import React from 'react';
import { Sparkles, ArrowRight, Eye, Lock, Users, Smartphone } from 'lucide-react';
import { TranslationStrings } from '../i18n/translations';
import { ThemeMode } from '../types';
import { CornerFlourish } from './OrnamentalFlourish';

interface HeroSectionProps {
  onExploreClick: () => void;
  onBookClick: () => void;
  onOpenLedger: () => void;
  onOpenPermissions: () => void;
  theme?: ThemeMode;
  t: TranslationStrings;
}

export const HeroSection: React.FC<HeroSectionProps> = ({
  onExploreClick,
  onBookClick,
  onOpenLedger,
  onOpenPermissions,
  theme = 'dark',
  t,
}) => {
  const isDark = theme === 'dark';

  return (
    <section className={`relative overflow-hidden bg-starry-canvas py-12 md:py-20 border-b ${
      isDark ? 'border-cyan-500/20' : 'border-amber-600/20'
    }`}>
      
      {/* Dynamic Ambient Van Gogh Cosmic Halo & Gaudí Glow */}
      <div className={`absolute top-10 left-1/4 w-96 h-96 rounded-full blur-3xl pointer-events-none animate-pulse ${
        isDark ? 'bg-cyan-500/15' : 'bg-amber-400/15'
      }`} />
      <div className={`absolute bottom-10 right-1/4 w-96 h-96 rounded-full blur-3xl pointer-events-none ${
        isDark ? 'bg-fuchsia-500/15' : 'bg-sky-400/15'
      }`} />
      <div className={`absolute top-1/2 right-1/3 w-80 h-80 rounded-full blur-3xl pointer-events-none ${
        isDark ? 'bg-amber-500/10' : 'bg-amber-300/15'
      }`} />

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 relative z-10">
        
        {/* Editorial Cyber-Gaudí Split */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 lg:gap-12 items-center">
          
          {/* Left Column: Expressive Van Gogh / Gaudí Typography */}
          <div className="lg:col-span-6 space-y-6">
            
            {/* Artistic Badge */}
            <div className={`inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full border text-xs font-mono shadow-md ${
              isDark 
                ? 'bg-gradient-to-r from-cyan-950/80 via-purple-950/80 to-amber-950/80 border-cyan-400/40 text-cyan-300 shadow-cyan-500/10' 
                : 'bg-amber-100/90 border-amber-400/70 text-amber-900 shadow-amber-900/10 font-bold'
            }`}>
              <Sparkles className={`w-3.5 h-3.5 ${isDark ? 'text-amber-300' : 'text-amber-700'}`} />
              <span className="tracking-wider">{t.heroBadge}</span>
            </div>

            {/* Headline with Van Gogh & Gaudí Flourishes */}
            <h1 className={`font-display text-4xl sm:text-5xl lg:text-6xl font-black tracking-tight leading-[1.08] ${
              isDark ? 'text-white' : 'text-slate-900'
            }`}>
              <span className={`text-transparent bg-clip-text ${
                isDark 
                  ? 'bg-gradient-to-r from-amber-300 via-yellow-200 to-amber-400' 
                  : 'bg-gradient-to-r from-amber-800 via-amber-900 to-yellow-800'
              }`}>
                {t.heroTitle1}
              </span>{' '}
              <span className={`text-transparent bg-clip-text ${
                isDark 
                  ? 'bg-gradient-to-r from-cyan-300 via-fuchsia-300 to-purple-300' 
                  : 'bg-gradient-to-r from-sky-700 via-purple-700 to-indigo-900'
              }`}>
                {t.heroTitle2}
              </span>{' '}
              <span className={`block mt-1 ${isDark ? 'text-white' : 'text-slate-900'}`}>
                {t.heroTitle3}
              </span>
            </h1>

            {/* Honest Subtitle */}
            <p className={`text-sm sm:text-base leading-relaxed max-w-xl ${
              isDark ? 'text-gray-300 font-normal' : 'text-slate-700 font-medium'
            }`}>
              {t.heroSubtitle}
            </p>

            {/* Trust Principles Unboxed Grid */}
            <div className={`grid grid-cols-3 gap-3 py-3 border-y text-xs font-mono ${
              isDark ? 'border-cyan-500/20' : 'border-amber-600/25 bg-amber-50/70 rounded-xl px-2'
            }`}>
              <div className="space-y-0.5">
                <span className={`font-bold flex items-center gap-1 ${isDark ? 'text-amber-300' : 'text-amber-800'}`}>
                  <Eye className={`w-3 h-3 ${isDark ? 'text-amber-400' : 'text-amber-700'}`} />
                  <span>Public Art Stream</span>
                </span>
                <p className={`text-[11px] ${isDark ? 'text-gray-400' : 'text-slate-600 font-medium'}`}>Open gallery showcase</p>
              </div>

              <button
                type="button"
                onClick={onOpenLedger}
                className={`space-y-0.5 border-x px-2 text-left cursor-pointer ${isDark ? 'border-cyan-500/20' : 'border-amber-600/25'}`}
              >
                <span className={`font-bold flex items-center gap-1 ${isDark ? 'text-cyan-300' : 'text-sky-800'}`}>
                  <Lock className={`w-3 h-3 ${isDark ? 'text-cyan-400' : 'text-sky-700'}`} />
                  <span>Chat & Deposit [SIM]</span>
                </span>
                <p className={`text-[11px] ${isDark ? 'text-gray-400' : 'text-slate-600 font-medium'}`}>Session preview mode</p>
              </button>

              <div className="space-y-0.5">
                <span className={`font-bold flex items-center gap-1 ${isDark ? 'text-fuchsia-300' : 'text-purple-800'}`}>
                  <Users className={`w-3 h-3 ${isDark ? 'text-fuchsia-400' : 'text-purple-700'}`} />
                  <span>Friend Jury [SIM]</span>
                </span>
                <p className={`text-[11px] ${isDark ? 'text-gray-400' : 'text-slate-600 font-medium'}`}>Circle consensus demo</p>
              </div>
            </div>

            {/* Primary Action Buttons */}
            <div className="flex flex-wrap items-center gap-3 pt-2">
              <button
                onClick={onBookClick}
                className="btn-vangogh-gold text-xs sm:text-sm py-3 px-6 shadow-xl"
              >
                <span>{t.bookSession}</span>
                <ArrowRight className="w-4 h-4 ml-2" />
              </button>

              <button
                onClick={onExploreClick}
                className="btn-starry-neon text-xs sm:text-sm py-3 px-5"
              >
                <Sparkles className="w-4 h-4 text-cyan-300 mr-2" />
                <span>{t.exploreCollection}</span>
              </button>

              <button
                onClick={onOpenPermissions}
                className={`p-3 rounded-xl border transition-colors text-xs font-mono flex items-center gap-1.5 cursor-pointer ${
                  isDark 
                    ? 'bg-[#0c101c] border-cyan-500/30 text-cyan-300 hover:border-cyan-400' 
                    : 'bg-white border-amber-400/60 text-slate-800 hover:border-amber-600 shadow-sm font-semibold'
                }`}
                title="Android APK / Permissions"
              >
                <Smartphone className={`w-4 h-4 ${isDark ? 'text-amber-300' : 'text-amber-700'}`} />
                <span className="hidden sm:inline">Android Ready</span>
              </button>
            </div>

          </div>

          {/* Right Column: Hero Art Showcase in Gaudí Organic Mosaic Frame */}
          <div className="lg:col-span-6 relative">
            
            {/* Decorative Parabolic Arched Aura Glow */}
            <div className="absolute -inset-1.5 bg-gradient-to-r from-[#00f3ff] via-[#d946ef] to-[#fbbf24] rounded-3xl blur-md opacity-40 group-hover:opacity-75 transition duration-1000" />

            <div className={`relative rounded-2xl overflow-hidden gaudi-mosaic-card border-2 shadow-2xl group ${
              isDark ? 'border-amber-400/40' : 'border-amber-500/40'
            }`}>
              <CornerFlourish position="top-left" className="absolute top-2 left-2 z-10" size={38} />
              <CornerFlourish position="top-right" className="absolute top-2 right-2 z-10" size={38} />

              <img
                src="/assets/images/hero_nailix_cyber_gaudi_1790126105708.jpg"
                alt="Nailix Exquisite Haute Manicure Art"
                className="w-full h-[400px] sm:h-[480px] object-cover group-hover:scale-105 transition-transform duration-700 ease-out"
                referrerPolicy="no-referrer"
                onError={(e) => {
                  e.currentTarget.src = '/assets/images/portfolio_gaudi_mosaic_nails_1790126128212.jpg';
                }}
              />

              {/* Stained Glass Mosaic Refraction Card Overlay */}
              <div className="absolute bottom-0 inset-x-0 p-5 bg-gradient-to-t from-[#07080e] via-[#07080e]/85 to-transparent backdrop-blur-sm border-t border-cyan-400/30 space-y-2 text-white">
                <div className="flex items-center justify-between text-xs">
                  <span className="text-[11px] font-mono text-cyan-300 flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-full bg-amber-400 animate-ping" />
                    <span>HAUTE PIECE #001 · ROYAL ORNAMENT</span>
                  </span>
                  <span className="gaudi-organic-tag text-[10px] text-amber-300">
                    Hand-Sculpted Porcelain & Platinum
                  </span>
                </div>

                <div className="flex items-baseline justify-between">
                  <div>
                    <h3 className="font-display text-lg font-bold text-white">
                      Celestial Gold Filigree on Obsidian Stilettos
                    </h3>
                    <p className="text-xs text-gray-300 font-mono">
                      Master Mateo Rossi · Barcelona Atelier
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="font-mono text-lg font-bold text-amber-300">$185 USD</p>
                    <p className="text-[10px] text-cyan-400 font-mono">~0.062 ETH</p>
                  </div>
                </div>
              </div>
            </div>

          </div>

        </div>

      </div>
    </section>
  );
};
