import React from 'react';
import { Sparkles, MapPin, Scale, MessageSquare, Smartphone, Compass } from 'lucide-react';
import { triggerHaptic } from '../utils/haptics';
import { ThemeMode } from '../types';
import { TranslationStrings } from '../i18n/translations';

interface AndroidBottomNavProps {
  activeTab: string;
  setActiveTab: (tab: string) => void;
  unreadChatCount: number;
  onOpenChat: () => void;
  theme: ThemeMode;
  t: TranslationStrings;
}

export const AndroidBottomNav: React.FC<AndroidBottomNavProps> = ({
  activeTab,
  setActiveTab,
  unreadChatCount,
  onOpenChat,
  theme,
  t,
}) => {
  const isDark = theme === 'dark';

  const handleSelectTab = (tabId: string) => {
    triggerHaptic('selection');
    if (tabId === 'chat') {
      onOpenChat();
    } else {
      setActiveTab(tabId);
    }
  };

  const navItems = [
    {
      id: 'explore',
      label: 'Галерея',
      icon: Compass,
      activeColor: isDark ? 'text-cyan-300' : 'text-sky-800',
    },
    {
      id: 'map',
      label: 'Радар',
      icon: MapPin,
      activeColor: isDark ? 'text-amber-400' : 'text-amber-800',
    },
    {
      id: 'moderation',
      label: 'Жюри',
      icon: Scale,
      activeColor: isDark ? 'text-fuchsia-400' : 'text-purple-800',
    },
    {
      id: 'chat',
      label: 'Чат',
      icon: MessageSquare,
      badge: unreadChatCount > 0 ? unreadChatCount : null,
      activeColor: isDark ? 'text-emerald-400' : 'text-emerald-800',
    },
    {
      id: 'android',
      label: 'Android',
      icon: Smartphone,
      isSpecial: true,
      activeColor: isDark ? 'text-[#00f3ff]' : 'text-sky-700',
    },
  ];

  return (
    <nav
      aria-label="Android System Navigation"
      className={`fixed bottom-0 inset-x-0 z-40 transition-colors duration-200 border-t pb-[max(0.5rem,env(safe-area-inset-bottom))] shadow-2xl backdrop-blur-xl ${
        isDark
          ? 'bg-[#080a14]/95 border-cyan-500/25 shadow-cyan-950/40 text-gray-300'
          : 'bg-[#ffffff]/95 border-amber-600/30 shadow-slate-900/15 text-slate-700'
      }`}
    >
      {/* Top subtle glow strip */}
      <div className="h-0.5 w-full bg-gradient-to-r from-cyan-400 via-amber-400 to-fuchsia-500 opacity-70" />

      <div className="max-w-lg mx-auto px-2 flex items-center justify-around h-15">
        {navItems.map((item) => {
          const Icon = item.icon;
          const isActive = activeTab === item.id;

          return (
            <button
              key={item.id}
              onClick={() => handleSelectTab(item.id)}
              className={`relative flex flex-col items-center justify-center flex-1 h-full py-1 transition-all duration-150 cursor-pointer select-none active:scale-95 group focus:outline-none`}
            >
              {/* Android Material 3 Active Pill Indicator */}
              <div
                className={`relative flex items-center justify-center px-4 py-1 rounded-full transition-all duration-200 ${
                  isActive
                    ? isDark
                      ? 'bg-gradient-to-r from-cyan-500/20 to-blue-600/20 ring-1 ring-cyan-400/50 shadow-[0_0_12px_rgba(0,243,255,0.25)]'
                      : 'bg-amber-100/90 ring-1 ring-amber-500/40 shadow-sm'
                    : 'group-hover:bg-black/5 dark:group-hover:bg-white/5'
                }`}
              >
                <Icon
                  className={`w-5 h-5 transition-transform duration-150 ${
                    isActive ? `${item.activeColor} scale-110` : 'text-gray-400 group-hover:text-gray-200'
                  }`}
                />

                {/* Badge for Chat / Notifications */}
                {item.badge && (
                  <span className="absolute -top-1 -right-1 px-1.5 py-0.2 min-w-[16px] text-[10px] font-bold font-mono bg-rose-500 text-white rounded-full border border-white dark:border-black flex items-center justify-center shadow-md animate-pulse">
                    {item.badge}
                  </span>
                )}

                {item.isSpecial && !isActive && (
                  <span className="absolute -top-1 -right-1 w-2 h-2 rounded-full bg-cyan-400 ring-2 ring-black animate-ping" />
                )}
              </div>

              {/* Label */}
              <span
                className={`text-[10px] font-medium tracking-tight mt-0.5 transition-colors ${
                  isActive
                    ? isDark
                      ? `${item.activeColor} font-bold`
                      : 'text-slate-900 font-bold'
                    : isDark
                      ? 'text-gray-400 group-hover:text-gray-200'
                      : 'text-slate-600 group-hover:text-slate-900'
                }`}
              >
                {item.label}
              </span>
            </button>
          );
        })}
      </div>
    </nav>
  );
};
