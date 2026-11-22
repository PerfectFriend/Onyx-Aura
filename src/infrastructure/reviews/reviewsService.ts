// =============================================================================
// Stage 5 · Sprint 5.2 — Client Reviews API Adapter
// - Talks to /api/reviews, /api/reviews/eligible, and POST /api/reviews with
//   same-origin HttpOnly Passkey cookies.
// - Reports `available: false` cleanly when offline / static preview so UI can
//   degrade honestly to [SIM] LOCAL_ONLY without silent phantom success.
// =============================================================================

import {
  CreateReviewRequestPayload,
  EligibleBookingForReview,
  PublicReviewView,
  ServerArtistRatingSummary,
} from '../../domain/reviews';
import { translateServerErrorCode } from '../../i18n/messages';
import { SupportedLanguage } from '../../i18n/translations';

export interface ServerReviewsSnapshot {
  available: boolean;
  reviews: PublicReviewView[];
  artistRatings: Record<string, ServerArtistRatingSummary>;
}

export interface EligibleBookingsResponse {
  available: boolean;
  requiresAuth: boolean;
  eligibleBookings: EligibleBookingForReview[];
}

export interface SubmitServerReviewResponse {
  review: PublicReviewView;
  artistRating: ServerArtistRatingSummary;
  idempotentReplay: boolean;
}

export async function fetchServerReviews(artistId?: string): Promise<ServerReviewsSnapshot> {
  if (typeof fetch !== 'function') {
    return { available: false, reviews: [], artistRatings: {} };
  }

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 1800);
    const query = artistId ? `?artistId=${encodeURIComponent(artistId)}` : '';
    const res = await fetch(`/api/reviews${query}`, {
      credentials: 'same-origin',
      signal: controller.signal,
    });
    clearTimeout(timeout);

    if (!res.ok) {
      return { available: false, reviews: [], artistRatings: {} };
    }

    const data = (await res.json()) as {
      reviews?: unknown;
      artistRatings?: unknown;
    };

    return {
      available: true,
      reviews: Array.isArray(data.reviews) ? (data.reviews as PublicReviewView[]) : [],
      artistRatings:
        data.artistRatings && typeof data.artistRatings === 'object'
          ? (data.artistRatings as Record<string, ServerArtistRatingSummary>)
          : {},
    };
  } catch {
    return { available: false, reviews: [], artistRatings: {} };
  }
}

export async function fetchEligibleBookingsForReview(): Promise<EligibleBookingsResponse> {
  if (typeof fetch !== 'function') {
    return { available: false, requiresAuth: false, eligibleBookings: [] };
  }

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 1800);
    const res = await fetch('/api/reviews/eligible', {
      credentials: 'same-origin',
      signal: controller.signal,
    });
    clearTimeout(timeout);

    if (res.status === 401) {
      return { available: true, requiresAuth: true, eligibleBookings: [] };
    }
    if (!res.ok) {
      return { available: false, requiresAuth: false, eligibleBookings: [] };
    }

    const data = (await res.json()) as { eligibleBookings?: unknown };
    return {
      available: true,
      requiresAuth: false,
      eligibleBookings: Array.isArray(data.eligibleBookings)
        ? (data.eligibleBookings as EligibleBookingForReview[])
        : [],
    };
  } catch {
    return { available: false, requiresAuth: false, eligibleBookings: [] };
  }
}

export async function submitServerBookingReview(
  params: CreateReviewRequestPayload & { language?: SupportedLanguage }
): Promise<SubmitServerReviewResponse> {
  const res = await fetch('/api/reviews', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'same-origin',
    body: JSON.stringify({
      bookingReferenceId: params.bookingReferenceId,
      artistId: params.artistId,
      rating: params.rating,
      breakdown: params.breakdown,
      text: params.text,
    }),
  });

  if (!res.ok) {
    const err = (await res.json().catch(() => ({}))) as { code?: unknown; error?: unknown };
    const fallback =
      typeof err.error === 'string'
        ? err.error
        : `Review submission rejected (${res.status}).`;
    throw new Error(
      err.code ? translateServerErrorCode(err.code, fallback, params.language) : fallback
    );
  }

  const data = (await res.json()) as {
    review: PublicReviewView;
    artistRating: ServerArtistRatingSummary;
    idempotentReplay?: boolean;
  };
  return {
    review: data.review,
    artistRating: data.artistRating,
    idempotentReplay: Boolean(data.idempotentReplay),
  };
}
