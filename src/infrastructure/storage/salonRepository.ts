// =============================================================================
// Local-First Salon Repository Facade (Q-10 · Modularized in Sprint 5.1)
// Coordinates:
// - `repositorySeed.ts` (seed fixtures & origin tagging)
// - `repositoryMigrations.ts` (`v1 -> v2 -> v3` migrations & backfill)
// - `repositoryOutbox.ts` (allowlist sanitization & UUID mutation queue)
// - `repositoryCollections.ts` (discriminated read recovery & quarantine)
// =============================================================================

import { createId } from '../../domain/ids';
import {
  DEFAULT_ANONYMOUS_SESSION,
  IdentitySession,
  isIdentitySessionExpired,
  PasskeyCredentialRecord,
} from '../../domain/identity';
import { computeExactArtistRatingUpdate } from '../../domain/rating';
import {
  validateAds,
  validateAnchorPointRecord,
  validateAnchorPoints,
  validateAppointments,
  validateArtists,
  validateChats,
  validateIdentitySession,
  validatePasskeys,
  validatePortfolio,
  validateReviewRecord,
  validateReviews,
  validateSchemaMeta,
  validateStringArray,
} from '../../domain/schemas';
import {
  BaseStorageKey,
  DataLayerMeta,
  HydratedSalonData,
  OutboxMutation,
  OutboxMutationInput,
  StorageAdapter,
  StorageEntry,
  StorageHealthReport,
  StorageKey,
} from '../../domain/storage';
import { formatAppMessage } from '../../i18n/messages';
import { SupportedLanguage } from '../../i18n/translations';
import {
  Appointment,
  Artist,
  ChatMessage,
  ClientAnchorPoint,
  PortfolioItem,
  Review,
  SponsoredAd,
} from '../../types';
import { assertNoSecretLikeFields } from '../identity/secretHygiene';
import {
  createDefaultStorageAdapter,
  ResilientStorageAdapter,
  setActiveStorageStatus,
} from './indexedDbAdapter';
import {
  buildSeedEntriesToPersist,
  readAllRepositoryCollections,
  resolveAllRepositoryCollections,
} from './repositoryCollections';
import {
  runSchemaMigrations,
  SALON_SCHEMA_VERSION,
  SCHEMA_MIGRATIONS,
  SchemaMigration,
} from './repositoryMigrations';
import {
  appendOutboxMutationState,
  buildFlushedOutboxState,
  MAX_SYNCED_OUTBOX_HISTORY,
  OUTBOX_PENDING_WARNING_THRESHOLD,
  sanitizeOutboxPayload,
} from './repositoryOutbox';
import { createSeedSnapshot, DEFAULT_LIKED_IDS, DEFAULT_SAVED_IDS } from './repositorySeed';

export {
  SALON_SCHEMA_VERSION,
  DEFAULT_LIKED_IDS,
  DEFAULT_SAVED_IDS,
  MAX_SYNCED_OUTBOX_HISTORY,
  OUTBOX_PENDING_WARNING_THRESHOLD,
  SCHEMA_MIGRATIONS,
  createSeedSnapshot,
  sanitizeOutboxPayload,
};
export type { SchemaMigration };

const STORAGE_SYNC_CHANNEL_NAME = 'nailix_storage_sync_v1';
const STORAGE_LOCK_NAME = 'nailix_repository_write_lock';

async function withWebLock<T>(operation: () => Promise<T>): Promise<T> {
  if (
    typeof navigator !== 'undefined' &&
    navigator.locks &&
    typeof navigator.locks.request === 'function'
  ) {
    return navigator.locks.request(STORAGE_LOCK_NAME, operation);
  }
  return operation();
}

export class SalonRepository {
  private readonly resilientAdapter: ResilientStorageAdapter;
  private readonly tabId: string;
  private readonly language?: SupportedLanguage;
  private writeQueue: Promise<unknown> = Promise.resolve();
  private syncChannel: BroadcastChannel | null = null;
  private readOnlyFutureSchema = false;
  private readonly unreadableCollections = new Set<BaseStorageKey>();

