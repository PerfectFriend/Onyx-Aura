// =============================================================================
// Domain contracts for Stage 2/3.3 Local-First persistence, storage health,
// unreadable-vs-missing distinction (N-01), quarantine keys (N-03),
// atomic multi-key transactions + outbox (N-06), schema migrations (N-02).
// Pure interfaces free of UI or simulation dependencies (Manifest Law 2 & 3).
// =============================================================================

import {
  Artist,
  Appointment,
  PortfolioItem,
  Review,
  ClientAnchorPoint,
  ChatMessage,
  SponsoredAd,
} from '../types';
import { IdentitySession, PasskeyCredentialRecord } from './identity';

export type StorageBackendKind = 'indexeddb' | 'memory';

export type StorageHealth = 'ok' | 'degraded' | 'memory_only';

export type BaseStorageKey =
  | 'artists'
  | 'appointments'
  | 'portfolio'
  | 'likedIds'
  | 'savedIds'
  | 'reviews'
  | 'anchorPoints'
  | 'chats'
  | 'ads'
  | 'passkeys'
  | 'identitySession'
  | 'outbox'
  | 'schemaMeta';

export type StorageKey = BaseStorageKey | `quarantine:${string}`;

export type StorageEntry = readonly [StorageKey, unknown];

/**
 * Discriminated read result distinguishing "key absent" from "read I/O failed" (N-01)
 * so transient read errors NEVER trigger seed overwrites of real user data.
 */
export type StorageReadResult<T> =
  | { status: 'ok'; value: T }
  | { status: 'missing' }
  | { status: 'unreadable'; error: string };

/**
 * Abstract async key-value storage backend (IndexedDB in browser, Memory fallback in tests/SSR).
 */
export interface StorageAdapter {
  readonly backend: StorageBackendKind;
  get<T>(key: StorageKey): Promise<T | undefined>;
  getDetailed?<T>(key: StorageKey): Promise<StorageReadResult<T>>;
  set<T>(key: StorageKey, value: T): Promise<void>;
  setMany?(entries: ReadonlyArray<StorageEntry>): Promise<void>;
  remove(key: StorageKey): Promise<void>;
  keys(): Promise<string[]>;
  clear(): Promise<void>;
}

export interface StorageHealthReport {
  health: StorageHealth;
  backend: StorageBackendKind;
  warnings: string[];
  lastError?: string;
  unreadableKeys: StorageKey[];
  pendingWriteKeys: StorageKey[];
}

export type OutboxEntity =
  | 'appointments'
  | 'artists'
  | 'portfolio'
  | 'likes'
  | 'saves'
  | 'reviews'
  | 'anchorPoints'
  | 'chats'
  | 'ads'
  | 'identity';

export interface OutboxMutation {
  id: string;
  entity: OutboxEntity;
  action: string;
  /** Lightweight allowlisted reference payload (entity IDs / counts — never PII). */
  payload: unknown;
  createdAt: string;
  status: 'pending_sync' | 'synced';
  attempts: number;
}

export interface OutboxMutationInput {
  entity: OutboxEntity;
  action: string;
  payload: unknown;
}

export interface DataLayerMeta {
  schemaVersion: number;
  seededAt: string;
  lastModifiedAt: string;
  backend: StorageBackendKind;
  storedFutureVersion?: number;
}

export interface HydratedSalonData {
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
  meta: DataLayerMeta;
  health: StorageHealth;
  warnings: string[];
  readOnlyFutureSchema: boolean;
  storedFutureVersion?: number;
  unreadableKeys: StorageKey[];
  quarantineKeys: string[];
}
