import React from 'react';
import { Sparkles, Check, X, Sliders, Image as ImageIcon } from 'lucide-react';
import { WallpaperTheme } from '../types';
import { triggerHaptic } from '../utils/haptics';

interface CornerFlourishProps {
  position?: 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right';
  className?: string;
  size?: number;
}

export const CornerFlourish: React.FC<CornerFlourishProps> = ({
  position = 'top-left',
  className = '',
  size = 36,
}) => {
  const transform =
    position === 'top-right'
      ? 'scale(-1, 1)'
      : position === 'bottom-left'
      ? 'scale(1, -1)'
      : position === 'bottom-right'
      ? 'scale(-1, -1)'
      : 'none';

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 48 48"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={`pointer-events-none select-none opacity-80 ${className}`}
      style={{ transform }}
      aria-hidden="true"
    >
      <path
        d="M3 45V15C3 8.37258 8.37258 3 15 3H45"
        stroke="url(#goldGradient)"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
      <path
        d="M7 45V18C7 11.9249 11.9249 7 18 7H45"
        stroke="url(#goldGradient)"
        strokeWidth="0.8"
        strokeOpacity="0.6"
        strokeLinecap="round"
      />
      {/* Decorative filigree curls */}
      <path
        d="M15 15C15 11 19 9 22 12C24 14 22 18 19 18C16 18 13 14 15 9"
        stroke="url(#goldGradient)"
        strokeWidth="1"
        strokeLinecap="round"
      />
      <circle cx="15" cy="15" r="2" fill="url(#cyanGemGradient)" />
      <circle cx="28" cy="7" r="1.5" fill="url(#goldGradient)" />
      <circle cx="7" cy="28" r="1.5" fill="url(#goldGradient)" />
      
      <defs>
        <linearGradient id="goldGradient" x1="0" y1="0" x2="48" y2="48" gradientUnits="userSpaceOnUse">
          <stop stopColor="#fde68a" />
          <stop offset="0.5" stopColor="#d97706" />
          <stop offset="1" stopColor="#f59e0b" />
        </linearGradient>
        <linearGradient id="cyanGemGradient" x1="13" y1="13" x2="17" y2="17" gradientUnits="userSpaceOnUse">
          <stop stopColor="#67e8f9" />
          <stop offset="1" stopColor="#0891b2" />
        </linearGradient>
      </defs>
    </svg>
  );
};

interface OrnamentDividerProps {
  className?: string;
}

export const OrnamentDivider: React.FC<OrnamentDividerProps> = ({ className = '' }) => {
  return (
    <div className={`flex items-center justify-center my-6 select-none ${className}`} aria-hidden="true">
      <div className="h-[1px] flex-1 max-w-[120px] bg-gradient-to-r from-transparent via-amber-400/40 to-amber-400" />
      <svg
        width="64"
        height="20"
        viewBox="0 0 64 20"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        className="mx-3 opacity-90 shrink-0"
      >
        <path
          d="M2 10C12 10 18 4 24 10C30 16 34 10 32 10C30 10 34 16 40 10C46 4 52 10 62 10"
          stroke="url(#divGold)"
          strokeWidth="1.2"
          strokeLinecap="round"
        />
        <circle cx="32" cy="10" r="3.5" fill="url(#divGem)" stroke="#fef08a" strokeWidth="0.8" />
        <circle cx="16" cy="10" r="1.5" fill="#f59e0b" />
        <circle cx="48" cy="10" r="1.5" fill="#f59e0b" />
        <defs>
          <linearGradient id="divGold" x1="0" y1="0" x2="64" y2="0" gradientUnits="userSpaceOnUse">
            <stop stopColor="#fde047" />
            <stop offset="0.5" stopColor="#d97706" />
            <stop offset="1" stopColor="#fde047" />
          </linearGradient>
          <linearGradient id="divGem" x1="28" y1="6" x2="36" y2="14" gradientUnits="userSpaceOnUse">
            <stop stopColor="#38bdf8" />
            <stop offset="1" stopColor="#0284c7" />
          </linearGradient>
        </defs>
      </svg>
      <div className="h-[1px] flex-1 max-w-[120px] bg-gradient-to-l from-transparent via-amber-400/40 to-amber-400" />
    </div>
  );
};

export interface WallpaperOption {
  id: WallpaperTheme;
  title: string;
  subtitle: string;
  darkImage: string;
  lightImage: string;
  accent: string;
}

export const WALLPAPER_OPTIONS: WallpaperOption[] = [
  {
    id: 'damask',
    title: 'Королевский Дамаск',
    subtitle: 'Роскошный классический орнамент с золотым тиснением',
    darkImage: '/assets/images/bg_ornament_dark_1790127006702.jpg',
    lightImage: '/assets/images/bg_ornament_light_1790127019356.jpg',
    accent: '#f59e0b',
  },
  {
    id: 'filigree',
    title: 'Золотая Филигрань',
    subtitle: 'Тончайшая кружевная вязь с драгоценными переливами',
    darkImage: '/assets/images/frame_ornament_border_1790127030568.jpg',
    lightImage: '/assets/images/bg_ornament_light_1790127019356.jpg',
    accent: '#38bdf8',
  },
  {
    id: 'mosaic',
    title: 'Бархатная Мозаика',
    subtitle: 'Глубокие переливы керамических граней и шелка',
    darkImage: '/assets/images/button_ornament_texture_1790127041006.jpg',
    lightImage: '/assets/images/bg_ornament_light_1790127019356.jpg',
    accent: '#d946ef',
  },
  {
    id: 'minimal',
    title: 'Глубокий Обсидиан',
    subtitle: 'Сдержанный бархатно-атласный фон без контрастных узоров',
    darkImage: '',
    lightImage: '',
    accent: '#94a3b8',
  },
];

