import { describe, it, expect, vi } from 'vitest';
import {
  DEFAULT_LIKED_IDS,
  DEFAULT_SAVED_IDS,
  SALON_SCHEMA_VERSION,
  SalonRepository,
} from '../infrastructure/storage/salonRepository';
import {
  createDefaultStorageAdapter,
  MemoryStorageAdapter,
} from '../infrastructure/storage/indexedDbAdapter';
import { StorageAdapter, StorageKey } from '../domain/storage';
import { Appointment, SponsoredAd } from '../types';
import { getRelativeDateISO } from '../data/initialData';

describe('Stage 2 — Local-First Storage & SalonRepository', () => {
  it('selects MemoryStorageAdapter safely in Node/SSR environments where indexedDB is unavailable', () => {
    const adapter = createDefaultStorageAdapter();
    expect(adapter.backend).toBe('memory');
  });

  it('seeds all domain collections once on first boot without overwriting subsequent mutations across reloads', async () => {
    const persistentBackingMap = new Map<string, unknown>();

    // First session ("before reload")
    const session1Repo = new SalonRepository(new MemoryStorageAdapter(persistentBackingMap));
    const seeded = await session1Repo.ensureSeededAndLoad();

    expect(seeded.meta.schemaVersion).toBe(SALON_SCHEMA_VERSION);
    expect(seeded.artists.length).toBeGreaterThanOrEqual(3);
    expect(seeded.portfolio.length).toBeGreaterThan(0);
    expect(seeded.likedIds).toEqual(DEFAULT_LIKED_IDS);
    expect(seeded.savedIds).toEqual(DEFAULT_SAVED_IDS);
    expect(seeded.outbox).toEqual([]);

    // User creates a new booking & toggles a like
    const newBooking: Appointment = {
      id: 'apt-persist-test',
      clientName: 'Elena Demo',
      clientPhone: '+34 600 111 222',
      clientEmail: 'elena@example.com',
      artistId: seeded.artists[0].id,
      artistName: seeded.artists[0].name,
      artistAvatar: seeded.artists[0].avatar,
      serviceId: seeded.artists[0].services[0].id,
      serviceName: seeded.artists[0].services[0].name,
      price: 165,
      currency: 'USD',
      date: getRelativeDateISO(3),
      timeSlot: '15:00',
      status: 'escrow_locked',
      remindersEnabled: true,
      pushReminderScheduled: true,
      smsReminderScheduled: true,
      createdAt: new Date().toISOString(),
    };

    const nextAppointments = [newBooking, ...seeded.appointments];
    await session1Repo.saveAppointments(nextAppointments);
    await session1Repo.saveLikedIds(['port-gaudi', 'port-1', 'port-2']);

    // Second session ("after page reload" with a brand-new SalonRepository instance reading the same storage)
    const session2Repo = new SalonRepository(new MemoryStorageAdapter(persistentBackingMap));
    const reloaded = await session2Repo.ensureSeededAndLoad();

    expect(reloaded.appointments[0].id).toBe('apt-persist-test');
    expect(reloaded.appointments.length).toBe(seeded.appointments.length + 1);
    expect(reloaded.likedIds).toContain('port-2');
    expect(reloaded.meta.seededAt).toBe(seeded.meta.seededAt);
  });

  it('queues offline mutations in persistent Outbox and supports simulated FIFO flush + resetToSeed()', async () => {
    const persistentBackingMap = new Map<string, unknown>();
    const repo = new SalonRepository(new MemoryStorageAdapter(persistentBackingMap));
    const initial = await repo.ensureSeededAndLoad();

    const newAd: SponsoredAd = {
      id: 'ad-local-1',
      title: 'Offline Promo Nail Glow',
      brandName: 'Nailix Studio',
      tagline: 'Luxury Cyber-Gaudí Manicure',
      description: 'Persisted offline ad card',
      targetAudience: 'client',
      category: 'salon_spa',
      bannerImage: '/assets/images/portfolio_gaudi_mosaic_nails_1790126128212.jpg',
      ctaText: 'Explore',
      discountCode: 'LOCAL15',
      discountPercent: 15,
      bidPerClickNAIL: 10,
      impressions: 0,
      clicks: 0,
      isActive: true,
      sponsoredBadge: 'LOCAL_AD',
    };

    await repo.saveAds([newAd, ...initial.ads]);
    const outboxAfterWrite = await repo.enqueueOutboxMutation('ads', 'AD_CAMPAIGN_CREATED', {
      adId: newAd.id,
    });

    expect(outboxAfterWrite.length).toBe(1);
    expect(outboxAfterWrite[0].status).toBe('pending_sync');
    expect(outboxAfterWrite[0].attempts).toBe(0);

    // Survives simulated reload
    const repoAfterReload = new SalonRepository(new MemoryStorageAdapter(persistentBackingMap));
    const pendingBeforeFlush = await repoAfterReload.getOutbox();
    expect(pendingBeforeFlush).toHaveLength(1);
    expect(pendingBeforeFlush[0].payload).toEqual({ adId: newAd.id });

    // Simulated flush marks queued entries as synced
    const flushed = await repoAfterReload.flushOutboxLocalDemo();
    expect(flushed[0].status).toBe('synced');
    expect(flushed[0].attempts).toBe(1);

    // resetToSeed wipes custom campaigns and outbox, restoring initial fixtures cleanly
    const resetData = await repoAfterReload.resetToSeed();
    expect(resetData.ads.find(a => a.id === 'ad-local-1')).toBeUndefined();
    expect(resetData.outbox).toEqual([]);
  });

  it('degrades transparently to MemoryStorageAdapter if the primary storage backend throws at runtime', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const failingAdapter: StorageAdapter = {
      backend: 'indexeddb',
      async get<T>(_key: StorageKey): Promise<T | undefined> {
        throw new Error('SecurityError: IndexedDB disabled in strict sandbox');
      },
      async set<T>(_key: StorageKey, _value: T): Promise<void> {
        throw new Error('QuotaExceededError');
      },
      async remove(_key: StorageKey): Promise<void> {},
      async keys(): Promise<string[]> {
        return [];
      },
      async clear(): Promise<void> {},
    };

    const resilientRepo = new SalonRepository(failingAdapter);
    const loaded = await resilientRepo.ensureSeededAndLoad();

    expect(resilientRepo.getBackendKind()).toBe('memory');
    expect(loaded.artists.length).toBeGreaterThanOrEqual(3);
    warnSpy.mockRestore();
  });
});
