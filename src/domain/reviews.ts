// =============================================================================
// Stage 5 · Sprint 5.2 — Pure Domain Contracts for Booking-Gated Reviews
// - Zero UI or [SIM] dependencies (Manifest Law 2).
// - Reviews require a server-side captured/completed deposit booking owned by
//   the author's Passkey credential (no anonymous or arbitrary artist reviews).
// - Sum-preserving rating updates reuse domain/rating.ts on the server.
// =============================================================================

import { DepositIntent } from './payments';
import { CANONICAL_SERVICE_CATALOG, CanonicalServiceCatalogEntry } from './serviceCatalog';
import { UserRole } from '../types';

export interface ReviewBreakdown {
  technique: number;
  hygiene: number;
  durability: number;
  precision: number;
}

export interface ServerReviewRecord {
  id: string;
  bookingReferenceId: string;
  intentId: string;
  artistId: string;
  artistName: string;
  authorCredentialId: string;
  authorDisplayName: string;
  authorRole: UserRole;
  rating: number;
  breakdown: ReviewBreakdown;
  text: string;
  createdAt: string;
  bookingConfirmed: true;
  appointmentDate?: string;
  appointmentTimeSlot?: string;
}

/**
 * Public read projection returned by GET/POST /api/reviews.
 * Strips internal authorCredentialId and payment intentId.
 */
export interface PublicReviewView {
  id: string;
  bookingReferenceId: string;
  artistId: string;
  artistName: string;
  authorDisplayName: string;
  authorRole: UserRole;
  rating: number;
  breakdown: ReviewBreakdown;
  text: string;
  createdAt: string;
  confirmedAfterCompletedBooking: true;
  appointmentDate?: string;
  appointmentTimeSlot?: string;
}

export interface ServerArtistRatingSummary {
  artistId: string;
  artistName: string;
  rating: number;
  totalReviews: number;
  ratingSum: number;
  updatedAt: string;
}

export interface EligibleBookingForReview {
  bookingReferenceId: string;
  intentId: string;
  artistId: string;
  artistName: string;
  serviceId: string;
  serviceName: string;
  amountMinor: number;
  appointmentDate?: string;
  appointmentTimeSlot?: string;
  createdAt: string;
}

export interface CreateReviewRequestPayload {
  bookingReferenceId: string;
  artistId: string;
  rating?: number;
  breakdown: ReviewBreakdown;
  text: string;
}

const FORBIDDEN_IDS = new Set(['__proto__', 'constructor', 'prototype']);
export const MIN_REVIEW_TEXT_LENGTH = 5;
export const MAX_REVIEW_TEXT_LENGTH = 1500;

export function isSafeReviewIdentifier(value: unknown, maxLen: number = 64): value is string {
  return (
    typeof value === 'string' &&
    value.trim().length > 0 &&
    value.trim().length <= maxLen &&
    !FORBIDDEN_IDS.has(value.trim())
  );
}

function isScoreInRange(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 1 && value <= 5;
}

export interface NormalizedCreateReviewInput {
  bookingReferenceId: string;
  artistId: string;
  rating: number;
  breakdown: ReviewBreakdown;
  text: string;
}

