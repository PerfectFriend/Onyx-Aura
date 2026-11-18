// =============================================================================
// Stage 4 · Sprint 4.4 — Cross-Audit Adversarial Hardening Suite (Q-01 … Q-09)
// Converts every probe (S1–S9) from Kolyan's audit appendix into live Vitest
// unit + HTTP Express router integration tests (zero .todo).
// =============================================================================

import { createHash, createHmac, generateKeyPairSync, randomBytes } from 'node:crypto';
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import express, { Request } from 'express';
import { describe, expect, it } from 'vitest';
import { createAppServer } from '../../server';
import { INITIAL_ARTISTS } from '../data/initialData';
import { CANONICAL_SERVICE_CATALOG, resolveAuthoritativeDepositQuote } from '../domain/serviceCatalog';
import { createFoundationApiRouter } from '../server/apiRouter';
import { WebAuthnChallengeStubStore } from '../server/challengeService';
import { validateWebAuthnOrigin } from '../server/originPolicy';
import { buildServerHttpCsp, securityHeadersMiddleware } from '../server/securityHeaders';
import { InMemoryServerStateStore } from '../server/serverStore';
import { ServerSessionService } from '../server/sessionService';
import { StripeHostedCheckoutService } from '../server/stripeProvider';
import {
  validateSpkiKeyForRegistration,
  verifyRegistrationBindingOnServer,
} from '../server/webAuthnServerVerifier';

const b64u = (b: Buffer | Uint8Array | string): string =>
  (typeof b === 'string' ? Buffer.from(b, 'utf8') : Buffer.from(b)).toString('base64url');

const spkiOf = (k: ReturnType<typeof generateKeyPairSync>): string =>
  b64u(k.publicKey.export({ type: 'spki', format: 'der' }));