  constructor(
    adapter: StorageAdapter = createDefaultStorageAdapter(),
    options: { language?: SupportedLanguage } = {}
  ) {
    this.resilientAdapter =
      adapter instanceof ResilientStorageAdapter ? adapter : new ResilientStorageAdapter(adapter);
    this.tabId = createId('tab');
    this.language = options.language;

    if (typeof window !== 'undefined' && 'BroadcastChannel' in window) {
      try {
        this.syncChannel = new BroadcastChannel(STORAGE_SYNC_CHANNEL_NAME);
      } catch {
        this.syncChannel = null;
      }
    }
  }

  public getBackendKind() {
    return this.resilientAdapter.backend;
  }

  public getHealthReport(): StorageHealthReport {
    return this.resilientAdapter.getHealthReport();
  }

  public getPendingWriteCount(): number {
    return this.resilientAdapter.getPendingWriteCount();
  }

  public async retryPendingWrites(): Promise<boolean> {
    const flushedAll = await this.resilientAdapter.retryPendingWrites();
    this.updateGlobalStatus();
    if (flushedAll) {
      this.notifyOtherTabs();
    }
    return flushedAll;
  }

  public subscribeExternalChanges(onExternalChange: () => void): () => void {
    if (!this.syncChannel) return () => {};
    const listener = (event: MessageEvent) => {
      const payload = event.data as { type?: unknown; tabId?: unknown } | null;
      if (payload && payload.type === 'STORAGE_UPDATED' && payload.tabId !== this.tabId) {
        onExternalChange();
      }
    };
    this.syncChannel.addEventListener('message', listener);
    return () => {
      this.syncChannel?.removeEventListener('message', listener);
    };
  }

  public destroy(): void {
    if (this.syncChannel) {
      this.syncChannel.close();
      this.syncChannel = null;
    }
  }

  private notifyOtherTabs(): void {
    if (this.syncChannel) {
      try {
        this.syncChannel.postMessage({
          type: 'STORAGE_UPDATED',
          tabId: this.tabId,
          ts: Date.now(),
        });
      } catch {
        // Ignore closed channel
      }
    }
  }

  private updateGlobalStatus(): void {
    const report = this.resilientAdapter.getHealthReport();
    setActiveStorageStatus({ backend: report.backend, health: report.health });
  }

  private enqueueWrite<T>(operation: () => Promise<T>): Promise<T> {
    const run = this.writeQueue.then(() => withWebLock(operation), () => withWebLock(operation));
    this.writeQueue = run.catch(() => undefined);
    return run;
  }

