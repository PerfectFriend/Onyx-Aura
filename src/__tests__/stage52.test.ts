// =============================================================================
// Stage 5 · Sprint 5.2 — Booking-Gated Reviews & Authoritative Ratings Tests
// Covers domain validation, checkout ownerCredentialId binding, full Stripe ->
// review -> sum-preserving rating E2E, negative security matrix (401/400/403/409/429),
// FileServerStateStore restart persistence + Stage 4 snapshot compatibility,
// and reviewsService client adapter graceful fallback & error translation.
// =============================================================================

import { createHash, createHmac, generateKeyPairSync } from 'node:crypto';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import os from 'node:os';
import path from 'node:path';
import express from 'express';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  isSafeReviewIdentifier,
  PublicReviewView,
  ServerArtistRatingSummary,
  validateCreateReviewPayload,
} from '../domain/reviews';
import {
  fetchEligibleBookingsForReview,
  fetchServerReviews,
  submitServerBookingReview,
} from '../infrastructure/reviews/reviewsService';
import { createFoundationApiRouter } from '../server/apiRouter';
import { WebAuthnChallengeStubStore } from '../server/challengeService';
import { FileServerStateStore, InMemoryServerStateStore } from '../server/serverStore';
import { ServerSessionService } from '../server/sessionService';
import { StripeHostedCheckoutService } from '../server/stripeProvider';

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

