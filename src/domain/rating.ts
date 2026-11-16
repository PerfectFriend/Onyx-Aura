// =============================================================================
// Pure Domain Rating Calculations (extracted from App.tsx per L-14)
// Keeps cumulative sum when available to prevent repeated rounding drift.
// =============================================================================

export interface ArtistRatingUpdateInput {
  currentRating: number;
  totalReviews: number;
  ratingSum?: number;
  newRating: number;
}

export interface ArtistRatingUpdateResult {
  rating: number;
  totalReviews: number;
  ratingSum: number;
}

/**
 * Computes incremental weighted average rating without depending on stale closures (K-09).
 */
export function computeUpdatedArtistRating(
  currentRating: number,
  totalReviews: number,
  newRating: number
): number {
  const safeCount = Math.max(0, totalReviews);
  const weighted = (currentRating * safeCount + newRating) / (safeCount + 1);
  return Number(weighted.toFixed(2));
}

/**
 * Sum-preserving incremental rating update avoiding progressive rounding drift (L-14).
 */
export function computeExactArtistRatingUpdate({
  currentRating,
  totalReviews,
  ratingSum,
  newRating,
}: ArtistRatingUpdateInput): ArtistRatingUpdateResult {
  const safeCount = Math.max(0, totalReviews);
  const baseSum = typeof ratingSum === 'number' && Number.isFinite(ratingSum)
    ? ratingSum
    : currentRating * safeCount;
  const nextCount = safeCount + 1;
  const nextSum = Number((baseSum + newRating).toFixed(4));
  return {
    rating: Number((nextSum / nextCount).toFixed(2)),
    totalReviews: nextCount,
    ratingSum: nextSum,
  };
}
