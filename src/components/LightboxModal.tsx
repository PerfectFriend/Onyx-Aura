import React from 'react';
import { X, Heart, Bookmark, ShieldCheck, Clock, DollarSign, Calendar, Instagram, Share2, Layers } from 'lucide-react';
import { PortfolioItem } from '../types';

interface LightboxModalProps {
  item: PortfolioItem | null;
  onClose: () => void;
  onBookThisLook: (item: PortfolioItem) => void;
  onLikeToggle: (itemId: string) => void;
  isLiked: boolean;
  onSaveToggle: (itemId: string) => void;
  isSaved: boolean;
}

export const LightboxModal: React.FC<LightboxModalProps> = ({
  item,
  onClose,
  onBookThisLook,
  onLikeToggle,
  isLiked,
  onSaveToggle,
  isSaved,
}) => {
  if (!item) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6 bg-black/85 backdrop-blur-md">
      <div 
        className="relative w-full max-w-4xl bg-[#101218] border border-[#272a33] rounded-2xl overflow-hidden shadow-2xl max-h-[92vh] flex flex-col md:flex-row"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Close Button */}
        <button
          onClick={onClose}
          className="absolute top-4 right-4 z-20 p-2 rounded-full bg-black/60 text-white hover:bg-white hover:text-black transition-colors cursor-pointer"
          aria-label="Close modal"
        >
          <X className="w-5 h-5" />
        </button>

        {/* Media Side */}
        <div className="md:w-3/5 bg-black flex items-center justify-center relative min-h-[300px] md:min-h-[500px]">
          <img
            src={item.image}
            alt={item.title}
            className="w-full h-full max-h-[70vh] md:max-h-[85vh] object-contain"
            referrerPolicy="no-referrer"
            onError={(e) => {
              e.currentTarget.src = '/assets/images/portfolio_gaudi_mosaic_nails_1790126128212.jpg';
            }}
          />
          
          {/* Quick overlay pill replacement: subtle bottom bar */}
          <div className="absolute bottom-3 left-3 right-3 flex items-center justify-between text-xs text-[#d1d5db] bg-[#0b0c10]/80 backdrop-blur-md px-3 py-2 rounded-md border border-[#272a33]">
            <span className="font-mono text-[11px] truncate max-w-[200px]">
              SHA-256: {item.onChainHash.slice(0, 16)}...
            </span>
            <span className="text-[#38bdf8] flex items-center gap-1 text-[11px]">
              <ShieldCheck className="w-3.5 h-3.5" />
              <span>Immutable Proof</span>
            </span>
          </div>
        </div>

        {/* Details Side */}
        <div className="md:w-2/5 p-6 flex flex-col justify-between overflow-y-auto max-h-[50vh] md:max-h-[85vh] bg-[#101218]">
          <div className="space-y-5">
            
            {/* Master Artist Header */}
            <div className="flex items-center justify-between pb-4 border-b border-[#1f222b]">
              <div className="flex items-center gap-3">
                <img
                  src={item.artistAvatar}
                  alt={item.artistName}
                  className="w-10 h-10 rounded-full object-cover border border-[#272a33]"
                  referrerPolicy="no-referrer"
                  onError={(e) => {
                    e.currentTarget.src = '/assets/images/avatar_master_artist_1790123890131.jpg';
                  }}
                />
                <div>
                  <h4 className="text-sm font-semibold text-white">{item.artistName}</h4>
                  <p className="text-xs text-[#9ca3af]">@{item.artistHandle}</p>
                </div>
              </div>

              {item.igPostId && (
                <div className="flex items-center gap-1 text-xs text-[#ec4899] font-mono">
                  <Instagram className="w-3.5 h-3.5" />
                  <span>IG Synced</span>
                </div>
              )}
            </div>

            {/* Title & Metadata */}
            <div>
              <div className="text-xs text-[#d4af37] font-mono mb-1">
                <span>{item.category}</span>
                <span className="mx-2" aria-hidden="true">·</span>
                <span>{item.date}</span>
              </div>
              <h2 className="font-display text-xl font-bold text-white text-balance leading-snug">
                {item.title}
              </h2>
            </div>

            {/* Description */}
            <p className="text-sm text-[#9ca3af] leading-relaxed">
              {item.description}
            </p>

            {/* Materials Used */}
            <div className="space-y-2">
              <p className="text-xs uppercase tracking-wider text-[#9ca3af] font-medium flex items-center gap-1.5">
                <Layers className="w-3.5 h-3.5 text-[#d4af37]" />
                <span>Materials & Formulation</span>
              </p>
              <ul className="text-xs text-[#d1d5db] space-y-1 pl-1">
                {item.materials.map((mat, idx) => (
                  <li key={idx} className="flex items-center gap-2">
                    <span className="w-1 h-1 rounded-full bg-[#d4af37]" />
                    <span>{mat}</span>
                  </li>
                ))}
              </ul>
            </div>

            {/* Duration & Price specs */}
            <div className="grid grid-cols-2 gap-3 py-3 border-y border-[#1f222b] text-xs">
              <div className="flex items-center gap-2 text-[#9ca3af]">
                <Clock className="w-4 h-4 text-[#d4af37]" />
                <div>
                  <p className="text-[11px] text-[#9ca3af]">Duration</p>
                  <p className="font-medium text-white">{item.durationMinutes} minutes</p>
                </div>
              </div>
              <div className="flex items-center gap-2 text-[#9ca3af]">
                <DollarSign className="w-4 h-4 text-[#34d399]" />
                <div>
                  <p className="text-[11px] text-[#9ca3af]">Base Session</p>
                  <p className="font-mono font-bold text-white">${item.priceUSD} USD</p>
                </div>
              </div>
            </div>

            {/* Social Interactions */}
            <div className="flex items-center justify-between text-xs text-[#9ca3af] pt-1">
              <div className="flex items-center gap-4">
                <button
                  onClick={() => onLikeToggle(item.id)}
                  className={`flex items-center gap-1.5 transition-colors cursor-pointer ${
                    isLiked ? 'text-[#f43f5e]' : 'hover:text-white'
                  }`}
                >
                  <Heart className={`w-4 h-4 ${isLiked ? 'fill-current' : ''}`} />
                  <span className="font-mono">{item.likes + (isLiked ? 1 : 0)}</span>
                </button>

                <button
                  onClick={() => onSaveToggle(item.id)}
                  className={`flex items-center gap-1.5 transition-colors cursor-pointer ${
                    isSaved ? 'text-[#38bdf8]' : 'hover:text-white'
                  }`}
                >
                  <Bookmark className={`w-4 h-4 ${isSaved ? 'fill-current' : ''}`} />
                  <span className="font-mono">{item.saves + (isSaved ? 1 : 0)}</span>
                </button>
              </div>

              {item.igLikes && (
                <div className="text-xs text-[#9ca3af]">
                  <span className="font-mono tabular-nums">{item.igLikes.toLocaleString()}</span> IG Saves
                </div>
              )}
            </div>
          </div>

          {/* Action Button */}
          <div className="pt-6">
            <button
              onClick={() => {
                onClose();
                onBookThisLook(item);
              }}
              className="w-full py-3 text-xs font-semibold uppercase tracking-wider text-[#0b0c10] bg-[#d4af37] hover:bg-[#e6c158] rounded-md transition-all flex items-center justify-center gap-2 shadow-lg cursor-pointer"
            >
              <Calendar className="w-4 h-4" />
              <span>Book This Exact Look with {item.artistName.split(' ')[0]}</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
