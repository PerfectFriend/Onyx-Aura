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
import { buildServerHttpCsp, securityHeadersMiddleware } from '../server/securityHeaders';
import { FileServerStateStore, InMemoryServerStateStore } from '../server/serverStore';
import { ServerSessionService } from '../server/sessionService';
import { StripeHostedCheckoutService, verifyStripeWebhookSignature } from '../server/stripeProvider';
import { buildContentSecurityPolicy } from '../infrastructure/security/csp';
import { generateLocalQrDataUrl, generateLocalQrSvg } from '../utils/qrGenerator';

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

function makeRegistrationAuthenticatorData(params: {
  rpId: string;
  flagsByte: number;
  signCount: number;
  credentialIdBytes: Buffer;
  spkiDer: Buffer;
}): Buffer {
  const rpHash = createHash('sha256').update(params.rpId).digest();
  const header = Buffer.alloc(5);
  header[0] = params.flagsByte | 0x40; // ensure AT bit set
  header.writeUInt32BE(params.signCount, 1);

  const aaguid = Buffer.alloc(16, 0x11);
  const credLen = Buffer.alloc(2);
  credLen.writeUInt16BE(params.credentialIdBytes.length, 0);

  // Uncompressed P-256 SPKI ends with 0x04 || x (32) || y (32)
  const x = params.spkiDer.subarray(params.spkiDer.length - 64, params.spkiDer.length - 32);
  const y = params.spkiDer.subarray(params.spkiDer.length - 32);

  // CBOR map(5): { 1: 2, 3: -7, -1: 1, -2: x, -3: y }
  const coseKey = Buffer.concat([
    Buffer.from([0xa5, 0x01, 0x02, 0x03, 0x26, 0x20, 0x01, 0x21, 0x58, 0x20]),
    x,
    Buffer.from([0x22, 0x58, 0x20]),
    y,
  ]);

  return Buffer.concat([rpHash, header, aaguid, credLen, params.credentialIdBytes, coseKey]);
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
    const credBytes = Buffer.from('cred-es256-real-1', 'utf8');
    const credentialId = toBase64Url(credBytes);

    await withServer(
      app => {
        app.use(
          '/api',
          createFoundationApiRouter({
            challengeStore,
            stateStore,
            sessionService,
            allowedOrigins: [origin],
            masterInviteCodes: ['TEST-MASTER-INVITE-42'],
          })
        );
      },
      async baseUrl => {
        // 1. Register credential on server with attestedCredentialData + master invite code
        const regChallengeRes = await fetch(`${baseUrl}/api/auth/webauthn/challenge`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ceremony: 'registration' }),
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
        const regAuthData = toBase64Url(
          makeRegistrationAuthenticatorData({
            rpId,
            flagsByte: 0x05, // UP + UV
            signCount: 1,
            credentialIdBytes: credBytes,
            spkiDer,
          })
        );

        const regRes = await fetch(`${baseUrl}/api/auth/webauthn/register`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            challengeId: regChallenge.challengeId,
            credentialId,
            rawIdBase64Url: credentialId,
            publicKeySpkiBase64Url: spkiB64u,
            clientDataJSONBase64Url: regClientData,
            authenticatorDataBase64Url: regAuthData,
            expectedOrigin: origin,
            rpId,
            algorithm: -7,
            displayName: 'Elena Master',
            masterInviteCode: 'TEST-MASTER-INVITE-42',
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

        // Create checkout session (server derives $165 USD from canonical catalog artist-1 / srv-1)
        const csRes = await fetch(`${baseUrl}/api/payments/checkout-session`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            bookingReferenceId: 'apt-stripe-1',
            artistId: 'artist-1',
            serviceId: 'srv-1',
            tipPercentage: 0,
            displayCurrency: 'USD',
          }),
        });
        expect(csRes.status).toBe(201);
        const csJson = (await csRes.json()) as {
          hostedCheckoutUrl: string;
          intent: { id: string; status: string; amountMinor: number; mode: string };
        };
        expect(csJson.hostedCheckoutUrl).toBe('https://checkout.stripe.com/c/pay/cs_test_a1b2c3');
        expect(csJson.intent.amountMinor).toBe(16500);
        expect(csJson.intent.status).toBe('requires_action');
        expect(csJson.intent.mode).toBe('hosted_psp');
        expect(capturedStripeRequestBody).toContain('unit_amount%5D=16500');

        // Signed Stripe webhook updates status to 'captured' when amount_total & currency match
        const webhookPayload = JSON.stringify({
          id: 'evt_test_001',
          type: 'checkout.session.completed',
          data: {
            object: {
              id: 'cs_test_a1b2c3',
              payment_status: 'paid',
              amount_total: 16500,
              currency: 'usd',
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

  it('Sprint 4.3 Hardening: blocks origin/rpId hijacking, registered passkey downgrade, ceremony confusion, open-redirect checkout, and out-of-order webhook regression', async () => {
    const stateStore = new InMemoryServerStateStore();
    const challengeStore = new WebAuthnChallengeStubStore();
    const webhookSecret = 'whsec_hardening_test_123456';
    const stripeService = new StripeHostedCheckoutService({
      store: stateStore,
      secretKey: 'sk_test_hardening_key',
      webhookSecret,
      fetchFn: () =>
        Promise.resolve(
          new Response(
            JSON.stringify({
              id: 'cs_hard_1',
              url: 'https://checkout.stripe.com/c/pay/cs_hard_1',
            }),
            { status: 200 }
          )
        ),
    });

    const { publicKey, privateKey } = generateKeyPairSync('ec', { namedCurve: 'P-256' });
    const spkiDer = publicKey.export({ type: 'spki', format: 'der' });
    const spkiB64u = toBase64Url(spkiDer);
    const legitCredBytes = Buffer.from('cred-legit-host', 'utf8');
    const legitCredentialId = toBase64Url(legitCredBytes);

    await withServer(
      app => {
        app.use(
          '/api',
          createFoundationApiRouter({
            challengeStore,
            stateStore,
            stripeService,
            masterInviteCodes: ['TEST-HARDENING-INVITE'],
          })
        );
      },
      async baseUrl => {
        const trustedOrigin = new URL(baseUrl).origin;
        const trustedRpId = new URL(baseUrl).hostname;

        // 1. Forged third-party expectedOrigin MUST be rejected on /register
        const ch1 = (await (
          await fetch(`${baseUrl}/api/auth/webauthn/challenge`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ ceremony: 'registration', role: 'master' }),
          })
        ).json()) as { challengeId: string; challengeBase64Url: string };

        const forgedRegRes = await fetch(`${baseUrl}/api/auth/webauthn/register`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            challengeId: ch1.challengeId,
            credentialId: 'cred-forged-origin',
            publicKeySpkiBase64Url: spkiB64u,
            clientDataJSONBase64Url: toBase64Url(
              JSON.stringify({
                type: 'webauthn.create',
                challenge: ch1.challengeBase64Url,
                origin: 'https://evil-attacker.example',
              })
            ),
            expectedOrigin: 'https://evil-attacker.example',
            rpId: 'evil-attacker.example',
            algorithm: -7,
            role: 'master',
          }),
        });
        expect(forgedRegRes.status).toBe(400);

        // 2. Arbitrary third-party rpId MUST be rejected even when origin matches server host
        const ch2 = (await (
          await fetch(`${baseUrl}/api/auth/webauthn/challenge`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ ceremony: 'registration', role: 'master' }),
          })
        ).json()) as { challengeId: string; challengeBase64Url: string };

        const badRpRes = await fetch(`${baseUrl}/api/auth/webauthn/register`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            challengeId: ch2.challengeId,
            credentialId: 'cred-bad-rpid',
            publicKeySpkiBase64Url: spkiB64u,
            clientDataJSONBase64Url: toBase64Url(
              JSON.stringify({
                type: 'webauthn.create',
                challenge: ch2.challengeBase64Url,
                origin: trustedOrigin,
              })
            ),
            rpId: 'google.com',
            algorithm: -7,
            role: 'master',
          }),
        });
        expect(badRpRes.status).toBe(400);

        // 3. Valid registration on actual trusted server host succeeds & sets Cache-Control: no-store
        const ch3 = (await (
          await fetch(`${baseUrl}/api/auth/webauthn/challenge`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ ceremony: 'registration' }),
          })
        ).json()) as { challengeId: string; challengeBase64Url: string };

        const okReg = await fetch(`${baseUrl}/api/auth/webauthn/register`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            challengeId: ch3.challengeId,
            credentialId: legitCredentialId,
            rawIdBase64Url: legitCredentialId,
            publicKeySpkiBase64Url: spkiB64u,
            clientDataJSONBase64Url: toBase64Url(
              JSON.stringify({
                type: 'webauthn.create',
                challenge: ch3.challengeBase64Url,
                origin: trustedOrigin,
              })
            ),
            authenticatorDataBase64Url: toBase64Url(
              makeRegistrationAuthenticatorData({
                rpId: trustedRpId,
                flagsByte: 0x05,
                signCount: 1,
                credentialIdBytes: legitCredBytes,
                spkiDer,
              })
            ),
            rpId: trustedRpId,
            algorithm: -7,
            masterInviteCode: 'TEST-HARDENING-INVITE',
          }),
        });
        expect(okReg.status).toBe(201);
        expect(okReg.headers.get('cache-control')).toContain('no-store');

        // 4. Registered credential omitting signature MUST be blocked with 401 (anti-downgrade)
        const ch4 = (await (
          await fetch(`${baseUrl}/api/auth/webauthn/challenge`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ ceremony: 'authentication' }),
          })
        ).json()) as { challengeId: string; challengeBase64Url: string };

        const downgradeRes = await fetch(`${baseUrl}/api/auth/webauthn/verify`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            challengeId: ch4.challengeId,
            credentialId: legitCredentialId,
            clientDataJSONBase64Url: toBase64Url(
              JSON.stringify({
                type: 'webauthn.get',
                challenge: ch4.challengeBase64Url,
                origin: trustedOrigin,
              })
            ),
          }),
        });
        expect(downgradeRes.status).toBe(401);

        // 5. Registration challenge passed to /verify MUST be rejected with 400
        const ch5 = (await (
          await fetch(`${baseUrl}/api/auth/webauthn/challenge`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ ceremony: 'registration', role: 'client' }),
          })
        ).json()) as { challengeId: string; challengeBase64Url: string };

        const wrongCeremonyRes = await fetch(`${baseUrl}/api/auth/webauthn/verify`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            challengeId: ch5.challengeId,
            clientDataJSONBase64Url: toBase64Url(
              JSON.stringify({
                type: 'webauthn.create',
                challenge: ch5.challengeBase64Url,
                origin: trustedOrigin,
              })
            ),
          }),
        });
        expect(wrongCeremonyRes.status).toBe(400);

        // Keep privateKey exercised to guarantee real signature still passes on valid flow
        const ch6 = (await (
          await fetch(`${baseUrl}/api/auth/webauthn/challenge`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ ceremony: 'authentication', role: 'master' }),
          })
        ).json()) as { challengeId: string; challengeBase64Url: string };
        const cdBuf = Buffer.from(
          JSON.stringify({
            type: 'webauthn.get',
            challenge: ch6.challengeBase64Url,
            origin: trustedOrigin,
          }),
          'utf8'
        );
        const adBuf = makeAuthenticatorData(trustedRpId, 0x05, 2);
        const realSig = cryptoSign(
          'sha256',
          Buffer.concat([adBuf, createHash('sha256').update(cdBuf).digest()]),
          privateKey
        );
        const legitVerify = await fetch(`${baseUrl}/api/auth/webauthn/verify`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            challengeId: ch6.challengeId,
            credentialId: legitCredentialId,
            clientDataJSONBase64Url: toBase64Url(cdBuf),
            authenticatorDataBase64Url: toBase64Url(adBuf),
            signatureBase64Url: toBase64Url(realSig),
          }),
        });
        expect(legitVerify.status).toBe(200);

        // 6. Open-redirect originUrl MUST be rejected on /payments/checkout-session
        const evilCheckout = await fetch(`${baseUrl}/api/payments/checkout-session`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            bookingReferenceId: 'apt-open-redir',
            artistId: 'artist-1',
            serviceId: 'srv-1',
            tipPercentage: 0,
            originUrl: 'https://evil-phish.example',
          }),
        });
        expect(evilCheckout.status).toBe(400);

        // 7. Webhook status cannot regress captured intent back to canceled
        const goodCheckout = await fetch(`${baseUrl}/api/payments/checkout-session`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            bookingReferenceId: 'apt-mono-1',
            artistId: 'artist-1',
            serviceId: 'srv-1',
            tipPercentage: 0,
          }),
        });
        expect(goodCheckout.status).toBe(201);
        const { intent } = (await goodCheckout.json()) as { intent: { id: string } };

        const ts = Math.floor(Date.now() / 1000);
        const capPayload = JSON.stringify({
          id: 'evt_cap_1',
          type: 'checkout.session.completed',
          data: {
            object: {
              payment_status: 'paid',
              amount_total: 16500,
              currency: 'usd',
              metadata: { intentId: intent.id },
            },
          },
        });
        const capSig = createHmac('sha256', webhookSecret).update(`${ts}.${capPayload}`).digest('hex');
        expect(
          (
            await fetch(`${baseUrl}/api/payments/webhooks/stripe`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json', 'Stripe-Signature': `t=${ts},v1=${capSig}` },
              body: capPayload,
            })
          ).status
        ).toBe(200);

        const expPayload = JSON.stringify({
          id: 'evt_exp_late_1',
          type: 'checkout.session.expired',
          data: { object: { metadata: { intentId: intent.id } } },
        });
        const expSig = createHmac('sha256', webhookSecret).update(`${ts}.${expPayload}`).digest('hex');
        await fetch(`${baseUrl}/api/payments/webhooks/stripe`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Stripe-Signature': `t=${ts},v1=${expSig}` },
          body: expPayload,
        });

        const finalIntent = (await (
          await fetch(`${baseUrl}/api/payments/intents/${intent.id}`)
        ).json()) as { intent: { status: string } };
        expect(finalIntent.intent.status).toBe('captured');

        // 8. Public health probe returns strictly minimal { ok: true } (Q-06)
        const health = (await (await fetch(`${baseUrl}/api/health`)).json()) as Record<string, unknown>;
        expect(health).toEqual({ ok: true });
      }
    );
  });

  it('N-10 Local Offline QR & Strict CSP: generates QR locally without network and removes api.qrserver.com from CSP', async () => {
    const svg = await generateLocalQrSvg('https://nailix.art');
    expect(svg).toContain('<svg');
    expect(svg).toContain('</svg>');

    const dataUrl = await generateLocalQrDataUrl('https://nailix.art');
    expect(dataUrl.startsWith('data:image/png;base64,')).toBe(true);

    expect(buildContentSecurityPolicy('development')).not.toContain('qrserver.com');
    expect(buildContentSecurityPolicy('production')).not.toContain('qrserver.com');
    expect(buildServerHttpCsp(true)).not.toContain('qrserver.com');
  });
});
