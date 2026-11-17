// =============================================================================
// Local-First Salon Repository:
// - Discriminated read handling (`ok` vs `missing` vs `unreadable`) (N-01)
// - Schema version 3 + `v1 -> v2 -> v3` migration registry & origin backfill (N-02)
// - Per-record validation + `quarantine:<collection>:<ts>` + non-secret passthrough (N-03)
// - Transactional `commitWithOutbox` / `commitBatchWithOutbox` + allowlist payload (N-06)
// - Web Locks (`navigator.locks`) & debounced cross-tab `BroadcastChannel` (N-04)
// =============================================================================

import {
  BaseStorageKey,
  DataLayerMeta,
  HydratedSalonData,
  OutboxEntity,
  OutboxMutation,
  OutboxMutationInput,
  StorageAdapter,
  StorageEntry,
  StorageHealthReport,
  StorageKey,
  StorageReadResult,
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
import { computeExactArtistRatingUpdate } from '../../domain/rating';
import {
  partitionCollectionRecords,
  RecordValidationOptions,
  validateAdRecord,
  validateAds,
  validateAnchorPointRecord,
  validateAnchorPoints,
  validateAppointmentRecord,
  validateAppointments,
  validateArtistRecord,
  validateArtists,
  validateChatRecord,
  validateChats,
  validateIdentitySession,
  validateOutboxRecord,
  validatePasskeyRecord,
  validatePasskeys,
  validatePortfolio,
  validatePortfolioRecord,
  validateReviewRecord,
  validateReviews,
  validateSchemaMeta,
  validateStringArray,
  ValidationResult,
} from '../../domain/schemas';
import { assertNoSecretLikeFields } from '../identity/secretHygiene';
import {
  createDefaultStorageAdapter,
  ResilientStorageAdapter,
  setActiveStorageStatus,
} from './indexedDbAdapter';

export const SALON_SCHEMA_VERSION = 3;
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

const ALLOWED_OUTBOX_PAYLOAD_KEYS = new Set([
  'id',
  'appointmentId',
  'artistId',
  'lookId',
  'reviewId',
  'anchorId',
  'threadId',
  'msgId',
  'adId',
  'credentialId',
  'igPostId',
  'role',
  'authMethod',
  'rpId',
  'discoveredNew',
  'cryptographicSignatureVerified',
  'authenticated',
  'count',
  'totalLiked',
  'totalSaved',
  'rating',
  'timeSlot',
  'date',
  'version',
]);

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
 * Strict allowlist sanitizer for Outbox mutation payloads (N-06).
 * Only structural IDs, counters, role/auth flags, and dates/slots pass through — zero PII.
 */
export function sanitizeOutboxPayload(payload: unknown): unknown {
  if (payload === null || typeof payload !== 'object' || Array.isArray(payload)) {
    return typeof payload === 'string' || typeof payload === 'number' || typeof payload === 'boolean'
      ? payload
      : {};
  }
  const src = payload as Record<string, unknown>;
  const cleaned: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(src)) {
    if (ALLOWED_OUTBOX_PAYLOAD_KEYS.has(k)) {
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
): { items: T[]; changed: boolean } {
  let changed = false;
  const next = items.map(item => {
    if (item.origin === 'seed' || item.origin === 'user') {
      return item;
    }
    changed = true;
    const resolvedOrigin: 'seed' | 'user' = seedIdSet.has(item.id) ? 'seed' : 'user';
    return {
      ...item,
      origin: resolvedOrigin,
    };
  });
  return { items: next, changed };
}

function annotateAllOrigins(data: MigrationPayload): { payload: MigrationPayload; changed: boolean } {
  const art = inferOrigin(data.artists, SEED_ARTIST_IDS);
  const apt = inferOrigin(data.appointments, SEED_APPOINTMENT_IDS);
  const port = inferOrigin(data.portfolio, SEED_PORTFOLIO_IDS);
  const rev = inferOrigin(data.reviews, SEED_REVIEW_IDS);
  const anc = inferOrigin(data.anchorPoints, SEED_ANCHOR_IDS);
  const ch = inferOrigin(data.chats, SEED_CHAT_IDS);
  const ads = inferOrigin(data.ads, SEED_AD_IDS);

  const changed =
    art.changed ||
    apt.changed ||
    port.changed ||
    rev.changed ||
    anc.changed ||
    ch.changed ||
    ads.changed;

  return {
    changed,
    payload: {
      ...data,
      artists: art.items,
      appointments: apt.items,
      portfolio: port.items,
      reviews: rev.items,
      anchorPoints: anc.items,
      chats: ch.items,
      ads: ads.items,
    },
  };
}

export const SCHEMA_MIGRATIONS: SchemaMigration[] = [
  {
    from: 1,
    to: 2,
    description:
      'Add Stage 3 public-only WebAuthn registry & TTL session defaults, and annotate legacy origins.',
    run: data => ({
      ...annotateAllOrigins(data).payload,
      passkeys: data.passkeys ?? [],
      identitySession: data.identitySession ?? { ...DEFAULT_ANONYMOUS_SESSION },
    }),
  },
  {
    from: 2,
    to: 3,
    description:
      'Upgrade Sprint 3.2 v2 databases to v3 so all pre-existing user records receive explicit origin="user" | "seed" (N-02).',
    run: data => annotateAllOrigins(data).payload,
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
  private readonly tabId: string;
  private writeQueue: Promise<unknown> = Promise.resolve();
  private syncChannel: BroadcastChannel | null = null;
  private readOnlyFutureSchema = false;
  private readonly unreadableCollections = new Set<BaseStorageKey>();

  constructor(adapter: StorageAdapter = createDefaultStorageAdapter()) {
    this.resilientAdapter =
      adapter instanceof ResilientStorageAdapter ? adapter : new ResilientStorageAdapter(adapter);
    this.tabId =
      typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
        ? crypto.randomUUID()
        : `tab-${Date.now()}-${Math.floor(Math.random() * 10000)}`;

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

  private resolveArrayCollection<T>(
    key: BaseStorageKey,
    readResult: StorageReadResult<unknown>,
    recordValidator: (item: unknown, opts?: RecordValidationOptions) => ValidationResult<T>,
    allowUnknownNonSecret: boolean,
    seedFallback: () => T[],
    emptySafeFallback: () => T[],
    warnings: string[],
    quarantineQueue: StorageEntry[]
  ): { value: T[]; needsWrite: boolean; unreadable: boolean } {
    if (readResult.status === 'unreadable') {
      this.unreadableCollections.add(key);
      warnings.push(
        `Не удалось прочитать «${key}» (${readResult.error}) — данные на диске не затронуты, активен безопасный режим.`
      );
      return { value: emptySafeFallback(), needsWrite: false, unreadable: true };
    }

    this.unreadableCollections.delete(key);

    if (readResult.status === 'missing') {
      return { value: seedFallback(), needsWrite: true, unreadable: false };
    }

    const partitioned = partitionCollectionRecords(readResult.value, recordValidator, {
      allowUnknownNonSecret,
    });

    if (!partitioned.isArray) {
      const qKey = `quarantine:${key}:${Date.now()}` as const;
      quarantineQueue.push([qKey, readResult.value]);
      warnings.push(
        `Коллекция «${key}» имела некорректный формат и перенесена в карантин (${qKey}).`
      );
      return { value: seedFallback(), needsWrite: false, unreadable: false };
    }

    if (partitioned.quarantined.length > 0) {
      const qKey = `quarantine:${key}:${Date.now()}` as const;
      quarantineQueue.push([qKey, partitioned.quarantined]);
      warnings.push(
        `Из «${key}» отфильтровано записей в карантин (${partitioned.quarantined.length} шт., причина: ${partitioned.reasons.join('; ')}). Остальные ${partitioned.valid.length} сохранены.`
      );
      return {
        value: partitioned.valid,
        needsWrite: true,
        unreadable: false,
      };
    }

    return { value: partitioned.valid, needsWrite: false, unreadable: false };
  }

  private resolveSingleObject<T>(
    key: BaseStorageKey,
    readResult: StorageReadResult<unknown>,
    validator: (val: unknown) => ValidationResult<T>,
    defaultFallback: () => T,
    warnings: string[],
    quarantineQueue: StorageEntry[]
  ): { value: T; needsWrite: boolean; unreadable: boolean } {
    if (readResult.status === 'unreadable') {
      this.unreadableCollections.add(key);
      warnings.push(
        `Не удалось прочитать «${key}» (${readResult.error}) — данные на диске не затронуты.`
      );
      return { value: defaultFallback(), needsWrite: false, unreadable: true };
    }

    this.unreadableCollections.delete(key);

    if (readResult.status === 'missing') {
      return { value: defaultFallback(), needsWrite: true, unreadable: false };
    }

    const checked = validator(readResult.value);
    if (!checked.ok || checked.value === undefined) {
      const qKey = `quarantine:${key}:${Date.now()}` as const;
      quarantineQueue.push([qKey, readResult.value]);
      warnings.push(
        `Запись «${key}» (${checked.reason || 'schema error'}) перемещена в карантин (${qKey}).`
      );
      return { value: defaultFallback(), needsWrite: false, unreadable: false };
    }

    return { value: checked.value, needsWrite: false, unreadable: false };
  }

  /**
   * Loads persisted collections with discriminated read handling (`missing` vs `unreadable`),
   * per-record quarantine & non-secret passthrough (N-03), `v1 -> v2 -> v3` migration (N-02),
   * and future-schema read-only guard.
   */
  public async ensureSeededAndLoad(): Promise<HydratedSalonData> {
    const nowIso = new Date().toISOString();
    const warnings: string[] = [];
    const quarantineQueue: StorageEntry[] = [];

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
      this.resilientAdapter.getDetailed<unknown>('schemaMeta'),
      this.resilientAdapter.getDetailed<unknown>('artists'),
      this.resilientAdapter.getDetailed<unknown>('appointments'),
      this.resilientAdapter.getDetailed<unknown>('portfolio'),
      this.resilientAdapter.getDetailed<unknown>('likedIds'),
      this.resilientAdapter.getDetailed<unknown>('savedIds'),
      this.resilientAdapter.getDetailed<unknown>('reviews'),
      this.resilientAdapter.getDetailed<unknown>('anchorPoints'),
      this.resilientAdapter.getDetailed<unknown>('chats'),
      this.resilientAdapter.getDetailed<unknown>('ads'),
      this.resilientAdapter.getDetailed<unknown>('passkeys'),
      this.resilientAdapter.getDetailed<unknown>('identitySession'),
      this.resilientAdapter.getDetailed<unknown>('outbox'),
    ]);

    const metaUnreadable = rawMeta.status === 'unreadable';
    if (metaUnreadable) {
      warnings.push(
        `Не удалось прочитать метаданные схемы (${rawMeta.error}) — перезапись схемы отключена.`
      );
    }

    const parsedMetaResult =
      rawMeta.status === 'ok' ? validateSchemaMeta(rawMeta.value) : { ok: false, value: undefined };
    const storedMeta = parsedMetaResult.ok ? parsedMetaResult.value : undefined;
    const futureSchemaDetected = Boolean(
      storedMeta && storedMeta.schemaVersion > SALON_SCHEMA_VERSION
    );
    this.readOnlyFutureSchema = futureSchemaDetected;

    if (futureSchemaDetected && storedMeta) {
      warnings.push(
        `База создана более новой версией (схема v${storedMeta.schemaVersion} > текущей v${SALON_SCHEMA_VERSION}). Включён режим только для чтения без перезаписи.`
      );
    }

    const artistsRes = this.resolveArrayCollection(
      'artists',
      rawArtists,
      validateArtistRecord,
      true,
      () => withSeedOrigin(cloneSeed(INITIAL_ARTISTS)),
      () => [],
      warnings,
      quarantineQueue
    );
    const appointmentsRes = this.resolveArrayCollection(
      'appointments',
      rawAppointments,
      validateAppointmentRecord,
      true,
      () => withSeedOrigin(cloneSeed(INITIAL_APPOINTMENTS)),
      () => [],
      warnings,
      quarantineQueue
    );
    const portfolioRes = this.resolveArrayCollection(
      'portfolio',
      rawPortfolio,
      validatePortfolioRecord,
      true,
      () => withSeedOrigin(cloneSeed(INITIAL_PORTFOLIO)),
      () => [],
      warnings,
      quarantineQueue
    );
    const likedRes = this.resolveSingleObject(
      'likedIds',
      rawLiked,
      v => validateStringArray(v, 'likedIds'),
      () => [...DEFAULT_LIKED_IDS],
      warnings,
      quarantineQueue
    );
    const savedRes = this.resolveSingleObject(
      'savedIds',
      rawSaved,
      v => validateStringArray(v, 'savedIds'),
      () => [...DEFAULT_SAVED_IDS],
      warnings,
      quarantineQueue
    );
    const reviewsRes = this.resolveArrayCollection(
      'reviews',
      rawReviews,
      validateReviewRecord,
      true,
      () => withSeedOrigin(cloneSeed(INITIAL_REVIEWS)),
      () => [],
      warnings,
      quarantineQueue
    );
    const anchorsRes = this.resolveArrayCollection(
      'anchorPoints',
      rawAnchors,
      validateAnchorPointRecord,
      true,
      () => withSeedOrigin(cloneSeed(INITIAL_ANCHOR_POINTS)),
      () => [],
      warnings,
      quarantineQueue
    );
    const chatsRes = this.resolveArrayCollection(
      'chats',
      rawChats,
      validateChatRecord,
      true,
      () => withSeedOrigin(cloneSeed(INITIAL_CHATS)),
      () => [],
      warnings,
      quarantineQueue
    );
    const adsRes = this.resolveArrayCollection(
      'ads',
      rawAds,
      validateAdRecord,
      true,
      () => withSeedOrigin(cloneSeed(INITIAL_SPONSORED_ADS)),
      () => [],
      warnings,
      quarantineQueue
    );
    const passkeysRes = this.resolveArrayCollection(
      'passkeys',
      rawPasskeys,
      validatePasskeyRecord,
      false,
      () => [],
      () => [],
      warnings,
      quarantineQueue
    );
    const sessionRes = this.resolveSingleObject(
      'identitySession',
      rawIdentitySession,
      validateIdentitySession,
      () => ({ ...DEFAULT_ANONYMOUS_SESSION }),
      warnings,
      quarantineQueue
    );
    const outboxRes = this.resolveArrayCollection(
      'outbox',
      rawOutbox,
      validateOutboxRecord,
      false,
      () => [],
      () => [],
      warnings,
      quarantineQueue
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

    let sessionExpiredOnLoad = false;
    if (!sessionRes.unreadable && isIdentitySessionExpired(payload.identitySession)) {
      payload.identitySession = { ...DEFAULT_ANONYMOUS_SESSION };
      sessionExpiredOnLoad = true;
    }

    let currentVersion = storedMeta?.schemaVersion ?? SALON_SCHEMA_VERSION;
    let migrated = false;
    let backfilledOrigins = false;
    if (!futureSchemaDetected) {
      while (currentVersion < SALON_SCHEMA_VERSION) {
        const step = SCHEMA_MIGRATIONS.find(m => m.from === currentVersion);
        if (!step) break;
        payload = step.run(payload);
        currentVersion = step.to;
        migrated = true;
      }

      // Ensure any untagged v2/legacy records carry explicit origin (N-02)
      const annotated = annotateAllOrigins(payload);
      if (annotated.changed) {
        payload = annotated.payload;
        backfilledOrigins = true;
      }
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
      const seedEntries: StorageEntry[] = [...quarantineQueue];

      // Never seed or overwrite a collection that failed to read (N-01)!
      if (!artistsRes.unreadable && (artistsRes.needsWrite || migrated || backfilledOrigins)) {
        seedEntries.push(['artists', payload.artists]);
      }
      if (!appointmentsRes.unreadable && (appointmentsRes.needsWrite || migrated || backfilledOrigins)) {
        seedEntries.push(['appointments', payload.appointments]);
      }
      if (!portfolioRes.unreadable && (portfolioRes.needsWrite || migrated || backfilledOrigins)) {
        seedEntries.push(['portfolio', payload.portfolio]);
      }
      if (!likedRes.unreadable && likedRes.needsWrite) {
        seedEntries.push(['likedIds', payload.likedIds]);
      }
      if (!savedRes.unreadable && savedRes.needsWrite) {
        seedEntries.push(['savedIds', payload.savedIds]);
      }
      if (!reviewsRes.unreadable && (reviewsRes.needsWrite || migrated || backfilledOrigins)) {
        seedEntries.push(['reviews', payload.reviews]);
      }
      if (!anchorsRes.unreadable && (anchorsRes.needsWrite || migrated || backfilledOrigins)) {
        seedEntries.push(['anchorPoints', payload.anchorPoints]);
      }
      if (!chatsRes.unreadable && (chatsRes.needsWrite || migrated || backfilledOrigins)) {
        seedEntries.push(['chats', payload.chats]);
      }
      if (!adsRes.unreadable && (adsRes.needsWrite || migrated || backfilledOrigins)) {
        seedEntries.push(['ads', payload.ads]);
      }
      if (!passkeysRes.unreadable && passkeysRes.needsWrite) {
        seedEntries.push(['passkeys', payload.passkeys]);
      }
      if (!sessionRes.unreadable && (sessionRes.needsWrite || sessionExpiredOnLoad)) {
        seedEntries.push(['identitySession', payload.identitySession]);
      }
      if (!outboxRes.unreadable && outboxRes.needsWrite) {
        seedEntries.push(['outbox', payload.outbox]);
      }
      if (!metaUnreadable && (!storedMeta || migrated || backfilledOrigins)) {
        seedEntries.push(['schemaMeta', meta]);
      }

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
      throw new Error(
        'Хранилище открыто в режиме только для чтения (обнаружена более новая схема данных).'
      );
    }
    for (const k of targetKeys) {
      if (this.unreadableCollections.has(k)) {
        throw new Error(
          `Коллекция «${k}» не была прочитана при загрузке; запись заблокирована, чтобы не потерять данные на диске.`
        );
      }
    }
  }

  private async buildNextOutboxEntry(mutation: OutboxMutationInput): Promise<{
    nextOutbox: OutboxMutation[];
    entry: StorageEntry;
  }> {
    const current = (await this.resilientAdapter.get<OutboxMutation[]>('outbox')) ?? [];
    const newItem: OutboxMutation = {
      id: nextOutboxId(),
      entity: mutation.entity,
      action: mutation.action,
      payload: sanitizeOutboxPayload(mutation.payload),
      createdAt: new Date().toISOString(),
      status: 'pending_sync',
      attempts: 0,
    };

    const pending = [newItem, ...current.filter(m => m.status === 'pending_sync')];
    const synced = current
      .filter(m => m.status === 'synced')
      .slice(0, MAX_SYNCED_OUTBOX_HISTORY);
    const nextOutbox = [...pending, ...synced];
    return { nextOutbox, entry: ['outbox', nextOutbox] };
  }

  /**
   * Appends a standalone local mutation to the persistent Outbox Queue.
   */
  public async enqueueOutboxMutation(
    entity: OutboxEntity,
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

  /**
   * Atomic single-transaction write of collection(s) + outbox mutation + schemaMeta (N-06).
   */
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

  /**
   * Authoritative WebLock transaction adding a review + recomputing exact artist rating + outbox (N-06, N-09).
   */
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

  /**
   * Returns only user-created records (excluding `origin === 'seed'`) for exports/sync (L-03).
   */
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
