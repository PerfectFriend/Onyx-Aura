import React, { useState } from 'react';
import { 
  Sparkles, 
  ExternalLink, 
  Tag, 
  Check, 
  TrendingUp, 
  Megaphone, 
} from 'lucide-react';
import { SponsoredAd, ThemeMode } from '../types';
import { TranslationStrings } from '../i18n/translations';

interface SponsoredAdsBannerProps {
  ads: SponsoredAd[];
  userRole: 'client' | 'master';
  onOpenAdManager: () => void;
  theme: ThemeMode;
  t: TranslationStrings;
}

export const SponsoredAdsBanner: React.FC<SponsoredAdsBannerProps> = ({
  ads,
  userRole,
  onOpenAdManager,
}) => {
  const [copiedCodeId, setCopiedCodeId] = useState<string | null>(null);

  // Filter ads by current audience
  const targetedAds = ads.filter(ad => 
    ad.isActive && (ad.targetAudience === userRole || ad.targetAudience === 'all')
  );

  const handleCopyCode = (id: string, code: string) => {
    navigator.clipboard?.writeText(code);
    setCopiedCodeId(id);
    setTimeout(() => setCopiedCodeId(null), 3000);
  };

  if (targetedAds.length === 0) return null;

  return (
    <section className="py-8 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
      {/* Header Banner */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 mb-4 pb-2 border-b border-cyan-500/20">
        <div>
          <div className="text-[11px] font-mono text-cyan-400 flex items-center gap-1.5 uppercase">
            <Megaphone className="w-3.5 h-3.5 text-amber-300" />
            <span>
              {userRole === 'master' 
                ? 'Pro Guild Materials & Hardware Marketplace' 
                : 'Curated Beauty Salons & Luxury Spa Partners'}
            </span>
          </div>
          <h3 className="font-display text-lg font-bold text-white mt-0.5">
            {userRole === 'master' 
              ? 'Trade Offers for Certified Nail Masters' 
              : 'Exclusive Salon Packages & VIP Treatments'}
          </h3>
        </div>

        <button
          onClick={onOpenAdManager}
          className="btn-starry-neon text-xs py-1.5 px-3 flex items-center gap-1.5 shrink-0"
        >
          <TrendingUp className="w-3.5 h-3.5 text-cyan-300" />
          <span>Sponsor an Ad / Campaign</span>
        </button>
      </div>

      {/* Grid of Targeted Sponsored Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
        {targetedAds.slice(0, 3).map(ad => (
          <div
            key={ad.id}
            className="gaudi-mosaic-card overflow-hidden group flex flex-col justify-between hover:border-cyan-400 hover:shadow-cyan-500/10 transition-all duration-300"
          >
            <div>
              {/* Ad Banner Image with Raster Frame Touch */}
              <div className="relative aspect-[16/8] overflow-hidden">
                <img
                  src={ad.bannerImage}
                  alt={ad.title}
                  className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                  referrerPolicy="no-referrer"
                  onError={(e) => {
                    e.currentTarget.src = '/assets/images/portfolio_cyber_chrome_1790123880263.jpg';
                  }}
                />
                <div className="absolute inset-0 bg-gradient-to-t from-[#0a0d18] via-transparent to-transparent" />

                {/* Sponsored Badge Pill */}
                <div className="absolute top-2.5 left-2.5 px-2 py-0.5 rounded-full bg-black/75 backdrop-blur-md border border-amber-400/40 text-[9px] font-mono text-amber-300 font-bold flex items-center gap-1">
                  <Sparkles className="w-2.5 h-2.5" />
                  <span>{ad.sponsoredBadge}</span>
                </div>

                {/* Discount Percentage Pill */}
                {ad.discountPercent && (
                  <div className="absolute top-2.5 right-2.5 px-2 py-0.5 rounded-full bg-rose-600 text-white text-[10px] font-mono font-bold shadow-lg">
                    -{ad.discountPercent}% OFF
                  </div>
                )}

                {/* Brand Name on Bottom */}
                <div className="absolute bottom-2 left-3 right-3 text-xs font-semibold text-white truncate">
                  {ad.brandName}
                </div>
              </div>

              {/* Card Body */}
              <div className="p-4 space-y-2">
                <h4 className="font-display text-sm font-bold text-white leading-snug group-hover:text-cyan-300 transition-colors">
                  {ad.title}
                </h4>

                <p className="text-[11px] text-gray-300 line-clamp-2 leading-relaxed">
                  {ad.description}
                </p>
              </div>
            </div>

            {/* Bottom Actions & Promo Code */}
            <div className="p-4 pt-0 space-y-3">
              {ad.discountCode && (
                <div className="flex items-center justify-between p-2 rounded-lg bg-black/40 border border-white/10 text-xs">
                  <div className="flex items-center gap-1.5 font-mono text-[11px] text-gray-300">
                    <Tag className="w-3 h-3 text-amber-400" />
                    <span>Code: <strong className="text-white">{ad.discountCode}</strong></span>
                  </div>
                  <button
                    onClick={() => handleCopyCode(ad.id, ad.discountCode!)}
                    className="text-[10px] font-mono px-2 py-0.5 rounded bg-cyan-500/20 hover:bg-cyan-500/30 text-cyan-300 cursor-pointer transition-colors"
                  >
                    {copiedCodeId === ad.id ? (
                      <span className="flex items-center gap-1 text-emerald-400">
                        <Check className="w-2.5 h-2.5" /> Copied!
                      </span>
                    ) : (
                      'Copy'
                    )}
                  </button>
                </div>
              )}

              <div className="pt-2 border-t border-white/10 flex items-center justify-between">
                <span className="text-[10px] font-mono text-gray-400">
                  {ad.targetAudience === 'master' ? '🛠️ Master Trade Deal' : '✨ Client Beauty Perk'}
                </span>
                <button
                  onClick={() => {
                    if (ad.discountCode) handleCopyCode(ad.id, ad.discountCode);
                  }}
                  className="btn-vangogh-gold text-xs py-1.5 px-3 flex items-center gap-1"
                >
                  <span>{ad.ctaText}</span>
                  <ExternalLink className="w-3 h-3" />
                </button>
              </div>
            </div>

          </div>
        ))}
      </div>
    </section>
  );
};