export function validateCreateReviewPayload(
  raw: unknown
): { ok: true; value: NormalizedCreateReviewInput } | { ok: false; error: string } {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return { ok: false, error: 'Review payload must be a JSON object.' };
  }

  const body = raw as Record<string, unknown>;
  if (!isSafeReviewIdentifier(body.bookingReferenceId, 64)) {
    return { ok: false, error: 'Valid bookingReferenceId (1..64 chars) is required.' };
  }
  if (!isSafeReviewIdentifier(body.artistId, 64)) {
    return { ok: false, error: 'Valid artistId (1..64 chars) is required.' };
  }

  const bd = body.breakdown;
  if (!bd || typeof bd !== 'object' || Array.isArray(bd)) {
    return { ok: false, error: 'Breakdown ratings object is required.' };
  }
  const bRec = bd as Record<string, unknown>;
  if (
    !isScoreInRange(bRec.technique) ||
    !isScoreInRange(bRec.hygiene) ||
    !isScoreInRange(bRec.durability) ||
    !isScoreInRange(bRec.precision)
  ) {
    return {
      ok: false,
      error: 'All breakdown scores (technique, hygiene, durability, precision) must be between 1 and 5.',
    };
  }

  const breakdown: ReviewBreakdown = {
    technique: Number(bRec.technique.toFixed(1)),
    hygiene: Number(bRec.hygiene.toFixed(1)),
    durability: Number(bRec.durability.toFixed(1)),
    precision: Number(bRec.precision.toFixed(1)),
  };

  let normalizedRating: number;
  if (body.rating === undefined) {
    normalizedRating = Number(
      (
        (breakdown.technique + breakdown.hygiene + breakdown.durability + breakdown.precision) /
        4
      ).toFixed(1)
    );
  } else {
    if (!isScoreInRange(body.rating)) {
      return { ok: false, error: 'Review rating must be a finite number between 1 and 5.' };
    }
    normalizedRating = Number(body.rating.toFixed(1));
  }

  if (typeof body.text !== 'string') {
    return { ok: false, error: 'Review text must be a string.' };
  }
  const cleanText = body.text.trim();
  if (cleanText.length < MIN_REVIEW_TEXT_LENGTH || cleanText.length > MAX_REVIEW_TEXT_LENGTH) {
    return {
      ok: false,
      error: `Review text must be between ${MIN_REVIEW_TEXT_LENGTH} and ${MAX_REVIEW_TEXT_LENGTH} characters.`,
    };
  }

  return {
    ok: true,
    value: {
      bookingReferenceId: body.bookingReferenceId.trim(),
      artistId: body.artistId.trim(),
      rating: normalizedRating,
      breakdown,
      text: cleanText,
    },
  };
}

export function resolveCanonicalArtistName(
  artistId: string,
  catalog: readonly CanonicalServiceCatalogEntry[] = CANONICAL_SERVICE_CATALOG
): string {
  return catalog.find(item => item.artistId === artistId)?.artistName ?? 'Master Artist';
}

export function resolveCanonicalServiceName(
  artistId: string,
  serviceId: string,
  catalog: readonly CanonicalServiceCatalogEntry[] = CANONICAL_SERVICE_CATALOG
): string {
  return (
    catalog.find(item => item.artistId === artistId && item.serviceId === serviceId)?.serviceName ??
    'Nail Art Session'
  );
}

export function toPublicReviewView(record: ServerReviewRecord): PublicReviewView {
  return {
    id: record.id,
    bookingReferenceId: record.bookingReferenceId,
    artistId: record.artistId,
    artistName: record.artistName,
    authorDisplayName: record.authorDisplayName,
    authorRole: record.authorRole,
    rating: record.rating,
    breakdown: { ...record.breakdown },
    text: record.text,
    createdAt: record.createdAt,
    confirmedAfterCompletedBooking: true,
    ...(record.appointmentDate ? { appointmentDate: record.appointmentDate } : {}),
    ...(record.appointmentTimeSlot ? { appointmentTimeSlot: record.appointmentTimeSlot } : {}),
  };
}

export function toEligibleBookingView(
  intent: DepositIntent,
  catalog: readonly CanonicalServiceCatalogEntry[] = CANONICAL_SERVICE_CATALOG
): EligibleBookingForReview {
  return {
    bookingReferenceId: intent.bookingReferenceId,
    intentId: intent.id,
    artistId: intent.artistId,
    artistName: resolveCanonicalArtistName(intent.artistId, catalog),
    serviceId: intent.serviceId,
    serviceName: resolveCanonicalServiceName(intent.artistId, intent.serviceId, catalog),
    amountMinor: intent.amountMinor,
    ...(intent.appointmentDate ? { appointmentDate: intent.appointmentDate } : {}),
    ...(intent.appointmentTimeSlot ? { appointmentTimeSlot: intent.appointmentTimeSlot } : {}),
    createdAt: intent.createdAt,
  };
}

export function reviewsMatchIdempotently(
  existing: ServerReviewRecord,
  candidate: NormalizedCreateReviewInput,
  authorCredentialId: string
): boolean {
  return (
    existing.authorCredentialId === authorCredentialId &&
    existing.bookingReferenceId === candidate.bookingReferenceId &&
    existing.artistId === candidate.artistId &&
    existing.rating === candidate.rating &&
    existing.text === candidate.text &&
    existing.breakdown.technique === candidate.breakdown.technique &&
    existing.breakdown.hygiene === candidate.breakdown.hygiene &&
    existing.breakdown.durability === candidate.breakdown.durability &&
    existing.breakdown.precision === candidate.breakdown.precision
  );
}
