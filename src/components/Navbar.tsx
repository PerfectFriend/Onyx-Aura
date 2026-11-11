import React, { useState } from 'react';
import { 
  Sparkles, Radio, MessageSquare, ShieldCheck, Smartphone, 
  ChevronDown, Check, Users, MapPin, Sun, Moon, Megaphone,
  Image as ImageIcon, Calendar
} from 'lucide-react';
import { LANGUAGES, SupportedLanguage, TranslationStrings } from '../i18n/translations';
import { ThemeMode } from '../types';

interface NavbarProps {
  activeTab: string;
  setActiveTab: (tab: string) => void;
  userRole: 'client' | 'master';
  setUserRole: (role: 'client' | 'master') => void;
  onOpenBooking: () => void;
  onOpenAppointments?: () => void;
  appointmentsCount?: number;
  onOpenChat: () => void;
  onOpenPermissions: () => void;
  unreadChatCount: number;
  swarmOnlineCount: number;
  currentLanguage: SupportedLanguage;
  onSelectLanguage: (lang: SupportedLanguage) => void;
  theme: ThemeMode;
  onToggleTheme: () => void;
  onOpenAdManager?: () => void;
  onOpenWallpaper?: () => void;
  t: TranslationStrings;
}

export const Navbar: React.FC<NavbarProps> = ({
  activeTab,
  setActiveTab,
  userRole,
  setUserRole,
  onOpenBooking,
  onOpenAppointments,
  appointmentsCount = 0,
  onOpenChat,
  onOpenPermissions,
  unreadChatCount,
  swarmOnlineCount,
  currentLanguage,
  onSelectLanguage,
  theme,
  onToggleTheme,
  onOpenAdManager,
  onOpenWallpaper,
  t,
}) => {
  const [isLangMenuOpen, setIsLangMenuOpen] = useState<boolean>(false);
  const currentLangMeta = LANGUAGES.find(l => l.code === currentLanguage) || LANGUAGES[0];
  const isDark = theme === 'dark';

  return (
    <header 
      className={`sticky top-0 z-40 w-full backdrop-blur-md transition-colors duration-300 border-b shadow-lg ${
        isDark 
          ? 'bg-[#07080e]/95 border-cyan-500/25 shadow-cyan-950/20 text-[#edeef2]' 
          : 'bg-[#fffdf7]/95 border-amber-600/25 shadow-amber-900/10 text-slate-800'
      }`}
    >
      {/* Top Trencadís Mosaic Strip */}
      <div className="h-1 w-full bg-gradient-to-r from-[#00f3ff] via-[#d946ef] via-[#fbbf24] to-[#10b981] animate-pulse" />

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-18 flex items-center justify-between gap-4">
        
        {/* Zone 1: Nailix Brand with Cyber-VanGogh Icon */}
        <button
          onClick={() => setActiveTab('explore')}
          className="text-left group cursor-pointer focus:outline-none flex items-center gap-2.5"
        >
          <div className={`relative w-9 h-9 rounded-xl overflow-hidden ring-2 transition-all shadow-md ${
            isDark 
              ? 'ring-cyan-400/50 group-hover:ring-amber-300 shadow-cyan-500/20' 
              : 'ring-amber-500/60 group-hover:ring-amber-600 shadow-amber-900/15'
          }`}>
            <img
              src="/pwa-192x192.png"
              alt="Nailix App"
              className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-300"
            />
          </div>
          <div>
            <div className="flex items-center gap-1.5">
              <span className={`font-display text-2xl font-black tracking-wider transition-colors ${
                isDark 
                  ? 'text-transparent bg-clip-text bg-gradient-to-r from-white via-cyan-200 to-amber-300 group-hover:to-fuchsia-300' 
                  : 'text-transparent bg-clip-text bg-gradient-to-r from-amber-950 via-sky-800 to-amber-700'
              }`}>
                Nailix
              </span>
              <span className={`text-[10px] font-mono px-1.5 py-0.5 rounded-full border font-bold ${
                isDark 
                  ? 'bg-amber-400/20 text-amber-300 border-amber-400/40' 
                  : 'bg-amber-100 text-amber-900 border-amber-400/60'
              }`}>
                HAUTE COUTURE
              </span>
            </div>
            <p className={`text-[10px] font-mono tracking-tight hidden sm:block ${
              isDark ? 'text-gray-400' : 'text-slate-600 font-medium'
            }`}>
              {t.tagline}
            </p>
          </div>
        </button>

        {/* Zone 2: Navigation Links */}
        <nav className={`hidden xl:flex items-center gap-5 text-xs font-semibold ${
          isDark ? 'text-gray-300' : 'text-slate-700'
        }`}>
          <button
            onClick={() => setActiveTab('explore')}
            className={`transition-all cursor-pointer py-1 ${
              activeTab === 'explore'
                ? isDark ? 'text-cyan-300 border-b-2 border-cyan-400 font-bold' : 'text-sky-800 border-b-2 border-amber-600 font-extrabold'
                : isDark ? 'hover:text-cyan-300' : 'hover:text-amber-800'
            }`}
          >
            {t.explore}
          </button>

          {/* Map & Proximity Tab */}
          <button
            onClick={() => setActiveTab('map')}
            className={`transition-all cursor-pointer py-1 flex items-center gap-1 ${
              activeTab === 'map'
                ? isDark ? 'text-cyan-300 border-b-2 border-cyan-400 font-bold' : 'text-sky-800 border-b-2 border-amber-600 font-extrabold'
                : isDark ? 'hover:text-cyan-300' : 'hover:text-amber-800'
            }`}
          >
            <MapPin className={`w-3.5 h-3.5 ${isDark ? 'text-cyan-400' : 'text-amber-700'}`} />
            <span>{t.salonMap || 'Salon Map'}</span>
          </button>
          
          <button
            onClick={() => setActiveTab('artists')}
            className={`transition-all cursor-pointer py-1 ${
              activeTab === 'artists'
                ? isDark ? 'text-cyan-300 border-b-2 border-cyan-400 font-bold' : 'text-sky-800 border-b-2 border-amber-600 font-extrabold'
                : isDark ? 'hover:text-cyan-300' : 'hover:text-amber-800'
            }`}
          >
            {t.artists}
          </button>

          {/* Friend Jury Moderation Tab */}
          <button
            onClick={() => setActiveTab('moderation')}
            className={`transition-all cursor-pointer py-1 flex items-center gap-1 ${
              activeTab === 'moderation'
                ? isDark ? 'text-amber-300 border-b-2 border-amber-400 font-bold' : 'text-amber-900 border-b-2 border-amber-600 font-extrabold'
                : isDark ? 'hover:text-amber-300' : 'hover:text-amber-800'
            }`}
          >
            <Users className={`w-3.5 h-3.5 ${isDark ? 'text-amber-400' : 'text-amber-700'}`} />
            <span>{t.friendModeration}</span>
            <span className="px-1 text-[9px] font-bold rounded bg-red-950/90 text-red-300 border border-red-500/50">SIM</span>
          </button>

          <button
            onClick={() => setActiveTab('ledger')}
            className={`transition-all cursor-pointer py-1 ${
              activeTab === 'ledger'
                ? isDark ? 'text-cyan-300 border-b-2 border-cyan-400 font-bold' : 'text-sky-800 border-b-2 border-amber-600 font-extrabold'
                : isDark ? 'hover:text-cyan-300' : 'hover:text-amber-800'
            }`}
          >
            {t.reputation}
          </button>

          <button
            onClick={() => setActiveTab('instagram')}
            className={`transition-all cursor-pointer py-1 ${
              activeTab === 'instagram'
                ? isDark ? 'text-fuchsia-300 border-b-2 border-fuchsia-400 font-bold' : 'text-purple-800 border-b-2 border-amber-600 font-extrabold'
                : isDark ? 'hover:text-fuchsia-300' : 'hover:text-amber-800'
            }`}
          >
            {t.instagram}
          </button>

          <button
            onClick={() => setActiveTab('cryptocloud')}
            className={`transition-all cursor-pointer py-1 flex items-center gap-1.5 ${
              activeTab === 'cryptocloud'
                ? isDark ? 'text-emerald-300 border-b-2 border-emerald-400 font-bold' : 'text-emerald-800 border-b-2 border-amber-600 font-extrabold'
                : isDark ? 'hover:text-emerald-300' : 'hover:text-amber-800'
            }`}
          >
            <Radio className={`w-3.5 h-3.5 ${isDark ? 'text-emerald-400' : 'text-emerald-700'}`} />
            <span>{t.cryptocloud}</span>
            <span className="px-1 text-[9px] font-bold rounded bg-red-950/90 text-red-300 border border-red-500/50">SIM</span>
            <span className={`text-[10px] font-mono ${isDark ? 'text-emerald-300' : 'text-emerald-800 font-bold'}`}>
              ({swarmOnlineCount})
            </span>
          </button>

          <button
            onClick={() => setActiveTab('analytics')}
            className={`transition-all cursor-pointer py-1 ${
              activeTab === 'analytics'
                ? isDark ? 'text-cyan-300 border-b-2 border-cyan-400 font-bold' : 'text-sky-800 border-b-2 border-amber-600 font-extrabold'
                : isDark ? 'hover:text-cyan-300' : 'hover:text-amber-800'
            }`}
          >
            {t.analytics}
          </button>

          <button
            onClick={() => setActiveTab('android')}
            className={`transition-all cursor-pointer py-1 flex items-center gap-1.5 ${
              activeTab === 'android'
                ? isDark ? 'text-cyan-300 border-b-2 border-cyan-400 font-bold' : 'text-sky-800 border-b-2 border-amber-600 font-extrabold'
                : isDark ? 'hover:text-cyan-300' : 'hover:text-amber-800'
            }`}
          >
            <Smartphone className="w-3.5 h-3.5 text-cyan-400" />
            <span>Android Suite</span>
            <span className="text-[9px] font-mono px-1 py-0.2 rounded bg-cyan-400/20 text-cyan-300 border border-cyan-400/40 font-bold">
              APK
            </span>
          </button>
        </nav>

        {/* Zone 3: Actions & Controls */}
        <div className="flex items-center gap-2 sm:gap-2.5">
          
          {/* Light / Dark Theme Toggle Button */}
          <button
            onClick={onToggleTheme}
            className={`p-2 rounded-xl transition-all cursor-pointer border ${
              isDark 
                ? 'bg-[#0e1220] border-cyan-500/30 text-amber-300 hover:border-amber-400 hover:bg-[#151c33]' 
                : 'bg-white border-amber-400/60 text-amber-700 hover:border-amber-600 hover:bg-amber-50 shadow-sm'
            }`}
            title={isDark ? 'Switch to Light Theme' : 'Switch to Dark Theme'}
            aria-label="Toggle Theme"
          >
            {isDark ? (
              <Sun className="w-4 h-4 text-amber-300 hover:rotate-45 transition-transform" />
            ) : (
              <Moon className="w-4 h-4 text-indigo-700 hover:-rotate-12 transition-transform" />
            )}
          </button>

          {/* Luxury Wallpaper & Ornament Selector */}
          {onOpenWallpaper && (
            <button
              onClick={onOpenWallpaper}
              className={`p-2 rounded-xl transition-all cursor-pointer border flex items-center gap-1.5 ${
                isDark 
                  ? 'bg-[#0e1220] border-amber-500/30 text-amber-300 hover:border-amber-400 hover:bg-[#151c33]' 
                  : 'bg-white border-amber-400/60 text-amber-800 hover:border-amber-600 hover:bg-amber-50 shadow-sm'
              }`}
              title="Обои и Орнаменты"
              aria-label="Обои и Орнаменты"
            >
              <ImageIcon className="w-4 h-4 text-amber-400" />
              <span className="hidden md:inline text-[11px] font-mono font-bold">Обои</span>
            </button>
          )}

          {/* Top 10 Languages Selector Dropdown */}
          <div className="relative">
            <button
              onClick={() => setIsLangMenuOpen(!isLangMenuOpen)}
              className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border transition-colors text-xs font-mono cursor-pointer ${
                isDark 
                  ? 'bg-[#0e1220] border-cyan-500/30 text-gray-200 hover:border-cyan-400' 
                  : 'bg-white border-amber-400/60 text-slate-800 hover:border-amber-600 shadow-sm'
              }`}
              title="Change Language"
            >
              <span className="text-sm">{currentLangMeta.flag}</span>
              <span className="hidden md:inline uppercase font-bold">{currentLangMeta.code}</span>
              <ChevronDown className={`w-3 h-3 ${isDark ? 'text-cyan-400' : 'text-amber-700'}`} />
            </button>

            {isLangMenuOpen && (
              <div 
                className={`absolute right-0 mt-2 w-48 rounded-xl border shadow-2xl py-2 z-50 divide-y ${
                  isDark 
                    ? 'bg-[#0c101c] border-cyan-500/40 divide-cyan-500/10 text-gray-200' 
                    : 'bg-white border-amber-300 divide-amber-100 text-slate-800 shadow-amber-900/10'
                }`}
                onClick={e => e.stopPropagation()}
              >
                <div className={`px-3 py-1.5 text-[10px] font-mono uppercase tracking-wider font-bold ${
                  isDark ? 'text-cyan-300' : 'text-amber-800'
                }`}>
                  Select Language (Auto-detected)
                </div>
                <div className="max-h-64 overflow-y-auto py-1">
                  {LANGUAGES.map(lang => {
                    const isSelected = lang.code === currentLanguage;
                    return (
                      <button
                        key={lang.code}
                        onClick={() => {
                          onSelectLanguage(lang.code);
                          setIsLangMenuOpen(false);
                        }}
                        className={`w-full px-3 py-1.5 text-xs text-left flex items-center justify-between transition-colors cursor-pointer ${
                          isSelected 
                            ? isDark ? 'text-cyan-300 font-bold bg-cyan-500/20' : 'text-amber-900 font-bold bg-amber-100'
                            : isDark ? 'text-gray-300 hover:bg-cyan-500/10' : 'text-slate-700 hover:bg-amber-50'
                        }`}
                      >
                        <span className="flex items-center gap-2">
                          <span>{lang.flag}</span>
                          <span>{lang.nativeName}</span>
                        </span>
                        {isSelected && <Check className={`w-3.5 h-3.5 ${isDark ? 'text-cyan-300' : 'text-amber-700'}`} />}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
          </div>

          {/* Android Permissions & APK Modal Button */}
          <button
            onClick={onOpenPermissions}
            className={`p-2 rounded-xl border transition-colors cursor-pointer ${
              isDark 
                ? 'bg-[#0e1220] border-cyan-500/30 text-cyan-300 hover:border-cyan-400' 
                : 'bg-white border-amber-400/60 text-amber-800 hover:border-amber-600 shadow-sm'
            }`}
            title={t.permissionsTitle}
            aria-label={t.permissionsTitle}
          >
            <Smartphone className="w-4 h-4" />
          </button>

          {/* Role Toggle Switch */}
          <div className={`hidden sm:flex items-center p-1 rounded-xl border ${
            isDark ? 'bg-[#070913] border-cyan-500/30' : 'bg-amber-100/70 border-amber-400/50'
          }`}>
            <button
              onClick={() => setUserRole('client')}
              className={`px-2.5 py-1 text-xs font-semibold rounded-lg transition-all cursor-pointer ${
                userRole === 'client'
                  ? 'bg-gradient-to-r from-cyan-600 to-blue-600 text-white shadow-md'
                  : isDark ? 'text-gray-400 hover:text-white' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              {t.switchRoleClient}
            </button>
            <button
              onClick={() => setUserRole('master')}
              className={`px-2.5 py-1 text-xs font-semibold rounded-lg transition-all cursor-pointer ${
                userRole === 'master'
                  ? 'bg-gradient-to-r from-amber-400 to-yellow-500 text-black shadow-md font-bold'
                  : isDark ? 'text-gray-400 hover:text-white' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              {t.switchRoleMaster}
            </button>
          </div>

          {/* Confirmed Appointments & Calendar Sync Button */}
          {onOpenAppointments && (
            <button
              onClick={onOpenAppointments}
              className={`relative p-2 rounded-xl border transition-colors cursor-pointer ${
                isDark 
                  ? 'bg-[#0e1220] border-cyan-500/30 text-amber-300 hover:border-amber-400' 
                  : 'bg-white border-amber-400/60 text-amber-800 hover:border-amber-600 shadow-sm'
              }`}
              title="Мои записи и синхронизация с Google / Apple Calendar"
              aria-label="Мои записи"
            >
              <Calendar className="w-4 h-4" />
              {appointmentsCount > 0 && (
                <span className="absolute -top-1 -right-1 w-4 h-4 bg-amber-500 text-slate-950 text-[10px] font-bold rounded-full flex items-center justify-center font-mono shadow-sm">
                  {appointmentsCount}
                </span>
              )}
            </button>
          )}

          {/* Encrypted Chat Button */}
          <button
            onClick={onOpenChat}
            className={`relative p-2 rounded-xl border transition-colors cursor-pointer ${
              isDark 
                ? 'bg-[#0e1220] border-cyan-500/30 text-fuchsia-300 hover:border-fuchsia-400' 
                : 'bg-white border-amber-400/60 text-purple-700 hover:border-purple-600 shadow-sm'
            }`}
            title={t.consultation}
            aria-label={t.consultation}
          >
            <MessageSquare className="w-4 h-4" />
            {unreadChatCount > 0 && (
              <span className="absolute -top-1 -right-1 w-4 h-4 bg-rose-500 text-white text-[10px] font-bold rounded-full flex items-center justify-center animate-pulse">
                {unreadChatCount}
              </span>
            )}
          </button>

          {/* Primary CTA: Book Session */}
          <button
            onClick={onOpenBooking}
            className="btn-vangogh-gold text-xs py-2 px-3 sm:px-4 whitespace-nowrap"
          >
            <Sparkles className="w-3.5 h-3.5 mr-1" />
            <span>{t.bookNow}</span>
          </button>

        </div>
      </div>

      {/* Mobile Submenu Bar */}
      <div className={`xl:hidden flex items-center justify-between px-4 py-2 border-t overflow-x-auto text-xs gap-4 ${
        isDark ? 'bg-[#070912]/90 border-cyan-500/20 text-gray-300' : 'bg-[#fffdf7]/95 border-amber-600/20 text-slate-700'
      }`}>
        <button
          onClick={() => setActiveTab('explore')}
          className={`whitespace-nowrap font-medium ${
            activeTab === 'explore' 
              ? isDark ? 'text-cyan-300 font-bold' : 'text-amber-800 font-extrabold' 
              : ''
          }`}
        >
          {t.explore}
        </button>
        {onOpenAppointments && (
          <button
            onClick={onOpenAppointments}
            className={`whitespace-nowrap flex items-center gap-1 font-medium ${
              isDark ? 'text-amber-300 hover:text-amber-200' : 'text-amber-800 hover:text-amber-900 font-bold'
            }`}
            title="Мои записи & Календарь"
          >
            <Calendar className={`w-3 h-3 ${isDark ? 'text-amber-400' : 'text-amber-700'}`} />
            <span>Записи ({appointmentsCount})</span>
          </button>
        )}
        <button
          onClick={() => setActiveTab('map')}
          className={`whitespace-nowrap flex items-center gap-1 font-medium ${
            activeTab === 'map' 
              ? isDark ? 'text-cyan-300 font-bold' : 'text-amber-800 font-extrabold' 
              : ''
          }`}
        >
          <MapPin className={`w-3 h-3 ${isDark ? 'text-cyan-400' : 'text-amber-700'}`} />
          <span>{t.salonMap || 'Salon Map'}</span>
        </button>
        <button
          onClick={() => setActiveTab('artists')}
          className={`whitespace-nowrap font-medium ${
            activeTab === 'artists' 
              ? isDark ? 'text-cyan-300 font-bold' : 'text-amber-800 font-extrabold' 
              : ''
          }`}
        >
          {t.artists}
        </button>
        <button
          onClick={() => setActiveTab('moderation')}
          className={`whitespace-nowrap flex items-center gap-1 font-medium ${
            activeTab === 'moderation' 
              ? isDark ? 'text-amber-300 font-bold' : 'text-amber-800 font-extrabold' 
              : ''
          }`}
        >
          <Users className={`w-3 h-3 ${isDark ? 'text-amber-400' : 'text-amber-700'}`} />
          <span>{t.friendModeration}</span>
        </button>
        <button
          onClick={() => setActiveTab('ledger')}
          className={`whitespace-nowrap font-medium ${
            activeTab === 'ledger' 
              ? isDark ? 'text-cyan-300 font-bold' : 'text-amber-800 font-extrabold' 
              : ''
          }`}
        >
          {t.reputation}
        </button>
        <button
          onClick={() => setActiveTab('instagram')}
          className={`whitespace-nowrap font-medium ${
            activeTab === 'instagram' 
              ? isDark ? 'text-fuchsia-300 font-bold' : 'text-purple-800 font-extrabold' 
              : ''
          }`}
        >
          {t.instagram}
        </button>
        <button
          onClick={() => setActiveTab('cryptocloud')}
          className={`whitespace-nowrap font-medium ${
            activeTab === 'cryptocloud' 
              ? isDark ? 'text-emerald-300 font-bold' : 'text-emerald-800 font-extrabold' 
              : ''
          }`}
        >
          {t.cryptocloud}
        </button>
        <button
          onClick={() => setActiveTab('analytics')}
          className={`whitespace-nowrap font-medium ${
            activeTab === 'analytics' 
              ? isDark ? 'text-cyan-300 font-bold' : 'text-amber-800 font-extrabold' 
              : ''
          }`}
        >
          {t.analytics}
        </button>
        <button
          onClick={() => setActiveTab('android')}
          className={`whitespace-nowrap flex items-center gap-1 font-medium ${
            activeTab === 'android' 
              ? isDark ? 'text-cyan-300 font-bold' : 'text-amber-800 font-extrabold' 
              : ''
          }`}
        >
          <Smartphone className="w-3 h-3 text-cyan-400" />
          <span>Android Suite</span>
        </button>
      </div>

    </header>
  );
};