function buildP256RegAuthData(params: {
  rpId: string;
  flagsByte: number;
  credentialIdBytes: Buffer;
  spkiDer: Buffer;
  signCount?: number;
}): Buffer {
  const rpHash = createHash('sha256').update(params.rpId).digest();
  const header = Buffer.alloc(5);
  header[0] = params.flagsByte | 0x40; // AT bit
  header.writeUInt32BE(params.signCount ?? 1, 1);

  const aaguid = Buffer.alloc(16, 0x22);
  const credLen = Buffer.alloc(2);
  credLen.writeUInt16BE(params.credentialIdBytes.length, 0);

  const x = params.spkiDer.subarray(params.spkiDer.length - 64, params.spkiDer.length - 32);
  const y = params.spkiDer.subarray(params.spkiDer.length - 32);

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

describe('Stage 4 · Sprint 4.4 Hardening Suite (Q-01 … Q-09)', () => {
  describe('Q-01 · Anti-squatting (409), mandatory attestedCredentialData COSE binding, and master UV', () => {
    it('rejects master registration without authenticatorData / attestationObject', () => {
      const ec = generateKeyPairSync('ec', { namedCurve: 'P-256' });
      const chal = b64u(randomBytes(32));
      const clientData = b64u(
        JSON.stringify({ type: 'webauthn.create', challenge: chal, origin: 'https://salon.example' })
      );

      const r = verifyRegistrationBindingOnServer({
        expectedChallengeBase64Url: chal,
        clientDataJSONBase64Url: clientData,
        publicKeySpkiBase64Url: spkiOf(ec),
        expectedOrigin: 'https://salon.example',
        rpId: 'salon.example',
        algorithm: -7,
        role: 'master',
      });
      expect(r.ok).toBe(false);
    });

    it('rejects registration when submitted SPKI does not match COSE key embedded in authData', () => {
      const keyA = generateKeyPairSync('ec', { namedCurve: 'P-256' });
      const keyB = generateKeyPairSync('ec', { namedCurve: 'P-256' });
      const spkiADer = keyA.publicKey.export({ type: 'spki', format: 'der' });
      const credBytes = Buffer.from('cred-mismatch-1');
      const chal = b64u(randomBytes(32));

      const authData = buildP256RegAuthData({
        rpId: 'salon.example',
        flagsByte: 0x05,
        credentialIdBytes: credBytes,
        spkiDer: spkiADer,
      });

      const r = verifyRegistrationBindingOnServer({
        expectedChallengeBase64Url: chal,
        clientDataJSONBase64Url: b64u(
          JSON.stringify({ type: 'webauthn.create', challenge: chal, origin: 'https://salon.example' })
        ),
        publicKeySpkiBase64Url: spkiOf(keyB),
        expectedOrigin: 'https://salon.example',
        rpId: 'salon.example',
        algorithm: -7,
        role: 'client',
        rawIdBase64Url: b64u(credBytes),
        authenticatorDataBase64Url: b64u(authData),
      });
      expect(r.ok).toBe(false);
    });

    it('POST /auth/webauthn/register with an existing credentialId -> 409 and victim key remains intact', async () => {
      const stateStore = new InMemoryServerStateStore();
      const challengeStore = new WebAuthnChallengeStubStore();
      const sessionService = new ServerSessionService({
        store: stateStore,
        secret: 'q01-test-hmac-secret-at-least-32-chars!!',
      });

      const victimKey = generateKeyPairSync('ec', { namedCurve: 'P-256' });
      const attackerKey = generateKeyPairSync('ec', { namedCurve: 'P-256' });
      const victimSpkiDer = victimKey.publicKey.export({ type: 'spki', format: 'der' });
      const attackerSpkiDer = attackerKey.publicKey.export({ type: 'spki', format: 'der' });

      const credBytes = Buffer.from('cred-victim-1', 'utf8');
      const credId = b64u(credBytes);

      await withServer(
        app => {
          app.use(
            '/api',
            createFoundationApiRouter({ challengeStore, stateStore, sessionService })
          );
        },
        async baseUrl => {
          const origin = new URL(baseUrl).origin;
          const rpId = new URL(baseUrl).hostname;

          const ch1 = (await (
            await fetch(`${baseUrl}/api/auth/webauthn/challenge`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ ceremony: 'registration' }),
            })
          ).json()) as { challengeId: string; challengeBase64Url: string };

          const reg1 = await fetch(`${baseUrl}/api/auth/webauthn/register`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              challengeId: ch1.challengeId,
              credentialId: credId,
              rawIdBase64Url: credId,
              publicKeySpkiBase64Url: b64u(victimSpkiDer),
              clientDataJSONBase64Url: b64u(
                JSON.stringify({ type: 'webauthn.create', challenge: ch1.challengeBase64Url, origin })
              ),
              authenticatorDataBase64Url: b64u(
                buildP256RegAuthData({
                  rpId,
                  flagsByte: 0x05,
                  credentialIdBytes: credBytes,
                  spkiDer: victimSpkiDer,
                })
              ),
              rpId,
              algorithm: -7,
              displayName: 'Victim User',
            }),
          });
          expect(reg1.status).toBe(201);
          const ownerCookie = (reg1.headers.get('set-cookie') ?? '').split(';')[0];

          // Attacker attempts overwrite with same credentialId and no owner cookie -> 409
          const ch2 = (await (
            await fetch(`${baseUrl}/api/auth/webauthn/challenge`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ ceremony: 'registration' }),
            })
          ).json()) as { challengeId: string; challengeBase64Url: string };

          const squatRes = await fetch(`${baseUrl}/api/auth/webauthn/register`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              challengeId: ch2.challengeId,
              credentialId: credId,
              rawIdBase64Url: credId,
              publicKeySpkiBase64Url: b64u(attackerSpkiDer),
              clientDataJSONBase64Url: b64u(
                JSON.stringify({ type: 'webauthn.create', challenge: ch2.challengeBase64Url, origin })
              ),
              authenticatorDataBase64Url: b64u(
                buildP256RegAuthData({
                  rpId,
                  flagsByte: 0x05,
                  credentialIdBytes: credBytes,
                  spkiDer: attackerSpkiDer,
                })
              ),
              rpId,
              algorithm: -7,
              displayName: 'Attacker',
            }),
          });
          expect(squatRes.status).toBe(409);

          const storedAfterSquat = await stateStore.getPasskey(credId);
          expect(storedAfterSquat?.publicKeySpkiBase64Url).toBe(b64u(victimSpkiDer));
          expect(storedAfterSquat?.displayName).toBe('Victim User');

          // Legitimate active owner WITH HttpOnly session CAN update their own displayName
          const ch3 = (await (
            await fetch(`${baseUrl}/api/auth/webauthn/challenge`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ ceremony: 'registration' }),
            })
          ).json()) as { challengeId: string; challengeBase64Url: string };

          const ownerUpdate = await fetch(`${baseUrl}/api/auth/webauthn/register`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Cookie: ownerCookie,
            },
            body: JSON.stringify({
              challengeId: ch3.challengeId,
              credentialId: credId,
              rawIdBase64Url: credId,
              publicKeySpkiBase64Url: b64u(victimSpkiDer),
              clientDataJSONBase64Url: b64u(
                JSON.stringify({ type: 'webauthn.create', challenge: ch3.challengeBase64Url, origin })
              ),
              authenticatorDataBase64Url: b64u(
                buildP256RegAuthData({
                  rpId,
                  flagsByte: 0x05,
                  credentialIdBytes: credBytes,
                  spkiDer: victimSpkiDer,
                })
              ),
              rpId,
              algorithm: -7,
              displayName: 'Victim Renamed',
            }),
          });
          expect(ownerUpdate.status).toBe(201);
          expect((await stateStore.getPasskey(credId))?.displayName).toBe('Victim Renamed');
        }
      );
    });
  });

  describe('Q-02 · Server-authoritative roles (no self-assigned master)', () => {
    it('POST /auth/webauthn/challenge { role: "master" } then register { role: "master" } -> session.role === "client", invalid invite -> 403, valid one-time invite -> "master"', async () => {
      const stateStore = new InMemoryServerStateStore();
      const challengeStore = new WebAuthnChallengeStubStore();
      const sessionService = new ServerSessionService({
        store: stateStore,
        secret: 'q02-test-hmac-secret-at-least-32-chars!!',
      });

      const key1 = generateKeyPairSync('ec', { namedCurve: 'P-256' });
      const spki1 = key1.publicKey.export({ type: 'spki', format: 'der' });
      const cred1Bytes = Buffer.from('cred-self-escalate');

      const key2 = generateKeyPairSync('ec', { namedCurve: 'P-256' });
      const spki2 = key2.publicKey.export({ type: 'spki', format: 'der' });
      const cred2Bytes = Buffer.from('cred-invite-master');

      await withServer(
        app => {
          app.use(
            '/api',
            createFoundationApiRouter({
              challengeStore,
              stateStore,
              sessionService,
              masterInviteCodes: ['ONE-TIME-MASTER-CODE-99'],
            })
          );
        },
        async baseUrl => {
          const origin = new URL(baseUrl).origin;
          const rpId = new URL(baseUrl).hostname;

          // Attempt client-supplied role: 'master' without invite code
          const ch1 = (await (
            await fetch(`${baseUrl}/api/auth/webauthn/challenge`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ ceremony: 'registration', role: 'master' }),
            })
          ).json()) as { challengeId: string; challengeBase64Url: string };

          const reg1 = await fetch(`${baseUrl}/api/auth/webauthn/register`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              challengeId: ch1.challengeId,
              credentialId: b64u(cred1Bytes),
              rawIdBase64Url: b64u(cred1Bytes),
              publicKeySpkiBase64Url: b64u(spki1),
              clientDataJSONBase64Url: b64u(
                JSON.stringify({ type: 'webauthn.create', challenge: ch1.challengeBase64Url, origin })
              ),
              authenticatorDataBase64Url: b64u(
                buildP256RegAuthData({
                  rpId,
                  flagsByte: 0x05,
                  credentialIdBytes: cred1Bytes,
                  spkiDer: spki1,
                })
              ),
              rpId,
              algorithm: -7,
              role: 'master',
            }),
          });
          expect(reg1.status).toBe(201);
          const reg1Json = (await reg1.json()) as { session: { role: string } };
          expect(reg1Json.session.role).toBe('client');
          const clientCookie = (reg1.headers.get('set-cookie') ?? '').split(';')[0];

          // Wrong invite code on /promote-master -> 403
          const badPromote = await fetch(`${baseUrl}/api/auth/webauthn/promote-master`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Cookie: clientCookie },
            body: JSON.stringify({ masterInviteCode: 'WRONG-CODE-123' }),
          });
          expect(badPromote.status).toBe(403);

          // Valid one-time invite code promotes active session -> master
          const okPromote = await fetch(`${baseUrl}/api/auth/webauthn/promote-master`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Cookie: clientCookie },
            body: JSON.stringify({ masterInviteCode: 'ONE-TIME-MASTER-CODE-99' }),
          });
          expect(okPromote.status).toBe(200);
          const promoteJson = (await okPromote.json()) as { role: string };
          expect(promoteJson.role).toBe('master');

          // Same one-time invite code CANNOT be reused by a second registration -> 403
          const ch2 = (await (
            await fetch(`${baseUrl}/api/auth/webauthn/challenge`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ ceremony: 'registration' }),
            })
          ).json()) as { challengeId: string; challengeBase64Url: string };

          const reuseRes = await fetch(`${baseUrl}/api/auth/webauthn/register`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              challengeId: ch2.challengeId,
              credentialId: b64u(cred2Bytes),
              rawIdBase64Url: b64u(cred2Bytes),
              publicKeySpkiBase64Url: b64u(spki2),
              clientDataJSONBase64Url: b64u(
                JSON.stringify({ type: 'webauthn.create', challenge: ch2.challengeBase64Url, origin })
              ),
              authenticatorDataBase64Url: b64u(
                buildP256RegAuthData({
                  rpId,
                  flagsByte: 0x05,
                  credentialIdBytes: cred2Bytes,
                  spkiDer: spki2,
                })
              ),
              rpId,
              algorithm: -7,
              masterInviteCode: 'ONE-TIME-MASTER-CODE-99',
            }),
          });
          expect(reuseRes.status).toBe(403);
        }
      );
    });
  });

  describe('Q-03 · Server-side catalog deposit pricing, bounds, and booking idempotency', () => {
    it('keeps CANONICAL_SERVICE_CATALOG 100% consistent with INITIAL_ARTISTS prices', () => {
      for (const entry of CANONICAL_SERVICE_CATALOG) {
        const artist = INITIAL_ARTISTS.find(a => a.id === entry.artistId);
        const service = artist?.services.find(s => s.id === entry.serviceId);
        expect(artist).toBeDefined();
        expect(service).toBeDefined();
        expect(service?.priceUSD).toBe(entry.priceUsd);
      }
    });

    it('POST /payments/checkout-session { serviceId, amountUsd: 0.5 } -> amountMinor equals catalog deposit, not 50', async () => {
      const stateStore = new InMemoryServerStateStore();
      const bodies: string[] = [];
      const stripeService = new StripeHostedCheckoutService({
        store: stateStore,
        secretKey: 'sk_test_q03',
        webhookSecret: 'whsec_test_q03_secret',
        fetchFn: (_url, init) => {
          bodies.push(typeof init?.body === 'string' ? init.body : '');
          return Promise.resolve(
            new Response(
              JSON.stringify({ id: 'cs_cat_1', url: 'https://checkout.stripe.com/c/pay/cs_cat_1' }),
              { status: 200 }
            )
          );
        },
      });

      const expected = resolveAuthoritativeDepositQuote({
        artistId: 'artist-1',
        serviceId: 'srv-1',
        tipPercentage: 18,
      });
      expect(expected.ok).toBe(true);
      if (!expected.ok) return;

      await withServer(
        app => {
          app.use('/api', createFoundationApiRouter({ stateStore, stripeService }));
        },
        async baseUrl => {
          const spoofRes = await fetch(`${baseUrl}/api/payments/checkout-session`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              bookingReferenceId: 'apt-spoof-price',
              artistId: 'artist-1',
              serviceId: 'srv-1',
              tipPercentage: 18,
              amountUsd: 0.5,
              artistName: 'Tampered Master',
              serviceName: 'Free Spoof',
            }),
          });
          expect(spoofRes.status).toBe(201);
          const spoofJson = (await spoofRes.json()) as { intent: { amountMinor: number } };
          // artist-1 / srv-1 = $165 + 18% ($30) = $195 -> 19500 cents (NOT 50 cents)
          expect(spoofJson.intent.amountMinor).toBe(expected.quote.amountMinor);
          expect(spoofJson.intent.amountMinor).toBe(19500);
          expect(bodies[0]).not.toContain('Tampered');
          expect(bodies[0]).toContain('unit_amount%5D=19500');

          const unknownRes = await fetch(`${baseUrl}/api/payments/checkout-session`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              bookingReferenceId: 'apt-unknown',
              artistId: 'artist-unknown',
              serviceId: 'srv-999',
              tipPercentage: 0,
            }),
          });
          expect(unknownRes.status).toBe(400);
        }
      );
    });

    it('reuses one Stripe session for same bookingReferenceId (deterministic Idempotency-Key), enforces upper USD cap, and bounds depositIntents store', async () => {
      const sentKeys: string[] = [];
      const store = new InMemoryServerStateStore();
      const fakeFetch = ((_u: string, init?: RequestInit) => {
        const headers = (init?.headers ?? {}) as Record<string, string>;
        sentKeys.push(headers['Idempotency-Key']);
        return Promise.resolve(
          new Response(
            JSON.stringify({ id: 'cs_1', url: 'https://checkout.stripe.com/c/pay/cs_1' }),
            { status: 200 }
          )
        );
      }) as unknown as typeof fetch;

      const svc = new StripeHostedCheckoutService({
        store,
        secretKey: 'sk_test_x',
        webhookSecret: 'whsec_testsecret',
        fetchFn: fakeFetch,
      });

      const input = {
        bookingReferenceId: 'b1',
        artistId: 'artist-1',
        artistName: 'Elena Vasiliev',
        serviceId: 'srv-1',
        serviceName: 'Sculptural 3D Liquid Chrome Couture',
        amountUsd: 165,
        displayCurrency: 'USD' as const,
        originUrl: 'https://nailix.example',
      };

      const first = await svc.createHostedCheckoutSession(input);
      const second = await svc.createHostedCheckoutSession(input);
      expect(second.id).toBe(first.id);
      expect(sentKeys).toEqual(['checkout_b1']);

      // Direct service upper bound cap ($10,000 max) rejects 1e9
      await expect(
        svc.createHostedCheckoutSession({
          ...input,
          bookingReferenceId: 'b-huge',
          amountUsd: 1e9,
        })
      ).rejects.toThrow(/between \$0\.50 and \$10,000\.00/i);

      // Bounding check on store depositIntents (cap 500 prunes expired/oldest entries)
      for (let i = 0; i < 520; i++) {
        await store.saveDepositIntent({
          ...first,
          id: `intent-cap-${i}`,
          bookingReferenceId: `bk-cap-${i}`,
          expiresAt: '2000-01-01T00:00:00.000Z',
        });
      }
      expect(await store.getDepositIntent('intent-cap-0')).toBeUndefined();
      expect(await store.getDepositIntent('intent-cap-519')).toBeDefined();
    });
  });

  describe('Q-04 & Q-09 · Webhook amount/currency verification, PaymentIntent correlation, refunds, and opaque 400 errors', () => {
    it('does not mark an intent captured when amount_total or currency differs', async () => {
      const store = new InMemoryServerStateStore();
      const fakeFetch = (() =>
        Promise.resolve(
          new Response(
            JSON.stringify({ id: 'cs_1', url: 'https://checkout.stripe.com/c/pay/cs_1' }),
            { status: 200 }
          )
        )) as unknown as typeof fetch;
      const svc = new StripeHostedCheckoutService({
        store,
        secretKey: 'sk_test_x',
        webhookSecret: 'whsec_testsecret',
        fetchFn: fakeFetch,
      });

      const intent = await svc.createHostedCheckoutSession({
        bookingReferenceId: 'b-mismatch',
        artistId: 'artist-1',
        artistName: 'Elena',
        serviceId: 'srv-1',
        serviceName: 'Chrome',
        amountUsd: 165,
        displayCurrency: 'USD',
        originUrl: 'https://nailix.example',
      });

      const body = JSON.stringify({
        id: 'evt_mismatch_1',
        type: 'checkout.session.completed',
        data: {
          object: {
            id: 'cs_1',
            payment_status: 'paid',
            amount_total: 1,
            currency: 'eur',
            metadata: { intentId: intent.id },
          },
        },
      });
      const ts = Math.floor(Date.now() / 1000);
      const sig = `t=${ts},v1=${createHmac('sha256', 'whsec_testsecret').update(`${ts}.${body}`).digest('hex')}`;
      const res = await svc.handleWebhookEvent({
        rawBody: Buffer.from(body),
        signatureHeader: sig,
      });
      expect(res.newStatus).not.toBe('captured');
      expect(res.rejectedReason).toBe('amount_or_currency_mismatch');
    });

    it('propagates metadata to PaymentIntent, transitions charge.refunded -> released, and hides internal webhook error details', async () => {
      const stateStore = new InMemoryServerStateStore();
      const capturedBodies: string[] = [];
      const webhookSecret = 'whsec_q09_secret_12345';
      const stripeService = new StripeHostedCheckoutService({
        store: stateStore,
        secretKey: 'sk_test_q09',
        webhookSecret,
        fetchFn: (_u, init) => {
          capturedBodies.push(typeof init?.body === 'string' ? init.body : '');
          return Promise.resolve(
            new Response(
              JSON.stringify({ id: 'cs_q09', url: 'https://checkout.stripe.com/c/pay/cs_q09' }),
              { status: 200 }
            )
          );
        },
      });

      await withServer(
        app => {
          app.use('/api', createFoundationApiRouter({ stateStore, stripeService }));
        },
        async baseUrl => {
          const csRes = await fetch(`${baseUrl}/api/payments/checkout-session`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              bookingReferenceId: 'apt-q09',
              artistId: 'artist-1',
              serviceId: 'srv-1',
              tipPercentage: 0,
            }),
          });
          const { intent } = (await csRes.json()) as { intent: { id: string; amountMinor: number } };

          expect(capturedBodies[0]).toContain(
            `payment_intent_data%5Bmetadata%5D%5BintentId%5D=${encodeURIComponent(intent.id)}`
          );

          const ts = Math.floor(Date.now() / 1000);
          const piSuccess = JSON.stringify({
            id: 'evt_pi_ok',
            type: 'payment_intent.succeeded',
            data: {
              object: {
                id: 'pi_1',
                amount_received: intent.amountMinor,
                currency: 'usd',
                metadata: { intentId: intent.id },
              },
            },
          });
          const piSig = `t=${ts},v1=${createHmac('sha256', webhookSecret).update(`${ts}.${piSuccess}`).digest('hex')}`;
          const piRes = await fetch(`${baseUrl}/api/payments/webhooks/stripe`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Stripe-Signature': piSig },
            body: piSuccess,
          });
          expect(piRes.status).toBe(200);
          expect((await stateStore.getDepositIntent(intent.id))?.status).toBe('captured');

          // Refund transitions captured -> released
          const refundPayload = JSON.stringify({
            id: 'evt_refund_1',
            type: 'charge.refunded',
            data: {
              object: {
                id: 'ch_1',
                amount: intent.amountMinor,
                currency: 'usd',
                metadata: { intentId: intent.id },
              },
            },
          });
          const refSig = `t=${ts},v1=${createHmac('sha256', webhookSecret).update(`${ts}.${refundPayload}`).digest('hex')}`;
          const refRes = await fetch(`${baseUrl}/api/payments/webhooks/stripe`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Stripe-Signature': refSig },
            body: refundPayload,
          });
          expect(refRes.status).toBe(200);
          expect((await stateStore.getDepositIntent(intent.id))?.status).toBe('released');

          // Bad signature returns sanitized 400 error without exposing internal replay/secret diagnostics
          const badRes = await fetch(`${baseUrl}/api/payments/webhooks/stripe`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Stripe-Signature': 't=1,v1=dead' },
            body: '{}',
          });
          expect(badRes.status).toBe(400);
          const badJson = (await badRes.json()) as { error: string };
          expect(badJson.error).toBe('Invalid Stripe webhook.');
        }
      );
    });
  });

  describe('Q-05 · Production origin policy rejects request-header Host self-attestation', () => {
    it('with no NAILIX_ALLOWED_ORIGINS / APP_URL, production rejects Host/X-Forwarded-Host origin', () => {
      const fakeHeaders: Record<string, string> = {
        host: 'evil.example',
        origin: 'https://evil.example',
        'x-forwarded-proto': 'https',
      };
      const fakeReq = {
        headers: fakeHeaders,
        header(name: string): string | undefined {
          return fakeHeaders[name.toLowerCase()];
        },
        protocol: 'http',
      } as unknown as Request;

      const prevAllowed = process.env.NAILIX_ALLOWED_ORIGINS;
      const prevAppUrl = process.env.APP_URL;
      delete process.env.NAILIX_ALLOWED_ORIGINS;
      delete process.env.APP_URL;

      try {
        const res = validateWebAuthnOrigin({
          clientOrigin: 'https://evil.example',
          req: fakeReq,
          isProduction: true,
        });
        expect(res.ok).toBe(false);
      } finally {
        if (prevAllowed !== undefined) process.env.NAILIX_ALLOWED_ORIGINS = prevAllowed;
        if (prevAppUrl !== undefined) process.env.APP_URL = prevAppUrl;
      }
    });

    it('rejects mutating requests with foreign Origin header -> 403', async () => {
      await withServer(
        app => {
          app.use('/api', createFoundationApiRouter({ isProduction: true, allowedOrigins: ['https://nailix.art'] }));
        },
        async baseUrl => {
          const res = await fetch(`${baseUrl}/api/auth/webauthn/challenge`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Origin: 'https://attacker.example',
            },
            body: JSON.stringify({ ceremony: 'authentication' }),
          });
          expect(res.status).toBe(403);
        }
      );
    });
  });

  describe('Q-06 · Per-client challenge quota, HTTP 429 rate limiting, and minimal /health', () => {
    it('keeps a legitimate client challenge alive after 2100 anonymous issues from other clients', () => {
      const cs = new WebAuthnChallengeStubStore();
      const legit = cs.issueChallenge({ ceremony: 'authentication', clientKey: 'legit-client-ip' });
      for (let i = 0; i < 2100; i++) {
        cs.issueChallenge({ ceremony: 'authentication', clientKey: `flood-${i % 10}` });
      }
      expect(cs.consumeChallengeRecord(legit.challengeId).status).toBe('ok');
    });

    it('returns HTTP 429 with Retry-After when auth endpoints burst past threshold and keeps /health minimal', async () => {
      await withServer(
        app => {
          app.use(
            '/api',
            createFoundationApiRouter({
              rateLimits: { windowMs: 60_000, authMax: 3, checkoutMax: 2 },
            })
          );
        },
        async baseUrl => {
          for (let i = 0; i < 3; i++) {
            const okRes = await fetch(`${baseUrl}/api/auth/webauthn/challenge`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ ceremony: 'authentication' }),
            });
            expect(okRes.status).toBe(200);
          }

          const limited = await fetch(`${baseUrl}/api/auth/webauthn/challenge`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ ceremony: 'authentication' }),
          });
          expect(limited.status).toBe(429);
          expect(limited.headers.get('retry-after')).toBeTruthy();

          const health = (await (await fetch(`${baseUrl}/api/health`)).json()) as Record<string, unknown>;
          expect(health).toEqual({ ok: true });
        }
      );
    });
  });

  describe('Q-07 · Production boot secret enforcement, frame-ancestors default, HSTS, trust proxy, and JSON 404 /api/*', () => {
    it('refuses production startup without NAILIX_SESSION_SECRET, sets frame-ancestors self + HSTS, disables trust proxy by default, and returns JSON 404 on unknown /api/*', async () => {
      const prevSecret = process.env.NAILIX_SESSION_SECRET;
      const prevFrames = process.env.NAILIX_FRAME_ANCESTORS;
      const prevTrustProxy = process.env.TRUST_PROXY;
      delete process.env.NAILIX_SESSION_SECRET;
      delete process.env.NAILIX_FRAME_ANCESTORS;
      delete process.env.TRUST_PROXY;

      try {
        await expect(createAppServer({ isProduction: true, mountFrontend: false })).rejects.toThrow(
          /NAILIX_SESSION_SECRET/i
        );
        expect(buildServerHttpCsp(true)).toContain("frame-ancestors 'self'");
        expect(buildServerHttpCsp(true)).not.toContain('google.com');

        process.env.NAILIX_SESSION_SECRET = 'prod-strong-session-secret-32-chars!!';
        const app = await createAppServer({ isProduction: true, mountFrontend: false });
        expect(app.get('trust proxy')).toBe(false);

        const server = http.createServer(app);
        await new Promise<void>(resolve => server.listen(0, '127.0.0.1', () => resolve()));
        try {
          const port = (server.address() as AddressInfo).port;
          const missingApi = await fetch(`http://127.0.0.1:${port}/api/does-not-exist`);
          expect(missingApi.status).toBe(404);
          expect(missingApi.headers.get('content-type')).toContain('application/json');
          expect(missingApi.headers.get('strict-transport-security')).toContain('max-age=');
        } finally {
          await new Promise<void>((res, rej) => server.close(e => (e ? rej(e) : res())));
        }

        // securityHeadersMiddleware direct HSTS check
        const hstsRes = await withServerReturnHeader();
        expect(hstsRes).toContain('max-age=');
      } finally {
        if (prevSecret !== undefined) process.env.NAILIX_SESSION_SECRET = prevSecret;
        else delete process.env.NAILIX_SESSION_SECRET;
        if (prevFrames !== undefined) process.env.NAILIX_FRAME_ANCESTORS = prevFrames;
        if (prevTrustProxy !== undefined) process.env.TRUST_PROXY = prevTrustProxy;
      }
    });
  });

  describe('Q-08 · Strict ES256 curve P-256, RSA PKCS1 separation, and malformed session cookie safety', () => {
    it('ES256 (-7) accepts P-256 only and rejects P-384 / RSA-PSS', () => {
      const p256 = generateKeyPairSync('ec', { namedCurve: 'P-256' });
      const p384 = generateKeyPairSync('ec', { namedCurve: 'secp384r1' });
      const rsaPss = generateKeyPairSync('rsa-pss', { modulusLength: 2048 });

      expect(validateSpkiKeyForRegistration(spkiOf(p256), -7)).toBe(true);
      expect(validateSpkiKeyForRegistration(spkiOf(p384), -7)).toBe(false);
      expect(validateSpkiKeyForRegistration(spkiOf(rsaPss), -257)).toBe(false);
    });

    it('malformed percent-encoding in the session cookie returns null without throwing URIError', () => {
      const svc = new ServerSessionService({
        store: new InMemoryServerStateStore(),
        secret: 'x'.repeat(32),
      });
      expect(() => svc.extractCookieToken('nailix_sid=%E0%A4%A')).not.toThrow();
      expect(svc.extractCookieToken('nailix_sid=%E0%A4%A')).toBeNull();
    });
  });
});

async function withServerReturnHeader(): Promise<string | null> {
  let hsts: string | null = null;
  await withServer(
    app => {
      app.use(securityHeadersMiddleware(true));
      app.get('/ping', (_req, res) => {
        res.json({ ok: true });
      });
    },
    async baseUrl => {
      const res = await fetch(`${baseUrl}/ping`);
      hsts = res.headers.get('strict-transport-security');
    }
  );
  return hsts;
}
