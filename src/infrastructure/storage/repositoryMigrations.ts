// =============================================================================
// Stage 5 · Sprint 5.1 — Repository Schema Migrations Module (Q-10)
// - Encapsulates SALON_SCHEMA_VERSION, v1 -> v2 -> v3 migrations, and
//   legacy record origin annotation (`'seed' | 'user'`).
// =============================================================================

import { DEFAULT_ANONYMOUS_SESSION, IdentitySession, PasskeyCredentialRecord } from '../../domain/identity';
import { OutboxMutation } from '../../domain/storage';
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
  SEED_AD_IDS,
  SEED_ANCHOR_IDS,
  SEED_APPOINTMENT_IDS,
  SEED_ARTIST_IDS,
  SEED_CHAT_IDS,
  SEED_PORTFOLIO_IDS,
  SEED_REVIEW_IDS,
} from './repositorySeed';

export const SALON_SCHEMA_VERSION = 3;

export interface MigrationPayload {
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

export function inferOrigin<T extends { id: string; origin?: 'seed' | 'user' }>(
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

export function annotateAllOrigins(data: MigrationPayload): {
  payload: MigrationPayload;
  changed: boolean;
} {
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

export function runSchemaMigrations(
  initialPayload: MigrationPayload,
  storedVersion: number | undefined
): {
  payload: MigrationPayload;
  migrated: boolean;
  backfilledOrigins: boolean;
} {
  let payload = initialPayload;
  let currentVersion = storedVersion ?? SALON_SCHEMA_VERSION;
  let migrated = false;

  while (currentVersion < SALON_SCHEMA_VERSION) {
    const step = SCHEMA_MIGRATIONS.find(m => m.from === currentVersion);
    if (!step) break;
    payload = step.run(payload);
    currentVersion = step.to;
    migrated = true;
  }

  const annotated = annotateAllOrigins(payload);
  return {
    payload: annotated.payload,
    migrated,
    backfilledOrigins: annotated.changed,
  };
}
