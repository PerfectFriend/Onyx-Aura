import React, { useCallback, useEffect, useState } from 'react';
import {
  ShieldCheck,
  CheckCircle2,
  Star,
  ExternalLink,
  Hash,
  Plus,
  CalendarCheck2,
  Lock,
  AlertCircle,
} from 'lucide-react';
import { DEFAULT_ANONYMOUS_SESSION, IdentitySession } from '../domain/identity';
import {
  EligibleBookingForReview,
  PublicReviewView,
  ServerArtistRatingSummary,
} from '../domain/reviews';
import { formatAppMessage } from '../i18n/messages';
import { SupportedLanguage } from '../i18n/translations';
import {
  fetchEligibleBookingsForReview,
  fetchServerReviews,
  submitServerBookingReview,
} from '../infrastructure/reviews/reviewsService';
import { Review, Artist } from '../types';

interface ReputationLedgerProps {
  reviews: Review[];
  artists: Artist[];
  session?: IdentitySession;
  language?: SupportedLanguage;
  onAddReview: (reviewData: {
    artistId: string;
    artistName: string;
    clientName: string;
    clientAddress: string;
    rating: number;
    breakdown: {
      technique: number;
      hygiene: number;
      durability: number;
      precision: number;
    };
    text: string;
    bookingTxId: string;
  }) => void;
}

