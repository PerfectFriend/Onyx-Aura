// =============================================================================
// Local-First Salon Repository + Seed Manager + Offline Sync Outbox (Stage 2)
// Replaces direct consumption of hardcoded arrays in UI/hooks with:
//   1) Idempotent initial seeding into IndexedDB (never clobbers saved edits)
//   2) Typed per-collection save helpers
//   3) Persistent offline-first outbox queue ready for future remote sync
// =============================================================================

import {
  DataLayerMeta,
  HydratedSalonData,
  OutboxEntity,
  OutboxMutation,
  StorageAdapter,
} from '../../domain/storage';
import {
  Appointment,
  Artist,
  ChatMessage,
  ClientAnchorPoint,
  PortfolioItem,
  Review,
  SponsoredAd,
} from '../../types';
import {
  INITIAL_ANCHOR_POINTS,
  INITIAL_APPOINTMENTS,
  INITIAL_ARTISTS,
  INITIAL_CHATS,
  INITIAL_PORTFOLIO,
  INITIAL_REVIEWS,
} from '../../data/initialData';
import { INITIAL_SPONSORED_ADS } from '../../data/advertisements';
import { createDefaultStorageAdapter, MemoryStorageAdapter } from './indexedDbAdapter';

export const SALON_SCHEMA_VERSION = 1;
export const DEFAULT_LIKED_IDS: string[] = ['port-gaudi', 'port-1'];
export const DEFAULT_SAVED_IDS: string[] = ['port-gaudi', 'port-2'];

function cloneSeed<T>(value: T): T {
  if (typeof structuredClone === 'function') {
    return structuredClone(value);
  }
  return JSON.parse(JSON.stringify(value)) as T;
}

export function createSeedSnapshot() {
  return {
    artists: cloneSeed(INITIAL_ARTISTS),
    appointments: cloneSeed(INITIAL_APPOINTMENTS),
    portfolio: cloneSeed(INITIAL_PORTFOLIO),
    likedIds: [...DEFAULT_LIKED_IDS],
    savedIds: [...DEFAULT_SAVED_IDS],
    reviews: cloneSeed(INITIAL_REVIEWS),
    anchorPoints: cloneSeed(INITIAL_ANCHOR_POINTS),
    chats: cloneSeed(INITIAL_CHATS),
    ads: cloneSeed(INITIAL_SPONSORED_ADS),
  };
}

function nextOutboxId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return `outbox-${crypto.randomUUID()}`;
  }
  return `outbox-${Date.now()}-${Math.floor(Math.random() * 10000)}`;
}

export class SalonRepository {
  private adapter: StorageAdapter;
  private writeQueue: Promise<unknown> = Promise.resolve();

  constructor(adapter: StorageAdapter = createDefaultStorageAdapter()) {
    this.adapter = adapter;
  }

  public getBackendKind() {
    return this.adapter.backend;
  }

  /**
   * Serializes writes cleanly to preserve chronological consistency across async mutations
   * and transparently degrades to an in-memory adapter if browser IndexedDB rejects at runtime
   * (e.g. Firefox private mode SecurityError).
   */
  private enqueueWrite<T>(operation: () => Promise<T>): Promise<T> {
    const run = this.writeQueue.then(operation, operation);
    this.writeQueue = run.catch(() => undefined);
    return run;
  }

  private async safeGet<T>(key: Parameters<StorageAdapter['get']>[0]): Promise<T | undefined> {
    try {
      return await this.adapter.get<T>(key);
    } catch (err) {
      console.warn(`[LocalFirst] Read failed on "${this.adapter.backend}", degrading to memory adapter:`, err);
      this.adapter = new MemoryStorageAdapter();
      return undefined;
    }
  }

  private async safeSet<T>(key: Parameters<StorageAdapter['set']>[0], value: T): Promise<void> {
    try {
      await this.adapter.set(key, value);
    } catch (err) {
      console.warn(`[LocalFirst] Write failed on "${this.adapter.backend}", degrading to memory adapter:`, err);
      this.adapter = new MemoryStorageAdapter();
      await this.adapter.set(key, value);
    }
  }

