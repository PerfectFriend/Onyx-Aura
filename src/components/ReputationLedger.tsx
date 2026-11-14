import React, { useState } from 'react';
import { ShieldCheck, CheckCircle2, Star, ExternalLink, Hash, Plus } from 'lucide-react';
import { Review, Artist } from '../types';

interface ReputationLedgerProps {
  reviews: Review[];
  artists: Artist[];
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
  onAddReview,
}) => {
  const [selectedArtistFilter, setSelectedArtistFilter] = useState<string>('all');
  const [isModalOpen, setIsModalOpen] = useState<boolean>(false);
  const [inspectedReview, setInspectedReview] = useState<Review | null>(null);

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

  const computedRating = Number(
    ((formTechnique + formHygiene + formDurability + formPrecision) / 4).toFixed(1)
  );

  const filteredReviews =
    selectedArtistFilter === 'all'
      ? reviews
      : reviews.filter(r => r.artistId === selectedArtistFilter);

  const handleSubmit = (e: React.FormEvent) => {
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
        technique: formTechnique,
        hygiene: formHygiene,
        durability: formDurability,
        precision: formPrecision,
      },
      text: formText,
      bookingTxId: formBookingTx,
    });
    setIsModalOpen(false);
  };

  return (
    <div className="py-10 bg-[#0b0c10]">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 space-y-8">
        {/* Section Header */}
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-6 pb-6 border-b border-[#1f222b]">
          <div>
            <div className="text-xs font-mono text-[#38bdf8] flex flex-wrap items-center gap-2 mb-1">
              <span className="flex items-center gap-1.5">
                <ShieldCheck className="w-3.5 h-3.5" />
                <span>DEMO REPUTATION LEDGER [SIM]</span>
              </span>
              <span className="px-2 py-0.5 text-[10px] font-bold rounded bg-red-950/90 text-red-300 border border-red-500/60 tracking-wider">
                [SIM] SIMULATED REPUTATION
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
                Локальное хранилище IndexedDB: демо-отзывы и рейтинг сохраняются между перезагрузками страницы, но [SIM] хэши (Web Crypto SHA-256) и баллы остаются локальной математической симуляцией (Закон 1, 7, 10).
              </span>
            </div>
            <p className="text-xs text-[#9ca3af] mt-1 max-w-2xl">
              [SIM] Interactive preview of review cards and weighted artist rating updates. Submitted demo entries are marked as unverified until server booking proofs launch in Stage 4.
            </p>
          </div>

          <div className="flex items-center gap-3">
            <select
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

            <button
              onClick={() => setIsModalOpen(true)}
              className="px-4 py-2 text-xs font-semibold text-[#0b0c10] bg-[#d4af37] hover:bg-[#e6c158] rounded-md transition-all flex items-center gap-1.5 shadow-sm cursor-pointer whitespace-nowrap"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Add Demo Review [SIM]</span>
            </button>
          </div>
        </div>

        {/* Artist Trust Cards Overview */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {artists.map(art => (
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
                  <p className="font-mono text-base font-bold text-white tabular-nums">{art.rating}</p>
                  <p className="text-[10px] text-[#9ca3af]">Rating ({art.totalReviews})</p>
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
                <span className="text-red-300">[SIM] Demo Profile</span>
              </div>
            </div>
          ))}
        </div>

        {/* Reviews List */}
        <div className="space-y-4 pt-4">
          <h3 className="text-sm font-semibold text-white uppercase tracking-wider">
            Session Demo Reviews ({filteredReviews.length})
          </h3>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {filteredReviews.map(rev => (
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

      {/* Anchor New Review Modal */}
      {isModalOpen && (
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
                onClick={() => setIsModalOpen(false)}
                className="text-xs text-[#9ca3af] hover:text-white cursor-pointer"
              >
                Close
              </button>
            </div>

            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="text-xs text-[#9ca3af]">Select Artist</label>
                <select
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
                  <label className="text-xs text-[#9ca3af]">Your Name</label>
                  <input
                    type="text"
                    value={formClientName}
                    onChange={e => setFormClientName(e.target.value)}
                    className="w-full mt-1 px-3 py-2 text-xs bg-[#15171e] border border-[#272a33] rounded-lg text-white"
                    required
                  />
                </div>
                <div>
                  <label className="text-xs text-[#9ca3af]">Demo Handle / Ref</label>
                  <input
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
                  <label className="text-[10px] text-[#9ca3af]">Technique</label>
                  <input
                    type="number"
                    min="1"
                    max="5"
                    value={formTechnique}
                    onChange={e => setFormTechnique(Number(e.target.value))}
                    className="w-full mt-1 px-2 py-1.5 text-xs bg-[#15171e] border border-[#272a33] rounded text-white"
                  />
                </div>
                <div>
                  <label className="text-[10px] text-[#9ca3af]">Hygiene</label>
                  <input
                    type="number"
                    min="1"
                    max="5"
                    value={formHygiene}
                    onChange={e => setFormHygiene(Number(e.target.value))}
                    className="w-full mt-1 px-2 py-1.5 text-xs bg-[#15171e] border border-[#272a33] rounded text-white"
                  />
                </div>
                <div>
                  <label className="text-[10px] text-[#9ca3af]">Durability</label>
                  <input
                    type="number"
                    min="1"
                    max="5"
                    value={formDurability}
                    onChange={e => setFormDurability(Number(e.target.value))}
                    className="w-full mt-1 px-2 py-1.5 text-xs bg-[#15171e] border border-[#272a33] rounded text-white"
                  />
                </div>
                <div>
                  <label className="text-[10px] text-[#9ca3af]">Precision</label>
                  <input
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
                <label className="text-xs text-[#9ca3af]">Review Commentary</label>
                <textarea
                  rows={2}
                  value={formText}
                  onChange={e => setFormText(e.target.value)}
                  className="w-full mt-1 px-3 py-2 text-xs bg-[#15171e] border border-[#272a33] rounded-lg text-white"
                  required
                />
              </div>

              <div>
                <label className="text-xs text-[#9ca3af]">Demo Booking Ref [SIM] (Unverified)</label>
                <input
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