  public async ensureSeededAndLoad(): Promise<HydratedSalonData> {
    const nowIso = new Date().toISOString();
    const warnings: string[] = [];
    const quarantineQueue: StorageEntry[] = [];

    const raw = await readAllRepositoryCollections(this.resilientAdapter);

    const metaUnreadable = raw.rawMeta.status === 'unreadable';
    if (raw.rawMeta.status === 'unreadable') {
      warnings.push(
        formatAppMessage('storage.meta_unreadable', { error: raw.rawMeta.error }, this.language)
      );
    }

    const parsedMetaResult =
      raw.rawMeta.status === 'ok'
        ? validateSchemaMeta(raw.rawMeta.value)
        : { ok: false, value: undefined };
    const storedMeta = parsedMetaResult.ok ? parsedMetaResult.value : undefined;
    const futureSchemaDetected = Boolean(
      storedMeta && storedMeta.schemaVersion > SALON_SCHEMA_VERSION
    );
    this.readOnlyFutureSchema = futureSchemaDetected;

    if (futureSchemaDetected && storedMeta) {
      warnings.push(
        formatAppMessage(
          'storage.future_schema',
          {
            storedVersion: storedMeta.schemaVersion,
            currentVersion: SALON_SCHEMA_VERSION,
          },
          this.language
        )
      );
    }

    const resolved = resolveAllRepositoryCollections({
      raw,
      unreadableCollections: this.unreadableCollections,
      warnings,
      quarantineQueue,
      language: this.language,
    });

    let payload = resolved.payload;
    let sessionExpiredOnLoad = false;
    if (!resolved.states.sessionRes.unreadable && isIdentitySessionExpired(payload.identitySession)) {
      payload.identitySession = { ...DEFAULT_ANONYMOUS_SESSION };
      sessionExpiredOnLoad = true;
    }

    let migrated = false;
    let backfilledOrigins = false;
    if (!futureSchemaDetected) {
      const migrationResult = runSchemaMigrations(payload, storedMeta?.schemaVersion);
      payload = migrationResult.payload;
      migrated = migrationResult.migrated;
      backfilledOrigins = migrationResult.backfilledOrigins;
    }

    const meta: DataLayerMeta = {
      schemaVersion: SALON_SCHEMA_VERSION,
      seededAt: storedMeta?.seededAt ?? nowIso,
      lastModifiedAt:
        migrated || backfilledOrigins || !storedMeta ? nowIso : storedMeta.lastModifiedAt,
      backend: this.resilientAdapter.backend,
      storedFutureVersion: futureSchemaDetected ? storedMeta?.schemaVersion : undefined,
    };

    if (!futureSchemaDetected) {
      const seedEntries = buildSeedEntriesToPersist({
        states: resolved.states,
        payload,
        quarantineQueue,
        migrated,
        backfilledOrigins,
        sessionExpiredOnLoad,
        metaUnreadable,
        storedMeta,
        meta,
      });
      if (seedEntries.length > 0) {
        await this.resilientAdapter.setMany(seedEntries);
      }
    }

    const healthReport = this.resilientAdapter.getHealthReport();
    meta.backend = healthReport.backend;
    this.updateGlobalStatus();

    const pendingCount = payload.outbox.filter(m => m.status === 'pending_sync').length;
    if (pendingCount >= OUTBOX_PENDING_WARNING_THRESHOLD) {
      warnings.push(
        formatAppMessage('storage.outbox_threshold', { count: pendingCount }, this.language)
      );
    }

    const allKeys = await this.resilientAdapter.keys();
    const quarantineKeys = allKeys.filter(k => k.startsWith('quarantine:'));

    return {
      ...payload,
      meta,
      health: healthReport.health,
      warnings: [...healthReport.warnings, ...warnings],
      readOnlyFutureSchema: futureSchemaDetected,
      storedFutureVersion: meta.storedFutureVersion,
      unreadableKeys: healthReport.unreadableKeys,
      quarantineKeys,
    };
  }

  private async buildMetaEntry(): Promise<StorageEntry> {
    const existing = await this.resilientAdapter.get<DataLayerMeta>('schemaMeta');
    const nowIso = new Date().toISOString();
    const meta: DataLayerMeta = {
      schemaVersion: SALON_SCHEMA_VERSION,
      seededAt: existing?.seededAt || nowIso,
      lastModifiedAt: nowIso,
      backend: this.resilientAdapter.backend,
    };
    return ['schemaMeta', meta];
  }

  private assertWritable(targetKeys: BaseStorageKey[] = []): void {
    if (this.readOnlyFutureSchema) {
      throw new Error(formatAppMessage('storage.readonly_future_error', {}, this.language));
    }
    for (const k of targetKeys) {
      if (this.unreadableCollections.has(k)) {
        throw new Error(
          formatAppMessage('storage.unreadable_write_blocked', { key: k }, this.language)
        );
      }
    }
  }

  private async buildNextOutboxEntry(mutation: OutboxMutationInput): Promise<{
    nextOutbox: OutboxMutation[];
    entry: StorageEntry;
  }> {
    const current = (await this.resilientAdapter.get<OutboxMutation[]>('outbox')) ?? [];
    return appendOutboxMutationState(current, mutation);
  }

  public async enqueueOutboxMutation(
    entity: OutboxMutationInput['entity'],
    action: string,
    payload: unknown
  ): Promise<OutboxMutation[]> {
    this.assertWritable(['outbox']);
    return this.enqueueWrite(async () => {
      const { nextOutbox, entry } = await this.buildNextOutboxEntry({ entity, action, payload });
      const metaEntry = await this.buildMetaEntry();
      await this.resilientAdapter.setMany([entry, metaEntry]);
      this.updateGlobalStatus();
      this.notifyOtherTabs();
      return nextOutbox;
    });
  }

