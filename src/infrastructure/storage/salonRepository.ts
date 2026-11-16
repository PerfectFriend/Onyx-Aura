// =============================================================================
// Local-First Salon Repository + Seed Origin Separation + Schema Migrations +
// Outbox Guarantee + Web Locks & BroadcastChannel Sync (Stage 2 -> Sprint 3.2)
// =============================================================================

import {
  DataLayerMeta,
  HydratedSalonData,
  OutboxEntity,
  OutboxMutation,
  StorageAdapter,
  StorageEntry,
  StorageHealthReport,
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
import {
  DEFAULT_ANONYMOUS_SESSION,
  IdentitySession,
  isIdentitySessionExpired,
  PasskeyCredentialRecord,
} from '../../domain/identity';
import {
  validateAds,
  validateAnchorPoints,
  validateAppointments,
  validateArtists,
  validateChats,
  validateIdentitySession,
  validateOutbox,
  validatePasskeys,
  validatePortfolio,
  validateReviews,
  validateSchemaMeta,
  validateStringArray,
} from '../../domain/schemas';
import { assertNoSecretLikeFields } from '../identity/secretHygiene';
import {
  createDefaultStorageAdapter,
  ResilientStorageAdapter,
  setActiveStorageStatus,
} from './indexedDbAdapter';

export const SALON_SCHEMA_VERSION = 2;
export const DEFAULT_LIKED_IDS: string[] = ['port-gaudi', 'port-1'];
export const DEFAULT_SAVED_IDS: string[] = ['port-gaudi', 'port-2'];
export const MAX_SYNCED_OUTBOX_HISTORY = 50;
export const OUTBOX_PENDING_WARNING_THRESHOLD = 100;

const STORAGE_SYNC_CHANNEL_NAME = 'nailix_storage_sync_v1';
const STORAGE_LOCK_NAME = 'nailix_repository_write_lock';

const SEED_APPOINTMENT_IDS = new Set(INITIAL_APPOINTMENTS.map(a => a.id));
const SEED_ARTIST_IDS = new Set(INITIAL_ARTISTS.map(a => a.id));
const SEED_PORTFOLIO_IDS = new Set(INITIAL_PORTFOLIO.map(p => p.id));
const SEED_REVIEW_IDS = new Set(INITIAL_REVIEWS.map(r => r.id));
const SEED_ANCHOR_IDS = new Set(INITIAL_ANCHOR_POINTS.map(a => a.id));
const SEED_CHAT_IDS = new Set(INITIAL_CHATS.map(c => c.id));
const SEED_AD_IDS = new Set(INITIAL_SPONSORED_ADS.map(a => a.id));

function cloneSeed<T>(value: T): T {
  if (typeof structuredClone === 'function') {
    return structuredClone(value);
  }
  return JSON.parse(JSON.stringify(value)) as T;
}

function withSeedOrigin<T extends { origin?: 'seed' | 'user' }>(items: T[]): T[] {
  return items.map(item => ({ ...item, origin: 'seed' as const }));
}

export function createSeedSnapshot() {
  return {
    artists: withSeedOrigin(cloneSeed(INITIAL_ARTISTS)),
    appointments: withSeedOrigin(cloneSeed(INITIAL_APPOINTMENTS)),
    portfolio: withSeedOrigin(cloneSeed(INITIAL_PORTFOLIO)),
    likedIds: [...DEFAULT_LIKED_IDS],
    savedIds: [...DEFAULT_SAVED_IDS],
    reviews: withSeedOrigin(cloneSeed(INITIAL_REVIEWS)),
    anchorPoints: withSeedOrigin(cloneSeed(INITIAL_ANCHOR_POINTS)),
    chats: withSeedOrigin(cloneSeed(INITIAL_CHATS)),
    ads: withSeedOrigin(cloneSeed(INITIAL_SPONSORED_ADS)),
    passkeys: [] as PasskeyCredentialRecord[],
    identitySession: { ...DEFAULT_ANONYMOUS_SESSION },
  };
}

function nextOutboxId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return `outbox-${crypto.randomUUID()}`;
  }
  return `outbox-${Date.now()}-${Math.floor(Math.random() * 10000)}`;
}

