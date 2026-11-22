// =============================================================================
// Stage 4 · Sprint 4.4 — Hardened Express API Router
// - WebAuthn: per-IP rate-limited & challenge-quota isolated; mandatory
//   authData/attestationObject COSE/SPKI binding + 409 anti-squatting on
//   /register; server-authoritative role assignment (Q-01, Q-02, Q-06).
// - Payments: server-calculated catalog deposit pricing (Q-03), deterministic
//   booking idempotency, Origin mutation checks (Q-07), minimal /health (Q-06),
//   and sanitized Stripe webhook error responses (Q-09).
// =============================================================================

import { createHash, timingSafeEqual } from 'node:crypto';
import express, { NextFunction, Request, Response, Router } from 'express';
import {
  isAllowedPaymentCurrency,
  toPublicDepositIntentView,
} from '../domain/payments';
import {
  CanonicalServiceCatalogEntry,
  resolveAuthoritativeDepositQuote,
} from '../domain/serviceCatalog';
import { UserRole } from '../types';
import { ServerSecurityAuditLog } from './auditLog';
import {
  defaultChallengeStubStore,
  WebAuthnChallengeStubStore,
} from './challengeService';
import {
  resolveTrustedCheckoutOriginUrl,
  validateMutationOriginHeader,
  validateRpIdForOrigin,
  validateWebAuthnOrigin,
} from './originPolicy';
import { createSlidingWindowRateLimiter, getClientIpKey } from './rateLimiter';
import { InMemoryServerStateStore, ServerStateStore } from './serverStore';
import { ServerSessionService } from './sessionService';
import {
  StripeCheckoutConflictError,
  StripeHostedCheckoutService,
} from './stripeProvider';
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

function hashInviteCode(code: string): string {
  return createHash('sha256').update(code, 'utf8').digest('hex');
}

function resolveConfiguredInviteHashes(explicit?: string[]): string[] {
  const envRaw = process.env.NAILIX_MASTER_INVITE_CODES ?? '';
  const combined = [
    ...(explicit ?? []),
    ...envRaw
      .split(',')
      .map(s => s.trim())
      .filter(Boolean),
  ];
  return Array.from(
    new Set(combined.filter(code => code.length >= 16).map(code => hashInviteCode(code)))
  );
}

export interface FoundationRouterDependencies {
  challengeStore?: WebAuthnChallengeStubStore;
  stateStore?: ServerStateStore;
  sessionService?: ServerSessionService;
  stripeService?: StripeHostedCheckoutService;
  allowedOrigins?: string[];
  auditLog?: ServerSecurityAuditLog;
  isProduction?: boolean;
  masterInviteCodes?: string[];
  serviceCatalog?: readonly CanonicalServiceCatalogEntry[];
  rateLimits?: {
    windowMs?: number;
    authMax?: number;
    checkoutMax?: number;
  };
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
  const isProduction = deps.isProduction ?? process.env.NODE_ENV === 'production';

  const validInviteHashes = resolveConfiguredInviteHashes(deps.masterInviteCodes);

  const matchConfiguredInviteHash = (candidate: string): string | null => {
    if (candidate.length < 16) return null;
    const candidateBuf = Buffer.from(hashInviteCode(candidate), 'hex');
    let matched: string | null = null;
    for (const configuredHash of validInviteHashes) {
      const configuredBuf = Buffer.from(configuredHash, 'hex');
      if (
        configuredBuf.length === candidateBuf.length &&
        timingSafeEqual(candidateBuf, configuredBuf)
      ) {
        matched = configuredHash;
      }
    }
    return matched;
  };

  const windowMs = deps.rateLimits?.windowMs ?? 60_000;
  const authRateLimiter = createSlidingWindowRateLimiter({
    windowMs,
    maxRequests: deps.rateLimits?.authMax ?? 60,
    bucketLabel: 'auth',
    onRateLimited: (_key, label) => {
      auditLog.record('security.rate_limited', 'rejected', label);
    },
  });
  const checkoutRateLimiter = createSlidingWindowRateLimiter({
    windowMs,
    maxRequests: deps.rateLimits?.checkoutMax ?? 20,
    bucketLabel: 'checkout',
    onRateLimited: (_key, label) => {
      auditLog.record('security.rate_limited', 'rejected', label);
    },
  });

