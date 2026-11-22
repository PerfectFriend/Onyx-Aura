// =============================================================================
// Stage 5 · Sprint 5.1 — Repository Collections & Quarantine Module (Q-10 / V-07)
// - Discriminated read resolution (`missing` vs `unreadable`), per-record schema
//   quarantine with non-secret passthrough, and atomic batch write planning.
// =============================================================================

import { createShortId } from '../../domain/ids';
import {
  partitionCollectionRecords,
  RecordValidationOptions,
  validateAdRecord,
  validateAnchorPointRecord,
  validateAppointmentRecord,
  validateArtistRecord,
  validateChatRecord,
  validateIdentitySession,
  validateOutboxRecord,
  validatePasskeyRecord,
  validatePortfolioRecord,
  validateReviewRecord,
  validateStringArray,
  ValidationResult,
} from '../../domain/schemas';
import {
  BaseStorageKey,
  DataLayerMeta,
  StorageEntry,
  StorageReadResult,
} from '../../domain/storage';
import { DEFAULT_ANONYMOUS_SESSION } from '../../domain/identity';
import {
  INITIAL_ANCHOR_POINTS,
  INITIAL_APPOINTMENTS,
  INITIAL_ARTISTS,
  INITIAL_CHATS,
  INITIAL_PORTFOLIO,
  INITIAL_REVIEWS,
} from '../../data/initialData';
import { INITIAL_SPONSORED_ADS } from '../../data/advertisements';
import { formatAppMessage } from '../../i18n/messages';
import { SupportedLanguage } from '../../i18n/translations';
import { ResilientStorageAdapter } from './indexedDbAdapter';
import { MigrationPayload } from './repositoryMigrations';
import { cloneSeed, DEFAULT_LIKED_IDS, DEFAULT_SAVED_IDS, withSeedOrigin } from './repositorySeed';

export interface ResolvedCollection<T> {
  value: T;
  needsWrite: boolean;
  unreadable: boolean;
}

export function resolveArrayCollection<T>(params: {
  key: BaseStorageKey;
  readResult: StorageReadResult<unknown>;
  recordValidator: (item: unknown, opts?: RecordValidationOptions) => ValidationResult<T>;
  allowUnknownNonSecret: boolean;
  seedFallback: () => T[];
  unreadableCollections: Set<BaseStorageKey>;
  warnings: string[];
  quarantineQueue: StorageEntry[];
  language?: SupportedLanguage;
}): ResolvedCollection<T[]> {
  const {
    key,
    readResult,
    recordValidator,
    allowUnknownNonSecret,
    seedFallback,
    unreadableCollections,
    warnings,
    quarantineQueue,
    language,
  } = params;

  if (readResult.status === 'unreadable') {
    unreadableCollections.add(key);
    warnings.push(
      formatAppMessage('storage.unreadable_collection', { key, error: readResult.error }, language)
    );
    return { value: [], needsWrite: false, unreadable: true };
  }

  unreadableCollections.delete(key);

  if (readResult.status === 'missing') {
    return { value: seedFallback(), needsWrite: true, unreadable: false };
  }

  const partitioned = partitionCollectionRecords(readResult.value, recordValidator, {
    allowUnknownNonSecret,
  });

  if (!partitioned.isArray) {
    const qKey = `quarantine:${key}:${createShortId()}` as const;
    quarantineQueue.push([qKey, readResult.value]);
    warnings.push(formatAppMessage('storage.corrupt_collection', { key, qKey }, language));
    return { value: seedFallback(), needsWrite: false, unreadable: false };
  }

  if (partitioned.quarantined.length > 0) {
    const qKey = `quarantine:${key}:${createShortId()}` as const;
    quarantineQueue.push([qKey, partitioned.quarantined]);
    warnings.push(
      formatAppMessage(
        'storage.quarantined_records',
        {
          key,
          count: partitioned.quarantined.length,
          reasons: partitioned.reasons.join('; '),
          validCount: partitioned.valid.length,
        },
        language
      )
    );
    return {
      value: partitioned.valid,
      needsWrite: true,
      unreadable: false,
    };
  }

  return { value: partitioned.valid, needsWrite: false, unreadable: false };
}

