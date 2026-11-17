// =============================================================================
// Stage 4 · Sprint 4.2 — Express API Router
// - WebAuthn: single-use challenge, server SPKI registration (/register), real
//   Node Crypto ES256/RS256 assertion verification (/verify), HttpOnly session
//   introspection (/session) & revocation (/logout).
// - Payments: dynamic provider status (/payments/provider), Stripe Hosted
//   Checkout SAQ-A session (/payments/checkout-session), intent lookup, and
//   HMAC-SHA256 checked Stripe webhook (/payments/webhooks/stripe).
// =============================================================================

import express, { NextFunction, Request, Response, Router } from 'express';
import { PaymentCurrency, UserRole } from '../types';
import { ServerSecurityAuditLog } from './auditLog';
import {
  defaultChallengeStubStore,
  WebAuthnChallengeStubStore,
} from './challengeService';
import {
  resolveTrustedCheckoutOriginUrl,
  validateRpIdForOrigin,
  validateWebAuthnOrigin,
} from './originPolicy';
import { InMemoryServerStateStore, ServerStateStore } from './serverStore';
import { ServerSessionService } from './sessionService';
import { StripeHostedCheckoutService } from './stripeProvider';
import {
  verifyAssertionSignatureOnServer,
  verifyRegistrationBindingOnServer,
} from './webAuthnServerVerifier';

function asyncRoute(
  fn: (req: Request, res: Response) => Promise<void>
): (req: Request, res: Response, next: NextFunction) => void {
  return (req, res, next) => {
    void fn(req, res).catch(next);
  };
}

function extractClientDataOrigin(clientDataJSONBase64Url: string): string | undefined {
  try {
    const padded = clientDataJSONBase64Url.replace(/-/g, '+').replace(/_/g, '/');
    const padLen = (4 - (padded.length % 4)) % 4;
    const raw = Buffer.from(`${padded}${'='.repeat(padLen)}`, 'base64').toString('utf8');
    const parsed = JSON.parse(raw) as { origin?: unknown };
    return typeof parsed.origin === 'string' ? parsed.origin : undefined;
  } catch {
    return undefined;
  }
}

export interface FoundationRouterDependencies {
  challengeStore?: WebAuthnChallengeStubStore;
  stateStore?: ServerStateStore;
  sessionService?: ServerSessionService;
  stripeService?: StripeHostedCheckoutService;
  allowedOrigins?: string[];
  auditLog?: ServerSecurityAuditLog;
}

