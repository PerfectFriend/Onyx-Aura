// =============================================================================
// Domain contracts for Stage 2/3.2 Local-First persistence, storage health,
// atomic multi-key transactions, schema migrations, and offline sync outbox.
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

export type StorageKey =
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

export type StorageEntry = readonly [StorageKey, unknown];

/**
 * Abstract async key-value storage backend (IndexedDB in browser, Memory fallback in tests/SSR).
 */
export interface StorageAdapter {
  readonly backend: StorageBackendKind;
  get<T>(key: StorageKey): Promise<T | undefined>;
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
  /** Lightweight reference payload (entity IDs / action metadata — never bulk PII). */
  payload: unknown;
  createdAt: string;
  status: 'pending_sync' | 'synced';
  attempts: number;
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
}