export function resolveSingleObject<T>(params: {
  key: BaseStorageKey;
  readResult: StorageReadResult<unknown>;
  validator: (val: unknown) => ValidationResult<T>;
  defaultFallback: () => T;
  unreadableCollections: Set<BaseStorageKey>;
  warnings: string[];
  quarantineQueue: StorageEntry[];
  language?: SupportedLanguage;
}): ResolvedCollection<T> {
  const {
    key,
    readResult,
    validator,
    defaultFallback,
    unreadableCollections,
    warnings,
    quarantineQueue,
    language,
  } = params;

  if (readResult.status === 'unreadable') {
    unreadableCollections.add(key);
    warnings.push(
      formatAppMessage('storage.unreadable_record', { key, error: readResult.error }, language)
    );
    return { value: defaultFallback(), needsWrite: false, unreadable: true };
  }

  unreadableCollections.delete(key);

  if (readResult.status === 'missing') {
    return { value: defaultFallback(), needsWrite: true, unreadable: false };
  }

  const checked = validator(readResult.value);
  if (!checked.ok || checked.value === undefined) {
    const qKey = `quarantine:${key}:${createShortId()}` as const;
    quarantineQueue.push([qKey, readResult.value]);
    warnings.push(
      formatAppMessage(
        'storage.corrupt_record',
        { key, reason: checked.reason || 'schema error', qKey },
        language
      )
    );
    return { value: defaultFallback(), needsWrite: false, unreadable: false };
  }

  return { value: checked.value, needsWrite: false, unreadable: false };
}

export async function readAllRepositoryCollections(adapter: ResilientStorageAdapter) {
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
    adapter.getDetailed<unknown>('schemaMeta'),
    adapter.getDetailed<unknown>('artists'),
    adapter.getDetailed<unknown>('appointments'),
    adapter.getDetailed<unknown>('portfolio'),
    adapter.getDetailed<unknown>('likedIds'),
    adapter.getDetailed<unknown>('savedIds'),
    adapter.getDetailed<unknown>('reviews'),
    adapter.getDetailed<unknown>('anchorPoints'),
    adapter.getDetailed<unknown>('chats'),
    adapter.getDetailed<unknown>('ads'),
    adapter.getDetailed<unknown>('passkeys'),
    adapter.getDetailed<unknown>('identitySession'),
    adapter.getDetailed<unknown>('outbox'),
  ]);

  return {
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
  };
}