  /**
   * Loads persisted collections from storage, seeding any missing collections cleanly
   * without overwriting previously saved user changes.
   */
  public async ensureSeededAndLoad(): Promise<HydratedSalonData> {
    const nowIso = new Date().toISOString();

    const [
      existingMeta,
      existingArtists,
      existingAppointments,
      existingPortfolio,
      existingLiked,
      existingSaved,
      existingReviews,
      existingAnchors,
      existingChats,
      existingAds,
      existingOutbox,
    ] = await Promise.all([
      this.safeGet<DataLayerMeta>('schemaMeta'),
      this.safeGet<Artist[]>('artists'),
      this.safeGet<Appointment[]>('appointments'),
      this.safeGet<PortfolioItem[]>('portfolio'),
      this.safeGet<string[]>('likedIds'),
      this.safeGet<string[]>('savedIds'),
      this.safeGet<Review[]>('reviews'),
      this.safeGet<ClientAnchorPoint[]>('anchorPoints'),
      this.safeGet<ChatMessage[]>('chats'),
      this.safeGet<SponsoredAd[]>('ads'),
      this.safeGet<OutboxMutation[]>('outbox'),
    ]);

    const artists = existingArtists ?? cloneSeed(INITIAL_ARTISTS);
    const appointments = existingAppointments ?? cloneSeed(INITIAL_APPOINTMENTS);
    const portfolio = existingPortfolio ?? cloneSeed(INITIAL_PORTFOLIO);
    const likedIds = existingLiked ?? [...DEFAULT_LIKED_IDS];
    const savedIds = existingSaved ?? [...DEFAULT_SAVED_IDS];
    const reviews = existingReviews ?? cloneSeed(INITIAL_REVIEWS);
    const anchorPoints = existingAnchors ?? cloneSeed(INITIAL_ANCHOR_POINTS);
    const chats = existingChats ?? cloneSeed(INITIAL_CHATS);
    const ads = existingAds ?? cloneSeed(INITIAL_SPONSORED_ADS);
    const outbox = existingOutbox ?? [];

    const meta: DataLayerMeta = existingMeta ?? {
      schemaVersion: SALON_SCHEMA_VERSION,
      seededAt: nowIso,
      lastModifiedAt: nowIso,
      backend: this.adapter.backend,
    };

    const seedWrites: Promise<void>[] = [];
    if (!existingArtists) seedWrites.push(this.safeSet('artists', artists));
    if (!existingAppointments) seedWrites.push(this.safeSet('appointments', appointments));
    if (!existingPortfolio) seedWrites.push(this.safeSet('portfolio', portfolio));
    if (!existingLiked) seedWrites.push(this.safeSet('likedIds', likedIds));
    if (!existingSaved) seedWrites.push(this.safeSet('savedIds', savedIds));
    if (!existingReviews) seedWrites.push(this.safeSet('reviews', reviews));
    if (!existingAnchors) seedWrites.push(this.safeSet('anchorPoints', anchorPoints));
    if (!existingChats) seedWrites.push(this.safeSet('chats', chats));
    if (!existingAds) seedWrites.push(this.safeSet('ads', ads));
    if (!existingOutbox) seedWrites.push(this.safeSet('outbox', outbox));
    if (!existingMeta) seedWrites.push(this.safeSet('schemaMeta', meta));

    if (seedWrites.length > 0) {
      await Promise.all(seedWrites);
    }

    return {
      artists,
      appointments,
      portfolio,
      likedIds,
      savedIds,
      reviews,
      anchorPoints,
      chats,
      ads,
      outbox,
      meta,
    };
  }

  private async touchMeta(): Promise<void> {
    const existing = await this.safeGet<DataLayerMeta>('schemaMeta');
    const nowIso = new Date().toISOString();
    await this.safeSet('schemaMeta', {
      schemaVersion: SALON_SCHEMA_VERSION,
      seededAt: existing?.seededAt || nowIso,
      lastModifiedAt: nowIso,
      backend: this.adapter.backend,
    });
  }

