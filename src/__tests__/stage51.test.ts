// =============================================================================
// Stage 5 · Sprint 5.1 — Pre-Social Hygiene Verification
// Covers Q-10 (split salonRepository modules), unified createId/createShortId,
// V-07 i18n message dictionaries (EN/RU), and additive ServerErrorCode emission.
// =============================================================================

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import express from 'express';
import { describe, expect, it, vi } from 'vitest';
import { createId, createRawUuid, createShortId } from '../domain/ids';
import { validateChatRecord } from '../domain/schemas';
import { BaseStorageKey, StorageEntry, StorageKey } from '../domain/storage';
import {
  formatAppMessage,
  ServerErrorCode,
  translateServerErrorCode,
} from '../i18n/messages';
import {
  MemoryStorageAdapter,
  ResilientStorageAdapter,
} from '../infrastructure/storage/indexedDbAdapter';
import { resolveArrayCollection } from '../infrastructure/storage/repositoryCollections';
import {
  runSchemaMigrations,
  SALON_SCHEMA_VERSION,
} from '../infrastructure/storage/repositoryMigrations';
import {
  appendOutboxMutationState,
  buildFlushedOutboxState,
  nextOutboxId,
} from '../infrastructure/storage/repositoryOutbox';
import { createSeedSnapshot, SEED_ARTIST_IDS } from '../infrastructure/storage/repositorySeed';
import { SalonRepository } from '../infrastructure/storage/salonRepository';
import { createFoundationApiRouter } from '../server/apiRouter';
import { WebAuthnChallengeStubStore } from '../server/challengeService';
import { findHonestyViolations } from '../test-utils/honesty';
import { ChatMessage } from '../types';

async function withRouterServer<T>(
  app: express.Express,
  fn: (baseUrl: string) => Promise<T>
): Promise<T> {
  const server = http.createServer(app);
  await new Promise<void>(resolveReady => {
    server.listen(0, '127.0.0.1', () => resolveReady());
  });
  const addr = server.address() as AddressInfo;
  const baseUrl = `http://127.0.0.1:${addr.port}`;
  try {
    return await fn(baseUrl);
  } finally {
    await new Promise<void>(resolveClose => server.close(() => resolveClose()));
  }
}

describe('Sprint 5.1 — Unified Cryptographic ID Generator (domain/ids)', () => {
  it('generates UUIDv4-formatted IDs with optional prefixes and bounded short IDs', () => {
    const raw = createRawUuid();
    expect(raw).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i);

    const prefixed = createId('msg');
    expect(prefixed).toMatch(/^msg-[0-9a-f-]{36}$/i);

    const short8 = createShortId('apt');
    expect(short8).toMatch(/^apt-[0-9a-f]{8}$/i);

    const short16 = createShortId(undefined, 16);
    expect(short16).toMatch(/^[0-9a-f]{16}$/i);

    const ids = new Set(Array.from({ length: 50 }, () => createId('uniq')));
    expect(ids.size).toBe(50);
  });

  it('falls back cleanly to getRandomValues and monotonic sequence when randomUUID is absent', () => {
    const spyMathRandom = vi.spyOn(Math, 'random');

    // Tier 2: crypto without randomUUID (getRandomValues only)
    vi.stubGlobal('crypto', {
      getRandomValues: (arr: Uint8Array) => {
        for (let i = 0; i < arr.length; i += 1) arr[i] = (i * 17 + 5) & 0xff;
        return arr;
      },
    });
    const viaBytes = createRawUuid();
    expect(viaBytes).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i);

    // Tier 3: stripped test shim without global crypto
    vi.stubGlobal('crypto', undefined);
    const mono1 = createRawUuid();
    const mono2 = createRawUuid();
    expect(mono1).not.toBe(mono2);
    expect(mono1).toMatch(/^00000000-0000-4000-8000-[0-9a-f]{12}$/i);
    expect(spyMathRandom).not.toHaveBeenCalled();

    vi.unstubAllGlobals();
    spyMathRandom.mockRestore();
  });
});