  public async getOutbox(): Promise<OutboxMutation[]> {
    return (await this.resilientAdapter.get<OutboxMutation[]>('outbox')) ?? [];
  }

  /**
   * [SIM] Marks pending outbox items as synced for offline-reconnection readiness demos.
   */
  public async flushOutboxLocalDemo(): Promise<OutboxMutation[]> {
    this.assertWritable(['outbox']);
    return this.enqueueWrite(async () => {
      const current = (await this.resilientAdapter.get<OutboxMutation[]>('outbox')) ?? [];
      const flushed = buildFlushedOutboxState(current);
      const metaEntry = await this.buildMetaEntry();
      await this.resilientAdapter.setMany([['outbox', flushed], metaEntry]);
      this.updateGlobalStatus();
      this.notifyOtherTabs();
      return flushed;
    });
  }

  private async commitValidated<T>(
    key: BaseStorageKey,
    value: T,
    validator: (v: unknown) => { ok: boolean; reason?: string },
    outboxMutation?: OutboxMutationInput
  ): Promise<OutboxMutation[] | void> {
    this.assertWritable(outboxMutation ? [key, 'outbox'] : [key]);
    assertNoSecretLikeFields(value);
    const check = validator(value);
    if (!check.ok) {
      throw new Error(`Security policy violation: invalid "${key}" schema (${check.reason}).`);
    }
    return this.enqueueWrite(async () => {
      const entries: StorageEntry[] = [[key, value]];
      let nextOutbox: OutboxMutation[] | undefined;
      if (outboxMutation) {
        const out = await this.buildNextOutboxEntry(outboxMutation);
        entries.push(out.entry);
        nextOutbox = out.nextOutbox;
      }
      entries.push(await this.buildMetaEntry());
      await this.resilientAdapter.setMany(entries);
      this.updateGlobalStatus();
      this.notifyOtherTabs();
      return nextOutbox;
    });
  }

  public async commitWithOutbox<T>(
    key: BaseStorageKey,
    value: T,
    validator: (v: unknown) => { ok: boolean; reason?: string },
    mutation: OutboxMutationInput
  ): Promise<OutboxMutation[]> {
    const res = await this.commitValidated(key, value, validator, mutation);
    return res ?? [];
  }

  public saveArtists(artists: Artist[]): Promise<void> {
    return this.commitValidated('artists', artists, v =>
      validateArtists(v, { allowUnknownNonSecret: true })
    ) as Promise<void>;
  }

  public saveAppointments(appointments: Appointment[]): Promise<void> {
    return this.commitValidated('appointments', appointments, v =>
      validateAppointments(v, { allowUnknownNonSecret: true })
    ) as Promise<void>;
  }

  public saveAppointmentsWithOutbox(
    appointments: Appointment[],
    mutation: OutboxMutationInput
  ): Promise<OutboxMutation[]> {
    return this.commitWithOutbox(
      'appointments',
      appointments,
      v => validateAppointments(v, { allowUnknownNonSecret: true }),
      mutation
    );
  }

  public savePortfolio(portfolio: PortfolioItem[]): Promise<void> {
    return this.commitValidated('portfolio', portfolio, v =>
      validatePortfolio(v, { allowUnknownNonSecret: true })
    ) as Promise<void>;
  }

  public savePortfolioWithOutbox(
    portfolio: PortfolioItem[],
    mutation: OutboxMutationInput
  ): Promise<OutboxMutation[]> {
    return this.commitWithOutbox(
      'portfolio',
      portfolio,
      v => validatePortfolio(v, { allowUnknownNonSecret: true }),
      mutation
    );
  }

  public saveLikedIds(likedIds: string[]): Promise<void> {
    return this.commitValidated('likedIds', likedIds, v =>
      validateStringArray(v, 'likedIds')
    ) as Promise<void>;
  }

