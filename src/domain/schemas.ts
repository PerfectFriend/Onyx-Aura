// =============================================================================
// Runtime Schema Validators, Per-Record Quarantine Partitioning &
// Non-Secret Field Passthrough (L-05, L-06, N-03, N-11)
// =============================================================================

import { IdentitySession, PasskeyCredentialRecord } from './identity';
import { DataLayerMeta, OutboxMutation } from './storage';
import {
  Appointment,
  Artist,
  ChatMessage,
  ClientAnchorPoint,
  PortfolioItem,
  Review,
  SponsoredAd,
} from '../types';
import { detectSecretLikeFields } from '../infrastructure/identity/secretHygiene';

export interface ValidationResult<T> {
  ok: boolean;
  value?: T;
  reason?: string;
}

export interface RecordValidationOptions {
  /** When true (lenient load), unknown non-secret fields are preserved via passthrough (N-03). */
  allowUnknownNonSecret?: boolean;
}

export interface PartitionedCollectionResult<T> {
  isArray: boolean;
  valid: T[];
  quarantined: unknown[];
  reasons: string[];
}

function isPlainRecord(val: unknown): val is Record<string, unknown> {
  return typeof val === 'object' && val !== null && !Array.isArray(val);
}

/** Requires non-empty non-whitespace string (N-11). */
function isNonEmptyString(val: unknown): val is string {
  return typeof val === 'string' && val.trim().length > 0;
}

function isString(val: unknown): val is string {
  return typeof val === 'string';
}

function isFiniteNumber(val: unknown): val is number {
  return typeof val === 'number' && Number.isFinite(val);
}

function isBoolean(val: unknown): val is boolean {
  return typeof val === 'boolean';
}

function hasOnlyAllowedKeys(obj: Record<string, unknown>, allowed: ReadonlySet<string>): string | null {
  for (const key of Object.keys(obj)) {
    if (!allowed.has(key)) {
      return key;
    }
  }
  return null;
}

function checkUnknownOrSecretFields(
  obj: Record<string, unknown>,
  allowed: ReadonlySet<string>,
  entityLabel: string,
  options?: RecordValidationOptions
): string | null {
  if (!options?.allowUnknownNonSecret) {
    const unknownKey = hasOnlyAllowedKeys(obj, allowed);
    if (unknownKey) return `Disallowed ${entityLabel} field "${unknownKey}"`;
    return null;
  }

  // Extract only non-exempt structured / unknown entries for secret hygiene scanning
  const extraOnly: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(obj)) {
    if (!allowed.has(k)) {
      extraOnly[k] = v;
    }
  }
  if (Object.keys(extraOnly).length > 0) {
    const violations = detectSecretLikeFields(extraOnly);
    if (violations.length > 0) {
      return `Secret-like unknown ${entityLabel} field (${violations.join(', ')})`;
    }
  }
  return null;
}

const PASSKEY_KEYS = new Set([
  'id',
  'rawIdBase64Url',
  'publicKeySpkiBase64Url',
  'displayName',
  'role',
  'rpId',
  'algorithm',
  'createdAt',
  'lastUsedAt',
  'transports',
  'signCount',
  'isSimulatedFallback',
]);

export function validatePasskeyRecord(
  input: unknown,
  options?: RecordValidationOptions
): ValidationResult<PasskeyCredentialRecord> {
  if (!isPlainRecord(input)) return { ok: false, reason: 'Passkey record must be an object' };
  const fieldErr = checkUnknownOrSecretFields(input, PASSKEY_KEYS, 'passkey', options);
  if (fieldErr) return { ok: false, reason: fieldErr };

  if (
    !isNonEmptyString(input.id) ||
    !isNonEmptyString(input.rawIdBase64Url) ||
    !isNonEmptyString(input.displayName) ||
    (input.role !== 'client' && input.role !== 'master') ||
    !isNonEmptyString(input.rpId) ||
    !isFiniteNumber(input.algorithm) ||
    !isNonEmptyString(input.createdAt) ||
    !isNonEmptyString(input.lastUsedAt) ||
    !Array.isArray(input.transports) ||
    !input.transports.every(isNonEmptyString) ||
    !isBoolean(input.isSimulatedFallback)
  ) {
    return { ok: false, reason: 'Malformed PasskeyCredentialRecord fields' };
  }

  if (input.publicKeySpkiBase64Url !== undefined && !isNonEmptyString(input.publicKeySpkiBase64Url)) {
    return { ok: false, reason: 'Malformed publicKeySpkiBase64Url' };
  }
  if (input.signCount !== undefined && !isFiniteNumber(input.signCount)) {
    return { ok: false, reason: 'Malformed signCount' };
  }

  return { ok: true, value: input as unknown as PasskeyCredentialRecord };
}

