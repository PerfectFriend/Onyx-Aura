import React, { useState } from 'react';
import { Calendar, Download, ExternalLink, Check, Copy, ChevronDown, Share2 } from 'lucide-react';
import { Appointment, Artist } from '../types';
import { 
  downloadIcsFile, 
  generateGoogleCalendarUrl, 
  generateOutlookCalendarUrl 
} from '../utils/calendarSync';
import { triggerHaptic } from '../utils/haptics';

interface CalendarSyncButtonsProps {
  appointment: Appointment;
  artist?: Artist | null;
  variant?: 'banner' | 'compact' | 'inline';
  className?: string;
  onNotification?: (msg: string) => void;
}

export const CalendarSyncButtons: React.FC<CalendarSyncButtonsProps> = ({
  appointment,
  artist,
  variant = 'banner',
  className = '',
  onNotification,
}) => {
  const [downloaded, setDownloaded] = useState<boolean>(false);
  const [copied, setCopied] = useState<boolean>(false);
  const [isOpenMenu, setIsOpenMenu] = useState<boolean>(false);

  const handleDownloadIcs = () => {
    triggerHaptic('success');
    downloadIcsFile(appointment, artist);
    setDownloaded(true);
    if (onNotification) {
      onNotification(`Календарный файл (.ics) успешно скачан для Apple Calendar и Outlook!`);
    }
    setTimeout(() => setDownloaded(false), 3500);
  };

  const handleOpenGoogle = () => {
    triggerHaptic('selection');
    const url = generateGoogleCalendarUrl(appointment, artist);
    window.open(url, '_blank', 'noopener,noreferrer');
    if (onNotification) {
      onNotification(`Открываем Google Calendar для синхронизации записи...`);
    }
  };

  const handleOpenOutlook = () => {
    triggerHaptic('selection');
    const url = generateOutlookCalendarUrl(appointment, artist);
    window.open(url, '_blank', 'noopener,noreferrer');
  };

  const handleCopyDetails = async () => {
    triggerHaptic('light');
    const details = `💅 Nailix Запись на маникюр\nУслуга: ${appointment.serviceName}\nМастер: ${appointment.artistName}\nДата: ${appointment.date} в ${appointment.timeSlot}\nСтоимость: $${appointment.price} USD (${appointment.currency})\nЭскроу TX: ${appointment.escrowTxHash || 'Secured'}\nАдрес: ${artist?.salonAddress || 'Салон мастера'}\nhttps://nailix.art`;
    
    try {
      await navigator.clipboard.writeText(details);
      setCopied(true);
      if (onNotification) {
        onNotification(`Детали записи скопированы в буфер обмена!`);
      }
      setTimeout(() => setCopied(false), 3000);
    } catch {
      // fallback
    }
  };

  // Compact icon button with dropdown for table rows or cards
  if (variant === 'compact') {
    return (
      <div className={`relative inline-block ${className}`}>
        <button
          onClick={() => setIsOpenMenu(!isOpenMenu)}
          className="p-1.5 rounded-lg bg-amber-400/10 hover:bg-amber-400/20 text-amber-300 border border-amber-400/30 transition-all flex items-center gap-1 text-[11px] font-mono cursor-pointer"
          title="Синхронизировать с Календарём (Google / Apple / .ICS)"
          aria-label="Синхронизировать с Календарём"
        >
          <Calendar className="w-3.5 h-3.5 text-amber-400" />
          <span className="hidden sm:inline">Календарь</span>
          <ChevronDown className="w-3 h-3 opacity-60" />
        </button>

        {isOpenMenu && (
          <>
            <div 
              className="fixed inset-0 z-30" 
              onClick={() => setIsOpenMenu(false)} 
            />
            <div className="absolute right-0 mt-1.5 w-56 rounded-xl bg-[#0c101c] border border-amber-400/30 shadow-2xl z-40 p-1.5 space-y-1 text-xs backdrop-blur-xl animate-fade-in font-sans">
              <div className="px-2.5 py-1 text-[10px] font-mono text-gray-400 border-b border-white/10 uppercase tracking-wider">
                Синхронизация записи
              </div>

              <button
                onClick={() => {
                  setIsOpenMenu(false);
                  handleOpenGoogle();
                }}
                className="w-full flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-left text-gray-200 hover:text-white hover:bg-cyan-500/20 transition-colors cursor-pointer"
              >
                <div className="w-5 h-5 rounded bg-blue-500/20 text-blue-400 flex items-center justify-center shrink-0">
                  <ExternalLink className="w-3 h-3" />
                </div>
                <div>
                  <div className="font-semibold text-xs">Google Calendar</div>
                  <div className="text-[10px] text-gray-400">Открыть в браузере</div>
                </div>
              </button>

              <button
                onClick={() => {
                  setIsOpenMenu(false);
                  handleDownloadIcs();
                }}
                className="w-full flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-left text-gray-200 hover:text-white hover:bg-amber-500/20 transition-colors cursor-pointer"
              >
                <div className="w-5 h-5 rounded bg-amber-500/20 text-amber-400 flex items-center justify-center shrink-0">
                  <Download className="w-3 h-3" />
                </div>
                <div>
                  <div className="font-semibold text-xs">Apple / Outlook (.ICS)</div>
                  <div className="text-[10px] text-gray-400">Скачать файл RFC 5545</div>
                </div>
              </button>

              <button
                onClick={() => {
                  setIsOpenMenu(false);
                  handleCopyDetails();
                }}
                className="w-full flex items-center gap-2.5 px-2.5 py-1.5 rounded-lg text-left text-gray-400 hover:text-white hover:bg-white/5 transition-colors cursor-pointer border-t border-white/5 pt-1.5"
              >
                <Copy className="w-3.5 h-3.5" />
                <span className="text-[11px]">Копировать детали</span>
              </button>
            </div>
          </>
        )}
      </div>
    );
  }

  // Inline mode: Two neat buttons side-by-side
  if (variant === 'inline') {
    return (
      <div className={`flex flex-wrap items-center gap-2 ${className}`}>
        <button
          onClick={handleOpenGoogle}
          className="px-3 py-1.5 rounded-lg bg-blue-500/15 hover:bg-blue-500/25 border border-blue-400/40 text-blue-300 text-xs font-medium flex items-center gap-1.5 transition-all cursor-pointer shadow-sm active:scale-95"
          title="Добавить в Google Calendar"
        >
          <Calendar className="w-3.5 h-3.5 text-blue-400" />
          <span>Google Calendar</span>
        </button>

        <button
          onClick={handleDownloadIcs}
          className="px-3 py-1.5 rounded-lg bg-amber-500/15 hover:bg-amber-500/25 border border-amber-400/40 text-amber-300 text-xs font-medium flex items-center gap-1.5 transition-all cursor-pointer shadow-sm active:scale-95"
          title="Скачать файл iCalendar (.ics) для Apple Calendar и Outlook"
        >
          {downloaded ? (
            <>
              <Check className="w-3.5 h-3.5 text-emerald-400" />
              <span className="text-emerald-400">Файл скачан ✓</span>
            </>
          ) : (
            <>
              <Download className="w-3.5 h-3.5 text-amber-400" />
              <span>Apple Calendar (.ICS)</span>
            </>
          )}
        </button>
      </div>
    );
  }

  // Banner mode: Full rich card with explanation and both actions (ideal for Checkout confirmation)
  return (
    <div className={`p-4 rounded-xl border transition-all text-left space-y-3 bg-[#0a0e1a]/80 border-amber-400/40 shadow-xl ${className}`}>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <div className="p-2 rounded-lg bg-gradient-to-br from-amber-400/20 to-amber-600/30 text-amber-300 border border-amber-400/30">
            <Calendar className="w-4 h-4" />
          </div>
          <div>
            <h4 className="font-display text-sm font-bold text-white flex items-center gap-1.5">
              <span>Добавить запись в календарь</span>
              <span className="text-[10px] font-mono px-1.5 py-0.2 rounded-full bg-emerald-500/20 text-emerald-400 border border-emerald-400/30">
                iCalendar RFC 5545
              </span>
            </h4>
            <p className="text-[11px] text-gray-400">
              Синхронизируйте дату с автоматическими напоминаниями за 24 ч и 2 ч
            </p>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 pt-1">
        {/* Google Calendar Web Intent */}
        <button
          onClick={handleOpenGoogle}
          className="px-3.5 py-2.5 rounded-xl border border-blue-400/40 bg-blue-500/10 hover:bg-blue-500/20 text-blue-200 hover:text-white transition-all flex items-center justify-center gap-2 text-xs font-semibold cursor-pointer group shadow-sm active:scale-95"
        >
          <div className="w-5 h-5 rounded-md bg-blue-500/20 flex items-center justify-center text-blue-300 group-hover:scale-110 transition-transform">
            <ExternalLink className="w-3.5 h-3.5" />
          </div>
          <span>Google Calendar</span>
        </button>

        {/* Apple Calendar / Standard .ICS Download */}
        <button
          onClick={handleDownloadIcs}
          className="px-3.5 py-2.5 rounded-xl border border-amber-400/50 bg-gradient-to-r from-amber-500/20 via-yellow-500/20 to-amber-500/10 hover:from-amber-500/30 hover:to-amber-500/20 text-amber-200 hover:text-white transition-all flex items-center justify-center gap-2 text-xs font-semibold cursor-pointer shadow-sm active:scale-95"
        >
          <div className="w-5 h-5 rounded-md bg-amber-400/20 flex items-center justify-center text-amber-300">
            {downloaded ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Download className="w-3.5 h-3.5" />}
          </div>
          <span>
            {downloaded ? 'Файл .ICS сохранён ✓' : 'Apple Calendar (.ICS)'}
          </span>
        </button>
      </div>

      {/* Auxiliary Actions & Info */}
      <div className="flex items-center justify-between pt-1 border-t border-white/5 text-[11px] font-mono text-gray-400">
        <button
          onClick={handleCopyDetails}
          className="hover:text-amber-300 transition-colors flex items-center gap-1 cursor-pointer"
        >
          {copied ? (
            <>
              <Check className="w-3 h-3 text-emerald-400" />
              <span className="text-emerald-400">Скопировано!</span>
            </>
          ) : (
            <>
              <Copy className="w-3 h-3" />
              <span>Скопировать детали</span>
            </>
          )}
        </button>

        <button
          onClick={handleOpenOutlook}
          className="hover:text-sky-300 transition-colors flex items-center gap-1 cursor-pointer"
        >
          <span>Outlook Calendar</span>
          <ExternalLink className="w-3 h-3" />
        </button>
      </div>
    </div>
  );
};
