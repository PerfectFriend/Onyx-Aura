// =============================================================================
// Domain contracts for Stage 2 Local-First persistence & offline sync outbox.
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

export type StorageBackendKind = 'indexeddb' | 'memory';

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
  | 'outbox'
  | 'schemaMeta';

/**
 * Abstract async key-value storage backend (IndexedDB in browser, Memory fallback in tests/SSR).
 */
export interface StorageAdapter {
  readonly backend: StorageBackendKind;
  get<T>(key: StorageKey): Promise<T | undefined>;
  set<T>(key: StorageKey, value: T): Promise<void>;
  remove(key: StorageKey): Promise<void>;
  keys(): Promise<string[]>;
  clear(): Promise<void>;
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
  | 'ads';

export interface OutboxMutation {
  id: string;
  entity: OutboxEntity;
  action: string;
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
  outbox: OutboxMutation[];
  meta: DataLayerMeta;
}