export function validatePasskeys(
  input: unknown,
  options?: RecordValidationOptions
): ValidationResult<PasskeyCredentialRecord[]> {
  if (!Array.isArray(input)) return { ok: false, reason: 'passkeys must be an array' };
  for (const item of input) {
    const res = validatePasskeyRecord(item, options);
    if (!res.ok) return { ok: false, reason: res.reason };
  }
  return { ok: true, value: input as PasskeyCredentialRecord[] };
}

const SESSION_KEYS = new Set([
  'authenticated',
  'credentialId',
  'displayName',
  'role',
  'authMethod',
  'signedInAt',
  'expiresAt',
  'verificationScope',
]);

export function validateIdentitySession(input: unknown): ValidationResult<IdentitySession> {
  if (!isPlainRecord(input)) return { ok: false, reason: 'identitySession must be an object' };
  const unknownKey = hasOnlyAllowedKeys(input, SESSION_KEYS);
  if (unknownKey) return { ok: false, reason: `Disallowed identitySession field "${unknownKey}"` };

  if (
    !isBoolean(input.authenticated) ||
    (input.credentialId !== null && !isNonEmptyString(input.credentialId)) ||
    (input.displayName !== null && !isString(input.displayName)) ||
    (input.role !== 'client' && input.role !== 'master') ||
    (input.authMethod !== 'none' &&
      input.authMethod !== 'webauthn_passkey' &&
      input.authMethod !== 'webauthn_presence_only' &&
      input.authMethod !== 'demo_passkey_sim') ||
    (input.signedInAt !== null && !isNonEmptyString(input.signedInAt)) ||
    (input.expiresAt !== undefined && input.expiresAt !== null && !isNonEmptyString(input.expiresAt)) ||
    (input.verificationScope !== 'client_local_only' &&
      input.verificationScope !== 'server_spki_verified')
  ) {
    return { ok: false, reason: 'Malformed IdentitySession fields' };
  }

  const normalized: IdentitySession = {
    authenticated: input.authenticated,
    credentialId: input.credentialId,
    displayName: input.displayName,
    role: input.role,
    authMethod: input.authMethod,
    signedInAt: input.signedInAt,
    expiresAt: input.expiresAt ?? null,
    verificationScope: input.verificationScope,
  };
  return { ok: true, value: normalized };
}

const APPOINTMENT_KEYS = new Set([
  'id',
  'clientName',
  'clientPhone',
  'clientEmail',
  'artistId',
  'artistName',
  'artistAvatar',
  'serviceId',
  'serviceName',
  'price',
  'currency',
  'cryptoEquivalent',
  'date',
  'timeSlot',
  'status',
  'escrowTxHash',
  'remindersEnabled',
  'pushReminderScheduled',
  'smsReminderScheduled',
  'referenceLookTitle',
  'referenceLookImage',
  'customNotes',
  'createdAt',
  'origin',
]);

export function validateAppointmentRecord(
  input: unknown,
  options?: RecordValidationOptions
): ValidationResult<Appointment> {
  if (!isPlainRecord(input)) return { ok: false, reason: 'Appointment entry must be an object' };
  const fieldErr = checkUnknownOrSecretFields(input, APPOINTMENT_KEYS, 'appointment', options);
  if (fieldErr) return { ok: false, reason: fieldErr };
  if (
    !isNonEmptyString(input.id) ||
    !isNonEmptyString(input.clientName) ||
    !isNonEmptyString(input.artistId) ||
    !isNonEmptyString(input.serviceName) ||
    !isFiniteNumber(input.price) ||
    !isNonEmptyString(input.date) ||
    !isNonEmptyString(input.timeSlot) ||
    !isNonEmptyString(input.status)
  ) {
    return { ok: false, reason: 'Malformed Appointment fields' };
  }
  return { ok: true, value: input as unknown as Appointment };
}

export function validateAppointments(
  input: unknown,
  options?: RecordValidationOptions
): ValidationResult<Appointment[]> {
  if (!Array.isArray(input)) return { ok: false, reason: 'appointments must be an array' };
  for (const item of input) {
    const res = validateAppointmentRecord(item, options);
    if (!res.ok) return { ok: false, reason: res.reason };
  }
  return { ok: true, value: input as Appointment[] };
}