  public saveLikesAndPortfolioAtomic(
    likedIds: string[],
    portfolio: PortfolioItem[],
    mutation?: OutboxMutationInput
  ): Promise<OutboxMutation[] | void> {
    this.assertWritable(mutation ? ['likedIds', 'portfolio', 'outbox'] : ['likedIds', 'portfolio']);
    assertNoSecretLikeFields(likedIds);
    assertNoSecretLikeFields(portfolio);
    const likedCheck = validateStringArray(likedIds, 'likedIds');
    if (!likedCheck.ok) throw new Error(`Invalid likedIds: ${likedCheck.reason}`);
    const portfolioCheck = validatePortfolio(portfolio, { allowUnknownNonSecret: true });
    if (!portfolioCheck.ok) throw new Error(`Invalid portfolio: ${portfolioCheck.reason}`);

    return this.enqueueWrite(async () => {
      const entries: StorageEntry[] = [
        ['likedIds', likedIds],
        ['portfolio', portfolio],
      ];
      let nextOutbox: OutboxMutation[] | undefined;
      if (mutation) {
        const out = await this.buildNextOutboxEntry(mutation);
        entries.push(out.entry);
        nextOutbox = out.nextOutbox;
      }
      entries.push(await this.buildMetaEntry());
      await this.resilientAdapter.setMany(entries);
      this.updateGlobalStatus();
      this.notifyOtherTabs();
      return nextOutbox;
    });
  }

  public saveReviewsAndArtistsAtomic(
    reviews: Review[],
    artists: Artist[],
    mutation?: OutboxMutationInput
  ): Promise<OutboxMutation[] | void> {
    this.assertWritable(mutation ? ['reviews', 'artists', 'outbox'] : ['reviews', 'artists']);
    assertNoSecretLikeFields(reviews);
    assertNoSecretLikeFields(artists);
    const revCheck = validateReviews(reviews, { allowUnknownNonSecret: true });
    if (!revCheck.ok) throw new Error(`Invalid reviews: ${revCheck.reason}`);
    const artCheck = validateArtists(artists, { allowUnknownNonSecret: true });
    if (!artCheck.ok) throw new Error(`Invalid artists: ${artCheck.reason}`);

    return this.enqueueWrite(async () => {
      const entries: StorageEntry[] = [
        ['reviews', reviews],
        ['artists', artists],
      ];
      let nextOutbox: OutboxMutation[] | undefined;
      if (mutation) {
        const out = await this.buildNextOutboxEntry(mutation);
        entries.push(out.entry);
        nextOutbox = out.nextOutbox;
      }
      entries.push(await this.buildMetaEntry());
      await this.resilientAdapter.setMany(entries);
      this.updateGlobalStatus();
      this.notifyOtherTabs();
      return nextOutbox;
    });
  }

  public async addReviewAndUpdateArtistWithOutbox(newReview: Review): Promise<{
    reviews: Review[];
    artists: Artist[];
    outbox: OutboxMutation[];
  }> {
    this.assertWritable(['reviews', 'artists', 'outbox']);
    const taggedReview: Review = { ...newReview, origin: 'user' };
    assertNoSecretLikeFields(taggedReview);
    const singleCheck = validateReviewRecord(taggedReview, { allowUnknownNonSecret: true });
    if (!singleCheck.ok) {
      throw new Error(`Invalid review: ${singleCheck.reason}`);
    }

    return this.enqueueWrite(async () => {
      const currentReviews = (await this.resilientAdapter.get<Review[]>('reviews')) ?? [];
      const currentArtists = (await this.resilientAdapter.get<Artist[]>('artists')) ?? [];

      const nextReviews = [taggedReview, ...currentReviews];
      const nextArtists = currentArtists.map(art => {
        if (art.id !== taggedReview.artistId) return art;
        const updated = computeExactArtistRatingUpdate({
          currentRating: art.rating,
          totalReviews: art.totalReviews,
          ratingSum: art.ratingSum,
          newRating: taggedReview.rating,
        });
        return {
          ...art,
          rating: updated.rating,
          totalReviews: updated.totalReviews,
          ratingSum: updated.ratingSum,
        };
      });

      const out = await this.buildNextOutboxEntry({
        entity: 'reviews',
        action: 'REVIEW_SUBMITTED',
        payload: {
          reviewId: taggedReview.id,
          artistId: taggedReview.artistId,
          rating: taggedReview.rating,
        },
      });
      const metaEntry = await this.buildMetaEntry();

      await this.resilientAdapter.setMany([
        ['reviews', nextReviews],
        ['artists', nextArtists],
        out.entry,
        metaEntry,
      ]);
      this.updateGlobalStatus();
      this.notifyOtherTabs();

      return { reviews: nextReviews, artists: nextArtists, outbox: out.nextOutbox };
    });
  }

