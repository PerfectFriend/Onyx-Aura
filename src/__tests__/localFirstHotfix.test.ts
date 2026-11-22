import { describe, it, expect } from 'vitest';
import {
  SALON_SCHEMA_VERSION,
  SalonRepository,
  sanitizeOutboxPayload,
} from '../infrastructure/storage/salonRepository';
import {
  MemoryStorageAdapter,
  ResilientStorageAdapter,
} from '../infrastructure/storage/indexedDbAdapter';
import { assertNoSecretLikeFields } from '../infrastructure/identity/secretHygiene';
import { validatePasskeyRecord } from '../domain/schemas';
import { StorageKey } from '../domain/storage';

async function seededMapWithRealChat() {
  const map = new Map<string, unknown>();
  const repo = new SalonRepository(new MemoryStorageAdapter(map));
  const data = await repo.ensureSeededAndLoad();
  await repo.saveChats([
    ...data.chats,
    { ...data.chats[0], id: 'REAL-USER-CHAT', text: 'real user message', origin: 'user' },
  ]);
  return map;
}

describe('Sprint 3.3 Hotfix — Kolyan Probes P1, P4, P5, N-06, N-07, N-11', () => {
  it('N-01 (Proba P1): transient read error on "chats" preserves REAL-USER-CHAT and keeps health degraded', async () => {
    const map = await seededMapWithRealChat();
    class ReadFlaky extends MemoryStorageAdapter {
      override async get<T>(key: StorageKey): Promise<T | undefined> {
        if (key === 'chats') throw new Error('transient IO error');
        return super.get<T>(key);
      }
    }

    const repo = new SalonRepository(
      new ResilientStorageAdapter(new ReadFlaky(map), { retryDelayMs: 1, maxRetries: 0 })
    );
    const loaded = await repo.ensureSeededAndLoad();

    expect(JSON.stringify(map.get('chats'))).toContain('REAL-USER-CHAT');
    expect(loaded.health).toBe('degraded');
    expect(loaded.unreadableKeys).toContain('chats');
    expect(loaded.warnings.some(w => w.includes('chats'))).toBe(true);

    // Refuses overwriting an unreadable key until clean read
    await expect(repo.saveChats([])).rejects.toThrow(/blocked|unreadable|заблокирована|прочитана/i);
  });

  it('N-02 (Proba P5): legacy v2 records without origin are migrated to v3 with explicit origin="user"', async () => {
    const map = new Map<string, unknown>();
    await new SalonRepository(new MemoryStorageAdapter(map)).ensureSeededAndLoad();

    // Case A: explicit v2 metadata in storage + untagged appointments
    map.set('schemaMeta', {
      schemaVersion: 2,
      seededAt: '2026-11-16T00:00:00.000Z',
      lastModifiedAt: '2026-11-16T00:00:00.000Z',
      backend: 'memory',
    });
    const legacy = (map.get('appointments') as Array<Record<string, unknown>>).map(a => {
      const copy: Record<string, unknown> = { ...a, id: `USER-${String(a.id)}` };
      delete copy.origin;
      return copy;
    });
    map.set('appointments', legacy);

    const data = await new SalonRepository(new MemoryStorageAdapter(map)).ensureSeededAndLoad();
    expect(SALON_SCHEMA_VERSION).toBe(3);
    expect(data.meta.schemaVersion).toBe(3);
    expect(data.appointments.every(a => a.origin === 'user')).toBe(true);
    expect(SalonRepository.filterUserRecords(data.appointments)).toHaveLength(legacy.length);
  });

  it('N-03 (Proba P4): unknown benign field passes through, corrupt entry is quarantined, rest preserved', async () => {
    const map = new Map<string, unknown>();
    const initial = await new SalonRepository(new MemoryStorageAdapter(map)).ensureSeededAndLoad();
    const artists = map.get('artists') as Array<Record<string, unknown>>;
    artists[0].rating = 4.11;
    artists[0].newFieldFromV3 = 'x';
    // Inject one corrupt record alongside valid artists
    const corrupt = { broken: true };
    map.set('artists', [...artists, corrupt]);

    const data = await new SalonRepository(new MemoryStorageAdapter(map)).ensureSeededAndLoad();
    expect(data.artists[0].rating).toBe(4.11);
    expect((data.artists[0] as unknown as Record<string, unknown>).newFieldFromV3).toBe('x');
    expect(data.artists).toHaveLength(initial.artists.length);
    expect(data.quarantineKeys.some(k => k.startsWith('quarantine:artists:'))).toBe(true);

    // Subsequent save of valid entities preserves benign unknown fields cleanly
    await new SalonRepository(new MemoryStorageAdapter(map)).saveArtists(data.artists);
  });

  it('N-03: non-array corrupt collection backups raw value to quarantine before falling back to seed', async () => {
    const map = new Map<string, unknown>([['appointments', 'corrupt-string']]);
    const repo = new SalonRepository(new MemoryStorageAdapter(map));
    const data = await repo.ensureSeededAndLoad();

    expect(data.quarantineKeys.some(k => k.startsWith('quarantine:appointments:'))).toBe(true);
    const dumped = await repo.exportQuarantinedData();
    expect(Object.values(dumped)).toContain('corrupt-string');
  });

  it('N-06: commitWithOutbox writes collection, outbox, and schemaMeta in ONE atomic setMany transaction', async () => {
    let setManyCallCount = 0;
    const countingAdapter = new MemoryStorageAdapter(new Map());
    const originalSetMany = countingAdapter.setMany.bind(countingAdapter);
    countingAdapter.setMany = async entries => {
      setManyCallCount += 1;
      return originalSetMany(entries);
    };

    const repo = new SalonRepository(countingAdapter);
    const data = await repo.ensureSeededAndLoad();
    setManyCallCount = 0;

    const outbox = await repo.saveChatsWithOutbox(data.chats, {
      entity: 'chats',
      action: 'CHAT_MESSAGE_SAVED',
      payload: { threadId: 't1', msgId: 'm1', clientPhone: '+34600111222', secretLeak: 'nope' },
    });

    expect(setManyCallCount).toBe(1);
    expect(outbox[0].payload).toEqual({ threadId: 't1', msgId: 'm1' });

    const sanitized = sanitizeOutboxPayload({
      appointmentId: 'apt-1',
      clientEmail: 'secret@user.com',
      arbitrary: 'drop-me',
    });
    expect(sanitized).toEqual({ appointmentId: 'apt-1' });
  });

  it('N-07 (Proba P8): harmless English chat text with "bearer" passes while real JWT/Bearer header triggers block', () => {
    expect(() =>
      assertNoSecretLikeFields([{ text: 'The bearer of good news arrived' }])
    ).not.toThrow();
    expect(() =>
      assertNoSecretLikeFields([{ text: 'Please bring Bearer token to the desk' }])
    ).not.toThrow();

    expect(() =>
      assertNoSecretLikeFields({ text: 'Authorization: Bearer super_secret_token_987654321' })
    ).toThrow(/Security policy violation/);
    expect(() =>
      assertNoSecretLikeFields({ text: 'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjMifQ.signature' })
    ).toThrow(/Security policy violation/);
  });

  it('N-11: isNonEmptyString rejects blank strings in required schema fields like passkey id', () => {
    const emptyIdRes = validatePasskeyRecord({
      id: '   ',
      rawIdBase64Url: 'AA',
      displayName: 'User',
      role: 'client',
      rpId: 'localhost',
      algorithm: -7,
      createdAt: '2026-11-16T00:00:00.000Z',
      lastUsedAt: '2026-11-16T00:00:00.000Z',
      transports: [],
      isSimulatedFallback: false,
    });
    expect(emptyIdRes.ok).toBe(false);
  });

  it('N-06 (extended): transactional review + artist rating update, anchor, master salon, likes, ads, and outbox flush', async () => {
    const map = new Map<string, unknown>();
    const adapter = new ResilientStorageAdapter(new MemoryStorageAdapter(map), {
      maxRetries: 1,
      retryDelayMs: 0,
    });
    const repo = new SalonRepository(adapter);
    const data = await repo.ensureSeededAndLoad();
    const firstArtist = data.artists[0];
    const firstAnchor = data.anchorPoints[0];

    const reviewResult = await repo.addReviewAndUpdateArtistWithOutbox({
      ...data.reviews[0],
      id: 'rev-atomic-1',
      artistId: firstArtist.id,
      rating: 5,
      text: 'Super clean work!',
      origin: 'user',
    });
    expect(reviewResult.reviews[0].id).toBe('rev-atomic-1');
    expect(reviewResult.artists[0].totalReviews).toBe(firstArtist.totalReviews + 1);
    expect(reviewResult.outbox.some(o => o.action === 'REVIEW_SUBMITTED')).toBe(true);

    const anchorRes = await repo.updateAnchorPointWithOutbox({
      ...firstAnchor,
      label: 'Eixample Studio [EDITED]',
    });
    expect(anchorRes.anchorPoints.some(a => a.label === 'Eixample Studio [EDITED]')).toBe(true);
    expect(anchorRes.outbox.some(o => o.action === 'ANCHOR_POINT_UPDATED')).toBe(true);

    const salonRes = await repo.updateMasterSalonWithOutbox(
      firstArtist.id,
      'Salon Nova',
      'Passeig de Gracia 10',
      41.39,
      2.16
    );
    expect(salonRes.artists.find(a => a.id === firstArtist.id)?.salonName).toBe('Salon Nova');
    expect(salonRes.outbox.some(o => o.action === 'MASTER_SALON_UPDATED')).toBe(true);

    await repo.saveAppointmentsWithOutbox(data.appointments, {
      entity: 'appointments',
      action: 'APPOINTMENT_SAVED',
      payload: { id: 'apt-tx-1' },
    });
    await repo.savePortfolioWithOutbox(data.portfolio, {
      entity: 'portfolio',
      action: 'PORTFOLIO_UPDATED',
      payload: { lookId: data.portfolio[0].id },
    });
    await repo.saveAdsWithOutbox(data.ads, {
      entity: 'ads',
      action: 'AD_UPDATED',
      payload: { adId: data.ads[0].id },
    });
    await repo.saveLikesAndPortfolioAtomic(['port-1'], data.portfolio, {
      entity: 'likes',
      action: 'LOOK_LIKED',
      payload: { lookId: 'port-1', totalLiked: 1 },
    });
    const savedOutbox = await repo.saveSavedIdsWithOutbox(['port-2'], {
      entity: 'saves',
      action: 'LOOK_SAVED',
      payload: { lookId: 'port-2', totalSaved: 1 },
    });
    expect(savedOutbox.some(o => o.action === 'LOOK_SAVED')).toBe(true);

    const flushed = await repo.flushOutboxLocalDemo();
    expect(flushed.every(o => o.status === 'synced')).toBe(true);
    expect(repo.getPendingWriteCount()).toBe(0);
    expect(await repo.retryPendingWrites()).toBe(true);

    const unsubscribe = repo.subscribeExternalChanges(() => {});
    expect(() => unsubscribe()).not.toThrow();
    expect(() => repo.destroy()).not.toThrow();
  });
});
