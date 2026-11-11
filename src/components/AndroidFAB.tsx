import React, { useState } from 'react';
import { Plus, X, Sparkles, Camera, Calendar, MessageSquare, Smartphone } from 'lucide-react';
import { triggerHaptic } from '../utils/haptics';
import { ThemeMode } from '../types';

interface AndroidFABProps {
  onQuickBook: () => void;
  onOpenARCamera: () => void;
  onOpenChat: () => void;
  onOpenAndroidSuite: () => void;
  onOpenAppointments?: () => void;
  theme: ThemeMode;
}

export const AndroidFAB: React.FC<AndroidFABProps> = ({
  onQuickBook,
  onOpenARCamera,
  onOpenChat,
  onOpenAndroidSuite,
  onOpenAppointments,
  theme,
}) => {
  const [isOpen, setIsOpen] = useState<boolean>(false);
  const isDark = theme === 'dark';

  const toggleOpen = () => {
    triggerHaptic('medium');
    setIsOpen(prev => !prev);
  };

  const handleAction = (callback: () => void) => {
    triggerHaptic('selection');
    callback();
    setIsOpen(false);
  };

  return (
    <div className="fixed bottom-20 right-4 sm:right-6 z-40 flex flex-col items-end pointer-events-auto">
      
      {/* Speed Dial Menu Items */}
      {isOpen && (
        <div className="flex flex-col items-end gap-2.5 mb-3 animate-fade-in">
          
          {/* Action 1: AR Nail Camera */}
          <button
            onClick={() => handleAction(onOpenARCamera)}
            className="flex items-center gap-2.5 group cursor-pointer"
          >
            <span className={`px-2.5 py-1 rounded-lg text-xs font-mono font-semibold shadow-lg backdrop-blur-md transition-all ${
              isDark ? 'bg-[#080d1a]/90 text-cyan-300 border border-cyan-500/30' : 'bg-white/95 text-slate-800 border border-slate-300'
            }`}>
              AR Примерка Ногтей
            </span>
            <div className="w-10 h-10 rounded-full bg-gradient-to-tr from-cyan-500 to-blue-600 text-white flex items-center justify-center shadow-lg shadow-cyan-500/30 group-hover:scale-110 transition-transform">
              <Camera className="w-5 h-5" />
            </div>
          </button>

          {/* Action 2: Quick Booking */}
          <button
            onClick={() => handleAction(onQuickBook)}
            className="flex items-center gap-2.5 group cursor-pointer"
          >
            <span className={`px-2.5 py-1 rounded-lg text-xs font-mono font-semibold shadow-lg backdrop-blur-md transition-all ${
              isDark ? 'bg-[#080d1a]/90 text-amber-300 border border-amber-500/30' : 'bg-white/95 text-slate-800 border border-slate-300'
            }`}>
              Экспресс-Запись
            </span>
            <div className="w-10 h-10 rounded-full bg-gradient-to-tr from-amber-500 to-amber-600 text-slate-950 flex items-center justify-center shadow-lg shadow-amber-500/30 group-hover:scale-110 transition-transform">
              <Calendar className="w-5 h-5 font-bold" />
            </div>
          </button>

          {/* Action 2b: My Appointments & Calendar Sync */}
          {onOpenAppointments && (
            <button
              onClick={() => handleAction(onOpenAppointments)}
              className="flex items-center gap-2.5 group cursor-pointer"
            >
              <span className={`px-2.5 py-1 rounded-lg text-xs font-mono font-semibold shadow-lg backdrop-blur-md transition-all ${
                isDark ? 'bg-[#080d1a]/90 text-yellow-300 border border-yellow-500/30' : 'bg-white/95 text-slate-800 border border-slate-300'
              }`}>
                Мои Записи & Календарь (.ICS)
              </span>
              <div className="w-10 h-10 rounded-full bg-gradient-to-tr from-yellow-400 to-amber-500 text-slate-950 flex items-center justify-center shadow-lg shadow-amber-500/30 group-hover:scale-110 transition-transform">
                <Sparkles className="w-5 h-5 font-bold" />
              </div>
            </button>
          )}

          {/* Action 3: Studio Chat */}
          <button
            onClick={() => handleAction(onOpenChat)}
            className="flex items-center gap-2.5 group cursor-pointer"
          >
            <span className={`px-2.5 py-1 rounded-lg text-xs font-mono font-semibold shadow-lg backdrop-blur-md transition-all ${
              isDark ? 'bg-[#080d1a]/90 text-emerald-300 border border-emerald-500/30' : 'bg-white/95 text-slate-800 border border-slate-300'
            }`}>
              Чат с Мастером
            </span>
            <div className="w-10 h-10 rounded-full bg-gradient-to-tr from-emerald-500 to-teal-600 text-white flex items-center justify-center shadow-lg shadow-emerald-500/30 group-hover:scale-110 transition-transform">
              <MessageSquare className="w-5 h-5" />
            </div>
          </button>

          {/* Action 4: Android Suite */}
          <button
            onClick={() => handleAction(onOpenAndroidSuite)}
            className="flex items-center gap-2.5 group cursor-pointer"
          >
            <span className={`px-2.5 py-1 rounded-lg text-xs font-mono font-semibold shadow-lg backdrop-blur-md transition-all ${
              isDark ? 'bg-[#080d1a]/90 text-fuchsia-300 border border-fuchsia-500/30' : 'bg-white/95 text-slate-800 border border-slate-300'
            }`}>
              Android Инструменты & APK
            </span>
            <div className="w-10 h-10 rounded-full bg-gradient-to-tr from-purple-600 to-fuchsia-600 text-white flex items-center justify-center shadow-lg shadow-fuchsia-500/30 group-hover:scale-110 transition-transform">
              <Smartphone className="w-5 h-5" />
            </div>
          </button>

        </div>
      )}

      {/* Main Material 3 Android Floating Action Button */}
      <button
        onClick={toggleOpen}
        aria-label="Android Quick Actions"
        className={`w-13 h-13 rounded-2xl flex items-center justify-center shadow-2xl transition-all duration-200 cursor-pointer select-none active:scale-90 ${
          isOpen
            ? 'bg-rose-600 text-white rotate-45 shadow-rose-600/40 ring-2 ring-white/20'
            : isDark
              ? 'bg-gradient-to-tr from-[#00f3ff] via-[#3b82f6] to-[#d946ef] text-white shadow-[0_4px_24px_rgba(0,243,255,0.4)] ring-2 ring-cyan-400/50 hover:scale-105'
              : 'bg-gradient-to-tr from-amber-500 to-amber-700 text-white shadow-xl shadow-amber-900/30 hover:scale-105 ring-2 ring-amber-400'
        }`}
      >
        <Plus className="w-6 h-6 stroke-[2.5]" />
      </button>

    </div>
  );
};
