// =============================================================================
// Stage 5 · Sprint 5.1 — Repository Outbox Queue Module (Q-10 / V-07)
// - Strict allowlist payload sanitization (N-06), UUID mutation IDs via
//   createId(), and bounded synced history preservation.
// =============================================================================

import { createId } from '../../domain/ids';
import { OutboxMutation, OutboxMutationInput, StorageEntry } from '../../domain/storage';

export const MAX_SYNCED_OUTBOX_HISTORY = 50;
export const OUTBOX_PENDING_WARNING_THRESHOLD = 100;

export const ALLOWED_OUTBOX_PAYLOAD_KEYS = new Set([
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

export function nextOutboxId(): string {
  return createId('outbox');
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

export function appendOutboxMutationState(
  current: OutboxMutation[],
  mutation: OutboxMutationInput
): {
  nextOutbox: OutboxMutation[];
  entry: StorageEntry;
} {
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

export function buildFlushedOutboxState(current: OutboxMutation[]): OutboxMutation[] {
  return current
    .map(item => ({
      ...item,
      status: 'synced' as const,
      attempts: item.attempts + 1,
    }))
    .slice(0, MAX_SYNCED_OUTBOX_HISTORY);
}
