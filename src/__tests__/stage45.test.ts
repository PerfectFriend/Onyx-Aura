// =============================================================================
// Stage 4 · Sprint 4.5 — Deployment, Return Reconciliation & Refund Hardening
// Implements all probes V-01 … V-06 from Kolyan's Stage 4.4 Audit (zero .todo).
// =============================================================================

import { createHash, createHmac, generateKeyPairSync } from 'node:crypto';
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import express from 'express';
import { describe, expect, it, vi } from 'vitest';
import { createAppServer } from '../../server';
import { matchIntentToAppointment } from '../domain/payments';
import { createFoundationApiRouter } from '../server/apiRouter';
import { WebAuthnChallengeStubStore } from '../server/challengeService';
import { InMemoryServerStateStore } from '../server/serverStore';
import { ServerSessionService } from '../server/sessionService';
import { StripeHostedCheckoutService } from '../server/stripeProvider';
import { Appointment } from '../types';

const b64u = (buf: Buffer | string): string =>
  (typeof buf === 'string' ? Buffer.from(buf, 'utf8') : buf).toString('base64url');

function makeRegAuthData(params: {
  rpId: string;
  flagsByte: number;
  credentialIdBytes: Buffer;
  spkiDer: Buffer;
}): Buffer {
  const rpHash = createHash('sha256').update(params.rpId).digest();
  const header = Buffer.alloc(5);
  header[0] = params.flagsByte | 0x40;
  header.writeUInt32BE(1, 1);
  const aaguid = Buffer.alloc(16, 0x33);
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

function stripeWithTestHarness(extraHandlers?: { paymentIntentId?: string }) {
  const store = new InMemoryServerStateStore();
  let n = 0;
  const fakeFetch = (() =>
    Promise.resolve({
      ok: true,
      json: () =>
        Promise.resolve({
          id: `cs_45_${++n}`,
          url: `https://checkout.stripe.com/c/pay/cs_45_${n}`,
          payment_intent: extraHandlers?.paymentIntentId ?? `pi_45_${n}`,
          expires_at: Math.floor(Date.now() / 1000) + 1800,
        }),
      text: () => Promise.resolve(''),
    })) as unknown as typeof fetch;

  const svc = new StripeHostedCheckoutService({
    store,
    secretKey: 'sk_test_stage45',
    webhookSecret: 'whsec_stage45_secret',
    fetchFn: fakeFetch,
  });

  const send = (event: object) => {
    const body = JSON.stringify(event);
    const ts = Math.floor(Date.now() / 1000);
    const sig = `t=${ts},v1=${createHmac('sha256', 'whsec_stage45_secret').update(`${ts}.${body}`).digest('hex')}`;
    return svc.handleWebhookEvent({ rawBody: Buffer.from(body), signatureHeader: sig });
  };

  return { store, svc, send };
}

async function withHttpServer(
  app: express.Express,
  run: (baseUrl: string) => Promise<void>
): Promise<void> {
  const server = http.createServer(app);
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', () => resolve()));
  try {
    const { port } = server.address() as AddressInfo;
    await run(`http://127.0.0.1:${port}`);
  } finally {
    await new Promise<void>((res, rej) => server.close(e => (e ? rej(e) : res())));
  }
}

describe('Stage 4 · Sprint 4.5 Hardening (V-01 … V-06)', () => {
  describe('V-01 · Proxy rate-limit bucketing & loud production origin warning', () => {
    it('keys rate limiter separately by X-Forwarded-For when TRUST_PROXY=1 is enabled', async () => {
      const prevTrustProxy = process.env.TRUST_PROXY;
      const prevAppUrl = process.env.APP_URL;
      process.env.TRUST_PROXY = '1';
      process.env.APP_URL = 'https://nailix.example';

      try {
        const app = await createAppServer({
          isProduction: true,
          mountFrontend: false,
          routerDeps: {
            rateLimits: { windowMs: 60_000, authMax: 2, checkoutMax: 5 },
          },
        });
        expect(app.get('trust proxy')).toBe(1);

        await withHttpServer(app, async baseUrl => {
          // Client A exhausts its 2-request bucket
          for (let i = 0; i < 2; i++) {
            const r = await fetch(`${baseUrl}/api/auth/webauthn/challenge`, {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                Origin: 'https://nailix.example',
                'X-Forwarded-For': '198.51.100.10',
              },
              body: JSON.stringify({ ceremony: 'authentication' }),
            });
            expect(r.status).toBe(200);
          }
          const limitedA = await fetch(`${baseUrl}/api/auth/webauthn/challenge`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Origin: 'https://nailix.example',
              'X-Forwarded-For': '198.51.100.10',
            },
            body: JSON.stringify({ ceremony: 'authentication' }),
          });
          expect(limitedA.status).toBe(429);

          // Distinct forwarded IP Client B keeps a fresh bucket
          const allowedB = await fetch(`${baseUrl}/api/auth/webauthn/challenge`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Origin: 'https://nailix.example',
              'X-Forwarded-For': '203.0.113.55',
            },
            body: JSON.stringify({ ceremony: 'authentication' }),
          });
          expect(allowedB.status).toBe(200);
        });
      } finally {
        if (prevTrustProxy !== undefined) process.env.TRUST_PROXY = prevTrustProxy;
        else delete process.env.TRUST_PROXY;
        if (prevAppUrl !== undefined) process.env.APP_URL = prevAppUrl;
        else delete process.env.APP_URL;
      }
    });

    it('logs a loud warning when production starts without APP_URL or NAILIX_ALLOWED_ORIGINS', async () => {
      const prevAppUrl = process.env.APP_URL;
      const prevAllowed = process.env.NAILIX_ALLOWED_ORIGINS;
      delete process.env.APP_URL;
      delete process.env.NAILIX_ALLOWED_ORIGINS;

      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      try {
        await createAppServer({ isProduction: true, mountFrontend: false });
        const messages = warnSpy.mock.calls.map(c => String(c[0]));
        expect(messages.some(m => /no allowed origins configured/i.test(m))).toBe(true);
      } finally {
        warnSpy.mockRestore();
        if (prevAppUrl !== undefined) process.env.APP_URL = prevAppUrl;
        if (prevAllowed !== undefined) process.env.NAILIX_ALLOWED_ORIGINS = prevAllowed;
      }
    });
  });

  describe('V-02 · Strict intent-to-booking reconciliation & minimal public GET /intents/:id', () => {
    it('matches strictly by bookingReferenceId + artistId + serviceId + escrowTxHash without trusting external refs', () => {
      const appointments: Appointment[] = [
        {
          id: 'apt-victim',
          clientName: 'Alice',
          clientPhone: '+1000',
          clientEmail: 'a@example.com',
          artistId: 'artist-1',
          artistName: 'Elena Vasiliev',
          artistAvatar: '',
          serviceId: 'srv-1',
          serviceName: 'Sculptural 3D Liquid Chrome Couture',
          price: 165,
          currency: 'USD',
          date: '2026-12-01',
          timeSlot: '11:30',
          status: 'pending',
          escrowTxHash: 'intent_victim_1',
          remindersEnabled: true,
          pushReminderScheduled: true,
          smsReminderScheduled: false,
          createdAt: '2026-11-20T10:00:00.000Z',
          origin: 'user',
        },
        {
          id: 'apt-attacker',
          clientName: 'Eve',
          clientPhone: '+2000',
          clientEmail: 'e@example.com',
          artistId: 'artist-1',
          artistName: 'Elena Vasiliev',
          artistAvatar: '',
          serviceId: 'srv-1',
          serviceName: 'Sculptural 3D Liquid Chrome Couture',
          price: 165,
          currency: 'USD',
          date: '2026-12-02',
          timeSlot: '15:00',
          status: 'pending',
          escrowTxHash: 'intent_attacker_9',
          remindersEnabled: true,
          pushReminderScheduled: true,
          smsReminderScheduled: false,
          createdAt: '2026-11-20T10:00:00.000Z',
          origin: 'user',
        },
      ];

      // Even if an attacker URL passed ?booking_ref=apt-attacker alongside intent_victim_1,
      // matchIntentToAppointment matches ONLY apt-victim and rejects mismatched artist/service/missing bookings.
      const matched = matchIntentToAppointment(
        {
          id: 'intent_victim_1',
          bookingReferenceId: 'apt-victim',
          artistId: 'artist-1',
          serviceId: 'srv-1',
        },
        appointments
      );
      expect(matched?.id).toBe('apt-victim');

      const mismatchService = matchIntentToAppointment(
        {
          id: 'intent_victim_1',
          bookingReferenceId: 'apt-victim',
          artistId: 'artist-1',
          serviceId: 'srv-2',
        },
        appointments
      );
      expect(mismatchService).toBeUndefined();

      const missingBooking = matchIntentToAppointment(
        {
          id: 'intent_other_device',
          bookingReferenceId: 'apt-remote-only',
          artistId: 'artist-1',
          serviceId: 'srv-1',
        },
        appointments
      );
      expect(missingBooking).toBeUndefined();
    });

    it('stores validated appointmentDate/appointmentTimeSlot and strips hostedCheckoutUrl/providerId from GET /api/payments/intents/:id', async () => {
      const { store, svc } = stripeWithTestHarness();
      const app = express();
      app.use('/api', createFoundationApiRouter({ stateStore: store, stripeService: svc }));

      await withHttpServer(app, async baseUrl => {
        const badSlot = await fetch(`${baseUrl}/api/payments/checkout-session`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            bookingReferenceId: 'apt-slot-bad',
            artistId: 'artist-1',
            serviceId: 'srv-1',
            appointmentDate: 'not-a-date',
          }),
        });
        expect(badSlot.status).toBe(400);

        const created = await fetch(`${baseUrl}/api/payments/checkout-session`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            bookingReferenceId: 'apt-slot-ok',
            artistId: 'artist-1',
            serviceId: 'srv-1',
            tipPercentage: 0,
            displayCurrency: 'USD',
            appointmentDate: '2026-12-05',
            appointmentTimeSlot: '16:30',
          }),
        });
        expect(created.status).toBe(201);
        const { intent } = (await created.json()) as { intent: { id: string } };

        const publicRes = await fetch(`${baseUrl}/api/payments/intents/${intent.id}`);
        expect(publicRes.status).toBe(200);
        const publicJson = (await publicRes.json()) as { intent: Record<string, unknown> };
        expect(publicJson.intent.appointmentDate).toBe('2026-12-05');
        expect(publicJson.intent.appointmentTimeSlot).toBe('16:30');
        expect(publicJson.intent.hostedCheckoutUrl).toBeUndefined();
        expect(publicJson.intent.providerId).toBeUndefined();
        expect(publicJson.intent.stripePaymentIntentId).toBeUndefined();
      });
    });
  });

  describe('V-03 · Partial refunds, disputes, payment_intent correlation, and unmatched webhooks', () => {
    it('tracks partial refunds as partially_refunded instead of released', async () => {
      const { store, svc, send } = stripeWithTestHarness();
      const intent = await svc.createHostedCheckoutSession({
        bookingReferenceId: 'b-partial-1',
        artistId: 'artist-1',
        artistName: 'Elena Vasiliev',
        serviceId: 'srv-1',
        serviceName: 'Sculptural 3D Liquid Chrome Couture',
        amountUsd: 165,
        displayCurrency: 'USD',
        originUrl: 'https://salon.example',
      });

      await send({
        id: 'e-cap-1',
        type: 'checkout.session.completed',
        data: {
          object: {
            id: 'cs_1',
            payment_status: 'paid',
            amount_total: intent.amountMinor,
            currency: 'usd',
            metadata: { intentId: intent.id },
          },
        },
      });
      await send({
        id: 'e-ref-partial-1',
        type: 'charge.refunded',
        data: {
          object: {
            id: 'ch_1',
            amount: intent.amountMinor,
            amount_refunded: 100,
            metadata: { intentId: intent.id },
          },
        },
      });

      const updated = await store.getDepositIntent(intent.id);
      expect(updated?.status).toBe('partially_refunded');
      expect(updated?.amountRefundedMinor).toBe(100);

      // Full refund afterwards transitions cleanly to released
      await send({
        id: 'e-ref-full-1',
        type: 'charge.refunded',
        data: {
          object: {
            id: 'ch_1',
            amount: intent.amountMinor,
            amount_refunded: intent.amountMinor,
            metadata: { intentId: intent.id },
          },
        },
      });
      expect((await store.getDepositIntent(intent.id))?.status).toBe('released');
    });

    it('maps charge.dispute.created to disputed (not released)', async () => {
      const { store, svc, send } = stripeWithTestHarness();
      const intent = await svc.createHostedCheckoutSession({
        bookingReferenceId: 'b-dispute-1',
        artistId: 'artist-1',
        artistName: 'Elena Vasiliev',
        serviceId: 'srv-1',
        serviceName: 'Sculptural 3D Liquid Chrome Couture',
        amountUsd: 165,
        displayCurrency: 'USD',
        originUrl: 'https://salon.example',
      });

      await send({
        id: 'e-cap-2',
        type: 'checkout.session.completed',
        data: {
          object: {
            id: 'cs_2',
            payment_status: 'paid',
            amount_total: intent.amountMinor,
            currency: 'usd',
            metadata: { intentId: intent.id },
          },
        },
      });
      await send({
        id: 'e-disp-2',
        type: 'charge.dispute.created',
        data: { object: { id: 'dp_1', metadata: { intentId: intent.id } } },
      });

      expect((await store.getDepositIntent(intent.id))?.status).toBe('disputed');
    });

    it('correlates webhooks via payment_intent fallback and marks missing-intent webhooks as unmatched', async () => {
      const { store, svc, send } = stripeWithTestHarness({ paymentIntentId: 'pi_fallback_77' });
      const intent = await svc.createHostedCheckoutSession({
        bookingReferenceId: 'b-fallback-77',
        artistId: 'artist-1',
        artistName: 'Elena Vasiliev',
        serviceId: 'srv-1',
        serviceName: 'Sculptural 3D Liquid Chrome Couture',
        amountUsd: 165,
        displayCurrency: 'USD',
        originUrl: 'https://salon.example',
      });

      await send({
        id: 'e-cap-77',
        type: 'checkout.session.completed',
        data: {
          object: {
            payment_status: 'paid',
            amount_total: intent.amountMinor,
            currency: 'usd',
            payment_intent: 'pi_fallback_77',
            metadata: { intentId: intent.id },
          },
        },
      });

      // Charge refund event WITHOUT metadata matches stored stripePaymentIntentId
      const refundNoMeta = await send({
        id: 'e-ref-nometa',
        type: 'charge.refunded',
        data: {
          object: {
            id: 'ch_nometa',
            payment_intent: 'pi_fallback_77',
            amount: intent.amountMinor,
            amount_refunded: intent.amountMinor,
          },
        },
      });
      expect(refundNoMeta.unmatched).toBeUndefined();
      expect(refundNoMeta.newStatus).toBe('released');
      expect((await store.getDepositIntent(intent.id))?.status).toBe('released');

      // Completely unknown event returns unmatched: true with NO bogus newStatus: 'released'
      const orphan = await send({
        id: 'e-orphan-1',
        type: 'charge.refunded',
        data: { object: { id: 'ch_unknown', amount_refunded: 500 } },
      });
      expect(orphan.unmatched).toBe(true);
      expect(orphan.newStatus).toBeUndefined();
    });
  });

  describe('V-04 · Durable, hashed, atomic master invite codes (>= 16 chars)', () => {
    it('keeps a consumed invite code consumed across router recreation and allows at most one concurrent /promote-master winner', async () => {
      const stateStore = new InMemoryServerStateStore();
      const sessionService = new ServerSessionService({
        store: stateStore,
        secret: 'stage45-session-secret-32-chars!!',
      });
      const challengeStore = new WebAuthnChallengeStubStore();
      const invite = 'NAILIX-MASTER-45-STRONG'; // 23 chars >= 16

      const ec1 = generateKeyPairSync('ec', { namedCurve: 'P-256' });
      const ec2 = generateKeyPairSync('ec', { namedCurve: 'P-256' });

      const registerClientAndGetCookie = async (
        baseUrl: string,
        keyPair: ReturnType<typeof generateKeyPairSync>,
        credLabel: string
      ) => {
        const ch = (await (
          await fetch(`${baseUrl}/api/auth/webauthn/challenge`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ ceremony: 'registration' }),
          })
        ).json()) as { challengeId: string; challengeBase64Url: string };

        const credBytes = Buffer.from(credLabel, 'utf8');
        const credId = b64u(credBytes);
        const spkiDer = keyPair.publicKey.export({ type: 'spki', format: 'der' });
        const origin = new URL(baseUrl).origin;
        const rpId = new URL(baseUrl).hostname;

        const regRes = await fetch(`${baseUrl}/api/auth/webauthn/register`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            challengeId: ch.challengeId,
            credentialId: credId,
            rawIdBase64Url: credId,
            publicKeySpkiBase64Url: b64u(spkiDer),
            clientDataJSONBase64Url: b64u(
              JSON.stringify({ type: 'webauthn.create', challenge: ch.challengeBase64Url, origin })
            ),
            authenticatorDataBase64Url: b64u(
              makeRegAuthData({ rpId, flagsByte: 0x05, credentialIdBytes: credBytes, spkiDer })
            ),
            rpId,
            algorithm: -7,
          }),
        });
        expect(regRes.status).toBe(201);
        return (regRes.headers.get('set-cookie') ?? '').split(';')[0];
      };

      // Boot 1: Two concurrent /promote-master calls race for the single invite code
      const app1 = express();
      app1.use(
        '/api',
        createFoundationApiRouter({
          stateStore,
          sessionService,
          challengeStore,
          masterInviteCodes: [invite, 'SHORT-CODE'], // <16 char SHORT-CODE ignored
        })
      );

      let loserCookie = '';
      await withHttpServer(app1, async baseUrl => {
        const cookie1 = await registerClientAndGetCookie(baseUrl, ec1, 'cred-race-1');
        const cookie2 = await registerClientAndGetCookie(baseUrl, ec2, 'cred-race-2');

        const [p1, p2] = await Promise.all([
          fetch(`${baseUrl}/api/auth/webauthn/promote-master`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Cookie: cookie1 },
            body: JSON.stringify({ masterInviteCode: invite }),
          }),
          fetch(`${baseUrl}/api/auth/webauthn/promote-master`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Cookie: cookie2 },
            body: JSON.stringify({ masterInviteCode: invite }),
          }),
        ]);

        const statuses = [p1.status, p2.status].sort();
        expect(statuses).toEqual([200, 403]);
        // Winner's previous session was rotated/revoked; loser's session stays active
        loserCookie = p1.status === 403 ? cookie1 : cookie2;
      });

      // Boot 2: Fresh router instance over the SAME stateStore (simulating server restart)
      const app2 = express();
      app2.use(
        '/api',
        createFoundationApiRouter({
          stateStore,
          sessionService,
          challengeStore,
          masterInviteCodes: [invite],
        })
      );

      await withHttpServer(app2, async baseUrl => {
        const replayAfterRestart = await fetch(`${baseUrl}/api/auth/webauthn/promote-master`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Cookie: loserCookie },
          body: JSON.stringify({ masterInviteCode: invite }),
        });
        expect(replayAfterRestart.status).toBe(403);
      });
    });
  });

  describe('V-05 & V-06 · Server quote endpoint, credentialId === rawIdBase64Url, currency enum & 409 checkout conflict', () => {
    it('exposes authoritative /api/payments/quote, rejects rawId mismatch, rejects bad displayCurrency, and returns 409 on conflicting bookingRef', async () => {
      const { store, svc } = stripeWithTestHarness();
      const challengeStore = new WebAuthnChallengeStubStore();
      const ec = generateKeyPairSync('ec', { namedCurve: 'P-256' });
      const spkiDer = ec.publicKey.export({ type: 'spki', format: 'der' });

      const app = express();
      app.use('/api', createFoundationApiRouter({ stateStore: store, stripeService: svc, challengeStore }));

      await withHttpServer(app, async baseUrl => {
        // V-05 Quote endpoint
        const quoteOk = await fetch(
          `${baseUrl}/api/payments/quote?artistId=artist-1&serviceId=srv-1&tipPercentage=18`
        );
        expect(quoteOk.status).toBe(200);
        const quoteJson = (await quoteOk.json()) as { quote: { basePriceUsd: number; totalUsd: number } };
        expect(quoteJson.quote.basePriceUsd).toBe(165);
        expect(quoteJson.quote.totalUsd).toBe(195);

        const quoteBad = await fetch(
          `${baseUrl}/api/payments/quote?artistId=artist-1&serviceId=srv-9&tipPercentage=0`
        );
        expect(quoteBad.status).toBe(400);

        // V-06 credentialId !== rawIdBase64Url rejected with 400
        const ch = (await (
          await fetch(`${baseUrl}/api/auth/webauthn/challenge`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ ceremony: 'registration' }),
          })
        ).json()) as { challengeId: string; challengeBase64Url: string };

        const credBytes = Buffer.from('cred-id-match-check', 'utf8');
        const mismatchReg = await fetch(`${baseUrl}/api/auth/webauthn/register`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            challengeId: ch.challengeId,
            credentialId: b64u(credBytes),
            rawIdBase64Url: b64u(Buffer.from('different-raw-id', 'utf8')),
            publicKeySpkiBase64Url: b64u(spkiDer),
            clientDataJSONBase64Url: b64u(
              JSON.stringify({
                type: 'webauthn.create',
                challenge: ch.challengeBase64Url,
                origin: new URL(baseUrl).origin,
              })
            ),
            authenticatorDataBase64Url: b64u(
              makeRegAuthData({
                rpId: new URL(baseUrl).hostname,
                flagsByte: 0x05,
                credentialIdBytes: credBytes,
                spkiDer,
              })
            ),
            rpId: new URL(baseUrl).hostname,
            algorithm: -7,
          }),
        });
        expect(mismatchReg.status).toBe(400);

        // V-06 Unsupported displayCurrency rejected with 400
        const badCurr = await fetch(`${baseUrl}/api/payments/checkout-session`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            bookingReferenceId: 'apt-curr-1',
            artistId: 'artist-1',
            serviceId: 'srv-1',
            displayCurrency: 'DOGE',
          }),
        });
        expect(badCurr.status).toBe(400);

        // V-06 Conflicting serviceId on open bookingReferenceId returns 409 Conflict
        const openFirst = await fetch(`${baseUrl}/api/payments/checkout-session`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            bookingReferenceId: 'apt-conflict-45',
            artistId: 'artist-1',
            serviceId: 'srv-1',
            tipPercentage: 0,
            displayCurrency: 'USD',
          }),
        });
        expect(openFirst.status).toBe(201);

        const openConflict = await fetch(`${baseUrl}/api/payments/checkout-session`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            bookingReferenceId: 'apt-conflict-45',
            artistId: 'artist-1',
            serviceId: 'srv-2',
            tipPercentage: 0,
            displayCurrency: 'USD',
          }),
        });
        expect(openConflict.status).toBe(409);
      });
    });
  });
});