export function createFoundationApiRouter(
  challengeStoreOrDeps: WebAuthnChallengeStubStore | FoundationRouterDependencies = defaultChallengeStubStore
): Router {
  const deps: FoundationRouterDependencies =
    challengeStoreOrDeps instanceof WebAuthnChallengeStubStore
      ? { challengeStore: challengeStoreOrDeps }
      : challengeStoreOrDeps;

  const challengeStore = deps.challengeStore ?? defaultChallengeStubStore;
  const stateStore = deps.stateStore ?? new InMemoryServerStateStore();
  const sessionService = deps.sessionService ?? new ServerSessionService({ store: stateStore });
  const stripeService = deps.stripeService ?? new StripeHostedCheckoutService({ store: stateStore });
  const explicitOrigins = deps.allowedOrigins;
  const auditLog = deps.auditLog ?? new ServerSecurityAuditLog();

  const router = express.Router();

  // Never allow proxies or Service Workers to cache API auth cookies, challenges, or intents
  router.use((_req, res, next) => {
    res.setHeader('Cache-Control', 'no-store, private');
    res.setHeader('Pragma', 'no-cache');
    next();
  });

  // Stripe webhook route MUST receive raw Buffer BEFORE express.json() alters formatting
  router.post(
    '/payments/webhooks/stripe',
    express.raw({ type: 'application/json', limit: '256kb' }),
    asyncRoute(async (req, res) => {
      const rawBody = Buffer.isBuffer(req.body)
        ? req.body
        : Buffer.from(typeof req.body === 'string' ? req.body : JSON.stringify(req.body ?? {}));

      try {
        const result = await stripeService.handleWebhookEvent({
          rawBody,
          signatureHeader: req.header('stripe-signature'),
        });
        auditLog.record(
          result.duplicate ? 'payments.webhook.duplicate' : 'payments.webhook.processed',
          'ok',
          result.eventType
        );
        res.status(200).json(result);
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Invalid Stripe webhook payload.';
        auditLog.record('payments.webhook.rejected', 'rejected', message);
        res.status(400).json({
          received: false,
          error: message,
        });
      }
    })
  );

  router.use(express.json({ limit: '128kb' }));

  router.get('/health', (_req, res) => {
    res.json({
      ok: true,
      stage: '4.3-hardened-server-and-local-qr',
      pendingChallenges: challengeStore.getPendingCount(),
      sessionSecretConfigured: sessionService.hasPersistentSecretConfigured(),
      stripeConfigured: stripeService.isConfigured(),
      auditSummary: auditLog.getSummary(),
    });
  });

  router.get('/payments/provider', (_req, res) => {
    res.json(stripeService.getProviderStatus());
  });

  router.post(
    '/payments/checkout-session',
    asyncRoute(async (req, res) => {
      const body =
        req.body && typeof req.body === 'object' ? (req.body as Record<string, unknown>) : {};

      if (!stripeService.isConfigured()) {
        res.status(503).json({
          error: 'Stripe Hosted Checkout is not configured on the server; use [SIM] demo preview.',
          providerStatus: stripeService.getProviderStatus(),
        });
        return;
      }

      const bookingReferenceId =
        typeof body.bookingReferenceId === 'string' ? body.bookingReferenceId.trim() : '';
      const artistId = typeof body.artistId === 'string' ? body.artistId.trim() : '';
      const artistName = typeof body.artistName === 'string' ? body.artistName.trim() : 'Master Artist';
      const serviceId = typeof body.serviceId === 'string' ? body.serviceId.trim() : '';
      const serviceName = typeof body.serviceName === 'string' ? body.serviceName.trim() : 'Haute Manicure';
      const amountUsd = typeof body.amountUsd === 'number' ? body.amountUsd : Number.NaN;
      const displayCurrency =
        typeof body.displayCurrency === 'string' ? (body.displayCurrency as PaymentCurrency) : 'USD';

      if (!bookingReferenceId || !artistId || !serviceId || !Number.isFinite(amountUsd)) {
        res.status(400).json({
          error: 'bookingReferenceId, artistId, serviceId, and finite amountUsd are required.',
        });
        return;
      }

      const originResolution = resolveTrustedCheckoutOriginUrl({
        candidateOriginUrl: typeof body.originUrl === 'string' ? body.originUrl : undefined,
        req,
        explicitOrigins,
      });

      if (!originResolution.ok) {
        auditLog.record('payments.checkout.rejected', 'rejected', originResolution.error);
        res.status(400).json({ error: originResolution.error });
        return;
      }

      try {
        const intent = await stripeService.createHostedCheckoutSession({
          bookingReferenceId,
          artistId,
          artistName,
          serviceId,
          serviceName,
          amountUsd,
          displayCurrency,
          originUrl: originResolution.originUrl,
        });
        auditLog.record('payments.checkout.created', 'ok', intent.providerId);
        res.status(201).json({ intent, hostedCheckoutUrl: intent.hostedCheckoutUrl });
      } catch (err) {
        const msg =
          err instanceof Error ? err.message : 'Unable to create Stripe Hosted Checkout session.';
        auditLog.record('payments.checkout.rejected', 'rejected', msg);
        res.status(502).json({ error: msg });
      }
    })
  );

  router.get(
    '/payments/intents/:intentId',
    asyncRoute(async (req, res) => {
      const intentId = typeof req.params.intentId === 'string' ? req.params.intentId : '';
      if (!intentId) {
        res.status(400).json({ error: 'Missing intentId.' });
        return;
      }
      const intent = await stateStore.getDepositIntent(intentId);
      if (!intent) {
        res.status(404).json({ error: 'Deposit intent not found.' });
        return;
      }
      res.json({ intent });
    })
  );

  router.post('/auth/webauthn/challenge', (req, res) => {
    const body =
      req.body && typeof req.body === 'object' ? (req.body as Record<string, unknown>) : {};
    const ceremony = body.ceremony === 'registration' ? 'registration' : 'authentication';
    const role: UserRole = body.role === 'master' ? 'master' : 'client';

    const issued = challengeStore.issueChallenge({ ceremony, role });
    auditLog.record('auth.challenge.issued', 'ok', `${ceremony}:${role}`);
    res.status(200).json(issued);
  });

  router.post(
    '/auth/webauthn/register',
    asyncRoute(async (req, res) => {
      const body =
        req.body && typeof req.body === 'object' ? (req.body as Record<string, unknown>) : {};

      const challengeId = typeof body.challengeId === 'string' ? body.challengeId : '';
      const credentialId = typeof body.credentialId === 'string' ? body.credentialId.trim() : '';
      const rawIdBase64Url =
        typeof body.rawIdBase64Url === 'string' ? body.rawIdBase64Url.trim() : credentialId;
      const publicKeySpkiBase64Url =
        typeof body.publicKeySpkiBase64Url === 'string' ? body.publicKeySpkiBase64Url.trim() : '';
      const clientDataJSONBase64Url =
        typeof body.clientDataJSONBase64Url === 'string' ? body.clientDataJSONBase64Url : '';
      const authenticatorDataBase64Url =
        typeof body.authenticatorDataBase64Url === 'string'
          ? body.authenticatorDataBase64Url
          : undefined;
      const bodyExpectedOrigin =
        typeof body.expectedOrigin === 'string' ? body.expectedOrigin : undefined;
      const rpId = typeof body.rpId === 'string' ? body.rpId.trim().toLowerCase() : '';
      const displayName =
        typeof body.displayName === 'string' && body.displayName.trim()
          ? body.displayName.trim().slice(0, 64)
          : 'Salon Guest';
      const algorithm = typeof body.algorithm === 'number' ? body.algorithm : -7;
      const role: UserRole = body.role === 'master' ? 'master' : 'client';

      if (
        !challengeId ||
        !credentialId ||
        !publicKeySpkiBase64Url ||
        !clientDataJSONBase64Url ||
        !rpId
      ) {
        res.status(400).json({
          registered: false,
          error:
            'challengeId, credentialId, publicKeySpkiBase64Url, clientDataJSONBase64Url, and rpId are required.',
        });
        return;
      }

      const consumed = challengeStore.consumeChallengeRecord(challengeId);
      if (consumed.status !== 'ok') {
        const err =
          consumed.status === 'expired'
            ? 'Registration challenge expired (TTL exceeded).'
            : 'Unknown or already-consumed registration challenge.';
        auditLog.record('auth.register.rejected', 'rejected', err);
        res.status(400).json({ registered: false, error: err });
        return;
      }

      if (consumed.record.ceremony !== 'registration') {
        const err = 'Challenge was not issued for WebAuthn registration.';
        auditLog.record('auth.register.rejected', 'rejected', err);
        res.status(400).json({ registered: false, error: err });
        return;
      }

      const clientOrigin = extractClientDataOrigin(clientDataJSONBase64Url);
      const originCheck = validateWebAuthnOrigin({
        clientOrigin,
        bodyExpectedOrigin,
        req,
        explicitOrigins,
      });
      if (!originCheck.ok) {
        auditLog.record('auth.register.rejected', 'rejected', originCheck.error);
        res.status(400).json({ registered: false, error: originCheck.error });
        return;
      }

      if (!validateRpIdForOrigin(rpId, originCheck.authoritativeOrigin)) {
        const err = `WebAuthn rpId "${rpId}" is not permitted for origin ${originCheck.authoritativeOrigin}.`;
        auditLog.record('auth.register.rejected', 'rejected', err);
        res.status(400).json({ registered: false, error: err });
        return;
      }

      const check = verifyRegistrationBindingOnServer({
        expectedChallengeBase64Url: consumed.record.challengeBase64Url,
        clientDataJSONBase64Url,
        publicKeySpkiBase64Url,
        expectedOrigin: originCheck.authoritativeOrigin,
        rpId,
        algorithm,
        role: consumed.record.role ?? role,
        authenticatorDataBase64Url,
      });

      if (!check.ok) {
        auditLog.record('auth.register.rejected', 'rejected', check.error);
        res.status(400).json({ registered: false, error: check.error });
        return;
      }

      const nowIso = new Date().toISOString();
      await stateStore.upsertPasskey({
        id: credentialId,
        rawIdBase64Url,
        publicKeySpkiBase64Url,
        algorithm,
        displayName,
        role: consumed.record.role,
        rpId,
        signCount: check.initialSignCount,
        createdAt: nowIso,
        lastUsedAt: nowIso,
      });

      const session = await sessionService.createAndSetSession(req, res, {
        credentialId,
        displayName,
        role: consumed.record.role,
        verificationLevel: 'server_spki_verified',
      });

      auditLog.record('auth.register.ok', 'ok', consumed.record.role);
      res.status(201).json({
        registered: true,
        verificationTier: 'server_spki_verified',
        cryptographicServerVerified: true,
        session,
      });
    })
  );

  router.post(
    '/auth/webauthn/verify',
    asyncRoute(async (req, res) => {
      const body =
        req.body && typeof req.body === 'object' ? (req.body as Record<string, unknown>) : {};

      const challengeId = typeof body.challengeId === 'string' ? body.challengeId : '';
      const clientDataJSONBase64Url =
        typeof body.clientDataJSONBase64Url === 'string' ? body.clientDataJSONBase64Url : '';
      const authenticatorDataBase64Url =
        typeof body.authenticatorDataBase64Url === 'string'
          ? body.authenticatorDataBase64Url
          : undefined;
      const bodyExpectedOrigin =
        typeof body.expectedOrigin === 'string' ? body.expectedOrigin : undefined;
      const credentialId = typeof body.credentialId === 'string' ? body.credentialId.trim() : undefined;
      const signatureBase64Url =
        typeof body.signatureBase64Url === 'string' ? body.signatureBase64Url : undefined;

      if (!challengeId || !clientDataJSONBase64Url) {
        res.status(400).json({
          accepted: false,
          verificationTier: 'challenge_stub_only',
          cryptographicServerVerified: false,
          challengeConsumed: false,
          error: 'challengeId and clientDataJSONBase64Url are required.',
        });
        return;
      }

      const stubCheck = challengeStore.verifyChallengeStub({
        challengeId,
        clientDataJSONBase64Url,
        authenticatorDataBase64Url,
        expectedOrigin: bodyExpectedOrigin,
      });

      if (!stubCheck.accepted) {
        auditLog.record('auth.verify.spki_rejected', 'rejected', stubCheck.error);
        res.status(400).json(stubCheck);
        return;
      }

      if (stubCheck.ceremony !== 'authentication') {
        const err = 'Verify endpoint accepts authentication challenges only.';
        auditLog.record('auth.verify.spki_rejected', 'rejected', err);
        res.status(400).json({
          accepted: false,
          verificationTier: 'challenge_stub_only',
          cryptographicServerVerified: false,
          challengeConsumed: true,
          error: err,
        });
        return;
      }

      // Server-authoritative origin validation (never blindly trust body.expectedOrigin)
      const originCheck = validateWebAuthnOrigin({
        clientOrigin: stubCheck.origin,
        bodyExpectedOrigin,
        req,
        explicitOrigins,
      });

      if (!originCheck.ok) {
        auditLog.record('auth.verify.spki_rejected', 'rejected', originCheck.error);
        res.status(400).json({
          accepted: false,
          verificationTier: 'challenge_stub_only',
          cryptographicServerVerified: false,
          challengeConsumed: true,
          error: originCheck.error,
        });
        return;
      }

      // Look up credentialId in persistent server SPKI store
      const storedCred = credentialId ? await stateStore.getPasskey(credentialId) : undefined;
      if (storedCred) {
        // Anti-downgrade guard: registered passkeys MUST present full signature + authenticatorData
        if (!authenticatorDataBase64Url || !signatureBase64Url) {
          const err =
            'Registered credential requires cryptographic signature and authenticatorData; downgrade to challenge stub is rejected.';
          auditLog.record('auth.verify.downgrade_blocked', 'rejected', err);
          res.status(401).json({
            accepted: false,
            verificationTier: 'server_spki_verified',
            cryptographicServerVerified: false,
            challengeConsumed: true,
            error: err,
          });
          return;
        }

        const cryptoCheck = verifyAssertionSignatureOnServer({
          storedCredential: storedCred,
          clientDataJSONBase64Url,
          authenticatorDataBase64Url,
          signatureBase64Url,
          expectedOrigin: originCheck.authoritativeOrigin,
        });

        if (!cryptoCheck.cryptographicSignatureValid) {
          auditLog.record('auth.verify.spki_rejected', 'rejected', cryptoCheck.error);
          res.status(401).json({
            accepted: false,
            verificationTier: 'server_spki_verified',
            cryptographicServerVerified: false,
            challengeConsumed: true,
            error: cryptoCheck.error,
            warnings: cryptoCheck.warnings,
          });
          return;
        }

        await stateStore.upsertPasskey({
          ...storedCred,
          signCount: cryptoCheck.nextSignCount,
          lastUsedAt: new Date().toISOString(),
        });

        const session = await sessionService.createAndSetSession(req, res, {
          credentialId: storedCred.id,
          displayName: storedCred.displayName,
          role: storedCred.role,
          verificationLevel: 'server_spki_verified',
        });

        auditLog.record('auth.verify.spki_ok', 'ok', storedCred.role);
        res.status(200).json({
          accepted: true,
          verificationTier: 'server_spki_verified',
          cryptographicServerVerified: true,
          challengeConsumed: true,
          ceremony: stubCheck.ceremony,
          origin: originCheck.authoritativeOrigin,
          warnings: cryptoCheck.warnings,
          session,
          notice:
            'Server confirmed ECDSA/RSASSA SPKI assertion signature and issued signed HttpOnly session cookie.',
        });
        return;
      }

      // Honest fallback when credential is not registered in server SPKI store
      auditLog.record('auth.verify.stub_fallback', 'fallback', 'unregistered-credential');
      res.status(200).json(stubCheck);
    })
  );

  router.get(
    '/auth/session',
    asyncRoute(async (req, res) => {
      const session = await sessionService.getActiveSessionFromRequest(req);
      if (!session) {
        res.status(200).json({
          authenticated: false,
          verificationScope: 'client_local_only',
        });
        return;
      }
      res.status(200).json({
        authenticated: true,
        credentialId: session.credentialId,
        displayName: session.displayName,
        role: session.role,
        verificationScope: session.verificationLevel,
        signedInAt: session.createdAt,
        expiresAt: session.expiresAt,
      });
    })
  );

  router.post(
    '/auth/logout',
    asyncRoute(async (req, res) => {
      await sessionService.revokeSessionFromRequest(req, res);
      auditLog.record('auth.session.revoked', 'ok');
      res.status(200).json({ signedOut: true });
    })
  );

  return router;
}
