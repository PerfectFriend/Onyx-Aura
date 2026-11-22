// =============================================================================
// Stage 5 · Sprint 5.1 — Repository Seed Module (Q-10)
// - Extracted from salonRepository.ts for isolated fixture & seed management.
// =============================================================================

import {
  INITIAL_ANCHOR_POINTS,
  INITIAL_APPOINTMENTS,
  INITIAL_ARTISTS,
  INITIAL_CHATS,
  INITIAL_PORTFOLIO,
  INITIAL_REVIEWS,
} from '../../data/initialData';
import { INITIAL_SPONSORED_ADS } from '../../data/advertisements';
import { DEFAULT_ANONYMOUS_SESSION, PasskeyCredentialRecord } from '../../domain/identity';

export const DEFAULT_LIKED_IDS: string[] = ['port-gaudi', 'port-1'];
export const DEFAULT_SAVED_IDS: string[] = ['port-gaudi', 'port-2'];

export const SEED_APPOINTMENT_IDS = new Set(INITIAL_APPOINTMENTS.map(a => a.id));
export const SEED_ARTIST_IDS = new Set(INITIAL_ARTISTS.map(a => a.id));
export const SEED_PORTFOLIO_IDS = new Set(INITIAL_PORTFOLIO.map(p => p.id));
export const SEED_REVIEW_IDS = new Set(INITIAL_REVIEWS.map(r => r.id));
export const SEED_ANCHOR_IDS = new Set(INITIAL_ANCHOR_POINTS.map(a => a.id));
export const SEED_CHAT_IDS = new Set(INITIAL_CHATS.map(c => c.id));
export const SEED_AD_IDS = new Set(INITIAL_SPONSORED_ADS.map(a => a.id));

export function cloneSeed<T>(value: T): T {
  if (typeof structuredClone === 'function') {
    return structuredClone(value);
  }
  return JSON.parse(JSON.stringify(value)) as T;
}

export function withSeedOrigin<T extends { origin?: 'seed' | 'user' }>(items: T[]): T[] {
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