const PORTFOLIO_KEYS = new Set([
  'id',
  'title',
  'artistId',
  'artistName',
  'artistHandle',
  'artistAvatar',
  'category',
  'image',
  'likes',
  'saves',
  'date',
  'description',
  'materials',
  'durationMinutes',
  'priceUSD',
  'igPostId',
  'igLikes',
  'contentHash',
  'origin',
]);

export function validatePortfolioRecord(
  input: unknown,
  options?: RecordValidationOptions
): ValidationResult<PortfolioItem> {
  if (!isPlainRecord(input)) return { ok: false, reason: 'PortfolioItem must be an object' };
  const fieldErr = checkUnknownOrSecretFields(input, PORTFOLIO_KEYS, 'portfolio', options);
  if (fieldErr) return { ok: false, reason: fieldErr };
  if (
    !isNonEmptyString(input.id) ||
    !isNonEmptyString(input.title) ||
    !isNonEmptyString(input.artistId) ||
    !isFiniteNumber(input.likes) ||
    !isFiniteNumber(input.saves) ||
    !isFiniteNumber(input.priceUSD)
  ) {
    return { ok: false, reason: 'Malformed PortfolioItem fields' };
  }
  return { ok: true, value: input as unknown as PortfolioItem };
}

export function validatePortfolio(
  input: unknown,
  options?: RecordValidationOptions
): ValidationResult<PortfolioItem[]> {
  if (!Array.isArray(input)) return { ok: false, reason: 'portfolio must be an array' };
  for (const item of input) {
    const res = validatePortfolioRecord(item, options);
    if (!res.ok) return { ok: false, reason: res.reason };
  }
  return { ok: true, value: input as PortfolioItem[] };
}

const ARTIST_KEYS = new Set([
  'id',
  'name',
  'handle',
  'avatar',
  'location',
  'bio',
  'verifiedTier',
  'reputationScore',
  'totalReviews',
  'rating',
  'ratingSum',
  'walletAddress',
  'stakedNAIL',
  'igHandle',
  'igFollowers',
  'igEngagementRate',
  'isIgConnected',
  'services',
  'portfolioCount',
  'salonName',
  'salonAddress',
  'coordinates',
  'workingHours',
  'origin',
]);

export function validateArtistRecord(
  input: unknown,
  options?: RecordValidationOptions
): ValidationResult<Artist> {
  if (!isPlainRecord(input)) return { ok: false, reason: 'Artist must be an object' };
  const fieldErr = checkUnknownOrSecretFields(input, ARTIST_KEYS, 'artist', options);
  if (fieldErr) return { ok: false, reason: fieldErr };
  if (
    !isNonEmptyString(input.id) ||
    !isNonEmptyString(input.name) ||
    !isFiniteNumber(input.rating) ||
    !isFiniteNumber(input.totalReviews) ||
    !Array.isArray(input.services)
  ) {
    return { ok: false, reason: 'Malformed Artist fields' };
  }
  return { ok: true, value: input as unknown as Artist };
}

export function validateArtists(
  input: unknown,
  options?: RecordValidationOptions
): ValidationResult<Artist[]> {
  if (!Array.isArray(input)) return { ok: false, reason: 'artists must be an array' };
  for (const item of input) {
    const res = validateArtistRecord(item, options);
    if (!res.ok) return { ok: false, reason: res.reason };
  }
  return { ok: true, value: input as Artist[] };
}

const REVIEW_KEYS = new Set([
  'id',
  'artistId',
  'artistName',
  'clientName',
  'clientAddress',
  'rating',
  'breakdown',
  'text',
  'date',
  'blockHeight',
  'blockHash',
  'parentHash',
  'verifiedBookingTx',
  'verifiedInPerson',
  'origin',
]);

export function validateReviewRecord(
  input: unknown,
  options?: RecordValidationOptions
): ValidationResult<Review> {
  if (!isPlainRecord(input)) return { ok: false, reason: 'Review must be an object' };
  const fieldErr = checkUnknownOrSecretFields(input, REVIEW_KEYS, 'review', options);
  if (fieldErr) return { ok: false, reason: fieldErr };
  if (
    !isNonEmptyString(input.id) ||
    !isNonEmptyString(input.artistId) ||
    !isFiniteNumber(input.rating) ||
    !isPlainRecord(input.breakdown) ||
    !isNonEmptyString(input.text)
  ) {
    return { ok: false, reason: 'Malformed Review fields' };
  }
  return { ok: true, value: input as unknown as Review };
}