describe('Sprint 5.1 — Split SalonRepository Modules (Q-10)', () => {
  it('exposes seed, migrations, outbox, and collection quarantine cleanly across modules', () => {
    const seed = createSeedSnapshot();
    expect(seed.artists.length).toBeGreaterThan(0);
    expect(SEED_ARTIST_IDS.has(seed.artists[0].id)).toBe(true);

    const outboxId = nextOutboxId();
    expect(outboxId).toMatch(/^outbox-[0-9a-f-]{36}$/i);

    const appended = appendOutboxMutationState([], {
      entity: 'chats',
      action: 'CHAT_SENT',
      payload: { msgId: 'm1', secretToken: 'strip-me' },
    });
    expect(appended.nextOutbox).toHaveLength(1);
    expect(appended.nextOutbox[0].payload).toEqual({ msgId: 'm1' });
    expect(buildFlushedOutboxState(appended.nextOutbox)[0].status).toBe('synced');

    const warnings: string[] = [];
    const unreadable = new Set<BaseStorageKey>();
    const quarantineQueue: StorageEntry[] = [];
    const corrupt = resolveArrayCollection<ChatMessage>({
      key: 'chats',
      readResult: { status: 'ok', value: { notAnArray: true } },
      recordValidator: validateChatRecord,
      allowUnknownNonSecret: true,
      seedFallback: () => [],
      unreadableCollections: unreadable,
      warnings,
      quarantineQueue,
      language: 'en',
    });
    expect(corrupt.value).toEqual([]);
    expect(quarantineQueue).toHaveLength(1);
    expect(quarantineQueue[0][0]).toMatch(/^quarantine:chats:[0-9a-f]{8}$/i);
    expect(warnings[0]).toContain('quarantine');

    const migrated = runSchemaMigrations(
      {
        artists: [{ ...seed.artists[0], origin: undefined }],
        appointments: [{ ...seed.appointments[0], id: 'custom-user-apt', origin: undefined }],
        portfolio: seed.portfolio,
        likedIds: seed.likedIds,
        savedIds: seed.savedIds,
        reviews: seed.reviews,
        anchorPoints: seed.anchorPoints,
        chats: seed.chats,
        ads: seed.ads,
        passkeys: [],
        identitySession: seed.identitySession,
        outbox: [],
      },
      2
    );
    expect(SALON_SCHEMA_VERSION).toBe(3);
    expect(migrated.migrated).toBe(true);
    expect(migrated.payload.appointments[0].origin).toBe('user');
  });

  it('localizes SalonRepository degradation and write-block warnings for both EN and RU', async () => {
    const setupFlakyRepo = async (language: 'en' | 'ru') => {
      const map = new Map<string, unknown>();
      await new SalonRepository(new MemoryStorageAdapter(map), { language }).ensureSeededAndLoad();

      class FlakyChatsAdapter extends MemoryStorageAdapter {
        override async get<T>(key: StorageKey): Promise<T | undefined> {
          if (key === 'chats') throw new Error('IO fault');
          return super.get<T>(key);
        }
      }

      const repo = new SalonRepository(
        new ResilientStorageAdapter(new FlakyChatsAdapter(map), { retryDelayMs: 1, maxRetries: 0 }),
        { language }
      );
      const data = await repo.ensureSeededAndLoad();
      return { repo, data };
    };

    const enCase = await setupFlakyRepo('en');
    expect(enCase.data.warnings.some(w => /safe mode active/i.test(w))).toBe(true);
    await expect(enCase.repo.saveChats([])).rejects.toThrow(/writes are blocked/i);

    const ruCase = await setupFlakyRepo('ru');
    expect(ruCase.data.warnings.some(w => /активен безопасный режим/i.test(w))).toBe(true);
    await expect(ruCase.repo.saveChats([])).rejects.toThrow(/запись заблокирована/i);
  });
});