  /**
   * Appends a local mutation to the persistent Offline-First Outbox Queue.
   * When a backend endpoint is introduced in Stage 4/5, pending records flush in FIFO order.
   */
  public async enqueueOutboxMutation(
    entity: OutboxEntity,
    action: string,
    payload: unknown
  ): Promise<OutboxMutation[]> {
    return this.enqueueWrite(async () => {
      const current = (await this.safeGet<OutboxMutation[]>('outbox')) ?? [];
      const entry: OutboxMutation = {
        id: nextOutboxId(),
        entity,
        action,
        payload,
        createdAt: new Date().toISOString(),
        status: 'pending_sync',
        attempts: 0,
      };
      // Keep bounded outbox history (up to 100 latest entries)
      const next = [entry, ...current].slice(0, 100);
      await this.safeSet('outbox', next);
      await this.touchMeta();
      return next;
    });
  }

  public async getOutbox(): Promise<OutboxMutation[]> {
    return (await this.safeGet<OutboxMutation[]>('outbox')) ?? [];
  }

  /**
   * [SIM] Marks pending outbox items as synced for offline-reconnection readiness demos
   * until a real backend server is attached.
   */
  public async flushOutboxLocalDemo(): Promise<OutboxMutation[]> {
    return this.enqueueWrite(async () => {
      const current = (await this.safeGet<OutboxMutation[]>('outbox')) ?? [];
      const flushed: OutboxMutation[] = current.map(item => ({
        ...item,
        status: 'synced',
        attempts: item.attempts + 1,
      }));
      await this.safeSet('outbox', flushed);
      await this.touchMeta();
      return flushed;
    });
  }

  public saveArtists(artists: Artist[]): Promise<void> {
    return this.enqueueWrite(async () => {
      await this.safeSet('artists', artists);
      await this.touchMeta();
    });
  }

  public saveAppointments(appointments: Appointment[]): Promise<void> {
    return this.enqueueWrite(async () => {
      await this.safeSet('appointments', appointments);
      await this.touchMeta();
    });
  }

  public savePortfolio(portfolio: PortfolioItem[]): Promise<void> {
    return this.enqueueWrite(async () => {
      await this.safeSet('portfolio', portfolio);
      await this.touchMeta();
    });
  }

  public saveLikedIds(likedIds: string[]): Promise<void> {
    return this.enqueueWrite(async () => {
      await this.safeSet('likedIds', likedIds);
      await this.touchMeta();
    });
  }

  public saveSavedIds(savedIds: string[]): Promise<void> {
    return this.enqueueWrite(async () => {
      await this.safeSet('savedIds', savedIds);
      await this.touchMeta();
    });
  }

  public saveReviews(reviews: Review[]): Promise<void> {
    return this.enqueueWrite(async () => {
      await this.safeSet('reviews', reviews);
      await this.touchMeta();
    });
  }

  public saveAnchorPoints(anchorPoints: ClientAnchorPoint[]): Promise<void> {
    return this.enqueueWrite(async () => {
      await this.safeSet('anchorPoints', anchorPoints);
      await this.touchMeta();
    });
  }

  public saveChats(chats: ChatMessage[]): Promise<void> {
    return this.enqueueWrite(async () => {
      await this.safeSet('chats', chats);
      await this.touchMeta();
    });
  }

  public saveAds(ads: SponsoredAd[]): Promise<void> {
    return this.enqueueWrite(async () => {
      await this.safeSet('ads', ads);
      await this.touchMeta();
    });
  }

  /**
   * Clears all locally persisted state and re-seeds clean initial fixtures.
   */
  public async resetToSeed(): Promise<HydratedSalonData> {
    return this.enqueueWrite(async () => {
      await this.adapter.clear();
      return this.ensureSeededAndLoad();
    });
  }
}

export const defaultSalonRepository = new SalonRepository();