export function validateReviews(
  input: unknown,
  options?: RecordValidationOptions
): ValidationResult<Review[]> {
  if (!Array.isArray(input)) return { ok: false, reason: 'reviews must be an array' };
  for (const item of input) {
    const res = validateReviewRecord(item, options);
    if (!res.ok) return { ok: false, reason: res.reason };
  }
  return { ok: true, value: input as Review[] };
}

const ANCHOR_KEYS = new Set(['id', 'name', 'label', 'icon', 'address', 'coordinates', 'origin']);

export function validateAnchorPointRecord(
  input: unknown,
  options?: RecordValidationOptions
): ValidationResult<ClientAnchorPoint> {
  if (!isPlainRecord(input)) return { ok: false, reason: 'ClientAnchorPoint must be an object' };
  const fieldErr = checkUnknownOrSecretFields(input, ANCHOR_KEYS, 'anchorPoint', options);
  if (fieldErr) return { ok: false, reason: fieldErr };
  if (
    !isNonEmptyString(input.id) ||
    !isNonEmptyString(input.name) ||
    !isPlainRecord(input.coordinates) ||
    !isFiniteNumber(input.coordinates.lat) ||
    !isFiniteNumber(input.coordinates.lng)
  ) {
    return { ok: false, reason: 'Malformed ClientAnchorPoint fields' };
  }
  return { ok: true, value: input as unknown as ClientAnchorPoint };
}

export function validateAnchorPoints(
  input: unknown,
  options?: RecordValidationOptions
): ValidationResult<ClientAnchorPoint[]> {
  if (!Array.isArray(input)) return { ok: false, reason: 'anchorPoints must be an array' };
  for (const item of input) {
    const res = validateAnchorPointRecord(item, options);
    if (!res.ok) return { ok: false, reason: res.reason };
  }
  return { ok: true, value: input as ClientAnchorPoint[] };
}

const CHAT_KEYS = new Set([
  'id',
  'threadId',
  'senderId',
  'senderName',
  'senderRole',
  'recipientId',
  'text',
  'timestamp',
  'quoteAttachment',
  'inspirationImg',
  'origin',
]);

export function validateChatRecord(
  input: unknown,
  options?: RecordValidationOptions
): ValidationResult<ChatMessage> {
  if (!isPlainRecord(input)) return { ok: false, reason: 'ChatMessage must be an object' };
  const fieldErr = checkUnknownOrSecretFields(input, CHAT_KEYS, 'chat', options);
  if (fieldErr) return { ok: false, reason: fieldErr };
  if (
    !isNonEmptyString(input.id) ||
    !isNonEmptyString(input.threadId) ||
    !isNonEmptyString(input.text) ||
    (input.senderRole !== 'client' && input.senderRole !== 'master')
  ) {
    return { ok: false, reason: 'Malformed ChatMessage fields' };
  }
  return { ok: true, value: input as unknown as ChatMessage };
}

export function validateChats(
  input: unknown,
  options?: RecordValidationOptions
): ValidationResult<ChatMessage[]> {
  if (!Array.isArray(input)) return { ok: false, reason: 'chats must be an array' };
  for (const item of input) {
    const res = validateChatRecord(item, options);
    if (!res.ok) return { ok: false, reason: res.reason };
  }
  return { ok: true, value: input as ChatMessage[] };
}

const AD_KEYS = new Set([
  'id',
  'title',
  'brandName',
  'brandLogo',
  'tagline',
  'description',
  'targetAudience',
  'category',
  'bannerImage',
  'ctaText',
  'ctaUrl',
  'discountCode',
  'discountPercent',
  'bidPerClickNAIL',
  'impressions',
  'clicks',
  'isActive',
  'sponsoredBadge',
  'origin',
]);

export function validateAdRecord(
  input: unknown,
  options?: RecordValidationOptions
): ValidationResult<SponsoredAd> {
  if (!isPlainRecord(input)) return { ok: false, reason: 'SponsoredAd must be an object' };
  const fieldErr = checkUnknownOrSecretFields(input, AD_KEYS, 'ad', options);
  if (fieldErr) return { ok: false, reason: fieldErr };
  if (
    !isNonEmptyString(input.id) ||
    !isNonEmptyString(input.title) ||
    !isNonEmptyString(input.brandName) ||
    !isBoolean(input.isActive)
  ) {
    return { ok: false, reason: 'Malformed SponsoredAd fields' };
  }
  return { ok: true, value: input as unknown as SponsoredAd };
}