describe('Sprint 5.1 — Localized App Messages & ServerErrorCode Dictionary (V-07)', () => {
  const ALL_CODES: ServerErrorCode[] = [
    'origin_untrusted',
    'rate_limited',
    'invalid_request',
    'challenge_invalid',
    'challenge_expired',
    'credential_conflict',
    'invite_invalid',
    'session_required',
    'credential_not_found',
    'signature_invalid',
    'quote_invalid',
    'checkout_conflict',
    'intent_not_found',
    'webhook_invalid',
    'stripe_unavailable',
  ];

  it('translates all server error codes in EN and RU cleanly', () => {
    for (const code of ALL_CODES) {
      const enText = translateServerErrorCode(code, undefined, 'en');
      const ruText = translateServerErrorCode(code, undefined, 'ru');
      expect(enText.length).toBeGreaterThan(8);
      expect(ruText.length).toBeGreaterThan(8);
      expect(enText).not.toBe(ruText);
    }

    expect(translateServerErrorCode('unknown_code', 'Custom fallback', 'en')).toBe(
      'Custom fallback'
    );
  });

  it('interpolates message templates cleanly for EN and RU without honesty violations', () => {
    const enMsg = formatAppMessage(
      'booking.captured.message',
      { artistName: 'Elena', amount: 45, intentShort: 'pi_12345' },
      'en'
    );
    const ruMsg = formatAppMessage(
      'booking.captured.message',
      { artistName: 'Елена', amount: 45, intentShort: 'pi_12345' },
      'ru'
    );
    expect(enMsg).toContain('Elena');
    expect(enMsg).toContain('$45 USD');
    expect(ruMsg).toContain('Елена');
    expect(ruMsg).toContain('$45 USD');

    const lines = readFileSync(resolve(process.cwd(), 'src/i18n/messages.ts'), 'utf8').split(
      /\r?\n/
    );
    expect(findHonestyViolations(lines, 'src/i18n/messages.ts')).toEqual([]);
  });

  it('emits additive machine ServerErrorCode on apiRouter JSON errors', async () => {
    const app = express();
    const challengeStore = new WebAuthnChallengeStubStore(10);
    app.use(
      '/api',
      createFoundationApiRouter({
        challengeStore,
        allowedOrigins: ['https://nailix.example'],
        isProduction: true,
        rateLimits: { windowMs: 60_000, authMax: 3, checkoutMax: 3 },
      })
    );

    await withRouterServer(app, async baseUrl => {
      const readCode = async (res: globalThis.Response): Promise<unknown> => {
        const body = (await res.json()) as { code?: unknown };
        return body.code;
      };

      const badQuote = await fetch(`${baseUrl}/api/payments/quote?artistId=unknown&serviceId=unknown`);
      expect(badQuote.status).toBe(400);
      expect(await readCode(badQuote)).toBe('quote_invalid');

      const missingIntent = await fetch(`${baseUrl}/api/payments/intents/pi_missing_51`);
      expect(missingIntent.status).toBe(404);
      expect(await readCode(missingIntent)).toBe('intent_not_found');

      const untrustedOrigin = await fetch(`${baseUrl}/api/payments/checkout-session`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Origin: 'https://evil.example',
        },
        body: JSON.stringify({}),
      });
      expect(untrustedOrigin.status).toBe(403);
      expect(await readCode(untrustedOrigin)).toBe('origin_untrusted');

      const unconfiguredStripe = await fetch(`${baseUrl}/api/payments/checkout-session`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Origin: 'https://nailix.example',
        },
        body: JSON.stringify({}),
      });
      expect(unconfiguredStripe.status).toBe(503);
      expect(await readCode(unconfiguredStripe)).toBe('stripe_unavailable');

      const noSessionPromote = await fetch(`${baseUrl}/api/auth/webauthn/promote-master`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Origin: 'https://nailix.example',
        },
        body: JSON.stringify({ masterInviteCode: 'x' }),
      });
      expect(noSessionPromote.status).toBe(401);
      expect(await readCode(noSessionPromote)).toBe('session_required');

      // Exhaust authMax=3 to verify machine 'rate_limited' code
      await fetch(`${baseUrl}/api/auth/webauthn/challenge`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Origin: 'https://nailix.example' },
        body: JSON.stringify({ ceremony: 'authentication' }),
      });
      await fetch(`${baseUrl}/api/auth/webauthn/challenge`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Origin: 'https://nailix.example' },
        body: JSON.stringify({ ceremony: 'authentication' }),
      });
      const rateLimited = await fetch(`${baseUrl}/api/auth/webauthn/challenge`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Origin: 'https://nailix.example' },
        body: JSON.stringify({ ceremony: 'authentication' }),
      });
      expect(rateLimited.status).toBe(429);
      expect(await readCode(rateLimited)).toBe('rate_limited');
    });
  });
});