function buildReviewTestApp(opts?: {
  store?: InMemoryServerStateStore;
  reviewMax?: number;
  stripeFetchError?: boolean;
}) {
  const store = opts?.store ?? new InMemoryServerStateStore();
  const challengeStore = new WebAuthnChallengeStubStore(60_000);
  const sessionService = new ServerSessionService({
    store,
    secret: 'stage52_test_session_secret_key_12345',
  });

  let checkoutCounter = 0;
  const fakeStripeFetch = (() => {
    checkoutCounter += 1;
    return Promise.resolve({
      ok: !opts?.stripeFetchError,
      status: opts?.stripeFetchError ? 500 : 200,
      json: () =>
        Promise.resolve({
          id: `cs_s52_${checkoutCounter}`,
          url: `https://checkout.stripe.com/c/pay/cs_s52_${checkoutCounter}`,
          payment_intent: `pi_s52_${checkoutCounter}`,
          expires_at: Math.floor(Date.now() / 1000) + 1800,
        }),
      text: () => Promise.resolve(''),
    });
  }) as unknown as typeof fetch;

  const webhookSecret = 'whsec_stage52_review_secret';
  const stripeService = new StripeHostedCheckoutService({
    store,
    secretKey: 'sk_test_stage52',
    webhookSecret,
    fetchFn: fakeStripeFetch,
  });

  const router = createFoundationApiRouter({
    challengeStore,
    stateStore: store,
    sessionService,
    stripeService,
    allowedOrigins: ['http://127.0.0.1:3000', 'http://localhost:3000'],
    isProduction: false,
    rateLimits: {
      windowMs: 60_000,
      authMax: 100,
      checkoutMax: 100,
      reviewMax: opts?.reviewMax ?? 30,
    },
  });

  const app = express();
  app.use('/api', router);
  return { app, store, webhookSecret };
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

function extractSidCookie(res: Response): string {
  const setCookie = res.headers.get('set-cookie') ?? '';
  const match = setCookie.match(/nailix_sid=([^;]+)/);
  if (!match) {
    throw new Error(`Expected nailix_sid Set-Cookie header, got "${setCookie}"`);
  }
  return `nailix_sid=${match[1]}`;
}

async function registerPasskeySession(
  baseUrl: string,
  displayName: string,
  credentialLabel: string
): Promise<{ cookie: string; credentialId: string }> {
  const origin = 'http://localhost:3000';
  const chRes = await fetch(`${baseUrl}/api/auth/webauthn/challenge`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Origin: origin },
    body: JSON.stringify({ ceremony: 'registration' }),
  });
  const ch = (await chRes.json()) as { challengeId: string; challengeBase64Url: string };

  const { publicKey } = generateKeyPairSync('ec', { namedCurve: 'P-256' });
  const spkiDer = publicKey.export({ type: 'spki', format: 'der' });
  const credBytes = Buffer.from(credentialLabel, 'utf8');
  const credId = b64u(credBytes);
  const authData = makeRegAuthData({
    rpId: 'localhost',
    flagsByte: 0x05,
    credentialIdBytes: credBytes,
    spkiDer,
  });

  const regRes = await fetch(`${baseUrl}/api/auth/webauthn/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Origin: origin },
    body: JSON.stringify({
      challengeId: ch.challengeId,
      credentialId: credId,
      rawIdBase64Url: credId,
      publicKeySpkiBase64Url: b64u(spkiDer),
      clientDataJSONBase64Url: b64u(
        JSON.stringify({
          type: 'webauthn.create',
          challenge: ch.challengeBase64Url,
          origin,
        })
      ),
      authenticatorDataBase64Url: b64u(authData),
      rpId: 'localhost',
      displayName,
      algorithm: -7,
    }),
  });
  if (regRes.status !== 201) {
    throw new Error(`Passkey register failed unexpectedly: ${regRes.status}`);
  }
  return { cookie: extractSidCookie(regRes), credentialId: credId };
}

async function createAndCaptureBooking(params: {
  baseUrl: string;
  cookie?: string;
  webhookSecret: string;
  bookingReferenceId: string;
  artistId: string;
  serviceId: string;
  appointmentDate?: string;
  appointmentTimeSlot?: string;
  webhookStatus?: 'captured' | 'unpaid' | 'released' | 'disputed';
}): Promise<string> {
  const origin = 'http://localhost:3000';
  const checkoutRes = await fetch(`${params.baseUrl}/api/payments/checkout-session`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Origin: origin,
      ...(params.cookie ? { Cookie: params.cookie } : {}),
    },
    body: JSON.stringify({
      bookingReferenceId: params.bookingReferenceId,
      artistId: params.artistId,
      serviceId: params.serviceId,
      tipPercentage: 0,
      displayCurrency: 'USD',
      originUrl: origin,
      appointmentDate: params.appointmentDate ?? '2026-12-01',
      appointmentTimeSlot: params.appointmentTimeSlot ?? '14:00',
    }),
  });
  expect(checkoutRes.status).toBe(201);
  const created = (await checkoutRes.json()) as {
    intent: { id: string; amountMinor: number; stripePaymentIntentId?: string };
  };

  if (params.webhookStatus === 'unpaid') {
    return created.intent.id;
  }

  const sendWebhook = async (event: object) => {
    const raw = JSON.stringify(event);
    const ts = Math.floor(Date.now() / 1000);
    const sig = `t=${ts},v1=${createHmac('sha256', params.webhookSecret).update(`${ts}.${raw}`).digest('hex')}`;
    const res = await fetch(`${params.baseUrl}/api/payments/webhooks/stripe`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'stripe-signature': sig,
      },
      body: raw,
    });
    expect(res.status).toBe(200);
  };

  await sendWebhook({
    id: `evt_cap_${params.bookingReferenceId}`,
    type: 'checkout.session.completed',
    data: {
      object: {
        payment_status: 'paid',
        payment_intent: created.intent.stripePaymentIntentId ?? `pi_cap_${params.bookingReferenceId}`,
        amount_total: created.intent.amountMinor,
        currency: 'usd',
        metadata: { intentId: created.intent.id },
      },
    },
  });

  if (params.webhookStatus === 'released') {
    await sendWebhook({
      id: `evt_rel_${params.bookingReferenceId}`,
      type: 'charge.refunded',
      data: {
        object: {
          payment_intent:
            created.intent.stripePaymentIntentId ?? `pi_cap_${params.bookingReferenceId}`,
          amount_refunded: created.intent.amountMinor,
          metadata: { intentId: created.intent.id },
        },
      },
    });
  } else if (params.webhookStatus === 'disputed') {
    await sendWebhook({
      id: `evt_disp_${params.bookingReferenceId}`,
      type: 'charge.dispute.created',
      data: {
        object: {
          payment_intent:
            created.intent.stripePaymentIntentId ?? `pi_cap_${params.bookingReferenceId}`,
          metadata: { intentId: created.intent.id },
        },
      },
    });
  }

  return created.intent.id;
}

describe('Stage 5 · Sprint 5.2 Booking-Gated Reviews & Sum-Preserving Ratings', () => {
  const originalFetch = globalThis.fetch;

  afterEach(() => {
    globalThis.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  describe('Domain Validation & Prototype Pollution Guards', () => {
    it('rejects prototype-polluting identifiers, invalid scores, and short review text', () => {
      expect(isSafeReviewIdentifier('__proto__')).toBe(false);
      expect(isSafeReviewIdentifier('constructor')).toBe(false);
      expect(isSafeReviewIdentifier('prototype')).toBe(false);
      expect(isSafeReviewIdentifier('   ')).toBe(false);
      expect(isSafeReviewIdentifier('bk_valid_1')).toBe(true);

      const badProto = validateCreateReviewPayload({
        bookingReferenceId: '__proto__',
        artistId: 'artist-1',
        breakdown: { technique: 5, hygiene: 5, durability: 5, precision: 5 },
        text: 'Great cuticle prep!',
      });
      expect(badProto.ok).toBe(false);

      const badScore = validateCreateReviewPayload({
        bookingReferenceId: 'bk_1',
        artistId: 'artist-1',
        breakdown: { technique: 6, hygiene: 5, durability: 5, precision: 5 },
        text: 'Great cuticle prep!',
      });
      expect(badScore.ok).toBe(false);

      const badNaN = validateCreateReviewPayload({
        bookingReferenceId: 'bk_1',
        artistId: 'artist-1',
        rating: Number.NaN,
        breakdown: { technique: 5, hygiene: 5, durability: 5, precision: 5 },
        text: 'Great cuticle prep!',
      });
      expect(badNaN.ok).toBe(false);

      const shortText = validateCreateReviewPayload({
        bookingReferenceId: 'bk_1',
        artistId: 'artist-1',
        breakdown: { technique: 5, hygiene: 5, durability: 5, precision: 5 },
        text: 'Ok',
      });
      expect(shortText.ok).toBe(false);

      const validOmittedRating = validateCreateReviewPayload({
        bookingReferenceId: ' bk_1 ',
        artistId: 'artist-1',
        breakdown: { technique: 5, hygiene: 4, durability: 5, precision: 4 },
        text: '  Clean Russian manicure and balanced apex.  ',
      });
      expect(validOmittedRating.ok).toBe(true);
      if (validOmittedRating.ok) {
        expect(validOmittedRating.value.bookingReferenceId).toBe('bk_1');
        expect(validOmittedRating.value.rating).toBe(4.5);
        expect(validOmittedRating.value.text).toBe('Clean Russian manicure and balanced apex.');
      }
    });
  });

  describe('Server API End-to-End Flow, Ownership Binding & Negative Security Matrix', () => {
    it('completes Passkey -> Checkout -> Stripe Capture -> Eligible -> POST /reviews (201) -> Idempotent Replay (200) -> Sum-Preserving Rating', async () => {
      const { app, webhookSecret } = buildReviewTestApp();

      await withHttpServer(app, async baseUrl => {
        const origin = 'http://localhost:3000';
        const alice = await registerPasskeySession(baseUrl, 'Alice Client', 'alice-cred-1');

        const intentId1 = await createAndCaptureBooking({
          baseUrl,
          cookie: alice.cookie,
          webhookSecret,
          bookingReferenceId: 'bk_s52_01',
          artistId: 'artist-1',
          serviceId: 'srv-1',
          webhookStatus: 'captured',
        });

        // Public payment intent view MUST NOT leak ownerCredentialId
        const intentStatusRes = await fetch(`${baseUrl}/api/payments/intents/${intentId1}`);
        const intentStatusBody = (await intentStatusRes.json()) as {
          intent: Record<string, unknown>;
        };
        expect('ownerCredentialId' in intentStatusBody.intent).toBe(false);

        // Eligible list returns captured unreviewed booking for Alice
        const eligRes = await fetch(`${baseUrl}/api/reviews/eligible`, {
          headers: { Cookie: alice.cookie },
        });
        expect(eligRes.status).toBe(200);
        const eligBody = (await eligRes.json()) as {
          eligibleBookings: Array<{ bookingReferenceId: string; artistId: string; serviceName: string }>;
        };
        expect(eligBody.eligibleBookings).toHaveLength(1);
        expect(eligBody.eligibleBookings[0].bookingReferenceId).toBe('bk_s52_01');
        expect(eligBody.eligibleBookings[0].artistId).toBe('artist-1');

        const reviewPayload = {
          bookingReferenceId: 'bk_s52_01',
          artistId: 'artist-1',
          rating: 5,
          breakdown: { technique: 5, hygiene: 5, durability: 5, precision: 5 },
          text: 'Flawless chrome sculpture and meticulous sterilization!',
        };

        // First POST -> 201 Created
        const createRes = await fetch(`${baseUrl}/api/reviews`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Origin: origin,
            Cookie: alice.cookie,
          },
          body: JSON.stringify(reviewPayload),
        });
        expect(createRes.status).toBe(201);
        const createBody = (await createRes.json()) as {
          ok: boolean;
          idempotentReplay: boolean;
          review: PublicReviewView & Record<string, unknown>;
          artistRating: ServerArtistRatingSummary;
        };
        expect(createBody.ok).toBe(true);
        expect(createBody.idempotentReplay).toBe(false);
        expect(createBody.review.confirmedAfterCompletedBooking).toBe(true);
        expect(createBody.review.authorDisplayName).toBe('Alice Client');
        expect('authorCredentialId' in createBody.review).toBe(false);
        expect('intentId' in createBody.review).toBe(false);
        expect(createBody.artistRating.rating).toBe(5);
        expect(createBody.artistRating.totalReviews).toBe(1);
        expect(createBody.artistRating.ratingSum).toBe(5);

        // Booking is removed from eligible list after review
        const eligAfterRes = await fetch(`${baseUrl}/api/reviews/eligible`, {
          headers: { Cookie: alice.cookie },
        });
        const eligAfterBody = (await eligAfterRes.json()) as {
          eligibleBookings: unknown[];
        };
        expect(eligAfterBody.eligibleBookings).toHaveLength(0);

        // Identical retry -> 200 OK idempotentReplay without double-counting
        const replayRes = await fetch(`${baseUrl}/api/reviews`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Origin: origin,
            Cookie: alice.cookie,
          },
          body: JSON.stringify(reviewPayload),
        });
        expect(replayRes.status).toBe(200);
        const replayBody = (await replayRes.json()) as {
          idempotentReplay: boolean;
          review: PublicReviewView;
          artistRating: ServerArtistRatingSummary;
        };
        expect(replayBody.idempotentReplay).toBe(true);
        expect(replayBody.review.id).toBe(createBody.review.id);
        expect(replayBody.artistRating.totalReviews).toBe(1);

        // Conflicting payload on same booking -> 409 Conflict
        const conflictRes = await fetch(`${baseUrl}/api/reviews`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Origin: origin,
            Cookie: alice.cookie,
          },
          body: JSON.stringify({
            ...reviewPayload,
            text: 'Changed review commentary attempting overwrite!',
          }),
        });
        expect(conflictRes.status).toBe(409);
        const conflictBody = (await conflictRes.json()) as { code: string };
        expect(conflictBody.code).toBe('review_duplicate');

        // Second booking by Alice for same artist 'artist-1' -> sum-preserving rating (5 + 4)/2 = 4.5
        await createAndCaptureBooking({
          baseUrl,
          cookie: alice.cookie,
          webhookSecret,
          bookingReferenceId: 'bk_s52_02',
          artistId: 'artist-1',
          serviceId: 'srv-2',
          webhookStatus: 'captured',
        });

        const secondCreateRes = await fetch(`${baseUrl}/api/reviews`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Origin: origin,
            Cookie: alice.cookie,
          },
          body: JSON.stringify({
            bookingReferenceId: 'bk_s52_02',
            artistId: 'artist-1',
            rating: 4,
            breakdown: { technique: 4, hygiene: 4, durability: 4, precision: 4 },
            text: 'Very solid cuticle shaping and great retention after two weeks.',
          }),
        });
        expect(secondCreateRes.status).toBe(201);
        const secondCreateBody = (await secondCreateRes.json()) as {
          artistRating: ServerArtistRatingSummary;
        };
        expect(secondCreateBody.artistRating.rating).toBe(4.5);
        expect(secondCreateBody.artistRating.totalReviews).toBe(2);
        expect(secondCreateBody.artistRating.ratingSum).toBe(9);

        // Public feed GET /api/reviews?artistId=artist-1 strips PII & keeps both entries
        const feedRes = await fetch(`${baseUrl}/api/reviews?artistId=artist-1`);
        expect(feedRes.status).toBe(200);
        const feedBody = (await feedRes.json()) as {
          ok: boolean;
          reviews: Array<PublicReviewView & Record<string, unknown>>;
          artistRatings: Record<string, ServerArtistRatingSummary>;
        };
        expect(feedBody.ok).toBe(true);
        expect(feedBody.reviews).toHaveLength(2);
        for (const rev of feedBody.reviews) {
          expect('authorCredentialId' in rev).toBe(false);
          expect('intentId' in rev).toBe(false);
        }
        expect(feedBody.artistRatings['artist-1'].rating).toBe(4.5);
      });
    });

    it('rejects unauthenticated (401), unowned/unpaid/refunded/disputed (403), artist mismatch (403), bad query (400), cross-owner checkout steal (409), and rate limits (429)', async () => {
      const { app, webhookSecret } = buildReviewTestApp({ reviewMax: 5 });

      await withHttpServer(app, async baseUrl => {
        const origin = 'http://localhost:3000';

        // 1. Unauthenticated -> 401 session_required
        const unauthElig = await fetch(`${baseUrl}/api/reviews/eligible`);
        expect(unauthElig.status).toBe(401);

        const unauthPost = await fetch(`${baseUrl}/api/reviews`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Origin: origin },
          body: JSON.stringify({
            bookingReferenceId: 'bk_missing',
            artistId: 'artist-1',
            breakdown: { technique: 5, hygiene: 5, durability: 5, precision: 5 },
            text: 'No session token present',
          }),
        });
        expect(unauthPost.status).toBe(401);
        const unauthBody = (await unauthPost.json()) as { code: string };
        expect(unauthBody.code).toBe('session_required');

        // Bad query parameter -> 400 invalid_request
        const protoQuery = await fetch(`${baseUrl}/api/reviews?artistId=__proto__`);
        expect(protoQuery.status).toBe(400);

        const alice = await registerPasskeySession(baseUrl, 'Alice', 'alice-neg-1');
        const mallory = await registerPasskeySession(baseUrl, 'Mallory', 'mallory-neg-1');

        // 2. Unpaid (requires_action), Refunded (released), Disputed, & Alice's captured booking
        await createAndCaptureBooking({
          baseUrl,
          cookie: alice.cookie,
          webhookSecret,
          bookingReferenceId: 'bk_unpaid',
          artistId: 'artist-1',
          serviceId: 'srv-1',
          webhookStatus: 'unpaid',
        });

        // Cross-owner checkout hijack attempt on same open bookingRef -> 409 checkout_conflict
        const stealCheckoutRes = await fetch(`${baseUrl}/api/payments/checkout-session`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Origin: origin,
            Cookie: mallory.cookie,
          },
          body: JSON.stringify({
            bookingReferenceId: 'bk_unpaid',
            artistId: 'artist-1',
            serviceId: 'srv-1',
            tipPercentage: 0,
            displayCurrency: 'USD',
            originUrl: origin,
          }),
        });
        expect(stealCheckoutRes.status).toBe(409);

        await createAndCaptureBooking({
          baseUrl,
          cookie: alice.cookie,
          webhookSecret,
          bookingReferenceId: 'bk_refunded',
          artistId: 'artist-1',
          serviceId: 'srv-1',
          webhookStatus: 'released',
        });
        await createAndCaptureBooking({
          baseUrl,
          cookie: alice.cookie,
          webhookSecret,
          bookingReferenceId: 'bk_disputed',
          artistId: 'artist-1',
          serviceId: 'srv-1',
          webhookStatus: 'disputed',
        });
        await createAndCaptureBooking({
          baseUrl,
          cookie: alice.cookie,
          webhookSecret,
          bookingReferenceId: 'bk_alice_paid',
          artistId: 'artist-1',
          serviceId: 'srv-1',
          webhookStatus: 'captured',
        });

        // Mallory cannot review Alice's captured booking -> 403 booking_not_eligible
        const foreignPost = await fetch(`${baseUrl}/api/reviews`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Origin: origin, Cookie: mallory.cookie },
          body: JSON.stringify({
            bookingReferenceId: 'bk_alice_paid',
            artistId: 'artist-1',
            breakdown: { technique: 5, hygiene: 5, durability: 5, precision: 5 },
            text: 'Trying to review another user booking!',
          }),
        });
        expect(foreignPost.status).toBe(403);
        expect(((await foreignPost.json()) as { code: string }).code).toBe('booking_not_eligible');

        // Unpaid, Refunded, Disputed all return 403 booking_not_eligible (note: consumes reviewMax=4 limiter -> let's check statuses carefully)
        for (const badRef of ['bk_unpaid', 'bk_refunded', 'bk_disputed']) {
          const r = await fetch(`${baseUrl}/api/reviews`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Origin: origin, Cookie: alice.cookie },
            body: JSON.stringify({
              bookingReferenceId: badRef,
              artistId: 'artist-1',
              breakdown: { technique: 5, hygiene: 5, durability: 5, precision: 5 },
              text: 'Valid commentary for ineligible booking',
            }),
          });
          expect(r.status).toBe(403);
        }

        // 5th POST within window hits reviewMax=4 -> 429 rate_limited
        const limitedRes = await fetch(`${baseUrl}/api/reviews`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Origin: origin, Cookie: alice.cookie },
          body: JSON.stringify({
            bookingReferenceId: 'bk_alice_paid',
            artistId: 'artist-2',
            breakdown: { technique: 5, hygiene: 5, durability: 5, precision: 5 },
            text: 'Rate limited fifth call',
          }),
        });
        expect(limitedRes.status).toBe(429);
      });
    });

    it('rejects artistId mismatch with 403 review_artist_mismatch & malformed rating with 400', async () => {
      const { app, webhookSecret } = buildReviewTestApp();

      await withHttpServer(app, async baseUrl => {
        const origin = 'http://localhost:3000';
        const alice = await registerPasskeySession(baseUrl, 'Alice', 'alice-mismatch');

        await createAndCaptureBooking({
          baseUrl,
          cookie: alice.cookie,
          webhookSecret,
          bookingReferenceId: 'bk_art1_only',
          artistId: 'artist-1',
          serviceId: 'srv-1',
          webhookStatus: 'captured',
        });

        const wrongArtist = await fetch(`${baseUrl}/api/reviews`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Origin: origin, Cookie: alice.cookie },
          body: JSON.stringify({
            bookingReferenceId: 'bk_art1_only',
            artistId: 'artist-2',
            breakdown: { technique: 5, hygiene: 5, durability: 5, precision: 5 },
            text: 'Reviewing artist-2 against artist-1 booking should fail.',
          }),
        });
        expect(wrongArtist.status).toBe(403);
        expect(((await wrongArtist.json()) as { code: string }).code).toBe(
          'review_artist_mismatch'
        );

        const badRating = await fetch(`${baseUrl}/api/reviews`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Origin: origin, Cookie: alice.cookie },
          body: JSON.stringify({
            bookingReferenceId: 'bk_art1_only',
            artistId: 'artist-1',
            rating: 9,
            breakdown: { technique: 5, hygiene: 5, durability: 5, precision: 5 },
            text: 'Out of range score',
          }),
        });
        expect(badRating.status).toBe(400);
      });
    });
  });

  describe('FileServerStateStore Persistence & Stage 4 Backward Compatibility', () => {
    it('loads Stage 4 snapshot lacking reviews/artistRatings and persists Sprint 5.2 reviews across store restart', async () => {
      const tmpDir = await mkdtemp(path.join(os.tmpdir(), 'nailix-s52-'));
      try {
        const storePath = path.join(tmpDir, 'server-state.json');
        // Legacy Stage 4 JSON snapshot without `reviews` or `artistRatings`
        await writeFile(
          storePath,
          JSON.stringify(
            {
              version: 1,
              passkeys: {},
              sessions: {},
              depositIntents: {
                intent_legacy_cap: {
                  id: 'intent_legacy_cap',
                  bookingReferenceId: 'bk_persist_1',
                  artistId: 'artist-2',
                  serviceId: 'srv-3',
                  amountMinor: 16000,
                  currency: 'USD',
                  displayCurrency: 'USD',
                  status: 'captured',
                  mode: 'hosted_psp',
                  providerId: 'stripe_hosted',
                  providerLabel: 'Stripe Hosted Checkout (SAQ-A)',
                  isSimulated: false,
                  ownerCredentialId: 'cred_persist_user',
                  createdAt: new Date().toISOString(),
                  expiresAt: new Date(Date.now() + 60_000).toISOString(),
                },
              },
              processedWebhookEvents: [],
              consumedInviteHashes: [],
            },
            null,
            2
          ),
          'utf8'
        );

        const store1 = new FileServerStateStore(storePath);
        expect(await store1.listReviews()).toEqual([]);
        expect(await store1.listArtistRatingSummaries()).toEqual({});

        const eligible1 = await store1.listEligibleIntentsForCredential('cred_persist_user');
        expect(eligible1.map(i => i.bookingReferenceId)).toEqual(['bk_persist_1']);

        const intent = eligible1[0];
        const created = await store1.createOrReplayReview({
          intent,
          input: {
            bookingReferenceId: 'bk_persist_1',
            artistId: 'artist-2',
            rating: 4.8,
            breakdown: { technique: 5, hygiene: 5, durability: 4.5, precision: 4.7 },
            text: 'Persistent Japanese Glass Aura session confirmed across restart.',
          },
          authorCredentialId: 'cred_persist_user',
          authorDisplayName: 'Marina',
          authorRole: 'client',
        });
        expect(created.outcome).toBe('created');

        // Simulate full server process restart with fresh FileServerStateStore instance
        const store2 = new FileServerStateStore(storePath);
        const persistedReviews = await store2.listReviews('artist-2');
        expect(persistedReviews).toHaveLength(1);
        expect(persistedReviews[0].authorDisplayName).toBe('Marina');
        expect(persistedReviews[0].confirmedAfterCompletedBooking).toBe(true);

        const persistedRatings = await store2.listArtistRatingSummaries();
        expect(persistedRatings['artist-2'].rating).toBe(4.8);
        expect(persistedRatings['artist-2'].totalReviews).toBe(1);
        expect(await store2.listEligibleIntentsForCredential('cred_persist_user')).toEqual([]);
      } finally {
        await rm(tmpDir, { recursive: true, force: true });
      }
    });
  });

  describe('Client Adapter (reviewsService.ts)', () => {
    it('falls back cleanly when offline and translates server error codes on rejection', async () => {
      const fetchSpy = vi
        .spyOn(globalThis, 'fetch')
        .mockRejectedValue(new Error('offline'));

      const offlineFeed = await fetchServerReviews();
      expect(offlineFeed).toEqual({ available: false, reviews: [], artistRatings: {} });

      const offlineEligible = await fetchEligibleBookingsForReview();
      expect(offlineEligible).toEqual({
        available: false,
        requiresAuth: false,
        eligibleBookings: [],
      });

      fetchSpy.mockResolvedValue({
        ok: false,
        status: 403,
        json: () => Promise.resolve({ code: 'booking_not_eligible', error: 'Denied' }),
      } as unknown as Response);

      await expect(
        submitServerBookingReview({
          bookingReferenceId: 'bk_x',
          artistId: 'artist-1',
          rating: 5,
          breakdown: { technique: 5, hygiene: 5, durability: 5, precision: 5 },
          text: 'Trying when server rejects',
          language: 'en',
        })
      ).rejects.toThrow(/captured or completed booking/i);
    });
  });
});