  const requireTrustedOrigin = (req: Request, res: Response): boolean => {
    const check = validateMutationOriginHeader({ req, explicitOrigins, isProduction });
    if (!check.ok) {
      auditLog.record('security.origin.rejected', 'rejected', check.error);
      res.status(403).json({ error: check.error });
      return false;
    }
    return true;
  };

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
        if (result.rejectedReason) {
          auditLog.record('payments.webhook.rejected', 'rejected', result.rejectedReason);
        } else if (result.unmatched) {
          auditLog.record('payments.webhook.unmatched', 'rejected', result.eventType);
        } else if (result.newStatus === 'released' || result.newStatus === 'partially_refunded') {
          auditLog.record('payments.refund.processed', 'ok', `${result.eventType}:${result.newStatus}`);
        } else {
          auditLog.record(
            result.duplicate ? 'payments.webhook.duplicate' : 'payments.webhook.processed',
            'ok',
            result.eventType
          );
        }
        res.status(200).json(result);
      } catch (err) {
        const internalMsg = err instanceof Error ? err.message : 'Invalid Stripe webhook payload.';
        auditLog.record('payments.webhook.rejected', 'rejected', internalMsg);
        // Q-09: never reflect raw internal parser/signature details to untrusted callers
        res.status(400).json({
          received: false,
          error: 'Invalid Stripe webhook.',
        });
      }
    })
  );

  router.use(express.json({ limit: '128kb' }));

  // Q-06: Public health probe exposes minimal { ok: true } only
  router.get('/health', (_req, res) => {
    res.json({ ok: true });
  });

  router.get('/payments/provider', (_req, res) => {
    res.json(stripeService.getProviderStatus());
  });

  // V-05: Server-authoritative catalog pricing quote endpoint
  router.get('/payments/quote', (req, res) => {
    const artistId = typeof req.query.artistId === 'string' ? req.query.artistId.trim() : '';
    const serviceId = typeof req.query.serviceId === 'string' ? req.query.serviceId.trim() : '';
    const rawTip = typeof req.query.tipPercentage === 'string' ? Number(req.query.tipPercentage) : 0;

    if (!artistId || !serviceId || !Number.isFinite(rawTip)) {
      res.status(400).json({ error: 'Valid artistId, serviceId, and tipPercentage query parameters are required.' });
      return;
    }

    const quoteRes = resolveAuthoritativeDepositQuote({
      artistId,
      serviceId,
      tipPercentage: rawTip,
      catalog: deps.serviceCatalog,
    });
    if (!quoteRes.ok) {
      res.status(400).json({ error: quoteRes.error });
      return;
    }

    res.status(200).json({ ok: true, quote: quoteRes.quote });
  });

  router.post(
    '/payments/checkout-session',
    checkoutRateLimiter,
    asyncRoute(async (req, res) => {
      if (!requireTrustedOrigin(req, res)) return;

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
      const serviceId = typeof body.serviceId === 'string' ? body.serviceId.trim() : '';
      const tipPercentage = typeof body.tipPercentage === 'number' ? body.tipPercentage : 0;

      if (body.displayCurrency !== undefined && !isAllowedPaymentCurrency(body.displayCurrency)) {
        res.status(400).json({ error: 'Unsupported displayCurrency.' });
        return;
      }
      const displayCurrency =
        body.displayCurrency !== undefined && isAllowedPaymentCurrency(body.displayCurrency)
          ? body.displayCurrency
          : 'USD';

      const rawDate = typeof body.appointmentDate === 'string' ? body.appointmentDate.trim() : undefined;
      const rawTimeSlot =
        typeof body.appointmentTimeSlot === 'string' ? body.appointmentTimeSlot.trim() : undefined;
      if (rawDate !== undefined && !/^\d{4}-\d{2}-\d{2}$/.test(rawDate)) {
        res.status(400).json({ error: 'Invalid appointmentDate format (expected YYYY-MM-DD).' });
        return;
      }
      if (rawTimeSlot !== undefined && !/^([01]\d|2[0-3]):[0-5]\d$/.test(rawTimeSlot)) {
        res.status(400).json({ error: 'Invalid appointmentTimeSlot format (expected HH:MM).' });
        return;
      }

      if (
        !bookingReferenceId ||
        bookingReferenceId.length > 64 ||
        !artistId ||
        artistId.length > 64 ||
        !serviceId ||
        serviceId.length > 64
      ) {
        res.status(400).json({
          error: 'Valid bookingReferenceId, artistId, and serviceId (max 64 chars) are required.',
        });
        return;
      }

      // Q-03: Server computes price & canonical labels from authoritative catalog (ignores client amountUsd)
      const quoteRes = resolveAuthoritativeDepositQuote({
        artistId,
        serviceId,
        tipPercentage,
        catalog: deps.serviceCatalog,
      });

      if (!quoteRes.ok) {
        auditLog.record('payments.checkout.rejected', 'rejected', quoteRes.error);
        res.status(400).json({ error: quoteRes.error });
        return;
      }

      const originResolution = resolveTrustedCheckoutOriginUrl({
        candidateOriginUrl: typeof body.originUrl === 'string' ? body.originUrl : undefined,
        req,
        explicitOrigins,
        isProduction,
      });

      if (!originResolution.ok) {
        auditLog.record('payments.checkout.rejected', 'rejected', originResolution.error);
        res.status(400).json({ error: originResolution.error });
        return;
      }

      try {
        const intent = await stripeService.createHostedCheckoutSession({
          bookingReferenceId,
          artistId: quoteRes.quote.artistId,
          artistName: quoteRes.quote.artistName,
          serviceId: quoteRes.quote.serviceId,
          serviceName: quoteRes.quote.serviceName,
          amountUsd: quoteRes.quote.totalUsd,
          displayCurrency,
          originUrl: originResolution.originUrl,
          appointmentDate: rawDate,
          appointmentTimeSlot: rawTimeSlot,
        });
        auditLog.record('payments.checkout.created', 'ok', intent.providerId);
        res.status(201).json({ intent, hostedCheckoutUrl: intent.hostedCheckoutUrl });
      } catch (err) {
        if (err instanceof StripeCheckoutConflictError) {
          auditLog.record('payments.checkout.rejected', 'rejected', err.message);
          res.status(409).json({ error: err.message });
          return;
        }
        const msg =
          err instanceof Error ? err.message : 'Unable to create Stripe Hosted Checkout session.';
        auditLog.record('payments.checkout.rejected', 'rejected', msg);
        res.status(502).json({ error: 'Unable to initialize Stripe Hosted Checkout session.' });
      }
    })
  );

  // V-02: Return minimal non-sensitive intent status view (no hostedCheckoutUrl / providerId)
  router.get(
    '/payments/intents/:intentId',
    asyncRoute(async (req, res) => {
      const intentId = typeof req.params.intentId === 'string' ? req.params.intentId : '';
      if (!intentId || intentId.length > 96) {
        res.status(400).json({ error: 'Missing or invalid intentId.' });
        return;
      }
      const intent = await stateStore.getDepositIntent(intentId);
      if (!intent) {
        res.status(404).json({ error: 'Deposit intent not found.' });
        return;
      }
      res.json({ intent: toPublicDepositIntentView(intent) });
    })
  );

  router.post('/auth/webauthn/challenge', authRateLimiter, (req, res) => {
    if (!requireTrustedOrigin(req, res)) return;

    const body =
      req.body && typeof req.body === 'object' ? (req.body as Record<string, unknown>) : {};
    const ceremony = body.ceremony === 'registration' ? 'registration' : 'authentication';
    // Q-02: Challenge ignores client-supplied role; server enforces client default on register
    const clientKey = getClientIpKey(req);

    const issued = challengeStore.issueChallenge({ ceremony, clientKey });
    auditLog.record('auth.challenge.issued', 'ok', ceremony);
    res.status(200).json(issued);
  });

  router.post(
    '/auth/webauthn/register',
    authRateLimiter,
    asyncRoute(async (req, res) => {
      if (!requireTrustedOrigin(req, res)) return;

      const body =
        req.body && typeof req.body === 'object' ? (req.body as Record<string, unknown>) : {};

      const challengeId = typeof body.challengeId === 'string' ? body.challengeId : '';
      const credentialId = typeof body.credentialId === 'string' ? body.credentialId.trim() : '';
      const rawIdInput =
        typeof body.rawIdBase64Url === 'string' ? body.rawIdBase64Url.trim() : '';
      if (rawIdInput && rawIdInput !== credentialId) {
        res.status(400).json({
          registered: false,
          error: 'credentialId must match rawIdBase64Url.',
        });
        return;
      }
      const rawIdBase64Url = rawIdInput || credentialId;
      const publicKeySpkiBase64Url =
        typeof body.publicKeySpkiBase64Url === 'string' ? body.publicKeySpkiBase64Url.trim() : '';
      const clientDataJSONBase64Url =
        typeof body.clientDataJSONBase64Url === 'string' ? body.clientDataJSONBase64Url : '';
      const authenticatorDataBase64Url =
        typeof body.authenticatorDataBase64Url === 'string'
          ? body.authenticatorDataBase64Url
          : undefined;
      const attestationObjectBase64Url =
        typeof body.attestationObjectBase64Url === 'string'
          ? body.attestationObjectBase64Url
          : undefined;
      const bodyExpectedOrigin =
        typeof body.expectedOrigin === 'string' ? body.expectedOrigin : undefined;
      const rpId = typeof body.rpId === 'string' ? body.rpId.trim().toLowerCase() : '';
      const displayName =
        typeof body.displayName === 'string' && body.displayName.trim()
          ? body.displayName.trim().slice(0, 64)
          : 'Salon Guest';
      const algorithm = typeof body.algorithm === 'number' ? body.algorithm : -7;
      const masterInviteCode =
        typeof body.masterInviteCode === 'string' ? body.masterInviteCode.trim() : '';

      if (
        !challengeId ||
        !credentialId ||
        !publicKeySpkiBase64Url ||
        !clientDataJSONBase64Url ||
        !rpId ||
        (!authenticatorDataBase64Url && !attestationObjectBase64Url)
      ) {
        res.status(400).json({
          registered: false,
          error:
            'challengeId, credentialId, publicKeySpkiBase64Url, clientDataJSONBase64Url, rpId, and authenticatorData/attestationObject are required.',
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

      // Q-01: Prevent credentialId squatting/overwriting without active session ownership
      const existingCred = await stateStore.getPasskey(credentialId);
      const allCreds = await stateStore.listPasskeysByRole();
      const conflictingRawId = allCreds.find(
        c => c.rawIdBase64Url === rawIdBase64Url && c.id !== credentialId
      );
      if (conflictingRawId) {
        auditLog.record('auth.register.conflict', 'rejected', 'rawId-conflict');
        res.status(409).json({
          registered: false,
          error: 'Credential rawId is already registered.',
        });
        return;
      }

      if (existingCred) {
        const activeSession = await sessionService.getActiveSessionFromRequest(req);
        const ownsExisting =
          activeSession !== null &&
          activeSession.credentialId === credentialId &&
          activeSession.verificationLevel === 'server_spki_verified';
        if (!ownsExisting) {
          auditLog.record('auth.register.conflict', 'rejected', 'credentialId-conflict');
          res.status(409).json({
            registered: false,
            error: 'Credential ID is already registered.',
          });
          return;
        }
      }

      // Q-02 & V-04: Role is NEVER taken from client body/challenge. Default is 'client'.
      let assignedRole: UserRole = existingCred?.role ?? 'client';
      let matchedInviteHash: string | null = null;
      if (masterInviteCode) {
        const candidateHash = matchConfiguredInviteHash(masterInviteCode);
        const alreadyConsumed = candidateHash
          ? await stateStore.isMasterInviteHashConsumed(candidateHash)
          : false;
        if (!candidateHash || alreadyConsumed) {
          auditLog.record('auth.master.rejected', 'rejected', 'invalid-invite-code');
          res.status(403).json({
            registered: false,
            error: 'Invalid or already consumed master invite code.',
          });
          return;
        }
        matchedInviteHash = candidateHash;
        assignedRole = 'master';
      }

      const clientOrigin = extractClientDataOrigin(clientDataJSONBase64Url);
      const originCheck = validateWebAuthnOrigin({
        clientOrigin,
        bodyExpectedOrigin,
        req,
        explicitOrigins,
        isProduction,
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
        role: assignedRole,
        rawIdBase64Url,
        authenticatorDataBase64Url,
        attestationObjectBase64Url,
      });

      if (!check.ok) {
        auditLog.record('auth.register.rejected', 'rejected', check.error);
        res.status(400).json({ registered: false, error: check.error });
        return;
      }

      if (matchedInviteHash) {
        const consumedOk = await stateStore.consumeMasterInviteHash(matchedInviteHash);
        if (!consumedOk) {
          auditLog.record('auth.master.rejected', 'rejected', 'concurrent-invite-consume');
          res.status(403).json({
            registered: false,
            error: 'Invalid or already consumed master invite code.',
          });
          return;
        }
        auditLog.record('auth.master.promoted', 'ok', 'registration-invite');
      }

      const nowIso = new Date().toISOString();
      await stateStore.upsertPasskey({
        id: credentialId,
        rawIdBase64Url,
        publicKeySpkiBase64Url,
        algorithm,
        displayName,
        role: assignedRole,
        rpId,
        signCount: check.initialSignCount,
        createdAt: existingCred?.createdAt ?? nowIso,
        lastUsedAt: nowIso,
      });

      const session = await sessionService.createAndSetSession(req, res, {
        credentialId,
        displayName,
        role: assignedRole,
        verificationLevel: 'server_spki_verified',
      });

      auditLog.record('auth.register.ok', 'ok', assignedRole);
      res.status(201).json({
        registered: true,
        verificationTier: 'server_spki_verified',
        cryptographicServerVerified: true,
        session,
      });
    })
  );

  // Q-02: Explicit server-side master promotion using a configured one-time invite code
  router.post(
    '/auth/webauthn/promote-master',
    authRateLimiter,
    asyncRoute(async (req, res) => {
      if (!requireTrustedOrigin(req, res)) return;

      const activeSession = await sessionService.getActiveSessionFromRequest(req);
      if (!activeSession || activeSession.verificationLevel !== 'server_spki_verified') {
        res.status(401).json({ error: 'Active server_spki_verified session required.' });
        return;
      }

      const body =
        req.body && typeof req.body === 'object' ? (req.body as Record<string, unknown>) : {};
      const inviteCode =
        typeof body.masterInviteCode === 'string' ? body.masterInviteCode.trim() : '';

      const stored = await stateStore.getPasskey(activeSession.credentialId);
      if (!stored) {
        res.status(404).json({ error: 'Registered credential for session not found.' });
        return;
      }

      // V-04: Match hash and consume atomically via durable store BEFORE role elevation
      const matchedHash = inviteCode ? matchConfiguredInviteHash(inviteCode) : null;
      const consumedOk = matchedHash ? await stateStore.consumeMasterInviteHash(matchedHash) : false;
      if (!consumedOk) {
        auditLog.record('auth.master.rejected', 'rejected', 'promote-invalid-invite');
        res.status(403).json({ error: 'Invalid or already consumed master invite code.' });
        return;
      }

      await stateStore.upsertPasskey({
        ...stored,
        role: 'master',
        lastUsedAt: new Date().toISOString(),
      });
      await sessionService.revokeSessionFromRequest(req, res);
      const updatedSession = await sessionService.createAndSetSession(req, res, {
        credentialId: stored.id,
        displayName: stored.displayName,
        role: 'master',
        verificationLevel: 'server_spki_verified',
      });

      auditLog.record('auth.master.promoted', 'ok', 'session-invite');
      res.status(200).json({
        promoted: true,
        role: 'master',
        session: updatedSession,
      });
    })
  );

  router.post(
    '/auth/webauthn/verify',
    authRateLimiter,
    asyncRoute(async (req, res) => {
      if (!requireTrustedOrigin(req, res)) return;

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
        isProduction,
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
    authRateLimiter,
    asyncRoute(async (req, res) => {
      if (!requireTrustedOrigin(req, res)) return;

      await sessionService.revokeSessionFromRequest(req, res);
      auditLog.record('auth.session.revoked', 'ok');
      res.status(200).json({ signedOut: true });
    })
  );

  return router;
}
