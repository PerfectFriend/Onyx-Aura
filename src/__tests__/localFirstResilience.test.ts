import { describe, it, expect } from 'vitest';
import { SalonRepository, SALON_SCHEMA_VERSION } from '../infrastructure/storage/salonRepository';
import {
  MemoryStorageAdapter,
  ResilientStorageAdapter,
} from '../infrastructure/storage/indexedDbAdapter';
import { detectSecretLikeFields } from '../infrastructure/identity/secretHygiene';
import { validateAppointments } from '../domain/schemas';
import { CryptoCloudEngine } from '../simulation/cryptocloud';

class FlakyAdapter extends MemoryStorageAdapter {
  failSetOn: string | null = null;
  failGetOn: string | null = null;

  override async set<T>(key: Parameters<MemoryStorageAdapter['set']>[0], v: T): Promise<void> {
    if (key === this.failSetOn) {
      throw new Error('QuotaExceededError');
    }
    return super.set(key, v);
  }

  override async get<T>(key: Parameters<MemoryStorageAdapter['get']>[0]): Promise<T | undefined> {
    if (key === this.failGetOn) {
      throw new Error('transient read error');
    }
    return super.get<T>(key);
  }
}

describe('Sprint 3.2 — Local-First Resilience & Integrity Tests (Kolyan L-01 .. L-06)', () => {
  it('L-02: outbox never drops pending_sync mutations even past 105 entries', async () => {
    const repo = new SalonRepository(new MemoryStorageAdapter(new Map()));
    await repo.ensureSeededAndLoad();
    for (let i = 0; i < 105; i++) {
      await repo.enqueueOutboxMutation('appointments', `A${i}`, { appointmentId: `id-${i}` });
    }
    const pending = (await repo.getOutbox()).filter(m => m.status === 'pending_sync');
    expect(pending.length).toBe(105);
  });

  it('L-01 Proba C: a single transient set() failure must not fork or lose visible outbox', async () => {
    const adapter = new FlakyAdapter(new Map());
    const resilient = new ResilientStorageAdapter(adapter, { retryDelayMs: 1, maxRetries: 1 });
    const repo = new SalonRepository(resilient);

    await repo.ensureSeededAndLoad();
    await repo.enqueueOutboxMutation('chats', 'PRE', { threadId: 't-1' });

    adapter.failSetOn = 'chats';
    await repo.saveChats([]);

    const actions = (await repo.getOutbox()).map(m => m.action);
    expect(actions).toContain('PRE');
    expect(repo.getHealthReport().health).toBe('degraded');
    expect(repo.getBackendKind()).toBe('memory');

    // Recover primary on retry and flush buffered writes back to primary
    adapter.failSetOn = null;
    await resilient.retryPendingWrites();
    expect(repo.getHealthReport().health).toBe('ok');
  });

  it('L-01 Proba D: a single transient get() error at startup must not silently orphan future writes in memory', async () => {
    const adapter = new FlakyAdapter(new Map());
    const seedRepo = new SalonRepository(adapter);
    await seedRepo.ensureSeededAndLoad();
    await seedRepo.saveAppointments([
      {
        id: 'REAL-USER-BOOKING',
        clientName: 'Real User',
        clientPhone: '+34 611 222 333',
        clientEmail: 'real@user.test',
        artistId: 'artist-1',
        artistName: 'Elena Vasiliev',
        artistAvatar: '/assets/images/avatar_master_artist_1790123890131.jpg',
        serviceId: 'srv-1',
        serviceName: 'Sculptural Chrome',
        price: 165,
        currency: 'USD',
        date: '2026-12-10',
        timeSlot: '15:00',
        status: 'confirmed',
        remindersEnabled: true,
        pushReminderScheduled: true,
        smsReminderScheduled: true,
        createdAt: '2026-11-16T00:00:00.000Z',
        origin: 'user',
      },
    ]);

    // Simulate single read error on `chats` during next boot
    adapter.failGetOn = 'chats';
    const rebootRepo = new SalonRepository(new ResilientStorageAdapter(adapter, { retryDelayMs: 1, maxRetries: 1 }));
    const loaded = await rebootRepo.ensureSeededAndLoad();

    expect(loaded.appointments.some(a => a.id === 'REAL-USER-BOOKING')).toBe(true);
    expect(Array.isArray(loaded.chats)).toBe(true);
    expect(loaded.warnings.length).toBeGreaterThan(0);

    // Subsequent primary reads recover when transient read failure disappears
    adapter.failGetOn = null;
    const recovered = await rebootRepo.ensureSeededAndLoad();
    expect(recovered.appointments.some(a => a.id === 'REAL-USER-BOOKING')).toBe(true);
  });

  it('L-06: malformed collections degrade cleanly to per-collection seed fallback with warnings', async () => {
    const map = new Map<string, unknown>([
      ['appointments', 'garbage'],
      ['reviews', { not: 'array' }],
    ]);
    const data = await new SalonRepository(new MemoryStorageAdapter(map)).ensureSeededAndLoad();

    expect(Array.isArray(data.appointments)).toBe(true);
    expect(Array.isArray(data.reviews)).toBe(true);
    expect(data.warnings.some(w => w.includes('appointments'))).toBe(true);
    expect(data.warnings.some(w => w.includes('reviews'))).toBe(true);
  });

  it('L-06: future schemaVersion (> SALON_SCHEMA_VERSION) enters read-only protection and does not echo v99', async () => {
    const backing = new Map<string, unknown>([
      [
        'schemaMeta',
        {
          schemaVersion: 99,
          seededAt: '2026-11-15T00:00:00.000Z',
          lastModifiedAt: '2026-11-15T00:00:00.000Z',
          backend: 'memory',
        },
      ],
    ]);
    const repo = new SalonRepository(new MemoryStorageAdapter(backing));
    const data = await repo.ensureSeededAndLoad();

    expect(data.meta.schemaVersion).toBe(SALON_SCHEMA_VERSION);
    expect(data.meta.schemaVersion).not.toBe(99);
    expect(data.readOnlyFutureSchema).toBe(true);
    expect(data.storedFutureVersion).toBe(99);
    // Stored v99 metadata is preserved untouched on disk rather than overwritten silently
    expect((backing.get('schemaMeta') as { schemaVersion: number }).schemaVersion).toBe(99);
    await expect(repo.saveAppointments([])).rejects.toThrow(/только для чтения|read-only/i);
  });

  it('L-06: migrates legacy v1 storage cleanly to v2 via explicit migration registry', async () => {
    const map = new Map<string, unknown>([
      [
        'schemaMeta',
        {
          schemaVersion: 1,
          seededAt: '2026-10-01T00:00:00.000Z',
          lastModifiedAt: '2026-10-01T00:00:00.000Z',
          backend: 'memory',
        },
      ],
      ['passkeys', []],
    ]);

    const repo = new SalonRepository(new MemoryStorageAdapter(map));
    const data = await repo.ensureSeededAndLoad();
    expect(data.meta.schemaVersion).toBe(SALON_SCHEMA_VERSION);
    expect(data.identitySession.authenticated).toBe(false);
    expect(data.identitySession.displayName).toBeNull();
  });

  it('L-05: allowlist schema validator rejects unknown arbitrary/secret keys even with benign names', () => {
    const res = validateAppointments([
      {
        id: 'apt-1',
        clientName: 'Client',
        clientPhone: '123',
        clientEmail: 'a@b.c',
        artistId: 'artist-1',
        artistName: 'Elena',
        artistAvatar: '/a.jpg',
        serviceId: 'srv-1',
        serviceName: 'Chrome',
        price: 100,
        currency: 'USD',
        date: '2026-12-01',
        timeSlot: '10:00',
        status: 'confirmed',
        remindersEnabled: true,
        pushReminderScheduled: true,
        smsReminderScheduled: true,
        createdAt: '2026-11-16T00:00:00.000Z',
        undocumentedSneakyField: 'x',
      },
    ]);
    expect(res.ok).toBe(false);
    expect(res.reason).toMatch(/Disallowed appointment field/i);

    expect(detectSecretLikeFields('{"private_key":"x"}').length).toBeGreaterThan(0);
    expect(detectSecretLikeFields('{"kty":"EC","d":"SECRET"}').length).toBeGreaterThan(0);
    expect(detectSecretLikeFields('{"apiKey":"sk-live-1"}').length).toBeGreaterThan(0);
    expect(detectSecretLikeFields('{"password": 12345}').length).toBeGreaterThan(0);
  });

  it('L-03: seed data is marked origin="seed" and excluded from CryptoCloud user export snapshots', async () => {
    const repo = new SalonRepository(new MemoryStorageAdapter(new Map()));
    const data = await repo.ensureSeededAndLoad();

    expect(data.appointments.every(a => a.origin === 'seed')).toBe(true);
    expect(data.reviews.every(r => r.origin === 'seed')).toBe(true);
    expect(data.chats.every(c => c.origin === 'seed')).toBe(true);

    const engine = new CryptoCloudEngine();
    const { blob } = await engine.exportSessionSnapshot({
      appointments: data.appointments,
      reviews: data.reviews,
      portfolio: data.portfolio,
      chats: data.chats,
    });
    const parsed = JSON.parse(await blob.text()) as {
      payload: {
        clientBookings: unknown[];
        demoReviews: unknown[];
        publicArtGallery: unknown[];
        sessionChatsPlaintext: unknown[];
      };
    };
    engine.destroy();

    expect(parsed.payload.clientBookings).toEqual([]);
    expect(parsed.payload.demoReviews).toEqual([]);
    expect(parsed.payload.publicArtGallery).toEqual([]);
    expect(parsed.payload.sessionChatsPlaintext).toEqual([]);
  });
});
