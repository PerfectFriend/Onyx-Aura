// =============================================================================
// Strict Allowlist Runtime Schema Validators (L-05 & L-06)
// - Primary defense against stray unknown fields (e.g. privateKey, apiKey, JWK d)
// - Corrupt-collection isolation: rejects non-arrays/malformed records cleanly
//   so one corrupted collection never crashes React across reloads.
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

export interface ValidationResult<T> {
  ok: boolean;
  value?: T;
  reason?: string;
}

function isPlainRecord(val: unknown): val is Record<string, unknown> {
  return typeof val === 'object' && val !== null && !Array.isArray(val);
}

function isNonEmptyString(val: unknown): val is string {
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

export function validatePasskeyRecord(input: unknown): ValidationResult<PasskeyCredentialRecord> {
  if (!isPlainRecord(input)) return { ok: false, reason: 'Passkey record must be an object' };
  const unknownKey = hasOnlyAllowedKeys(input, PASSKEY_KEYS);
  if (unknownKey) return { ok: false, reason: `Disallowed passkey field "${unknownKey}"` };

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

export function validatePasskeys(input: unknown): ValidationResult<PasskeyCredentialRecord[]> {
  if (!Array.isArray(input)) return { ok: false, reason: 'passkeys must be an array' };
  for (const item of input) {
    const res = validatePasskeyRecord(item);
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
    (input.displayName !== null && !isNonEmptyString(input.displayName)) ||
    (input.role !== 'client' && input.role !== 'master') ||
    (input.authMethod !== 'none' &&
      input.authMethod !== 'webauthn_passkey' &&
      input.authMethod !== 'demo_passkey_sim') ||
    (input.signedInAt !== null && !isNonEmptyString(input.signedInAt)) ||
    (input.expiresAt !== undefined && input.expiresAt !== null && !isNonEmptyString(input.expiresAt)) ||
    input.verificationScope !== 'client_local_only'
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
    verificationScope: 'client_local_only',
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

export function validateAppointments(input: unknown): ValidationResult<Appointment[]> {
  if (!Array.isArray(input)) return { ok: false, reason: 'appointments must be an array' };
  for (const item of input) {
    if (!isPlainRecord(item)) return { ok: false, reason: 'Appointment entry must be an object' };
    const unknownKey = hasOnlyAllowedKeys(item, APPOINTMENT_KEYS);
    if (unknownKey) return { ok: false, reason: `Disallowed appointment field "${unknownKey}"` };
    if (
      !isNonEmptyString(item.id) ||
      !isNonEmptyString(item.clientName) ||
      !isNonEmptyString(item.artistId) ||
      !isNonEmptyString(item.serviceName) ||
      !isFiniteNumber(item.price) ||
      !isNonEmptyString(item.date) ||
      !isNonEmptyString(item.timeSlot) ||
      !isNonEmptyString(item.status)
    ) {
      return { ok: false, reason: 'Malformed Appointment fields' };
    }
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

export function validatePortfolio(input: unknown): ValidationResult<PortfolioItem[]> {
  if (!Array.isArray(input)) return { ok: false, reason: 'portfolio must be an array' };
  for (const item of input) {
    if (!isPlainRecord(item)) return { ok: false, reason: 'PortfolioItem must be an object' };
    const unknownKey = hasOnlyAllowedKeys(item, PORTFOLIO_KEYS);
    if (unknownKey) return { ok: false, reason: `Disallowed portfolio field "${unknownKey}"` };
    if (
      !isNonEmptyString(item.id) ||
      !isNonEmptyString(item.title) ||
      !isNonEmptyString(item.artistId) ||
      !isFiniteNumber(item.likes) ||
      !isFiniteNumber(item.saves) ||
      !isFiniteNumber(item.priceUSD)
    ) {
      return { ok: false, reason: 'Malformed PortfolioItem fields' };
    }
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

export function validateArtists(input: unknown): ValidationResult<Artist[]> {
  if (!Array.isArray(input)) return { ok: false, reason: 'artists must be an array' };
  for (const item of input) {
    if (!isPlainRecord(item)) return { ok: false, reason: 'Artist must be an object' };
    const unknownKey = hasOnlyAllowedKeys(item, ARTIST_KEYS);
    if (unknownKey) return { ok: false, reason: `Disallowed artist field "${unknownKey}"` };
    if (
      !isNonEmptyString(item.id) ||
      !isNonEmptyString(item.name) ||
      !isFiniteNumber(item.rating) ||
      !isFiniteNumber(item.totalReviews) ||
      !Array.isArray(item.services)
    ) {
      return { ok: false, reason: 'Malformed Artist fields' };
    }
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

export function validateReviews(input: unknown): ValidationResult<Review[]> {
  if (!Array.isArray(input)) return { ok: false, reason: 'reviews must be an array' };
  for (const item of input) {
    if (!isPlainRecord(item)) return { ok: false, reason: 'Review must be an object' };
    const unknownKey = hasOnlyAllowedKeys(item, REVIEW_KEYS);
    if (unknownKey) return { ok: false, reason: `Disallowed review field "${unknownKey}"` };
    if (
      !isNonEmptyString(item.id) ||
      !isNonEmptyString(item.artistId) ||
      !isFiniteNumber(item.rating) ||
      !isPlainRecord(item.breakdown) ||
      !isNonEmptyString(item.text)
    ) {
      return { ok: false, reason: 'Malformed Review fields' };
    }
  }
  return { ok: true, value: input as Review[] };
}

const ANCHOR_KEYS = new Set(['id', 'name', 'label', 'icon', 'address', 'coordinates', 'origin']);

export function validateAnchorPoints(input: unknown): ValidationResult<ClientAnchorPoint[]> {
  if (!Array.isArray(input)) return { ok: false, reason: 'anchorPoints must be an array' };
  for (const item of input) {
    if (!isPlainRecord(item)) return { ok: false, reason: 'ClientAnchorPoint must be an object' };
    const unknownKey = hasOnlyAllowedKeys(item, ANCHOR_KEYS);
    if (unknownKey) return { ok: false, reason: `Disallowed anchorPoint field "${unknownKey}"` };
    if (
      !isNonEmptyString(item.id) ||
      !isNonEmptyString(item.name) ||
      !isPlainRecord(item.coordinates) ||
      !isFiniteNumber(item.coordinates.lat) ||
      !isFiniteNumber(item.coordinates.lng)
    ) {
      return { ok: false, reason: 'Malformed ClientAnchorPoint fields' };
    }
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

export function validateChats(input: unknown): ValidationResult<ChatMessage[]> {
  if (!Array.isArray(input)) return { ok: false, reason: 'chats must be an array' };
  for (const item of input) {
    if (!isPlainRecord(item)) return { ok: false, reason: 'ChatMessage must be an object' };
    const unknownKey = hasOnlyAllowedKeys(item, CHAT_KEYS);
    if (unknownKey) return { ok: false, reason: `Disallowed chat field "${unknownKey}"` };
    if (
      !isNonEmptyString(item.id) ||
      !isNonEmptyString(item.threadId) ||
      !isNonEmptyString(item.text) ||
      (item.senderRole !== 'client' && item.senderRole !== 'master')
    ) {
      return { ok: false, reason: 'Malformed ChatMessage fields' };
    }
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

export function validateAds(input: unknown): ValidationResult<SponsoredAd[]> {
  if (!Array.isArray(input)) return { ok: false, reason: 'ads must be an array' };
  for (const item of input) {
    if (!isPlainRecord(item)) return { ok: false, reason: 'SponsoredAd must be an object' };
    const unknownKey = hasOnlyAllowedKeys(item, AD_KEYS);
    if (unknownKey) return { ok: false, reason: `Disallowed ad field "${unknownKey}"` };
    if (
      !isNonEmptyString(item.id) ||
      !isNonEmptyString(item.title) ||
      !isNonEmptyString(item.brandName) ||
      !isBoolean(item.isActive)
    ) {
      return { ok: false, reason: 'Malformed SponsoredAd fields' };
    }
  }
  return { ok: true, value: input as SponsoredAd[] };
}

const OUTBOX_KEYS = new Set(['id', 'entity', 'action', 'payload', 'createdAt', 'status', 'attempts']);

export function validateOutbox(input: unknown): ValidationResult<OutboxMutation[]> {
  if (!Array.isArray(input)) return { ok: false, reason: 'outbox must be an array' };
  for (const item of input) {
    if (!isPlainRecord(item)) return { ok: false, reason: 'OutboxMutation must be an object' };
    const unknownKey = hasOnlyAllowedKeys(item, OUTBOX_KEYS);
    if (unknownKey) return { ok: false, reason: `Disallowed outbox field "${unknownKey}"` };
    if (
      !isNonEmptyString(item.id) ||
      !isNonEmptyString(item.entity) ||
      !isNonEmptyString(item.action) ||
      (item.status !== 'pending_sync' && item.status !== 'synced') ||
      !isFiniteNumber(item.attempts)
    ) {
      return { ok: false, reason: 'Malformed OutboxMutation fields' };
    }
  }
  return { ok: true, value: input as OutboxMutation[] };
}

export function validateStringArray(input: unknown, fieldName: string): ValidationResult<string[]> {
  if (!Array.isArray(input) || !input.every(isNonEmptyString)) {
    return { ok: false, reason: `${fieldName} must be an array of strings` };
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