/**
 * Strips potentially sensitive contact PII from outbox mutation payloads so offline
 * queues store entity IDs / action markers rather than duplicate phone/email records (L-02).
 */
function sanitizeOutboxPayload(payload: unknown): unknown {
  if (payload === null || typeof payload !== 'object' || Array.isArray(payload)) {
    return payload;
  }
  const src = payload as Record<string, unknown>;
  const cleaned: Record<string, unknown> = {};
  const blockedPiiKeys = new Set([
    'clientPhone',
    'clientEmail',
    'clientName',
    'text',
    'notes',
    'customNotes',
  ]);
  for (const [k, v] of Object.entries(src)) {
    if (!blockedPiiKeys.has(k)) {
      cleaned[k] = v;
    }
  }
  return cleaned;
}

interface MigrationPayload {
  artists: Artist[];
  appointments: Appointment[];
  portfolio: PortfolioItem[];
  likedIds: string[];
  savedIds: string[];
  reviews: Review[];
  anchorPoints: ClientAnchorPoint[];
  chats: ChatMessage[];
  ads: SponsoredAd[];
  passkeys: PasskeyCredentialRecord[];
  identitySession: IdentitySession;
  outbox: OutboxMutation[];
}

export interface SchemaMigration {
  from: number;
  to: number;
  description: string;
  run: (data: MigrationPayload) => MigrationPayload;
}

function inferOrigin<T extends { id: string; origin?: 'seed' | 'user' }>(
  items: T[],
  seedIdSet: ReadonlySet<string>
): T[] {
  return items.map(item => ({
    ...item,
    origin: item.origin ?? (seedIdSet.has(item.id) ? 'seed' : 'user'),
  }));
}

export const SCHEMA_MIGRATIONS: SchemaMigration[] = [
  {
    from: 1,
    to: 2,
    description:
      'Add Stage 3 public-only WebAuthn registry & TTL session defaults, and annotate legacy seed vs user origins (L-03/L-06).',
    run: data => ({
      ...data,
      artists: inferOrigin(data.artists, SEED_ARTIST_IDS),
      appointments: inferOrigin(data.appointments, SEED_APPOINTMENT_IDS),
      portfolio: inferOrigin(data.portfolio, SEED_PORTFOLIO_IDS),
      reviews: inferOrigin(data.reviews, SEED_REVIEW_IDS),
      anchorPoints: inferOrigin(data.anchorPoints, SEED_ANCHOR_IDS),
      chats: inferOrigin(data.chats, SEED_CHAT_IDS),
      ads: inferOrigin(data.ads, SEED_AD_IDS),
      passkeys: data.passkeys ?? [],
      identitySession: data.identitySession ?? { ...DEFAULT_ANONYMOUS_SESSION },
    }),
  },
];

async function withWebLock<T>(operation: () => Promise<T>): Promise<T> {
  if (typeof navigator !== 'undefined' && navigator.locks && typeof navigator.locks.request === 'function') {
    return navigator.locks.request(STORAGE_LOCK_NAME, operation);
  }
  return operation();
}

export class SalonRepository {
  private readonly resilientAdapter: ResilientStorageAdapter;
  private writeQueue: Promise<unknown> = Promise.resolve();
  private syncChannel: BroadcastChannel | null = null;
  private readOnlyFutureSchema = false;

