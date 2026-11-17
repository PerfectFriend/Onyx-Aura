import { createHash, createHmac, generateKeyPairSync, sign as cryptoSign } from 'node:crypto';
import fs from 'node:fs/promises';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import type { AddressInfo } from 'node:net';
import express from 'express';
import { describe, it, expect } from 'vitest';
import { createFoundationApiRouter } from '../server/apiRouter';
import { WebAuthnChallengeStubStore } from '../server/challengeService';
import { securityHeadersMiddleware } from '../server/securityHeaders';
import { FileServerStateStore, InMemoryServerStateStore } from '../server/serverStore';
import { ServerSessionService } from '../server/sessionService';
import { StripeHostedCheckoutService, verifyStripeWebhookSignature } from '../server/stripeProvider';

function toBase64Url(buf: Buffer | string): string {
  const b = typeof buf === 'string' ? Buffer.from(buf, 'utf8') : buf;
  return b
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/g, '');
}

function makeAuthenticatorData(rpId: string, flagsByte: number, signCount: number): Buffer {
  const rpHash = createHash('sha256').update(rpId).digest();
  const rest = Buffer.alloc(5);
  rest[0] = flagsByte;
  rest.writeUInt32BE(signCount, 1);
  return Buffer.concat([rpHash, rest]);
}

async function withServer(
  setup: (app: express.Express) => void,
  run: (baseUrl: string) => Promise<void>
): Promise<void> {
  const app = express();
  setup(app);
  const server = http.createServer(app);
  await new Promise<void>(resolve => {
    server.listen(0, '127.0.0.1', () => resolve());
  });
  try {
    const addr = server.address() as AddressInfo;
    await run(`http://127.0.0.1:${addr.port}`);
  } finally {
    await new Promise<void>((resolve, reject) => {
      server.close(err => (err ? reject(err) : resolve()));
    });
  }
}