export const ReputationLedger: React.FC<ReputationLedgerProps> = ({
  reviews,
  artists,
  session = DEFAULT_ANONYMOUS_SESSION,
  language = 'en',
  onAddReview,
}) => {
  const [selectedArtistFilter, setSelectedArtistFilter] = useState<string>('all');
  const [isModalOpen, setIsModalOpen] = useState<boolean>(false);
  const [inspectedReview, setInspectedReview] = useState<Review | null>(null);

  // Server-backed Sprint 5.2 state
  const [feedMode, setFeedMode] = useState<'loading' | 'server' | 'local_only'>('loading');
  const [serverReviews, setServerReviews] = useState<PublicReviewView[]>([]);
  const [serverArtistRatings, setServerArtistRatings] = useState<
    Record<string, ServerArtistRatingSummary>
  >({});
  const [eligibleBookings, setEligibleBookings] = useState<EligibleBookingForReview[]>([]);
  const [selectedBookingRef, setSelectedBookingRef] = useState<string>('');
  const [serverSubmitError, setServerSubmitError] = useState<string | null>(null);
  const [isSubmittingServer, setIsSubmittingServer] = useState<boolean>(false);

  // Fallback [SIM] local form state (active ONLY when backend API is unreachable)
  const [formArtistId, setFormArtistId] = useState<string>(artists[0]?.id || '');
  const [formClientName, setFormClientName] = useState<string>('Marina Sol (Demo)');
  const [formClientAddress, setFormClientAddress] = useState<string>('0xSIM_3dA2...98c1');
  const [formTechnique, setFormTechnique] = useState<number>(5);
  const [formHygiene, setFormHygiene] = useState<number>(5);
  const [formDurability, setFormDurability] = useState<number>(5);
  const [formPrecision, setFormPrecision] = useState<number>(5);
  const [formText, setFormText] = useState<string>(
    'Exemplary Russian prep. The metallic chrome application has zero bubbling or texture flaws.'
  );
  const [formBookingTx, setFormBookingTx] = useState<string>('0xSIM_DEMO_BOOKING_REF');

  const hasServerPasskey =
    session.authenticated && session.verificationScope === 'server_spki_verified';

  const refreshServerState = useCallback(async () => {
    const feed = await fetchServerReviews();
    if (!feed.available) {
      setFeedMode('local_only');
      setEligibleBookings([]);
      return;
    }

    setFeedMode('server');
    setServerReviews(feed.reviews);
    setServerArtistRatings(feed.artistRatings);

    if (hasServerPasskey) {
      const eligible = await fetchEligibleBookingsForReview();
      if (eligible.available && !eligible.requiresAuth) {
        setEligibleBookings(eligible.eligibleBookings);
        if (eligible.eligibleBookings.length > 0) {
          setSelectedBookingRef(prev =>
            eligible.eligibleBookings.some(b => b.bookingReferenceId === prev)
              ? prev
              : eligible.eligibleBookings[0].bookingReferenceId
          );
        } else {
          setSelectedBookingRef('');
        }
      } else {
        setEligibleBookings([]);
      }
    } else {
      setEligibleBookings([]);
      setSelectedBookingRef('');
    }
  }, [hasServerPasskey]);

  useEffect(() => {
    void refreshServerState();
  }, [refreshServerState, session.credentialId]);

  const clampScore = (val: number): number => {
    if (!Number.isFinite(val)) return 5;
    return Math.min(5, Math.max(1, Math.round(val)));
  };

  const computedRating = Number(
    (
      (clampScore(formTechnique) +
        clampScore(formHygiene) +
        clampScore(formDurability) +
        clampScore(formPrecision)) /
      4
    ).toFixed(1)
  );

  const filteredServerReviews =
    selectedArtistFilter === 'all'
      ? serverReviews
      : serverReviews.filter(r => r.artistId === selectedArtistFilter);

  const filteredSeedReviews =
    selectedArtistFilter === 'all'
      ? reviews
      : reviews.filter(r => r.artistId === selectedArtistFilter);

  const selectedEligibleBooking =
    eligibleBookings.find(b => b.bookingReferenceId === selectedBookingRef) ??
    eligibleBookings[0] ??
    null;

  const handleOpenModal = () => {
    setServerSubmitError(null);
    if (feedMode === 'server') {
      if (!hasServerPasskey || eligibleBookings.length === 0) return;
      if (!selectedBookingRef && eligibleBookings[0]) {
        setSelectedBookingRef(eligibleBookings[0].bookingReferenceId);
      }
    }
    setIsModalOpen(true);
  };

  const handleServerSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedEligibleBooking) return;

    setServerSubmitError(null);
    setIsSubmittingServer(true);
    try {
      const result = await submitServerBookingReview({
        bookingReferenceId: selectedEligibleBooking.bookingReferenceId,
        artistId: selectedEligibleBooking.artistId,
        rating: computedRating,
        breakdown: {
          technique: clampScore(formTechnique),
          hygiene: clampScore(formHygiene),
          durability: clampScore(formDurability),
          precision: clampScore(formPrecision),
        },
        text: formText.trim(),
        language,
      });

      setServerReviews(prev => {
        const withoutSame = prev.filter(r => r.id !== result.review.id);
        return [result.review, ...withoutSame];
      });
      setServerArtistRatings(prev => ({
        ...prev,
        [result.artistRating.artistId]: result.artistRating,
      }));
      const remaining = eligibleBookings.filter(
        b => b.bookingReferenceId !== selectedEligibleBooking.bookingReferenceId
      );
      setEligibleBookings(remaining);
      setSelectedBookingRef(remaining[0]?.bookingReferenceId ?? '');
      setIsModalOpen(false);
    } catch (err) {
      setServerSubmitError(
        err instanceof Error
          ? err.message
          : formatAppMessage('reviews.submit_error', {}, language)
      );
    } finally {
      setIsSubmittingServer(false);
    }
  };

  const handleLocalSimSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const art = artists.find(a => a.id === formArtistId) || artists[0];
    if (!art) return;

    onAddReview({
      artistId: art.id,
      artistName: art.name,
      clientName: formClientName,
      clientAddress: formClientAddress,
      rating: computedRating,
      breakdown: {
        technique: clampScore(formTechnique),
        hygiene: clampScore(formHygiene),
        durability: clampScore(formDurability),
        precision: clampScore(formPrecision),
      },
      text: formText,
      bookingTxId: formBookingTx,
    });
    setIsModalOpen(false);
  };

  const canPostServerReview = feedMode === 'server' && hasServerPasskey && eligibleBookings.length > 0;

  return (
    <div className="py-10 bg-[#0b0c10]">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 space-y-8">
        {/* Section Header */}
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-6 pb-6 border-b border-[#1f222b]">
          <div>
            {feedMode === 'server' ? (
              <>
                <div className="text-xs font-mono text-emerald-300 flex flex-wrap items-center gap-2 mb-1">
                  <span className="flex items-center gap-1.5">
                    <CalendarCheck2 className="w-3.5 h-3.5" />
                    <span>BOOKING-GATED REVIEWS</span>
                  </span>
                  <span className="px-2 py-0.5 text-[10px] font-bold rounded bg-emerald-950/90 text-emerald-300 border border-emerald-500/60 tracking-wider">
                    SERVER API · CAPTURED DEPOSIT REQUIRED
                  </span>
                </div>
                <h2 className="font-display text-2xl sm:text-3xl font-bold text-white tracking-tight">
                  {formatAppMessage('reviews.server_banner_title', {}, language)}
                </h2>
                <div className="my-2 p-2.5 bg-emerald-950/25 border border-emerald-500/35 rounded text-[11px] text-emerald-100 flex items-center gap-2">
                  <ShieldCheck className="w-4 h-4 text-emerald-400 shrink-0" />
                  <span>{formatAppMessage('reviews.server_banner_desc', {}, language)}</span>
                </div>
              </>
            ) : (
              <>
                <div className="text-xs font-mono text-[#38bdf8] flex flex-wrap items-center gap-2 mb-1">
                  <span className="flex items-center gap-1.5">
                    <ShieldCheck className="w-3.5 h-3.5" />
                    <span>DEMO REPUTATION LEDGER [SIM]</span>
                  </span>
                  <span className="px-2 py-0.5 text-[10px] font-bold rounded bg-red-950/90 text-red-300 border border-red-500/60 tracking-wider">
                    [SIM] LOCAL_ONLY REPUTATION
                  </span>
                </div>
                <h2 className="font-display text-2xl sm:text-3xl font-bold text-white tracking-tight">
                  Session Reputation & Demo Review Stream [SIM]
                </h2>
                <div className="my-2 p-2.5 bg-red-950/30 border border-red-500/40 rounded text-[11px] text-red-200 flex items-center gap-2">
                  <span className="font-mono font-bold bg-red-900/60 px-1.5 py-0.5 rounded text-red-300 text-[10px]">
                    [SIM]
                  </span>
                  <span>
                    Backend API недоступен (статичный / офлайн режим LOCAL_ONLY): демо-отзывы и [SIM] хэши (Web Crypto SHA-256) сохраняются только в IndexedDB браузера.
                  </span>
                </div>
              </>
            )}
          </div>

          <div className="flex items-center gap-3 flex-wrap">
            <select
              aria-label="Filter artist reviews"
              value={selectedArtistFilter}
              onChange={e => setSelectedArtistFilter(e.target.value)}
              className="px-3 py-2 text-xs bg-[#15171e] border border-[#272a33] rounded-lg text-white focus:outline-none"
            >
              <option value="all">All Artists</option>
              {artists.map(a => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
            </select>

            {feedMode === 'server' ? (
              <button
                type="button"
                onClick={handleOpenModal}
                disabled={!canPostServerReview}
                className={`px-4 py-2 text-xs font-semibold rounded-md transition-all flex items-center gap-1.5 shadow-sm whitespace-nowrap ${
                  canPostServerReview
                    ? 'text-[#0b0c10] bg-[#d4af37] hover:bg-[#e6c158] cursor-pointer'
                    : 'text-[#9ca3af] bg-[#15171e] border border-[#272a33] cursor-not-allowed opacity-70'
                }`}
              >
                {canPostServerReview ? (
                  <Plus className="w-3.5 h-3.5" />
                ) : (
                  <Lock className="w-3.5 h-3.5" />
                )}
                <span>Leave Booking Review</span>
              </button>
            ) : (
              <button
                type="button"
                onClick={handleOpenModal}
                className="px-4 py-2 text-xs font-semibold text-[#0b0c10] bg-[#d4af37] hover:bg-[#e6c158] rounded-md transition-all flex items-center gap-1.5 shadow-sm cursor-pointer whitespace-nowrap"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Add Demo Review [SIM]</span>
              </button>
            )}
          </div>
        </div>

        {/* Strict Gating Notice when Server Mode is active but user has no eligible booking */}
        {feedMode === 'server' && !canPostServerReview && (
          <div className="p-3.5 rounded-xl bg-[#12141a] border border-amber-500/35 text-xs text-amber-200 flex items-center gap-2.5">
            <Lock className="w-4 h-4 text-amber-400 shrink-0" />
            <span>
              {hasServerPasskey
                ? formatAppMessage('reviews.gate_no_booking', {}, language)
                : formatAppMessage('reviews.gate_signin_required', {}, language)}
            </span>
          </div>
        )}

        {/* Artist Trust Cards Overview */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {artists.map(art => {
            const serverSummary = serverArtistRatings[art.id];
            const showServerRating = feedMode === 'server' && Boolean(serverSummary);

            return (
              <div
                key={art.id}
                className="p-5 rounded-xl bg-[#12141a] border border-[#272a33] space-y-4 hover:border-[#38bdf8]/40 transition-all"
              >
                <div className="flex items-center gap-3.5">
                  <img
                    src={art.avatar}
                    alt={art.name}
                    className="w-12 h-12 rounded-full object-cover border border-[#272a33]"
                    referrerPolicy="no-referrer"
                    onError={e => {
                      e.currentTarget.src = '/assets/images/avatar_master_artist_1790123890131.jpg';
                    }}
                  />
                  <div className="truncate">
                    <div className="flex items-center gap-1.5">
                      <h4 className="text-sm font-semibold text-white truncate">{art.name}</h4>
                      <CheckCircle2 className="w-3.5 h-3.5 text-[#38bdf8] shrink-0" />
                    </div>
                    <p className="text-xs text-[#9ca3af] truncate">{art.verifiedTier}</p>
                  </div>
                </div>

                <div className="grid grid-cols-3 gap-2 py-2 border-y border-[#1f222b] text-center">
                  <div>
                    <p className="font-mono text-base font-bold text-white tabular-nums">
                      {showServerRating ? serverSummary.rating.toFixed(2) : art.rating}
                    </p>
                    <p className="text-[10px] text-[#9ca3af]">
                      {showServerRating
                        ? `Server Rating (${serverSummary.totalReviews})`
                        : `Seed [SIM] (${art.totalReviews})`}
                    </p>
                  </div>
                  <div>
                    <p className="font-mono text-base font-bold text-[#d4af37] tabular-nums">
                      {art.reputationScore}
                    </p>
                    <p className="text-[10px] text-[#9ca3af]">Demo Score [SIM]</p>
                  </div>
                  <div>
                    <p className="font-mono text-base font-bold text-[#34d399] tabular-nums">
                      {art.stakedNAIL.toLocaleString()}
                    </p>
                    <p className="text-[10px] text-[#9ca3af]">$NAIL [SIM]</p>
                  </div>
                </div>

                <div className="flex items-center justify-between text-[11px] font-mono text-[#9ca3af]">
                  <span>Ref: {art.walletAddress}</span>
                  <span className={showServerRating ? 'text-emerald-300' : 'text-red-300'}>
                    {showServerRating ? 'Live Booking Stats' : '[SIM] Demo Baseline'}
                  </span>
                </div>
              </div>
            );
          })}
        </div>

        {/* Live Server Booking-Gated Reviews */}
        {feedMode === 'server' && (
          <div className="space-y-4 pt-2">
            <h3 className="text-sm font-semibold text-white uppercase tracking-wider flex items-center gap-2">
              <CalendarCheck2 className="w-4 h-4 text-emerald-400" />
              <span>Confirmed Booking Reviews ({filteredServerReviews.length})</span>
            </h3>

            {filteredServerReviews.length === 0 ? (
              <div className="p-5 rounded-xl bg-[#12141a] border border-[#272a33] text-xs text-[#9ca3af]">
                No server-confirmed booking reviews yet for the selected artist filter.
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {filteredServerReviews.map(rev => (
                  <div
                    key={rev.id}
                    className="p-5 rounded-xl bg-[#12141a] border border-emerald-500/35 space-y-4"
                  >
                    <div className="flex items-center justify-between">
                      <div>
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-xs font-semibold text-white">
                            {rev.authorDisplayName}
                          </span>
                          <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-emerald-950/70 text-emerald-300 border border-emerald-500/45">
                            {formatAppMessage('reviews.badge_confirmed_booking', {}, language)}
                          </span>
                        </div>
                        <p className="text-[11px] text-[#d4af37] mt-0.5">
                          Review for <span className="text-white font-medium">{rev.artistName}</span>
                          {rev.appointmentDate
                            ? ` · ${rev.appointmentDate}${rev.appointmentTimeSlot ? ` ${rev.appointmentTimeSlot}` : ''}`
                            : ''}
                        </p>
                      </div>

                      <div className="flex items-center gap-1 text-xs font-mono text-[#d4af37]">
                        <Star className="w-3.5 h-3.5 fill-current" />
                        <span className="font-bold">{rev.rating.toFixed(1)}</span>
                      </div>
                    </div>

                    <p className="text-xs text-[#d1d5db] leading-relaxed">"{rev.text}"</p>

                    <div className="grid grid-cols-4 gap-2 text-[11px] text-[#9ca3af] font-mono py-2 border-y border-[#1f222b]">
                      <div>
                        Technique: <span className="text-white">{rev.breakdown.technique}/5</span>
                      </div>
                      <div>
                        Hygiene: <span className="text-white">{rev.breakdown.hygiene}/5</span>
                      </div>
                      <div>
                        Durability: <span className="text-white">{rev.breakdown.durability}/5</span>
                      </div>
                      <div>
                        Precision: <span className="text-white">{rev.breakdown.precision}/5</span>
                      </div>
                    </div>

                    <div className="flex items-center justify-between text-[11px] font-mono text-[#9ca3af]">
                      <span className="truncate max-w-[260px] text-emerald-300">
                        Booking: {rev.bookingReferenceId}
                      </span>
                      <span className="text-[10px] text-[#6b7280]">
                        {new Date(rev.createdAt).toLocaleDateString()}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Pre-Seeded / Local Demo Fixtures (Explicitly Separated & Badged [SIM]) */}
        <div className="space-y-4 pt-4">
          <h3 className="text-sm font-semibold text-white uppercase tracking-wider">
            [SIM] Seed Demo Samples ({filteredSeedReviews.length})
          </h3>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {filteredSeedReviews.map(rev => (
              <div
                key={rev.id}
                className="p-5 rounded-xl bg-[#12141a] border border-[#272a33] space-y-4 hover:border-[#333742] transition-all"
              >
                <div className="flex items-center justify-between">
                  <div>
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-xs font-semibold text-white">{rev.clientName}</span>
                      <span className="text-xs text-[#9ca3af] font-mono">({rev.clientAddress})</span>
                      <span
                        className={`text-[10px] font-mono px-1.5 py-0.5 rounded border ${
                          rev.verifiedInPerson
                            ? 'bg-emerald-950/60 text-emerald-300 border-emerald-500/40'
                            : 'bg-red-950/60 text-red-300 border-red-500/40'
                        }`}
                      >
                        {rev.verifiedInPerson ? '[SIM] Seed Sample' : '[SIM] Unverified Demo'}
                      </span>
                    </div>
                    <p className="text-[11px] text-[#d4af37] mt-0.5">
                      Review for <span className="text-white font-medium">{rev.artistName}</span>
                    </p>
                  </div>

                  <div className="flex items-center gap-1 text-xs font-mono text-[#d4af37]">
                    <Star className="w-3.5 h-3.5 fill-current" />
                    <span className="font-bold">{rev.rating.toFixed(1)}</span>
                  </div>
                </div>

                <p className="text-xs text-[#d1d5db] leading-relaxed">"{rev.text}"</p>

                <div className="grid grid-cols-4 gap-2 text-[11px] text-[#9ca3af] font-mono py-2 border-y border-[#1f222b]">
                  <div>
                    Technique: <span className="text-white">{rev.breakdown.technique}/5</span>
                  </div>
                  <div>
                    Hygiene: <span className="text-white">{rev.breakdown.hygiene}/5</span>
                  </div>
                  <div>
                    Durability: <span className="text-white">{rev.breakdown.durability}/5</span>
                  </div>
                  <div>
                    Precision: <span className="text-white">{rev.breakdown.precision}/5</span>
                  </div>
                </div>

                <div className="flex items-center justify-between text-[11px] font-mono text-[#9ca3af]">
                  <div className="space-y-0.5 truncate max-w-[280px]">
                    <p className="text-[#38bdf8] flex items-center gap-1">
                      <Hash className="w-3 h-3" />
                      <span>Demo Block #{rev.blockHeight} [SIM]</span>
                    </p>
                    <p className="truncate text-[10px] text-[#6b7280]">
                      Hash: {rev.blockHash.slice(0, 24)}...
                    </p>
                  </div>

                  <button
                    type="button"
                    onClick={() => setInspectedReview(rev)}
                    className="text-[#38bdf8] hover:text-[#7dd3fc] text-[11px] flex items-center gap-1 transition-colors cursor-pointer shrink-0"
                  >
                    <span>Inspect Payload</span>
                    <ExternalLink className="w-3 h-3" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Block Inspector Modal */}
      {inspectedReview && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/85 backdrop-blur-md">
          <div className="relative w-full max-w-xl bg-[#101218] border border-red-500/40 rounded-2xl p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-[#1f222b]">
              <div className="flex items-center gap-2 text-[#38bdf8]">
                <ShieldCheck className="w-4 h-4" />
                <h3 className="font-mono text-sm font-bold text-white">
                  Demo Block #{inspectedReview.blockHeight} Payload [SIM]
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setInspectedReview(null)}
                className="text-xs text-[#9ca3af] hover:text-white cursor-pointer"
              >
                Close
              </button>
            </div>

            <div className="space-y-3 font-mono text-xs">
              <div className="p-3 bg-[#15171e] rounded-lg border border-[#272a33] space-y-1">
                <span className="text-[#9ca3af] text-[10px]">LOCAL PAYLOAD HASH [SIM]</span>
                <p className="text-white break-all text-[11px]">{inspectedReview.blockHash}</p>
              </div>

              <div className="p-3 bg-[#15171e] rounded-lg border border-[#272a33] space-y-1">
                <span className="text-[#9ca3af] text-[10px]">PREVIOUS ENTRY REF [SIM]</span>
                <p className="text-[#9ca3af] break-all text-[11px]">{inspectedReview.parentHash}</p>
              </div>

              <div className="p-3 bg-[#15171e] rounded-lg border border-[#272a33] space-y-1">
                <span className="text-[#9ca3af] text-[10px]">DEMO BOOKING REFERENCE [SIM]</span>
                <p className="text-[#34d399] break-all text-[11px]">
                  {inspectedReview.verifiedBookingTx}
                </p>
              </div>

              <div className="flex justify-between text-[11px] text-red-300 pt-1">
                <span>
                  Verification:{' '}
                  {inspectedReview.verifiedInPerson
                    ? '[SIM] Pre-seeded Demo Entry'
                    : '[SIM] Unverified Client Submission'}
                </span>
                <span>Browser Session Only</span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Booking-Gated Server Review Modal OR [SIM] Local Offline Modal */}
      {isModalOpen && feedMode === 'server' && selectedEligibleBooking && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/85 backdrop-blur-md">
          <div className="relative w-full max-w-lg bg-[#101218] border border-emerald-500/45 rounded-2xl p-6 shadow-2xl space-y-5">
            <div className="flex items-center justify-between pb-3 border-b border-[#1f222b]">
              <div>
                <span className="text-[11px] font-mono text-emerald-300">
                  SERVER BOOKING-GATED SUBMISSION
                </span>
                <h3 className="font-display text-base font-bold text-white">
                  Post Booking Review
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setIsModalOpen(false)}
                className="text-xs text-[#9ca3af] hover:text-white cursor-pointer"
              >
                Close
              </button>
            </div>

            <form
              onSubmit={e => {
                void handleServerSubmit(e);
              }}
              className="space-y-4"
            >
              <div>
                <label htmlFor="server-booking-select" className="text-xs text-[#9ca3af]">
                  Eligible Captured Booking
                </label>
                <select
                  id="server-booking-select"
                  value={selectedEligibleBooking.bookingReferenceId}
                  onChange={e => setSelectedBookingRef(e.target.value)}
                  className="w-full mt-1 px-3 py-2 text-xs bg-[#15171e] border border-[#272a33] rounded-lg text-white font-mono"
                >
                  {eligibleBookings.map(b => (
                    <option key={b.bookingReferenceId} value={b.bookingReferenceId}>
                      {b.bookingReferenceId} · {b.artistName} ({b.serviceName})
                    </option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <span className="block text-xs text-[#9ca3af]">Booked Master (Locked)</span>
                  <div className="mt-1 px-3 py-2 text-xs bg-[#15171e]/70 border border-[#272a33] rounded-lg text-white">
                    {selectedEligibleBooking.artistName}
                  </div>
                </div>
                <div>
                  <span className="block text-xs text-[#9ca3af]">Passkey Author</span>
                  <div className="mt-1 px-3 py-2 text-xs bg-[#15171e]/70 border border-[#272a33] rounded-lg text-emerald-300 truncate">
                    {session.displayName ?? 'Passkey Client'}
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-4 gap-2">
                <div>
                  <label htmlFor="srv-score-technique" className="text-[10px] text-[#9ca3af]">
                    Technique
                  </label>
                  <input
                    id="srv-score-technique"
                    type="number"
                    min="1"
                    max="5"
                    value={formTechnique}
                    onChange={e => setFormTechnique(Number(e.target.value))}
                    className="w-full mt-1 px-2 py-1.5 text-xs bg-[#15171e] border border-[#272a33] rounded text-white"
                  />
                </div>
                <div>
                  <label htmlFor="srv-score-hygiene" className="text-[10px] text-[#9ca3af]">
                    Hygiene
                  </label>
                  <input
                    id="srv-score-hygiene"
                    type="number"
                    min="1"
                    max="5"
                    value={formHygiene}
                    onChange={e => setFormHygiene(Number(e.target.value))}
                    className="w-full mt-1 px-2 py-1.5 text-xs bg-[#15171e] border border-[#272a33] rounded text-white"
                  />
                </div>
                <div>
                  <label htmlFor="srv-score-durability" className="text-[10px] text-[#9ca3af]">
                    Durability
                  </label>
                  <input
                    id="srv-score-durability"
                    type="number"
                    min="1"
                    max="5"
                    value={formDurability}
                    onChange={e => setFormDurability(Number(e.target.value))}
                    className="w-full mt-1 px-2 py-1.5 text-xs bg-[#15171e] border border-[#272a33] rounded text-white"
                  />
                </div>
                <div>
                  <label htmlFor="srv-score-precision" className="text-[10px] text-[#9ca3af]">
                    Precision
                  </label>
                  <input
                    id="srv-score-precision"
                    type="number"
                    min="1"
                    max="5"
                    value={formPrecision}
                    onChange={e => setFormPrecision(Number(e.target.value))}
                    className="w-full mt-1 px-2 py-1.5 text-xs bg-[#15171e] border border-[#272a33] rounded text-white"
                  />
                </div>
              </div>

              <div>
                <label htmlFor="srv-review-commentary" className="text-xs text-[#9ca3af]">
                  Review Commentary (Overall {computedRating.toFixed(1)}/5)
                </label>
                <textarea
                  id="srv-review-commentary"
                  rows={3}
                  minLength={5}
                  maxLength={1500}
                  value={formText}
                  onChange={e => setFormText(e.target.value)}
                  className="w-full mt-1 px-3 py-2 text-xs bg-[#15171e] border border-[#272a33] rounded-lg text-white"
                  required
                />
              </div>

              {serverSubmitError && (
                <div className="p-2.5 rounded-lg bg-red-950/50 border border-red-500/45 text-[11px] text-red-200 flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 text-red-400 shrink-0" />
                  <span>{serverSubmitError}</span>
                </div>
              )}

              <div className="pt-2 flex justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="px-4 py-2 text-xs text-[#9ca3af] hover:text-white cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmittingServer}
                  className="px-5 py-2 text-xs font-semibold text-[#0b0c10] bg-[#d4af37] hover:bg-[#e6c158] rounded-md transition-all cursor-pointer disabled:opacity-60"
                >
                  {isSubmittingServer ? 'Saving...' : 'Publish Booking Review'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {isModalOpen && feedMode !== 'server' && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/85 backdrop-blur-md">
          <div className="relative w-full max-w-lg bg-[#101218] border border-red-500/40 rounded-2xl p-6 shadow-2xl space-y-5">
            <div className="flex items-center justify-between pb-3 border-b border-[#1f222b]">
              <div>
                <span className="text-[11px] font-mono text-red-300">[SIM] DEMO SUBMISSION</span>
                <h3 className="font-display text-base font-bold text-white">
                  Submit Demo Master Review [SIM]
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setIsModalOpen(false)}
                className="text-xs text-[#9ca3af] hover:text-white cursor-pointer"
              >
                Close
              </button>
            </div>

            <form onSubmit={handleLocalSimSubmit} className="space-y-4">
              <div>
                <label htmlFor="review-artist-select" className="text-xs text-[#9ca3af]">
                  Select Artist
                </label>
                <select
                  id="review-artist-select"
                  value={formArtistId}
                  onChange={e => setFormArtistId(e.target.value)}
                  className="w-full mt-1 px-3 py-2 text-xs bg-[#15171e] border border-[#272a33] rounded-lg text-white"
                >
                  {artists.map(a => (
                    <option key={a.id} value={a.id}>
                      {a.name} ({a.handle})
                    </option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label htmlFor="review-client-name" className="text-xs text-[#9ca3af]">
                    Your Name
                  </label>
                  <input
                    id="review-client-name"
                    type="text"
                    value={formClientName}
                    onChange={e => setFormClientName(e.target.value)}
                    className="w-full mt-1 px-3 py-2 text-xs bg-[#15171e] border border-[#272a33] rounded-lg text-white"
                    required
                  />
                </div>
                <div>
                  <label htmlFor="review-client-ref" className="text-xs text-[#9ca3af]">
                    Demo Handle / Ref
                  </label>
                  <input
                    id="review-client-ref"
                    type="text"
                    value={formClientAddress}
                    onChange={e => setFormClientAddress(e.target.value)}
                    className="w-full mt-1 px-3 py-2 text-xs bg-[#15171e] border border-[#272a33] rounded-lg text-white font-mono"
                    required
                  />
                </div>
              </div>

              <div className="grid grid-cols-4 gap-2">
                <div>
                  <label htmlFor="review-score-technique" className="text-[10px] text-[#9ca3af]">
                    Technique
                  </label>
                  <input
                    id="review-score-technique"
                    type="number"
                    min="1"
                    max="5"
                    value={formTechnique}
                    onChange={e => setFormTechnique(Number(e.target.value))}
                    className="w-full mt-1 px-2 py-1.5 text-xs bg-[#15171e] border border-[#272a33] rounded text-white"
                  />
                </div>
                <div>
                  <label htmlFor="review-score-hygiene" className="text-[10px] text-[#9ca3af]">
                    Hygiene
                  </label>
                  <input
                    id="review-score-hygiene"
                    type="number"
                    min="1"
                    max="5"
                    value={formHygiene}
                    onChange={e => setFormHygiene(Number(e.target.value))}
                    className="w-full mt-1 px-2 py-1.5 text-xs bg-[#15171e] border border-[#272a33] rounded text-white"
                  />
                </div>
                <div>
                  <label htmlFor="review-score-durability" className="text-[10px] text-[#9ca3af]">
                    Durability
                  </label>
                  <input
                    id="review-score-durability"
                    type="number"
                    min="1"
                    max="5"
                    value={formDurability}
                    onChange={e => setFormDurability(Number(e.target.value))}
                    className="w-full mt-1 px-2 py-1.5 text-xs bg-[#15171e] border border-[#272a33] rounded text-white"
                  />
                </div>
                <div>
                  <label htmlFor="review-score-precision" className="text-[10px] text-[#9ca3af]">
                    Precision
                  </label>
                  <input
                    id="review-score-precision"
                    type="number"
                    min="1"
                    max="5"
                    value={formPrecision}
                    onChange={e => setFormPrecision(Number(e.target.value))}
                    className="w-full mt-1 px-2 py-1.5 text-xs bg-[#15171e] border border-[#272a33] rounded text-white"
                  />
                </div>
              </div>

              <div>
                <label htmlFor="review-commentary" className="text-xs text-[#9ca3af]">
                  Review Commentary
                </label>
                <textarea
                  id="review-commentary"
                  rows={2}
                  value={formText}
                  onChange={e => setFormText(e.target.value)}
                  className="w-full mt-1 px-3 py-2 text-xs bg-[#15171e] border border-[#272a33] rounded-lg text-white"
                  required
                />
              </div>

              <div>
                <label htmlFor="review-booking-ref" className="text-xs text-[#9ca3af]">
                  Demo Booking Ref [SIM] (Unverified)
                </label>
                <input
                  id="review-booking-ref"
                  type="text"
                  value={formBookingTx}
                  onChange={e => setFormBookingTx(e.target.value)}
                  className="w-full mt-1 px-3 py-2 text-xs bg-[#15171e] border border-[#272a33] rounded-lg text-white font-mono"
                  required
                />
              </div>

              <div className="pt-2 flex justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="px-4 py-2 text-xs text-[#9ca3af] hover:text-white"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 text-xs font-semibold text-[#0b0c10] bg-[#d4af37] hover:bg-[#e6c158] rounded-md transition-all cursor-pointer"
                >
                  Save Demo Review [SIM]
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