export function validateAds(
  input: unknown,
  options?: RecordValidationOptions
): ValidationResult<SponsoredAd[]> {
  if (!Array.isArray(input)) return { ok: false, reason: 'ads must be an array' };
  for (const item of input) {
    const res = validateAdRecord(item, options);
    if (!res.ok) return { ok: false, reason: res.reason };
  }
  return { ok: true, value: input as SponsoredAd[] };
}

const OUTBOX_KEYS = new Set(['id', 'entity', 'action', 'payload', 'createdAt', 'status', 'attempts']);

export function validateOutboxRecord(
  input: unknown,
  options?: RecordValidationOptions
): ValidationResult<OutboxMutation> {
  if (!isPlainRecord(input)) return { ok: false, reason: 'OutboxMutation must be an object' };
  const fieldErr = checkUnknownOrSecretFields(input, OUTBOX_KEYS, 'outbox', options);
  if (fieldErr) return { ok: false, reason: fieldErr };
  if (
    !isNonEmptyString(input.id) ||
    !isNonEmptyString(input.entity) ||
    !isNonEmptyString(input.action) ||
    (input.status !== 'pending_sync' && input.status !== 'synced') ||
    !isFiniteNumber(input.attempts)
  ) {
    return { ok: false, reason: 'Malformed OutboxMutation fields' };
  }
  return { ok: true, value: input as unknown as OutboxMutation };
}

export function validateOutbox(
  input: unknown,
  options?: RecordValidationOptions
): ValidationResult<OutboxMutation[]> {
  if (!Array.isArray(input)) return { ok: false, reason: 'outbox must be an array' };
  for (const item of input) {
    const res = validateOutboxRecord(item, options);
    if (!res.ok) return { ok: false, reason: res.reason };
  }
  return { ok: true, value: input as OutboxMutation[] };
}

/**
 * Per-record collection partitioner (N-03):
 * Keeps every valid record (with passthrough unknown non-secret fields when enabled)
 * and moves ONLY corrupt/secret-tainted records to `quarantined` instead of wiping
 * the entire collection.
 */
export function partitionCollectionRecords<T>(
  input: unknown,
  recordValidator: (item: unknown, options?: RecordValidationOptions) => ValidationResult<T>,
  options: RecordValidationOptions = { allowUnknownNonSecret: true }
): PartitionedCollectionResult<T> {
  if (!Array.isArray(input)) {
    return {
      isArray: false,
      valid: [],
      quarantined: input === undefined ? [] : [input],
      reasons: ['collection is not an array'],
    };
  }

  const valid: T[] = [];
  const quarantined: unknown[] = [];
  const reasons: string[] = [];

  for (const item of input) {
    const res = recordValidator(item, options);
    if (res.ok && res.value !== undefined) {
      valid.push(res.value);
    } else {
      quarantined.push(item);
      if (res.reason && !reasons.includes(res.reason)) {
        reasons.push(res.reason);
      }
    }
  }

  return { isArray: true, valid, quarantined, reasons };
}

export function validateStringArray(input: unknown, fieldName: string): ValidationResult<string[]> {
  if (!Array.isArray(input) || !input.every(isNonEmptyString)) {
    return { ok: false, reason: `${fieldName} must be an array of non-empty strings` };
  }
  return { ok: true, value: input };
}

export function validateSchemaMeta(input: unknown): ValidationResult<DataLayerMeta> {
  if (!isPlainRecord(input)) return { ok: false, reason: 'schemaMeta must be an object' };
  if (!isFiniteNumber(input.schemaVersion) || !isNonEmptyString(input.seededAt)) {
    return { ok: false, reason: 'Malformed schemaMeta fields' };
  }
  const backend = input.backend === 'indexeddb' || input.backend === 'memory' ? input.backend : 'memory';
  const lastModifiedAt = isNonEmptyString(input.lastModifiedAt)
    ? input.lastModifiedAt
    : isNonEmptyString(input.lastUpdatedAt)
    ? input.lastUpdatedAt
    : input.seededAt;

  return {
    ok: true,
    value: {
      schemaVersion: input.schemaVersion,
      seededAt: input.seededAt,
      lastModifiedAt,
      backend,
      storedFutureVersion: isFiniteNumber(input.storedFutureVersion)
        ? input.storedFutureVersion
        : undefined,
    },
  };
}