describe('Stage 4 · Sprint 4.2 Server SPKI Verification, HttpOnly Sessions, Security Headers & Stripe SAQ-A', () => {
  it('FileServerStateStore persists passkeys/sessions across reloads and blocks forbidden secret fields', async () => {
    const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'nailix-store-'));
    const storeFile = path.join(tmpDir, 'server-state.json');

    try {
      const storeA = new FileServerStateStore(storeFile);
      await storeA.upsertPasskey({
        id: 'cred-persist-1',
        rawIdBase64Url: 'Y3JlZC0x',
        publicKeySpkiBase64Url: 'U1BLSQ',
        algorithm: -7,
        displayName: 'Elena Studio',
        role: 'master',
        rpId: 'nailix.example',
        signCount: 1,
        createdAt: '2026-11-17T00:00:00.000Z',
        lastUsedAt: '2026-11-17T00:00:00.000Z',
      });

      // Reload from disk via a fresh instance
      const storeB = new FileServerStateStore(storeFile);
      const loaded = await storeB.getPasskey('cred-persist-1');
      expect(loaded?.displayName).toBe('Elena Studio');
      expect(loaded?.role).toBe('master');
      expect(loaded?.signCount).toBe(1);

      await expect(
        storeB.upsertPasskey({
          id: 'bad',
          rawIdBase64Url: 'bad',
          publicKeySpkiBase64Url: 'bad',
          algorithm: -7,
          displayName: 'Bad',
          role: 'client',
          rpId: 'nailix.example',
          signCount: 0,
          createdAt: '2026-11-17T00:00:00.000Z',
          lastUsedAt: '2026-11-17T00:00:00.000Z',
          privateKey: 'SHOULD_NEVER_PERSIST',
        } as never)
      ).rejects.toThrow(/disallowed secret field/i);
    } finally {
      await fs.rm(tmpDir, { recursive: true, force: true });
    }
  });

  it('verifies ECDSA P-256 WebAuthn registration + assertion on server, issues HttpOnly HMAC cookie, and rejects tampered/unverified requests', async () => {
    const stateStore = new InMemoryServerStateStore();
    const challengeStore = new WebAuthnChallengeStubStore();
    const sessionService = new ServerSessionService({
      store: stateStore,
      secret: 'unit-test-hmac-secret-at-least-32-chars!',
    });

    const { publicKey, privateKey } = generateKeyPairSync('ec', { namedCurve: 'P-256' });
    const spkiDer = publicKey.export({ type: 'spki', format: 'der' });
    const spkiB64u = toBase64Url(spkiDer);
    const rpId = 'nailix.example';
    const origin = 'https://nailix.example';
    const credentialId = 'cred-es256-real-1';

    await withServer(
      app => {
        app.use('/api', createFoundationApiRouter({ challengeStore, stateStore, sessionService }));
      },
      async baseUrl => {
        // 1. Register credential on server
        const regChallengeRes = await fetch(`${baseUrl}/api/auth/webauthn/challenge`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ceremony: 'registration', role: 'master' }),
        });
        const regChallenge = (await regChallengeRes.json()) as {
          challengeId: string;
          challengeBase64Url: string;
        };

        const regClientData = toBase64Url(
          JSON.stringify({
            type: 'webauthn.create',
            challenge: regChallenge.challengeBase64Url,
            origin,
          })
        );
        const regAuthData = toBase64Url(makeAuthenticatorData(rpId, 0x05, 1)); // UP + UV

        const regRes = await fetch(`${baseUrl}/api/auth/webauthn/register`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            challengeId: regChallenge.challengeId,
            credentialId,
            rawIdBase64Url: toBase64Url('raw-cred-1'),
            publicKeySpkiBase64Url: spkiB64u,
            clientDataJSONBase64Url: regClientData,
            authenticatorDataBase64Url: regAuthData,
            expectedOrigin: origin,
            rpId,
            algorithm: -7,
            displayName: 'Elena Master',
            role: 'master',
          }),
        });
        expect(regRes.status).toBe(201);
        const regJson = (await regRes.json()) as {
          registered: boolean;
          verificationTier: string;
          cryptographicServerVerified: boolean;
        };
        expect(regJson.registered).toBe(true);
        expect(regJson.verificationTier).toBe('server_spki_verified');
        expect(regJson.cryptographicServerVerified).toBe(true);
        const cookieHeader = regRes.headers.get('set-cookie') ?? '';
        expect(cookieHeader).toContain('nailix_sid=');
        expect(cookieHeader).toContain('HttpOnly');

        // 2. Authenticate with real ECDSA P-256 signature + signCount increment
        const authChRes = await fetch(`${baseUrl}/api/auth/webauthn/challenge`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ceremony: 'authentication', role: 'master' }),
        });
        const authCh = (await authChRes.json()) as {
          challengeId: string;
          challengeBase64Url: string;
        };

        const clientDataBuf = Buffer.from(
          JSON.stringify({
            type: 'webauthn.get',
            challenge: authCh.challengeBase64Url,
            origin,
          }),
          'utf8'
        );
        const authDataBuf = makeAuthenticatorData(rpId, 0x05, 2); // UP + UV + signCount 2
        const clientDataHash = createHash('sha256').update(clientDataBuf).digest();
        const signedData = Buffer.concat([authDataBuf, clientDataHash]);
        const derSignature = cryptoSign('sha256', signedData, privateKey);

        const verifyRes = await fetch(`${baseUrl}/api/auth/webauthn/verify`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            challengeId: authCh.challengeId,
            credentialId,
            clientDataJSONBase64Url: toBase64Url(clientDataBuf),
            authenticatorDataBase64Url: toBase64Url(authDataBuf),
            signatureBase64Url: toBase64Url(derSignature),
            expectedOrigin: origin,
          }),
        });
        expect(verifyRes.status).toBe(200);
        const verifyJson = (await verifyRes.json()) as {
          accepted: boolean;
          verificationTier: string;
          cryptographicServerVerified: boolean;
        };
        expect(verifyJson.accepted).toBe(true);
        expect(verifyJson.verificationTier).toBe('server_spki_verified');
        expect(verifyJson.cryptographicServerVerified).toBe(true);

        const loginCookiePair = (verifyRes.headers.get('set-cookie') ?? '').split(';')[0];
        expect(loginCookiePair.startsWith('nailix_sid=')).toBe(true);

        // 3. Introspect authoritative HttpOnly session + reject forged cookie
        const sessionRes = await fetch(`${baseUrl}/api/auth/session`, {
          headers: { Cookie: loginCookiePair },
        });
        const sessionJson = (await sessionRes.json()) as {
          authenticated: boolean;
          role: string;
          verificationScope: string;
        };
        expect(sessionJson.authenticated).toBe(true);
        expect(sessionJson.role).toBe('master');
        expect(sessionJson.verificationScope).toBe('server_spki_verified');

        const forgedRes = await fetch(`${baseUrl}/api/auth/session`, {
          headers: { Cookie: `${loginCookiePair}TAMPERED` },
        });
        expect(((await forgedRes.json()) as { authenticated: boolean }).authenticated).toBe(false);

        // 4. Forged signature rejected with 401
        const badChRes = await fetch(`${baseUrl}/api/auth/webauthn/challenge`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ceremony: 'authentication', role: 'master' }),
        });
        const badCh = (await badChRes.json()) as {
          challengeId: string;
          challengeBase64Url: string;
        };
        const badClientData = toBase64Url(
          JSON.stringify({ type: 'webauthn.get', challenge: badCh.challengeBase64Url, origin })
        );
        const forgedSig = Buffer.from(derSignature);
        forgedSig[forgedSig.length - 1] ^= 0xff;

        const forgedVerifyRes = await fetch(`${baseUrl}/api/auth/webauthn/verify`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            challengeId: badCh.challengeId,
            credentialId,
            clientDataJSONBase64Url: badClientData,
            authenticatorDataBase64Url: toBase64Url(makeAuthenticatorData(rpId, 0x05, 3)),
            signatureBase64Url: toBase64Url(forgedSig),
            expectedOrigin: origin,
          }),
        });
        expect(forgedVerifyRes.status).toBe(401);

        // 5. Missing UV bit on master role rejected with 401
        const uvChRes = await fetch(`${baseUrl}/api/auth/webauthn/challenge`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ceremony: 'authentication', role: 'master' }),
        });
        const uvCh = (await uvChRes.json()) as {
          challengeId: string;
          challengeBase64Url: string;
        };
        const uvClientData = Buffer.from(
          JSON.stringify({ type: 'webauthn.get', challenge: uvCh.challengeBase64Url, origin }),
          'utf8'
        );
        const uvAuthData = makeAuthenticatorData(rpId, 0x01, 4); // UP only, NO UV
        const uvSig = cryptoSign(
          'sha256',
          Buffer.concat([uvAuthData, createHash('sha256').update(uvClientData).digest()]),
          privateKey
        );
        const uvRes = await fetch(`${baseUrl}/api/auth/webauthn/verify`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            challengeId: uvCh.challengeId,
            credentialId,
            clientDataJSONBase64Url: toBase64Url(uvClientData),
            authenticatorDataBase64Url: toBase64Url(uvAuthData),
            signatureBase64Url: toBase64Url(uvSig),
            expectedOrigin: origin,
          }),
        });
        expect(uvRes.status).toBe(401);

        // 6. Logout revokes session server-side
        const logoutRes = await fetch(`${baseUrl}/api/auth/logout`, {
          method: 'POST',
          headers: { Cookie: loginCookiePair },
        });
        expect(logoutRes.status).toBe(200);
        expect(logoutRes.headers.get('set-cookie')).toContain('Max-Age=0');

        const afterLogout = await fetch(`${baseUrl}/api/auth/session`, {
          headers: { Cookie: loginCookiePair },
        });
        expect(((await afterLogout.json()) as { authenticated: boolean }).authenticated).toBe(false);
      }
    );
  });

  it('StripeHostedCheckoutService verifies webhooks via HMAC-SHA256, deduplicates events, and exposes honest configured status', async () => {
    const stateStore = new InMemoryServerStateStore();
    const webhookSecret = 'whsec_test_secret_123456';
    let capturedStripeRequestBody = '';

    const mockFetch: typeof fetch = (_url, init) => {
      capturedStripeRequestBody = typeof init?.body === 'string' ? init.body : '';
      return Promise.resolve(
        new Response(
          JSON.stringify({
            id: 'cs_test_a1b2c3',
            url: 'https://checkout.stripe.com/c/pay/cs_test_a1b2c3',
            expires_at: Math.floor(Date.now() / 1000) + 1800,
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        )
      );
    };

    const stripeService = new StripeHostedCheckoutService({
      store: stateStore,
      secretKey: 'sk_test_mock_configured_key',
      webhookSecret,
      fetchFn: mockFetch,
    });

    await withServer(
      app => {
        app.use(securityHeadersMiddleware(true));
        app.use('/api', createFoundationApiRouter({ stateStore, stripeService }));
      },
      async baseUrl => {
        // Security headers check
        const provRes = await fetch(`${baseUrl}/api/payments/provider`);
        expect(provRes.status).toBe(200);
        expect(provRes.headers.get('x-content-type-options')).toBe('nosniff');
        expect(provRes.headers.get('content-security-policy')).toContain("script-src 'self'");
        expect(provRes.headers.get('content-security-policy')).toContain('frame-ancestors');

        const provJson = (await provRes.json()) as {
          activeProviderId: string;
          hostedCheckoutConfigured: boolean;
          pciInputsAllowedInDom: boolean;
          isSimulated: boolean;
        };
        expect(provJson.activeProviderId).toBe('stripe_hosted');
        expect(provJson.hostedCheckoutConfigured).toBe(true);
        expect(provJson.isSimulated).toBe(false);
        expect(provJson.pciInputsAllowedInDom).toBe(false);

        // Create checkout session
        const csRes = await fetch(`${baseUrl}/api/payments/checkout-session`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            bookingReferenceId: 'apt-stripe-1',
            artistId: 'art-1',
            artistName: 'Elena',
            serviceId: 'svc-1',
            serviceName: 'Chrome Sculpt',
            amountUsd: 155,
            displayCurrency: 'USD',
          }),
        });
        expect(csRes.status).toBe(201);
        const csJson = (await csRes.json()) as {
          hostedCheckoutUrl: string;
          intent: { id: string; status: string; amountMinor: number; mode: string };
        };
        expect(csJson.hostedCheckoutUrl).toBe('https://checkout.stripe.com/c/pay/cs_test_a1b2c3');
        expect(csJson.intent.amountMinor).toBe(15500);
        expect(csJson.intent.status).toBe('requires_action');
        expect(csJson.intent.mode).toBe('hosted_psp');
        expect(capturedStripeRequestBody).toContain('unit_amount%5D=15500');

        // Signed Stripe webhook updates status to 'captured'
        const webhookPayload = JSON.stringify({
          id: 'evt_test_001',
          type: 'checkout.session.completed',
          data: {
            object: {
              id: 'cs_test_a1b2c3',
              payment_status: 'paid',
              metadata: { intentId: csJson.intent.id },
            },
          },
        });
        const ts = Math.floor(Date.now() / 1000);
        const sig = createHmac('sha256', webhookSecret)
          .update(`${ts}.${webhookPayload}`, 'utf8')
          .digest('hex');

        const whRes = await fetch(`${baseUrl}/api/payments/webhooks/stripe`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Stripe-Signature': `t=${ts},v1=${sig}`,
          },
          body: webhookPayload,
        });
        expect(whRes.status).toBe(200);
        const whJson = (await whRes.json()) as {
          received: boolean;
          duplicate: boolean;
          newStatus: string;
        };
        expect(whJson.received).toBe(true);
        expect(whJson.duplicate).toBe(false);
        expect(whJson.newStatus).toBe('captured');

        // Duplicate webhook deduplicated cleanly
        const dupRes = await fetch(`${baseUrl}/api/payments/webhooks/stripe`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Stripe-Signature': `t=${ts},v1=${sig}`,
          },
          body: webhookPayload,
        });
        expect(((await dupRes.json()) as { duplicate: boolean }).duplicate).toBe(true);

        // Stored intent reflects 'captured'
        const intentRes = await fetch(`${baseUrl}/api/payments/intents/${csJson.intent.id}`);
        const intentJson = (await intentRes.json()) as { intent: { status: string } };
        expect(intentJson.intent.status).toBe('captured');

        // Invalid webhook signature fails with 400
        const badWh = await fetch(`${baseUrl}/api/payments/webhooks/stripe`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Stripe-Signature': `t=${ts},v1=0000000000000000`,
          },
          body: webhookPayload,
        });
        expect(badWh.status).toBe(400);
      }
    );

    // Direct replay timestamp expiration unit check
    const staleSig = verifyStripeWebhookSignature({
      rawBody: '{}',
      signatureHeader: 't=1000,v1=deadbeef',
      webhookSecret,
      nowSeconds: 2000,
    });
    expect(staleSig.valid).toBe(false);
    expect(staleSig.reason).toContain('tolerance');
  });
});