export function resolveAllRepositoryCollections(params: {
  raw: Awaited<ReturnType<typeof readAllRepositoryCollections>>;
  unreadableCollections: Set<BaseStorageKey>;
  warnings: string[];
  quarantineQueue: StorageEntry[];
  language?: SupportedLanguage;
}) {
  const { raw, unreadableCollections, warnings, quarantineQueue, language } = params;

  const artistsRes = resolveArrayCollection({
    key: 'artists',
    readResult: raw.rawArtists,
    recordValidator: validateArtistRecord,
    allowUnknownNonSecret: true,
    seedFallback: () => withSeedOrigin(cloneSeed(INITIAL_ARTISTS)),
    unreadableCollections,
    warnings,
    quarantineQueue,
    language,
  });
  const appointmentsRes = resolveArrayCollection({
    key: 'appointments',
    readResult: raw.rawAppointments,
    recordValidator: validateAppointmentRecord,
    allowUnknownNonSecret: true,
    seedFallback: () => withSeedOrigin(cloneSeed(INITIAL_APPOINTMENTS)),
    unreadableCollections,
    warnings,
    quarantineQueue,
    language,
  });
  const portfolioRes = resolveArrayCollection({
    key: 'portfolio',
    readResult: raw.rawPortfolio,
    recordValidator: validatePortfolioRecord,
    allowUnknownNonSecret: true,
    seedFallback: () => withSeedOrigin(cloneSeed(INITIAL_PORTFOLIO)),
    unreadableCollections,
    warnings,
    quarantineQueue,
    language,
  });
  const likedRes = resolveSingleObject({
    key: 'likedIds',
    readResult: raw.rawLiked,
    validator: v => validateStringArray(v, 'likedIds'),
    defaultFallback: () => [...DEFAULT_LIKED_IDS],
    unreadableCollections,
    warnings,
    quarantineQueue,
    language,
  });
  const savedRes = resolveSingleObject({
    key: 'savedIds',
    readResult: raw.rawSaved,
    validator: v => validateStringArray(v, 'savedIds'),
    defaultFallback: () => [...DEFAULT_SAVED_IDS],
    unreadableCollections,
    warnings,
    quarantineQueue,
    language,
  });
  const reviewsRes = resolveArrayCollection({
    key: 'reviews',
    readResult: raw.rawReviews,
    recordValidator: validateReviewRecord,
    allowUnknownNonSecret: true,
    seedFallback: () => withSeedOrigin(cloneSeed(INITIAL_REVIEWS)),
    unreadableCollections,
    warnings,
    quarantineQueue,
    language,
  });
  const anchorsRes = resolveArrayCollection({
    key: 'anchorPoints',
    readResult: raw.rawAnchors,
    recordValidator: validateAnchorPointRecord,
    allowUnknownNonSecret: true,
    seedFallback: () => withSeedOrigin(cloneSeed(INITIAL_ANCHOR_POINTS)),
    unreadableCollections,
    warnings,
    quarantineQueue,
    language,
  });
  const chatsRes = resolveArrayCollection({
    key: 'chats',
    readResult: raw.rawChats,
    recordValidator: validateChatRecord,
    allowUnknownNonSecret: true,
    seedFallback: () => withSeedOrigin(cloneSeed(INITIAL_CHATS)),
    unreadableCollections,
    warnings,
    quarantineQueue,
    language,
  });
  const adsRes = resolveArrayCollection({
    key: 'ads',
    readResult: raw.rawAds,
    recordValidator: validateAdRecord,
    allowUnknownNonSecret: true,
    seedFallback: () => withSeedOrigin(cloneSeed(INITIAL_SPONSORED_ADS)),
    unreadableCollections,
    warnings,
    quarantineQueue,
    language,
  });
  const passkeysRes = resolveArrayCollection({
    key: 'passkeys',
    readResult: raw.rawPasskeys,
    recordValidator: validatePasskeyRecord,
    allowUnknownNonSecret: false,
    seedFallback: () => [],
    unreadableCollections,
    warnings,
    quarantineQueue,
    language,
  });
  const sessionRes = resolveSingleObject({
    key: 'identitySession',
    readResult: raw.rawIdentitySession,
    validator: validateIdentitySession,
    defaultFallback: () => ({ ...DEFAULT_ANONYMOUS_SESSION }),
    unreadableCollections,
    warnings,
    quarantineQueue,
    language,
  });
  const outboxRes = resolveArrayCollection({
    key: 'outbox',
    readResult: raw.rawOutbox,
    recordValidator: validateOutboxRecord,
    allowUnknownNonSecret: false,
    seedFallback: () => [],
    unreadableCollections,
    warnings,
    quarantineQueue,
    language,
  });

  const payload: MigrationPayload = {
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

  return {
    payload,
    states: {
      artistsRes,
      appointmentsRes,
      portfolioRes,
      likedRes,
      savedRes,
      reviewsRes,
      anchorsRes,
      chatsRes,
      adsRes,
      passkeysRes,
      sessionRes,
      outboxRes,
    },
  };
}

export function buildSeedEntriesToPersist(params: {
  states: ReturnType<typeof resolveAllRepositoryCollections>['states'];
  payload: MigrationPayload;
  quarantineQueue: StorageEntry[];
  migrated: boolean;
  backfilledOrigins: boolean;
  sessionExpiredOnLoad: boolean;
  metaUnreadable: boolean;
  storedMeta: DataLayerMeta | undefined;
  meta: DataLayerMeta;
}): StorageEntry[] {
  const {
    states,
    payload,
    quarantineQueue,
    migrated,
    backfilledOrigins,
    sessionExpiredOnLoad,
    metaUnreadable,
    storedMeta,
    meta,
  } = params;

  const entries: StorageEntry[] = [...quarantineQueue];

  if (!states.artistsRes.unreadable && (states.artistsRes.needsWrite || migrated || backfilledOrigins)) {
    entries.push(['artists', payload.artists]);
  }
  if (
    !states.appointmentsRes.unreadable &&
    (states.appointmentsRes.needsWrite || migrated || backfilledOrigins)
  ) {
    entries.push(['appointments', payload.appointments]);
  }
  if (
    !states.portfolioRes.unreadable &&
    (states.portfolioRes.needsWrite || migrated || backfilledOrigins)
  ) {
    entries.push(['portfolio', payload.portfolio]);
  }
  if (!states.likedRes.unreadable && states.likedRes.needsWrite) {
    entries.push(['likedIds', payload.likedIds]);
  }
  if (!states.savedRes.unreadable && states.savedRes.needsWrite) {
    entries.push(['savedIds', payload.savedIds]);
  }
  if (!states.reviewsRes.unreadable && (states.reviewsRes.needsWrite || migrated || backfilledOrigins)) {
    entries.push(['reviews', payload.reviews]);
  }
  if (!states.anchorsRes.unreadable && (states.anchorsRes.needsWrite || migrated || backfilledOrigins)) {
    entries.push(['anchorPoints', payload.anchorPoints]);
  }
  if (!states.chatsRes.unreadable && (states.chatsRes.needsWrite || migrated || backfilledOrigins)) {
    entries.push(['chats', payload.chats]);
  }
  if (!states.adsRes.unreadable && (states.adsRes.needsWrite || migrated || backfilledOrigins)) {
    entries.push(['ads', payload.ads]);
  }
  if (!states.passkeysRes.unreadable && states.passkeysRes.needsWrite) {
    entries.push(['passkeys', payload.passkeys]);
  }
  if (!states.sessionRes.unreadable && (states.sessionRes.needsWrite || sessionExpiredOnLoad)) {
    entries.push(['identitySession', payload.identitySession]);
  }
  if (!states.outboxRes.unreadable && states.outboxRes.needsWrite) {
    entries.push(['outbox', payload.outbox]);
  }
  if (!metaUnreadable && (!storedMeta || migrated || backfilledOrigins)) {
    entries.push(['schemaMeta', meta]);
  }

  return entries;
}
