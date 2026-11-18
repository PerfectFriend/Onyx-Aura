// =============================================================================
// Stage 4 · Sprint 4.1 — Minimal Server WebAuthn Challenge Stub & Provider Status
// - Generates single-use 32-byte challenges with bounded 120s TTL.
// - Validates single-use challenge consumption + clientDataJSON bindings + UP bit.
// - HONESTY CONTRACT: Explicitly reports `verificationTier: 'challenge_stub_only'`
//   and `cryptographicServerVerified: false` until Stage 4.2 DB-backed SPKI verification.
// =============================================================================

import { randomBytes, randomUUID } from 'node:crypto';
import { UserRole } from '../types';

export const DEFAULT_CHALLENGE_TTL_MS = 120_000;
export const MAX_PENDING_CHALLENGES = 2000;
export const MAX_PENDING_CHALLENGES_PER_CLIENT = 25;

export interface IssuedChallengeRecord {
  challengeId: string;
  challengeBase64Url: string;
  ceremony: 'registration' | 'authentication';
  clientKey: string;
  createdAtMs: number;
  expiresAtMs: number;
}

export interface IssuedChallengeResponse {
  challengeId: string;
  challengeBase64Url: string;
  ceremony: 'registration' | 'authentication';
  expiresAt: string;
  ttlSeconds: number;
  verificationTier: 'challenge_stub_only';
  notice: string;
}

export interface ChallengeVerifyStubRequest {
  challengeId: string;
  clientDataJSONBase64Url: string;
  authenticatorDataBase64Url?: string;
  expectedOrigin?: string;
  role?: UserRole;
}

export interface ChallengeVerifyStubResult {
  accepted: boolean;
  verificationTier: 'challenge_stub_only';
  cryptographicServerVerified: false;
  challengeConsumed: boolean;
  ceremony?: 'registration' | 'authentication';
  origin?: string;
  error?: string;
  notice: string;
}

export interface ServerPaymentProviderStatus {
  activeProviderId: 'mock_sim';
  mode: 'simulated';
  isSimulated: true;
  hostedCheckoutConfigured: false;
  pciInputsAllowedInDom: false;
  plannedPspTarget: 'stripe_hosted_checkout_saq_a';
}

function toBase64UrlBuffer(buf: Uint8Array): string {
  return Buffer.from(buf)
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/g, '');
}

function fromBase64UrlToBuffer(b64u: string): Buffer {
  const padded = b64u.replace(/-/g, '+').replace(/_/g, '/');
  const padLen = (4 - (padded.length % 4)) % 4;
  return Buffer.from(`${padded}${'='.repeat(padLen)}`, 'base64');
}

export class WebAuthnChallengeStubStore {
  private readonly store = new Map<string, IssuedChallengeRecord>();
  private readonly clientBuckets = new Map<string, Set<string>>();
  private readonly ttlMs: number;

  constructor(ttlMs: number = DEFAULT_CHALLENGE_TTL_MS) {
    this.ttlMs = ttlMs;
  }

  private removeEntry(challengeId: string): void {
    const existing = this.store.get(challengeId);
    if (!existing) return;
    this.store.delete(challengeId);
    const bucket = this.clientBuckets.get(existing.clientKey);
    if (bucket) {
      bucket.delete(challengeId);
      if (bucket.size === 0) {
        this.clientBuckets.delete(existing.clientKey);
      }
    }
  }

  public pruneExpired(nowMs: number = Date.now()): number {
    let removed = 0;
    for (const [id, entry] of this.store.entries()) {
      if (nowMs >= entry.expiresAtMs) {
        this.removeEntry(id);
        removed += 1;
      }
    }
    return removed;
  }

  public getPendingCount(): number {
    return this.store.size;
  }

  public issueChallenge(options: {
    ceremony?: 'registration' | 'authentication';
    role?: UserRole;
    clientKey?: string;
    nowMs?: number;
  } = {}): IssuedChallengeResponse {
    const nowMs = options.nowMs ?? Date.now();
    this.pruneExpired(nowMs);

    const clientKey =
      typeof options.clientKey === 'string' && options.clientKey.trim()
        ? options.clientKey.trim()
        : 'anonymous';

    // Per-client quota: eviction only touches the calling client's own excess bucket
    let bucket = this.clientBuckets.get(clientKey);
    if (!bucket) {
      bucket = new Set<string>();
      this.clientBuckets.set(clientKey, bucket);
    }
    while (bucket.size >= MAX_PENDING_CHALLENGES_PER_CLIENT) {
      const oldestClientChallenge = bucket.values().next().value;
      if (typeof oldestClientChallenge === 'string') {
        this.removeEntry(oldestClientChallenge);
      } else {
        break;
      }
    }

    // If global store cap is still reached by distributed clients, evict from the LARGEST client bucket
    // so an attacker flood cannot evict single-challenge legitimate users (Q-06).
    if (this.store.size >= MAX_PENDING_CHALLENGES) {
      let largestBucket: Set<string> | undefined;
      for (const candidate of this.clientBuckets.values()) {
        if (!largestBucket || candidate.size > largestBucket.size) {
          largestBucket = candidate;
        }
      }
      const victimId =
        largestBucket?.values().next().value ?? this.store.keys().next().value;
      if (typeof victimId === 'string') {
        this.removeEntry(victimId);
      }
    }

    const challengeId = `ch-${randomUUID()}`;
    const challengeBase64Url = toBase64UrlBuffer(randomBytes(32));
    const ceremony = options.ceremony === 'registration' ? 'registration' : 'authentication';
    const expiresAtMs = nowMs + this.ttlMs;

    this.store.set(challengeId, {
      challengeId,
      challengeBase64Url,
      ceremony,
      clientKey,
      createdAtMs: nowMs,
      expiresAtMs,
    });
    bucket.add(challengeId);

    return {
      challengeId,
      challengeBase64Url,
      ceremony,
      expiresAt: new Date(expiresAtMs).toISOString(),
      ttlSeconds: Math.round(this.ttlMs / 1000),
      verificationTier: 'challenge_stub_only',
      notice:
        'Single-use challenge issued on server; cryptographic server check validates SPKI and flags on /verify.',
    };
  }

