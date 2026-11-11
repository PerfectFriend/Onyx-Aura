import React, { useState } from 'react';
import { 
  X, 
  Megaphone, 
  TrendingUp, 
  Coins, 
  CheckCircle2, 
  BarChart3, 
  Eye, 
  MousePointer, 
  ShieldCheck, 
  Plus,
  Sparkles,
  Zap
} from 'lucide-react';
import { SponsoredAd, AdTargetAudience, AdCategory, ThemeMode } from '../types';
import { TranslationStrings } from '../i18n/translations';

interface AdCampaignManagerModalProps {
  isOpen: boolean;
  onClose: () => void;
  ads: SponsoredAd[];
  onCreateCampaign: (newAd: SponsoredAd) => void;
  theme: ThemeMode;
  t: TranslationStrings;
}

export const AdCampaignManagerModal: React.FC<AdCampaignManagerModalProps> = ({
  isOpen,
  onClose,
  ads,
  onCreateCampaign,
  theme,
  t,
}) => {
  if (!isOpen) return null;

  const isDark = theme === 'dark';
  const [activeTab, setActiveTab] = useState<'create' | 'analytics'>('create');
  
  // Form state
  const [title, setTitle] = useState('');
  const [brandName, setBrandName] = useState('');
  const [tagline, setTagline] = useState('');
  const [description, setDescription] = useState('');
  const [targetAudience, setTargetAudience] = useState<AdTargetAudience>('client');
  const [category, setCategory] = useState<AdCategory>('salon_spa');
  const [bannerImage, setBannerImage] = useState('/assets/images/ad_gilded_leaf.jpg');
  const [ctaText, setCtaText] = useState('Claim Exclusive Offer');
  const [discountCode, setDiscountCode] = useState('NAILIX20');
  const [discountPercent, setDiscountPercent] = useState<number>(20);
  const [bidPerClickNAIL, setBidPerClickNAIL] = useState<number>(15);
  const [depositAmountNAIL, setDepositAmountNAIL] = useState<number>(500);
  const [successToast, setSuccessToast] = useState(false);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim() || !brandName.trim()) return;

    const newAd: SponsoredAd = {
      id: `ad-${Date.now()}`,
      title: title.trim(),
      brandName: brandName.trim(),
      tagline: tagline.trim() || 'Exclusive Verified Partner',
      description: description.trim() || 'Official partner promotion on Nailix Network.',
      targetAudience,
      category,
      bannerImage: bannerImage.trim() || '/assets/images/ad_lumina_chrome.jpg',
      ctaText: ctaText.trim() || 'Learn More',
      discountCode: discountCode.trim() || undefined,
      discountPercent: discountPercent > 0 ? discountPercent : undefined,
      bidPerClickNAIL,
      impressions: 1,
      clicks: 0,
      isActive: true,
      sponsoredBadge: targetAudience === 'master' ? 'VERIFIED HARDWARE' : 'PREMIER SALON',
    };

    onCreateCampaign(newAd);
    setSuccessToast(true);
    setTimeout(() => {
      setSuccessToast(false);
      onClose();
    }, 2000);
  };

  const totalImpressions = ads.reduce((sum, a) => sum + a.impressions, 0);
  const totalClicks = ads.reduce((sum, a) => sum + a.clicks, 0);
  const avgCTR = totalImpressions > 0 ? ((totalClicks / totalImpressions) * 100).toFixed(2) : '0';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6 bg-black/80 backdrop-blur-md">
      <div 
        className={`relative w-full max-w-2xl gaudi-mosaic-card border-2 shadow-2xl flex flex-col max-h-[92vh] overflow-hidden ${
          isDark 
            ? 'border-cyan-400/50 shadow-cyan-950/40' 
            : 'border-amber-500/50 shadow-amber-900/20 bg-white text-slate-800'
        }`}
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className={`flex items-center justify-between px-6 py-4 border-b ${
          isDark 
            ? 'border-cyan-500/20 bg-gradient-to-r from-cyan-950/60 via-purple-950/50 to-slate-950' 
            : 'border-amber-300 bg-gradient-to-r from-amber-100 via-sky-50 to-amber-50'
        }`}>
          <div>
            <div className={`text-xs font-mono flex items-center gap-1.5 font-bold ${
              isDark ? 'text-amber-300' : 'text-amber-800'
            }`}>
              <Megaphone className="w-3.5 h-3.5" />
              <span>NAILIX ADVERTISING ENGINE · BID WITH $NAIL OR FIAT</span>
            </div>
            <h2 className={`font-display text-lg font-bold ${
              isDark ? 'text-white' : 'text-slate-900'
            }`}>
              Sponsor an In-App Campaign
            </h2>
          </div>
          <button
            onClick={onClose}
            className={`p-1.5 rounded-full transition-colors cursor-pointer ${
              isDark ? 'text-gray-400 hover:text-white hover:bg-white/10' : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200'
            }`}
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Tab switch: New Campaign vs Live Performance */}
        <div className={`flex border-b ${
          isDark ? 'border-cyan-500/20 bg-[#070912]' : 'border-slate-200 bg-slate-100'
        }`}>
          <button
            onClick={() => setActiveTab('create')}
            className={`flex-1 py-3 text-xs font-semibold text-center cursor-pointer transition-colors ${
              activeTab === 'create'
                ? isDark 
                  ? 'border-b-2 border-cyan-400 text-cyan-300 bg-cyan-950/20 font-bold' 
                  : 'border-b-2 border-amber-600 text-amber-900 bg-amber-50 font-bold'
                : isDark ? 'text-gray-400 hover:text-white' : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            🚀 Launch New Ad
          </button>
          <button
            onClick={() => setActiveTab('analytics')}
            className={`flex-1 py-3 text-xs font-semibold text-center cursor-pointer transition-colors ${
              activeTab === 'analytics'
                ? isDark 
                  ? 'border-b-2 border-cyan-400 text-cyan-300 bg-cyan-950/20 font-bold' 
                  : 'border-b-2 border-amber-600 text-amber-900 bg-amber-50 font-bold'
                : isDark ? 'text-gray-400 hover:text-white' : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            📊 Network Ad Performance & CTR
          </button>
        </div>

        {/* Success Banner */}
        {successToast && (
          <div className="p-4 bg-emerald-950/80 border-b border-emerald-500/40 text-emerald-300 text-xs font-mono flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-400" />
            <span>Campaign launched! Targeted banners are now circulating through the P2P swarm.</span>
          </div>
        )}

        {/* Content Body */}
        {activeTab === 'create' ? (
          <form onSubmit={handleSubmit} className="p-6 overflow-y-auto space-y-4 text-xs">
            {/* Target Audience Segment Selection */}
            <div>
              <label className="block text-gray-300 font-semibold mb-1">
                Target Audience Segment <span className="text-rose-400">*</span>
              </label>
              <div className="grid grid-cols-2 gap-3">
                <button
                  type="button"
                  onClick={() => {
                    setTargetAudience('client');
                    setCategory('salon_spa');
                  }}
                  className={`p-3 rounded-xl border text-left cursor-pointer transition-all ${
                    targetAudience === 'client'
                      ? 'border-cyan-400 bg-cyan-950/40 text-white shadow-md'
                      : 'border-white/10 bg-black/40 text-gray-400'
                  }`}
                >
                  <p className="font-bold text-cyan-300 text-xs">Clients (Consumers)</p>
                  <p className="text-[11px] text-gray-400 mt-0.5">
                    Promote local beauty salons, SPA packages, lashes, luxury pedicures.
                  </p>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setTargetAudience('master');
                    setCategory('tools_supplies');
                  }}
                  className={`p-3 rounded-xl border text-left cursor-pointer transition-all ${
                    targetAudience === 'master'
                      ? 'border-amber-400 bg-amber-950/40 text-white shadow-md'
                      : 'border-white/10 bg-black/40 text-gray-400'
                  }`}
                >
                  <p className="font-bold text-amber-300 text-xs">Nail Masters (Artisans)</p>
                  <p className="text-[11px] text-gray-400 mt-0.5">
                    Promote professional e-files, dry heat autoclaves, chrome pigments, lamps.
                  </p>
                </button>
              </div>
            </div>

            {/* Campaign Title & Brand */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-gray-300 mb-1">Brand or Salon Name</label>
                <input
                  type="text"
                  required
                  value={brandName}
                  onChange={e => setBrandName(e.target.value)}
                  placeholder="e.g. Royal Atelier Spa or Gold Velvet Tools"
                  className="w-full px-3 py-2 rounded-lg bg-black/50 border border-white/20 text-white"
                />
              </div>

              <div>
                <label className="block text-gray-300 mb-1">Campaign Headline</label>
                <input
                  type="text"
                  required
                  value={title}
                  onChange={e => setTitle(e.target.value)}
                  placeholder="e.g. 20% Off Hospital-Grade E-Files"
                  className="w-full px-3 py-2 rounded-lg bg-black/50 border border-white/20 text-white"
                />
              </div>
            </div>

            {/* Description */}
            <div>
              <label className="block text-gray-300 mb-1">Offer Details & Copy</label>
              <textarea
                rows={2}
                value={description}
                onChange={e => setDescription(e.target.value)}
                placeholder="Describe your promotion, certification, warranty, or luxury treatment..."
                className="w-full px-3 py-2 rounded-lg bg-black/50 border border-white/20 text-white"
              />
            </div>

            {/* Promo Code & Discount */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <label className="block text-gray-300 mb-1">Promo Code</label>
                <input
                  type="text"
                  value={discountCode}
                  onChange={e => setDiscountCode(e.target.value)}
                  placeholder="NAILIX20"
                  className="w-full px-3 py-2 rounded-lg bg-black/50 border border-white/20 text-white font-mono"
                />
              </div>
              <div>
                <label className="block text-gray-300 mb-1">Discount (% Off)</label>
                <input
                  type="number"
                  min="0"
                  max="90"
                  value={discountPercent}
                  onChange={e => setDiscountPercent(Number(e.target.value))}
                  className="w-full px-3 py-2 rounded-lg bg-black/50 border border-white/20 text-white font-mono"
                />
              </div>
              <div>
                <label className="block text-gray-300 mb-1">Button Call to Action</label>
                <input
                  type="text"
                  value={ctaText}
                  onChange={e => setCtaText(e.target.value)}
                  placeholder="Claim Deal"
                  className="w-full px-3 py-2 rounded-lg bg-black/50 border border-white/20 text-white"
                />
              </div>
            </div>

            {/* Bidding in $NAIL or Escrow */}
            <div className="p-3.5 rounded-xl bg-cyan-950/30 border border-cyan-500/30 space-y-2">
              <div className="flex items-center justify-between">
                <span className="font-semibold text-cyan-300 flex items-center gap-1.5">
                  <Coins className="w-4 h-4 text-amber-300" />
                  <span>Staked Bid per Verified Click:</span>
                </span>
                <span className="font-mono font-bold text-amber-300 text-sm">
                  {bidPerClickNAIL} $NAIL (~${(bidPerClickNAIL * 0.22).toFixed(2)})
                </span>
              </div>
              <input
                type="range"
                min="5"
                max="50"
                value={bidPerClickNAIL}
                onChange={e => setBidPerClickNAIL(Number(e.target.value))}
                className="w-full accent-cyan-400"
              />
              <p className="text-[10px] text-gray-400 font-mono">
                Higher bids prioritize your banner in the top 3 slots of the Art Gallery and Proximity Map.
              </p>
            </div>

            {/* Submit */}
            <div className="pt-2">
              <button
                type="submit"
                className="w-full btn-vangogh-gold py-3 text-xs font-bold uppercase tracking-wider flex items-center justify-center gap-2 shadow-xl"
              >
                <Zap className="w-4 h-4" />
                <span>Deposit Escrow & Launch Campaign</span>
              </button>
            </div>
          </form>
        ) : (
          /* Analytics & Live Impressions Tab */
          <div className="p-6 overflow-y-auto space-y-6 text-xs">
            {/* High-level metrics */}
            <div className="grid grid-cols-3 gap-3">
              <div className="p-3 rounded-xl bg-black/40 border border-white/10 text-center font-mono">
                <p className="text-[10px] text-gray-400 uppercase">Total Impressions</p>
                <p className="text-base font-bold text-cyan-300">{totalImpressions.toLocaleString()}</p>
              </div>
              <div className="p-3 rounded-xl bg-black/40 border border-white/10 text-center font-mono">
                <p className="text-[10px] text-gray-400 uppercase">Total Clicks</p>
                <p className="text-base font-bold text-amber-300">{totalClicks.toLocaleString()}</p>
              </div>
              <div className="p-3 rounded-xl bg-black/40 border border-white/10 text-center font-mono">
                <p className="text-[10px] text-gray-400 uppercase">Avg. CTR</p>
                <p className="text-base font-bold text-emerald-400">{avgCTR}%</p>
              </div>
            </div>

            {/* List of active ads */}
            <div className="space-y-3">
              <h4 className="font-semibold text-white">Active Network Campaigns ({ads.length})</h4>
              {ads.map(ad => (
                <div key={ad.id} className="p-3 rounded-xl bg-black/40 border border-white/10 flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-semibold text-white truncate">{ad.title}</p>
                    <p className="text-[11px] text-gray-400">{ad.brandName} · Target: <span className="text-cyan-300 uppercase">{ad.targetAudience}</span></p>
                  </div>
                  <div className="text-right font-mono text-[11px] shrink-0">
                    <p className="text-cyan-300">{ad.clicks} clicks / {ad.impressions} views</p>
                    <p className="text-emerald-400 font-bold">{ad.bidPerClickNAIL} $NAIL / click</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