  constructor(adapter: StorageAdapter = createDefaultStorageAdapter()) {
    this.resilientAdapter =
      adapter instanceof ResilientStorageAdapter ? adapter : new ResilientStorageAdapter(adapter);

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

  public subscribeExternalChanges(onExternalChange: () => void): () => void {
    if (!this.syncChannel) return () => {};
    const listener = (event: MessageEvent) => {
      const payload = event.data as { type?: unknown } | null;
      if (payload && payload.type === 'STORAGE_UPDATED') {
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
        this.syncChannel.postMessage({ type: 'STORAGE_UPDATED', ts: Date.now() });
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

  private validateOrFallback<T>(
    raw: unknown,
    validator: (val: unknown) => { ok: boolean; value?: T; reason?: string },
    seedFallback: () => T,
    collectionName: string,
    warnings: string[]
  ): { value: T; needsSeedWrite: boolean } {
    if (raw === undefined) {
      return { value: seedFallback(), needsSeedWrite: true };
    }
    const result = validator(raw);
    if (!result.ok || result.value === undefined) {
      warnings.push(
        `Повреждённая коллекция «${collectionName}» (${result.reason || 'schema error'}) сброшена к исходным значениям.`
      );
      return { value: seedFallback(), needsSeedWrite: false };
    }
    return { value: result.value, needsSeedWrite: false };
  }

  /**
   * Loads persisted collections with schema validation, v1->v2 migration registry,
   * and future-schema read-only guard (L-06).
   */
  public async ensureSeededAndLoad(): Promise<HydratedSalonData> {
    const nowIso = new Date().toISOString();
    const warnings: string[] = [];

    const [
      rawMeta,
      rawArtists,
      rawAppointments,
      rawPortfolio,
      rawLiked,
      rawSaved,
      rawReviews,
      rawAnchors,
      rawChats,
      rawAds,
      rawPasskeys,
      rawIdentitySession,
      rawOutbox,
    ] = await Promise.all([
      this.resilientAdapter.get<unknown>('schemaMeta'),
      this.resilientAdapter.get<unknown>('artists'),
      this.resilientAdapter.get<unknown>('appointments'),
      this.resilientAdapter.get<unknown>('portfolio'),
      this.resilientAdapter.get<unknown>('likedIds'),
      this.resilientAdapter.get<unknown>('savedIds'),
      this.resilientAdapter.get<unknown>('reviews'),
      this.resilientAdapter.get<unknown>('anchorPoints'),
      this.resilientAdapter.get<unknown>('chats'),
      this.resilientAdapter.get<unknown>('ads'),
      this.resilientAdapter.get<unknown>('passkeys'),
      this.resilientAdapter.get<unknown>('identitySession'),
      this.resilientAdapter.get<unknown>('outbox'),
    ]);

    const parsedMetaResult =
      rawMeta !== undefined ? validateSchemaMeta(rawMeta) : { ok: false, value: undefined };
    const storedMeta = parsedMetaResult.ok ? parsedMetaResult.value : undefined;
    const futureSchemaDetected = Boolean(storedMeta && storedMeta.schemaVersion > SALON_SCHEMA_VERSION);
    this.readOnlyFutureSchema = futureSchemaDetected;

    if (futureSchemaDetected && storedMeta) {
      warnings.push(
        `База создана более новой версией (схема v${storedMeta.schemaVersion} > текущей v${SALON_SCHEMA_VERSION}). Включён режим только для чтения без перезаписи.`
      );
    }

    const artistsRes = this.validateOrFallback(
      rawArtists,
      validateArtists,
      () => withSeedOrigin(cloneSeed(INITIAL_ARTISTS)),
      'artists',
      warnings
    );
    const appointmentsRes = this.validateOrFallback(
      rawAppointments,
      validateAppointments,
      () => withSeedOrigin(cloneSeed(INITIAL_APPOINTMENTS)),
      'appointments',
      warnings
    );
    const portfolioRes = this.validateOrFallback(
      rawPortfolio,
      validatePortfolio,
      () => withSeedOrigin(cloneSeed(INITIAL_PORTFOLIO)),
      'portfolio',
      warnings
    );
    const likedRes = this.validateOrFallback(
      rawLiked,
      v => validateStringArray(v, 'likedIds'),
      () => [...DEFAULT_LIKED_IDS],
      'likedIds',
      warnings
    );
    const savedRes = this.validateOrFallback(
      rawSaved,
      v => validateStringArray(v, 'savedIds'),
      () => [...DEFAULT_SAVED_IDS],
      'savedIds',
      warnings
    );
    const reviewsRes = this.validateOrFallback(
      rawReviews,
      validateReviews,
      () => withSeedOrigin(cloneSeed(INITIAL_REVIEWS)),
      'reviews',
      warnings
    );
    const anchorsRes = this.validateOrFallback(
      rawAnchors,
      validateAnchorPoints,
      () => withSeedOrigin(cloneSeed(INITIAL_ANCHOR_POINTS)),
      'anchorPoints',
      warnings
    );
    const chatsRes = this.validateOrFallback(
      rawChats,
      validateChats,
      () => withSeedOrigin(cloneSeed(INITIAL_CHATS)),
      'chats',
      warnings
    );
    const adsRes = this.validateOrFallback(
      rawAds,
      validateAds,
      () => withSeedOrigin(cloneSeed(INITIAL_SPONSORED_ADS)),
      'ads',
      warnings
    );
    const passkeysRes = this.validateOrFallback(
      rawPasskeys,
      validatePasskeys,
      () => [],
      'passkeys',
      warnings
    );
    const sessionRes = this.validateOrFallback(
      rawIdentitySession,
      validateIdentitySession,
      () => ({ ...DEFAULT_ANONYMOUS_SESSION }),
      'identitySession',
      warnings
    );
    const outboxRes = this.validateOrFallback(
      rawOutbox,
      validateOutbox,
      () => [],
      'outbox',
      warnings
    );

    let payload: MigrationPayload = {
      artists: artistsRes.value,
      appointments: appointmentsRes.value,
      portfolio: portfolioRes.value,
      likedIds: likedRes.value,
      savedIds: savedRes.value,
      reviews: reviewsRes.value,
      anchorPoints: anchorsRes.value,
      chats: chatsRes.value,
      ads: adsRes.value,
      passkeys: passkeysRes.value,
      identitySession: sessionRes.value,
      outbox: outboxRes.value,
    };

    // Enforce bounded TTL on loaded identity sessions (L-04)
    let sessionExpiredOnLoad = false;
    if (isIdentitySessionExpired(payload.identitySession)) {
      payload.identitySession = { ...DEFAULT_ANONYMOUS_SESSION };
      sessionExpiredOnLoad = true;
    }

    // Run schema migration chain for versions < SALON_SCHEMA_VERSION (L-06)
    let currentVersion = storedMeta?.schemaVersion ?? SALON_SCHEMA_VERSION;
    let migrated = false;
    if (!futureSchemaDetected) {
      while (currentVersion < SALON_SCHEMA_VERSION) {
        const step = SCHEMA_MIGRATIONS.find(m => m.from === currentVersion);
        if (!step) break;
        payload = step.run(payload);
        currentVersion = step.to;
        migrated = true;
      }
      // Ensure any un-tagged pre-3.2 entries carry explicit origin
      if (migrated || !storedMeta) {
        payload = SCHEMA_MIGRATIONS[0].run(payload);
      }
    }

    const meta: DataLayerMeta = {
      schemaVersion: SALON_SCHEMA_VERSION,
      seededAt: storedMeta?.seededAt ?? nowIso,
      lastModifiedAt: migrated || !storedMeta ? nowIso : storedMeta.lastModifiedAt,
      backend: this.resilientAdapter.backend,
      storedFutureVersion: futureSchemaDetected ? storedMeta?.schemaVersion : undefined,
    };

    if (!futureSchemaDetected) {
      const seedEntries: StorageEntry[] = [];
      if (artistsRes.needsSeedWrite || migrated) seedEntries.push(['artists', payload.artists]);
      if (appointmentsRes.needsSeedWrite || migrated) seedEntries.push(['appointments', payload.appointments]);
      if (portfolioRes.needsSeedWrite || migrated) seedEntries.push(['portfolio', payload.portfolio]);
      if (likedRes.needsSeedWrite) seedEntries.push(['likedIds', payload.likedIds]);
      if (savedRes.needsSeedWrite) seedEntries.push(['savedIds', payload.savedIds]);
      if (reviewsRes.needsSeedWrite || migrated) seedEntries.push(['reviews', payload.reviews]);
      if (anchorsRes.needsSeedWrite || migrated) seedEntries.push(['anchorPoints', payload.anchorPoints]);
      if (chatsRes.needsSeedWrite || migrated) seedEntries.push(['chats', payload.chats]);
      if (adsRes.needsSeedWrite || migrated) seedEntries.push(['ads', payload.ads]);
      if (passkeysRes.needsSeedWrite) seedEntries.push(['passkeys', payload.passkeys]);
      if (sessionRes.needsSeedWrite || sessionExpiredOnLoad) {
        seedEntries.push(['identitySession', payload.identitySession]);
      }
      if (outboxRes.needsSeedWrite) seedEntries.push(['outbox', payload.outbox]);
      if (!storedMeta || migrated) seedEntries.push(['schemaMeta', meta]);

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
        `В локальной очереди Outbox накопилось ${pendingCount} несинхронизированных изменений.`
      );
    }

    return {
      ...payload,
      meta,
      health: healthReport.health,
      warnings: [...healthReport.warnings, ...warnings],
      readOnlyFutureSchema: futureSchemaDetected,
      storedFutureVersion: meta.storedFutureVersion,
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

  private assertWritable(): void {
    if (this.readOnlyFutureSchema) {
      throw new Error(
        'Хранилище открыто в режиме только для чтения (обнаружена более новая схема данных).'
      );
    }
  }

  /**
   * Appends a local mutation to the persistent Offline-First Outbox Queue.
   * L-02 invariant: NEVER drops entries with `status === 'pending_sync'`; only evicts
   * oldest `synced` entries beyond `MAX_SYNCED_OUTBOX_HISTORY`.
   */
  public async enqueueOutboxMutation(
    entity: OutboxEntity,
    action: string,
    payload: unknown
  ): Promise<OutboxMutation[]> {
    this.assertWritable();
    return this.enqueueWrite(async () => {
      const current = (await this.resilientAdapter.get<OutboxMutation[]>('outbox')) ?? [];
      const entry: OutboxMutation = {
        id: nextOutboxId(),
        entity,
        action,
        payload: sanitizeOutboxPayload(payload),
        createdAt: new Date().toISOString(),
        status: 'pending_sync',
        attempts: 0,
      };

      const pending = [entry, ...current.filter(m => m.status === 'pending_sync')];
      const synced = current
        .filter(m => m.status === 'synced')
        .slice(0, MAX_SYNCED_OUTBOX_HISTORY);
      const next = [...pending, ...synced];

      const metaEntry = await this.buildMetaEntry();
      await this.resilientAdapter.setMany([['outbox', next], metaEntry]);
      this.updateGlobalStatus();
      this.notifyOtherTabs();
      return next;
    });
  }

  public async getOutbox(): Promise<OutboxMutation[]> {
    return (await this.resilientAdapter.get<OutboxMutation[]>('outbox')) ?? [];
  }

  /**
   * [SIM] Marks pending outbox items as synced for offline-reconnection readiness demos
   * until a real backend server is attached.
   */
  public async flushOutboxLocalDemo(): Promise<OutboxMutation[]> {
    this.assertWritable();
    return this.enqueueWrite(async () => {
      const current = (await this.resilientAdapter.get<OutboxMutation[]>('outbox')) ?? [];
      const flushed: OutboxMutation[] = current
        .map(item => ({
          ...item,
          status: 'synced' as const,
          attempts: item.attempts + 1,
        }))
        .slice(0, MAX_SYNCED_OUTBOX_HISTORY);
      const metaEntry = await this.buildMetaEntry();
      await this.resilientAdapter.setMany([['outbox', flushed], metaEntry]);
      this.updateGlobalStatus();
      this.notifyOtherTabs();
      return flushed;
    });
  }

  private async commitValidated<T>(
    key: StorageEntry[0],
    value: T,
    validator: (v: unknown) => { ok: boolean; reason?: string }
  ): Promise<void> {
    this.assertWritable();
    assertNoSecretLikeFields(value);
    const check = validator(value);
    if (!check.ok) {
      throw new Error(`Security policy violation: invalid "${key}" schema (${check.reason}).`);
    }
    return this.enqueueWrite(async () => {
      const metaEntry = await this.buildMetaEntry();
      await this.resilientAdapter.setMany([[key, value], metaEntry]);
      this.updateGlobalStatus();
      this.notifyOtherTabs();
    });
  }

  public saveArtists(artists: Artist[]): Promise<void> {
    return this.commitValidated('artists', artists, validateArtists);
  }

  public saveAppointments(appointments: Appointment[]): Promise<void> {
    return this.commitValidated('appointments', appointments, validateAppointments);
  }

  public savePortfolio(portfolio: PortfolioItem[]): Promise<void> {
    return this.commitValidated('portfolio', portfolio, validatePortfolio);
  }

  public saveLikedIds(likedIds: string[]): Promise<void> {
    return this.commitValidated('likedIds', likedIds, v => validateStringArray(v, 'likedIds'));
  }

  /**
   * Truly atomic single-transaction update of likedIds + portfolio counters + meta (L-07, L-11).
   */
  public saveLikesAndPortfolioAtomic(likedIds: string[], portfolio: PortfolioItem[]): Promise<void> {
    this.assertWritable();
    assertNoSecretLikeFields(likedIds);
    assertNoSecretLikeFields(portfolio);
    const likedCheck = validateStringArray(likedIds, 'likedIds');
    if (!likedCheck.ok) throw new Error(`Invalid likedIds: ${likedCheck.reason}`);
    const portfolioCheck = validatePortfolio(portfolio);
    if (!portfolioCheck.ok) throw new Error(`Invalid portfolio: ${portfolioCheck.reason}`);

    return this.enqueueWrite(async () => {
      const metaEntry = await this.buildMetaEntry();
      await this.resilientAdapter.setMany([
        ['likedIds', likedIds],
        ['portfolio', portfolio],
        metaEntry,
      ]);
      this.updateGlobalStatus();
      this.notifyOtherTabs();
    });
  }

  /**
   * Truly atomic single-transaction update of reviews + artist ratings + meta (L-11).
   */
  public saveReviewsAndArtistsAtomic(reviews: Review[], artists: Artist[]): Promise<void> {
    this.assertWritable();
    assertNoSecretLikeFields(reviews);
    assertNoSecretLikeFields(artists);
    const revCheck = validateReviews(reviews);
    if (!revCheck.ok) throw new Error(`Invalid reviews: ${revCheck.reason}`);
    const artCheck = validateArtists(artists);
    if (!artCheck.ok) throw new Error(`Invalid artists: ${artCheck.reason}`);

    return this.enqueueWrite(async () => {
      const metaEntry = await this.buildMetaEntry();
      await this.resilientAdapter.setMany([
        ['reviews', reviews],
        ['artists', artists],
        metaEntry,
      ]);
      this.updateGlobalStatus();
      this.notifyOtherTabs();
    });
  }

  public saveSavedIds(savedIds: string[]): Promise<void> {
    return this.commitValidated('savedIds', savedIds, v => validateStringArray(v, 'savedIds'));
  }

  public saveReviews(reviews: Review[]): Promise<void> {
    return this.commitValidated('reviews', reviews, validateReviews);
  }

  public saveAnchorPoints(anchorPoints: ClientAnchorPoint[]): Promise<void> {
    return this.commitValidated('anchorPoints', anchorPoints, validateAnchorPoints);
  }

  public saveChats(chats: ChatMessage[]): Promise<void> {
    return this.commitValidated('chats', chats, validateChats);
  }

  public saveAds(ads: SponsoredAd[]): Promise<void> {
    return this.commitValidated('ads', ads, validateAds);
  }

  public async savePasskeys(passkeys: PasskeyCredentialRecord[]): Promise<void> {
    return this.commitValidated('passkeys', passkeys, validatePasskeys);
  }

  public async saveIdentitySession(session: IdentitySession): Promise<void> {
    return this.commitValidated('identitySession', session, validateIdentitySession);
  }

  /**
   * Returns only user-created records (excluding `origin === 'seed'`) for exports/sync (L-03).
   */
  public static filterUserRecords<T extends { origin?: 'seed' | 'user' }>(items: T[]): T[] {
    return items.filter(item => item.origin === 'user');
  }

  /**
   * Clears salon collections cleanly with explicit option to preserve Passkey identity keys (L-13).
   */
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