  public async updateAnchorPointWithOutbox(updatedPoint: ClientAnchorPoint): Promise<{
    anchorPoints: ClientAnchorPoint[];
    outbox: OutboxMutation[];
  }> {
    this.assertWritable(['anchorPoints', 'outbox']);
    const tagged: ClientAnchorPoint = { ...updatedPoint, origin: 'user' };
    assertNoSecretLikeFields(tagged);
    const check = validateAnchorPointRecord(tagged, { allowUnknownNonSecret: true });
    if (!check.ok) throw new Error(`Invalid anchorPoint: ${check.reason}`);

    return this.enqueueWrite(async () => {
      const current = (await this.resilientAdapter.get<ClientAnchorPoint[]>('anchorPoints')) ?? [];
      const nextAnchors = current.map(p => (p.id === tagged.id ? tagged : p));
      const out = await this.buildNextOutboxEntry({
        entity: 'anchorPoints',
        action: 'ANCHOR_POINT_UPDATED',
        payload: { anchorId: tagged.id },
      });
      const metaEntry = await this.buildMetaEntry();
      await this.resilientAdapter.setMany([['anchorPoints', nextAnchors], out.entry, metaEntry]);
      this.updateGlobalStatus();
      this.notifyOtherTabs();
      return { anchorPoints: nextAnchors, outbox: out.nextOutbox };
    });
  }

  public async updateMasterSalonWithOutbox(
    artistId: string,
    salonName: string,
    salonAddress: string,
    lat: number,
    lng: number
  ): Promise<{ artists: Artist[]; outbox: OutboxMutation[] }> {
    this.assertWritable(['artists', 'outbox']);
    assertNoSecretLikeFields({ salonName, salonAddress });

    return this.enqueueWrite(async () => {
      const current = (await this.resilientAdapter.get<Artist[]>('artists')) ?? [];
      const nextArtists = current.map(art =>
        art.id === artistId
          ? { ...art, salonName, salonAddress, coordinates: { lat, lng } }
          : art
      );
      const artCheck = validateArtists(nextArtists, { allowUnknownNonSecret: true });
      if (!artCheck.ok) throw new Error(`Invalid artists: ${artCheck.reason}`);

      const out = await this.buildNextOutboxEntry({
        entity: 'artists',
        action: 'MASTER_SALON_UPDATED',
        payload: { artistId },
      });
      const metaEntry = await this.buildMetaEntry();
      await this.resilientAdapter.setMany([['artists', nextArtists], out.entry, metaEntry]);
      this.updateGlobalStatus();
      this.notifyOtherTabs();
      return { artists: nextArtists, outbox: out.nextOutbox };
    });
  }

  public saveSavedIds(savedIds: string[]): Promise<void> {
    return this.commitValidated('savedIds', savedIds, v =>
      validateStringArray(v, 'savedIds')
    ) as Promise<void>;
  }

  public saveSavedIdsWithOutbox(
    savedIds: string[],
    mutation: OutboxMutationInput
  ): Promise<OutboxMutation[]> {
    return this.commitWithOutbox(
      'savedIds',
      savedIds,
      v => validateStringArray(v, 'savedIds'),
      mutation
    );
  }