interface WallpaperModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentWallpaper: WallpaperTheme;
  onSelectWallpaper: (wp: WallpaperTheme) => void;
  theme: 'dark' | 'light';
}

export const WallpaperModal: React.FC<WallpaperModalProps> = ({
  isOpen,
  onClose,
  currentWallpaper,
  onSelectWallpaper,
  theme,
}) => {
  if (!isOpen) return null;
  const isDark = theme === 'dark';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-fade-in">
      <div 
        className="relative w-full max-w-xl rounded-2xl overflow-hidden border-2 shadow-2xl transition-all"
        style={{
          background: isDark 
            ? 'linear-gradient(145deg, #0b0f1a 0%, #070912 100%)' 
            : 'linear-gradient(145deg, #ffffff 0%, #fefcf3 100%)',
          borderColor: isDark ? 'rgba(245, 158, 11, 0.4)' : 'rgba(217, 119, 6, 0.5)',
          boxShadow: '0 25px 60px -15px rgba(0,0,0,0.7)',
        }}
      >
        {/* Corner Flourishes */}
        <CornerFlourish position="top-left" className="absolute top-2 left-2" size={40} />
        <CornerFlourish position="top-right" className="absolute top-2 right-2" size={40} />

        {/* Modal Header */}
        <div className="p-6 border-b border-amber-500/20 flex items-center justify-between relative z-10">
          <div className="flex items-center gap-3">
            <div className={`p-2.5 rounded-xl border flex items-center justify-center ${
              isDark ? 'bg-amber-400/20 border-amber-400/40 text-amber-300' : 'bg-amber-100 border-amber-400 text-amber-900'
            }`}>
              <ImageIcon className="w-5 h-5" />
            </div>
            <div>
              <h2 className="font-display font-bold text-lg">Обои и Орнаменты</h2>
              <p className="text-xs text-gray-400">Выберите узор фоновых обоев и художественное оформление</p>
            </div>
          </div>

          <button
            onClick={onClose}
            className={`p-2 rounded-xl border transition-colors cursor-pointer ${
              isDark ? 'bg-white/5 border-white/10 hover:bg-white/10 text-gray-300' : 'bg-slate-100 border-slate-300 hover:bg-slate-200 text-slate-800'
            }`}
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Wallpaper Grid */}
        <div className="p-6 space-y-4 max-h-[70vh] overflow-y-auto">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
            {WALLPAPER_OPTIONS.map((opt) => {
              const isSelected = currentWallpaper === opt.id;
              const bgImg = isDark ? opt.darkImage : opt.lightImage;

              return (
                <button
                  key={opt.id}
                  onClick={() => {
                    triggerHaptic('selection');
                    onSelectWallpaper(opt.id);
                  }}
                  className={`group relative rounded-xl border-2 text-left p-3.5 transition-all overflow-hidden cursor-pointer ${
                    isSelected
                      ? 'border-amber-400 shadow-lg shadow-amber-500/20 ring-2 ring-amber-400/50'
                      : isDark
                      ? 'border-white/10 hover:border-amber-400/50 bg-black/40'
                      : 'border-slate-200 hover:border-amber-500/60 bg-white'
                  }`}
                >
                  {/* Mini Preview Texture Backdrop */}
                  {bgImg ? (
                    <div
                      className="absolute inset-0 opacity-20 group-hover:opacity-30 transition-opacity bg-cover bg-center pointer-events-none"
                      style={{ backgroundImage: `url(${bgImg})` }}
                    />
                  ) : (
                    <div className="absolute inset-0 bg-gradient-to-br from-black/20 to-transparent pointer-events-none" />
                  )}

                  <div className="relative z-10 flex items-start justify-between gap-2">
                    <div>
                      <div className="flex items-center gap-1.5">
                        <span
                          className="w-2.5 h-2.5 rounded-full shrink-0"
                          style={{ backgroundColor: opt.accent }}
                        />
                        <span className="font-display font-bold text-sm tracking-wide">
                          {opt.title}
                        </span>
                      </div>
                      <p className="text-[11px] opacity-75 mt-1 leading-snug">
                        {opt.subtitle}
                      </p>
                    </div>

                    {isSelected && (
                      <span className="p-1 rounded-full bg-amber-400 text-black shrink-0 shadow-md">
                        <Check className="w-3.5 h-3.5 stroke-[3]" />
                      </span>
                    )}
                  </div>
                </button>
              );
            })}
          </div>

          <OrnamentDivider />

          {/* Aesthetic Note */}
          <div className={`p-3.5 rounded-xl border text-xs leading-relaxed flex items-center gap-2.5 ${
            isDark ? 'bg-amber-950/20 border-amber-500/30 text-amber-200' : 'bg-amber-50 border-amber-300 text-amber-950'
          }`}>
            <Sparkles className="w-4 h-4 text-amber-400 shrink-0" />
            <span>
              Обои создают эстетичный атмосферный фон без лишних текстовых ярлыков — всё внимание сосредоточено на чистой красоте маникюра и узорах.
            </span>
          </div>
        </div>

        {/* Footer */}
        <div className="p-4 bg-black/20 border-t border-amber-500/20 flex items-center justify-end">
          <button
            onClick={onClose}
            className="btn-vangogh-gold text-xs py-2 px-6"
          >
            Применить
          </button>
        </div>
      </div>
    </div>
  );
};
