import React, { useState } from 'react';
import { Heart, Bookmark, Calendar, ShieldCheck, Users, Flag, Eye } from 'lucide-react';
import { PortfolioItem, ServiceCategory, ThemeMode } from '../types';
import { TranslationStrings } from '../i18n/translations';

interface PortfolioGalleryProps {
  items: PortfolioItem[];
  onSelectItem: (item: PortfolioItem) => void;
  onBookItem: (item: PortfolioItem) => void;
  likedIds: Set<string>;
  onToggleLike: (id: string) => void;
  savedIds: Set<string>;
  onToggleSave: (id: string) => void;
  onFlagToJury?: (item: PortfolioItem) => void;
  theme?: ThemeMode;
  t: TranslationStrings;
}

const CATEGORIES: (ServiceCategory | 'All Styles')[] = [
  'All Styles',
  'Sculptural 3D Chrome',
  'Japanese Glass Aura',
  'Russian E-File Precision',
  'Gothic Velvet Cat-Eye',
  'Baroque Gold Leaf Art',
];

export const PortfolioGallery: React.FC<PortfolioGalleryProps> = ({
  items,
  onSelectItem,
  onBookItem,
  likedIds,
  onToggleLike,
  savedIds,
  onToggleSave,
  onFlagToJury,
  theme = 'dark',
  t,
}) => {
  const isDark = theme === 'dark';
  const [selectedCategory, setSelectedCategory] = useState<ServiceCategory | 'All Styles'>('All Styles');
  const [flaggedToast, setFlaggedToast] = useState<string | null>(null);

  const filteredItems = selectedCategory === 'All Styles'
    ? items
    : items.filter(item => item.category === selectedCategory);

  const handleReport = (item: PortfolioItem) => {
    if (onFlagToJury) onFlagToJury(item);
    setFlaggedToast(`Artwork "${item.title}" forwarded to your Friend Jury Circle for review!`);
    setTimeout(() => setFlaggedToast(null), 5000);
  };

  return (
    <section className="py-14 bg-starry-canvas relative">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 space-y-8">
        
        {/* Section Header */}
        <div className={`flex flex-col md:flex-row md:items-end justify-between gap-6 pb-6 border-b ${
          isDark ? 'border-cyan-500/20' : 'border-amber-600/20'
        }`}>
          <div>
            <div className={`text-xs font-mono flex items-center gap-2 mb-1.5 font-bold ${
              isDark ? 'text-cyan-400' : 'text-sky-800'
            }`}>
              <span className={`p-1 rounded-md ${isDark ? 'bg-cyan-400/20 text-cyan-300' : 'bg-sky-100 text-sky-800'}`}>
                <Eye className="w-3.5 h-3.5" />
              </span>
              <span>{t.publicArtNote}</span>
            </div>
            <h2 className={`font-display text-2xl sm:text-3xl font-bold tracking-tight ${
              isDark ? 'text-white' : 'text-slate-900'
            }`}>
              {t.galleryTitle}
            </h2>
            <p className={`text-xs mt-1 max-w-2xl ${
              isDark ? 'text-gray-300' : 'text-slate-700 font-medium'
            }`}>
              {t.gallerySubtitle}
            </p>
          </div>

          {/* Interactive Category Filter Tabs */}
          <div className={`flex items-center gap-1.5 p-1 rounded-xl border overflow-x-auto max-w-full ${
            isDark ? 'bg-[#090d1a] border-cyan-500/30' : 'bg-slate-200/90 border-slate-300 shadow-inner'
          }`}>
            {CATEGORIES.map(cat => (
              <button
                key={cat}
                onClick={() => setSelectedCategory(cat)}
                className={`px-3 py-1.5 text-xs font-semibold rounded-lg whitespace-nowrap transition-all cursor-pointer ${
                  selectedCategory === cat
                    ? isDark
                      ? 'bg-gradient-to-r from-cyan-500 to-blue-600 text-white shadow-md'
                      : 'bg-gradient-to-r from-sky-700 to-indigo-800 text-white shadow-md font-bold'
                    : isDark 
                      ? 'text-gray-400 hover:text-white' 
                      : 'text-slate-700 hover:text-slate-900 hover:bg-white/60'
                }`}
              >
                {cat === 'All Styles' ? t.allCategories : cat}
              </button>
            ))}
          </div>
        </div>

        {/* Flagged toast feedback */}
        {flaggedToast && (
          <div className="p-3 rounded-xl bg-amber-950/70 border border-amber-500/40 text-xs font-mono text-amber-200 flex items-center gap-2 animate-in fade-in">
            <Users className="w-4 h-4 text-amber-400" />
            <span>{flaggedToast}</span>
          </div>
        )}

        {/* Gallery Bento Grid with Haute Couture Ornament Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {filteredItems.map((item, index) => {
            const isLiked = likedIds.has(item.id);
            const isSaved = savedIds.has(item.id);
            const isLarge = index === 0; // Primary showcase card

            return (
              <div
                key={item.id}
                className={`group relative gaudi-mosaic-card transition-all duration-300 hover:border-cyan-400 hover:shadow-2xl hover:shadow-cyan-500/10 flex flex-col justify-between ${
                  isLarge ? 'md:col-span-2 md:row-span-2' : ''
                }`}
              >
                {/* Image Container */}
                <div>
                  <div 
                    className={`relative overflow-hidden cursor-pointer ${
                      isLarge ? 'aspect-[16/10] md:aspect-[16/11]' : 'aspect-[4/3]'
                    }`}
                    onClick={() => onSelectItem(item)}
                  >
                    <img
                      src={item.image}
                      alt={item.title}
                      className="w-full h-full object-cover transition-transform duration-700 ease-out group-hover:scale-105"
                      referrerPolicy="no-referrer"
                      loading="lazy"
                      onError={(e) => {
                        e.currentTarget.src = '/assets/images/portfolio_gaudi_mosaic_nails_1790126128212.jpg';
                      }}
                    />
                    
                    {/* Top Floating Action Pill with Gaudí Mosaic Glass */}
                    <div className="absolute top-3 right-3 flex items-center gap-1.5 opacity-90 group-hover:opacity-100 transition-opacity">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          onToggleLike(item.id);
                        }}
                        className={`p-2 rounded-full backdrop-blur-md transition-all cursor-pointer ${
                          isLiked
                            ? 'bg-rose-600 text-white shadow-lg shadow-rose-500/40'
                            : 'bg-black/60 text-gray-200 hover:text-white hover:bg-black/80'
                        }`}
                        title="Like"
                      >
                        <Heart className={`w-3.5 h-3.5 ${isLiked ? 'fill-current' : ''}`} />
                      </button>

                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          onToggleSave(item.id);
                        }}
                        className={`p-2 rounded-full backdrop-blur-md transition-all cursor-pointer ${
                          isSaved
                            ? 'bg-cyan-500 text-black font-bold shadow-lg shadow-cyan-500/40'
                            : 'bg-black/60 text-gray-200 hover:text-white hover:bg-black/80'
                        }`}
                        title="Save to Vault"
                      >
                        <Bookmark className={`w-3.5 h-3.5 ${isSaved ? 'fill-current' : ''}`} />
                      </button>

                      {/* Flag to Friend Jury Button */}
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleReport(item);
                        }}
                        className="p-2 rounded-full backdrop-blur-md bg-black/60 text-amber-300 hover:bg-amber-900/60 hover:text-amber-200 transition-all cursor-pointer"
                        title="Submit to Friend Jury for review"
                      >
                        <Flag className="w-3.5 h-3.5" />
                      </button>
                    </div>

                    {/* Bottom Artist Overlay */}
                    <div className="absolute bottom-0 inset-x-0 p-3 bg-gradient-to-t from-[#0a0d18] via-[#0a0d18]/70 to-transparent flex items-center justify-between text-white text-xs">
                      <div className="flex items-center gap-2">
                        <img
                          src={item.artistAvatar}
                          alt={item.artistName}
                          className="w-6 h-6 rounded-full object-cover ring-1 ring-cyan-400/50"
                          referrerPolicy="no-referrer"
                          onError={(e) => {
                            e.currentTarget.src = '/assets/images/avatar_master_artist_1790123890131.jpg';
                          }}
                        />
                        <span className="font-semibold truncate">{item.artistName}</span>
                      </div>
                      <span className="font-mono text-amber-300 font-bold">${item.priceUSD} USD</span>
                    </div>
                  </div>

                  {/* Card Body */}
                  <div className="p-5 space-y-3">
                    <div className="flex items-center gap-2 text-xs text-gray-400 font-mono">
                      <span className="text-cyan-300">{item.category}</span>
                      <span aria-hidden="true">·</span>
                      <span>{item.durationMinutes}m slot</span>
                    </div>

                    <h3 
                      onClick={() => onSelectItem(item)}
                      className={`font-display text-base font-bold transition-colors cursor-pointer ${
                        isDark ? 'text-white group-hover:text-amber-300' : 'text-slate-900 group-hover:text-amber-800'
                      }`}
                    >
                      {item.title}
                    </h3>

                    <p className={`text-xs line-clamp-2 leading-relaxed ${
                      isDark ? 'text-gray-300' : 'text-slate-600'
                    }`}>
                      {item.description}
                    </p>
                  </div>
                </div>

                {/* Bottom Card Controls */}
                <div className="p-5 pt-0 flex items-center justify-between border-t border-cyan-500/15 text-xs">
                  <div className="flex items-center gap-3 text-gray-400 font-mono pt-3">
                    <span className="flex items-center gap-1">
                      <Heart className="w-3.5 h-3.5 text-rose-500" />
                      <span>{item.likes + (isLiked ? 1 : 0)}</span>
                    </span>
                    <span className="flex items-center gap-1 text-cyan-400">
                      <ShieldCheck className="w-3.5 h-3.5" />
                      <span>Public P2P</span>
                    </span>
                  </div>

                  <div className="pt-3">
                    <button
                      onClick={() => onBookItem(item)}
                      className="btn-vangogh-gold text-xs py-1.5 px-3.5 flex items-center gap-1.5"
                    >
                      <Calendar className="w-3 h-3" />
                      <span>{t.bookThisLook}</span>
                    </button>
                  </div>
                </div>

              </div>
            );
          })}
        </div>

      </div>
    </section>
  );
};