  public saveReviews(reviews: Review[]): Promise<void> {
    return this.commitValidated('reviews', reviews, v =>
      validateReviews(v, { allowUnknownNonSecret: true })
    ) as Promise<void>;
  }

  public saveAnchorPoints(anchorPoints: ClientAnchorPoint[]): Promise<void> {
    return this.commitValidated('anchorPoints', anchorPoints, v =>
      validateAnchorPoints(v, { allowUnknownNonSecret: true })
    ) as Promise<void>;
  }

  public saveChats(chats: ChatMessage[]): Promise<void> {
    return this.commitValidated('chats', chats, v =>
      validateChats(v, { allowUnknownNonSecret: true })
    ) as Promise<void>;
  }

  public saveChatsWithOutbox(
    chats: ChatMessage[],
    mutation: OutboxMutationInput
  ): Promise<OutboxMutation[]> {
    return this.commitWithOutbox(
      'chats',
      chats,
      v => validateChats(v, { allowUnknownNonSecret: true }),
      mutation
    );
  }

  public saveAds(ads: SponsoredAd[]): Promise<void> {
    return this.commitValidated('ads', ads, v =>
      validateAds(v, { allowUnknownNonSecret: true })
    ) as Promise<void>;
  }

  public saveAdsWithOutbox(
    ads: SponsoredAd[],
    mutation: OutboxMutationInput
  ): Promise<OutboxMutation[]> {
    return this.commitWithOutbox(
      'ads',
      ads,
      v => validateAds(v, { allowUnknownNonSecret: true }),
      mutation
    );
  }

  public savePasskeys(passkeys: PasskeyCredentialRecord[]): Promise<void> {
    return this.commitValidated('passkeys', passkeys, v => validatePasskeys(v)) as Promise<void>;
  }

  public savePasskeysWithOutbox(
    passkeys: PasskeyCredentialRecord[],
    mutation: OutboxMutationInput
  ): Promise<OutboxMutation[]> {
    return this.commitWithOutbox('passkeys', passkeys, v => validatePasskeys(v), mutation);
  }

  public saveIdentitySession(session: IdentitySession): Promise<void> {
    return this.commitValidated('identitySession', session, validateIdentitySession) as Promise<void>;
  }

  public saveIdentitySessionWithOutbox(
    session: IdentitySession,
    mutation: OutboxMutationInput
  ): Promise<OutboxMutation[]> {
    return this.commitWithOutbox('identitySession', session, validateIdentitySession, mutation);
  }

  public async exportQuarantinedData(): Promise<Record<string, unknown>> {
    const keys = await this.resilientAdapter.keys();
    const out: Record<string, unknown> = {};
    for (const key of keys) {
      if (key.startsWith('quarantine:')) {
        out[key] = await this.resilientAdapter.get(key as StorageKey);
      }
    }
    return out;
  }

  public static filterUserRecords<T extends { origin?: 'seed' | 'user' }>(items: T[]): T[] {
    return items.filter(item => item.origin === 'user');
  }

  public async resetToSeed(
    options: { preserveIdentity?: boolean } = {}
  ): Promise<HydratedSalonData> {
    return this.enqueueWrite(async () => {
      const preservedPasskeys = options.preserveIdentity
        ? (await this.resilientAdapter.get<PasskeyCredentialRecord[]>('passkeys')) ?? []
        : [];
      const preservedSession = options.preserveIdentity
        ? (await this.resilientAdapter.get<IdentitySession>('identitySession')) ?? {
            ...DEFAULT_ANONYMOUS_SESSION,
          }
        : { ...DEFAULT_ANONYMOUS_SESSION };

      this.readOnlyFutureSchema = false;
      this.unreadableCollections.clear();
      await this.resilientAdapter.clear();

      if (options.preserveIdentity) {
        await this.resilientAdapter.setMany([
          ['passkeys', preservedPasskeys],
          ['identitySession', preservedSession],
        ]);
      }

      const fresh = await this.ensureSeededAndLoad();
      this.notifyOtherTabs();
      return fresh;
    });
  }
}

export const defaultSalonRepository = new SalonRepository();