  public consumeChallengeRecord(
    challengeId: string,
    nowMs: number = Date.now()
  ):
    | { status: 'ok'; record: IssuedChallengeRecord }
    | { status: 'missing' }
    | { status: 'expired'; record: IssuedChallengeRecord } {
    const record = this.store.get(challengeId);
    if (!record) {
      return { status: 'missing' };
    }
    // Consume immediately (strict single-use non-replay guarantee)
    this.removeEntry(challengeId);
    if (nowMs >= record.expiresAtMs) {
      return { status: 'expired', record };
    }
    return { status: 'ok', record };
  }

  public verifyChallengeStub(
    input: ChallengeVerifyStubRequest,
    nowMs: number = Date.now()
  ): ChallengeVerifyStubResult {
    const consumed = this.consumeChallengeRecord(input.challengeId, nowMs);
    if (consumed.status === 'missing') {
      return {
        accepted: false,
        verificationTier: 'challenge_stub_only',
        cryptographicServerVerified: false,
        challengeConsumed: false,
        error: 'Unknown or already-consumed server challenge.',
        notice: 'Challenge rejected (missing or replay attempt).',
      };
    }

    if (consumed.status === 'expired') {
      return {
        accepted: false,
        verificationTier: 'challenge_stub_only',
        cryptographicServerVerified: false,
        challengeConsumed: true,
        error: 'Server challenge expired (TTL exceeded).',
        notice: 'Challenge expired before submission.',
      };
    }

    const { record } = consumed;

    let clientData: { type?: unknown; challenge?: unknown; origin?: unknown };
    try {
      const jsonText = fromBase64UrlToBuffer(input.clientDataJSONBase64Url).toString('utf8');
      clientData = JSON.parse(jsonText) as { type?: unknown; challenge?: unknown; origin?: unknown };
    } catch {
      return {
        accepted: false,
        verificationTier: 'challenge_stub_only',
        cryptographicServerVerified: false,
        challengeConsumed: true,
        error: 'Malformed clientDataJSON encoding.',
        notice: 'Challenge rejected (invalid clientDataJSON).',
      };
    }

    const expectedType = record.ceremony === 'registration' ? 'webauthn.create' : 'webauthn.get';
    if (clientData.type !== expectedType) {
      return {
        accepted: false,
        verificationTier: 'challenge_stub_only',
        cryptographicServerVerified: false,
        challengeConsumed: true,
        error: `Unexpected clientDataJSON.type: expected ${expectedType}.`,
        notice: 'Challenge rejected (ceremony type mismatch).',
      };
    }

    if (clientData.challenge !== record.challengeBase64Url) {
      return {
        accepted: false,
        verificationTier: 'challenge_stub_only',
        cryptographicServerVerified: false,
        challengeConsumed: true,
        error: 'Challenge binding mismatch inside clientDataJSON.',
        notice: 'Challenge rejected (challenge mismatch).',
      };
    }

    if (typeof clientData.origin !== 'string' || !clientData.origin.trim()) {
      return {
        accepted: false,
        verificationTier: 'challenge_stub_only',
        cryptographicServerVerified: false,
        challengeConsumed: true,
        error: 'Missing origin inside clientDataJSON.',
        notice: 'Challenge rejected (missing origin).',
      };
    }

    if (input.expectedOrigin && clientData.origin !== input.expectedOrigin) {
      return {
        accepted: false,
        verificationTier: 'challenge_stub_only',
        cryptographicServerVerified: false,
        challengeConsumed: true,
        error: `Origin mismatch: expected ${input.expectedOrigin}.`,
        notice: 'Challenge rejected (origin mismatch).',
      };
    }

    if (input.authenticatorDataBase64Url) {
      const authData = fromBase64UrlToBuffer(input.authenticatorDataBase64Url);
      if (authData.length < 37 || (authData[32] & 0x01) === 0) {
        return {
          accepted: false,
          verificationTier: 'challenge_stub_only',
          cryptographicServerVerified: false,
          challengeConsumed: true,
          error: 'Authenticator data missing required length or UP flag.',
          notice: 'Challenge rejected (invalid authenticatorData flags).',
        };
      }
    }

    return {
      accepted: true,
      verificationTier: 'challenge_stub_only',
      cryptographicServerVerified: false,
      challengeConsumed: true,
      ceremony: record.ceremony,
      origin: clientData.origin,
      notice:
        'Server stub consumed single-use challenge & validated clientDataJSON binding. NOTE: cryptographicServerVerified=false (full server-side COSE/SPKI signature check arrives in Stage 4.2).',
    };
  }
}

export function getServerPaymentProviderStatus(): ServerPaymentProviderStatus {
  return {
    activeProviderId: 'mock_sim',
    mode: 'simulated',
    isSimulated: true,
    hostedCheckoutConfigured: false,
    pciInputsAllowedInDom: false,
    plannedPspTarget: 'stripe_hosted_checkout_saq_a',
  };
}

export const defaultChallengeStubStore = new WebAuthnChallengeStubStore();
