import React from 'react';
import { 
  X, Calendar, Clock, MapPin, DollarSign, ShieldCheck, 
  Download, ExternalLink, Sparkles, AlertCircle, CheckCircle2 
} from 'lucide-react';
import { Appointment, Artist } from '../types';
import { CalendarSyncButtons } from './CalendarSyncButtons';
import { downloadAllAppointmentsIcs } from '../utils/calendarSync';
import { CornerFlourish, OrnamentDivider } from './OrnamentalFlourish';
import { triggerHaptic } from '../utils/haptics';

interface ClientAppointmentsModalProps {
  isOpen: boolean;
  onClose: () => void;
  appointments: Appointment[];
  artists: Artist[];
  onOpenBooking: () => void;
  theme?: 'dark' | 'light';
  onNotification?: (msg: string) => void;
}

export const ClientAppointmentsModal: React.FC<ClientAppointmentsModalProps> = ({
  isOpen,
  onClose,
  appointments,
  artists,
  onOpenBooking,
  theme = 'dark',
  onNotification,
}) => {
  if (!isOpen) return null;
  const isDark = theme === 'dark';

  const confirmedAppointments = appointments.filter(a => a.status !== 'cancelled');

  const handleDownloadAll = () => {
    triggerHaptic('success');
    downloadAllAppointmentsIcs(confirmedAppointments, artists);
    if (onNotification) {
      onNotification(`Все ${confirmedAppointments.length} записи выгружены в один календарный файл (.ics)!`);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6 bg-black/85 backdrop-blur-md animate-fade-in">
      <div 
        className={`relative w-full max-w-3xl rounded-2xl overflow-hidden border-2 shadow-2xl flex flex-col max-h-[92vh] ${
          isDark 
            ? 'gaudi-mosaic-card border-amber-400/40 text-white' 
            : 'bg-white border-amber-500/50 text-slate-900'
        }`}
        onClick={e => e.stopPropagation()}
      >
        <CornerFlourish position="top-left" className="absolute top-2 left-2 z-10" size={36} />
        <CornerFlourish position="top-right" className="absolute top-2 right-2 z-10" size={36} />

        {/* Modal Header */}
        <div className="p-6 border-b border-amber-500/20 flex items-center justify-between relative z-10">
          <div className="flex items-center gap-3">
            <div className={`p-2.5 rounded-xl border flex items-center justify-center ${
              isDark ? 'bg-amber-400/20 border-amber-400/40 text-amber-300' : 'bg-amber-100 border-amber-400 text-amber-900'
            }`}>
              <Calendar className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="font-display font-bold text-lg sm:text-xl">Мои Записи и Синхронизация</h2>
                <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-400 border border-emerald-400/30 font-bold">
                  {confirmedAppointments.length} Активных
                </span>
              </div>
              <p className="text-xs text-gray-400">
                Экспорт в Google Calendar, Apple Calendar (.ICS) и Microsoft Outlook
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {confirmedAppointments.length > 1 && (
              <button
                onClick={handleDownloadAll}
                className="hidden sm:flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-amber-400/20 hover:bg-amber-400/30 text-amber-300 border border-amber-400/40 text-xs font-semibold font-mono transition-all cursor-pointer shadow-sm"
                title="Скачать все записи единым файлом .ics"
              >
                <Download className="w-3.5 h-3.5" />
                <span>Экспорт всех (.ICS)</span>
              </button>
            )}
            <button
              onClick={onClose}
              className="p-1.5 rounded-full text-gray-400 hover:text-white hover:bg-white/10 transition-colors cursor-pointer"
              aria-label="Close modal"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Content list */}
        <div className="p-6 space-y-4 overflow-y-auto max-h-[70vh]">
          {confirmedAppointments.length === 0 ? (
            <div className="text-center py-12 space-y-4">
              <div className="w-16 h-16 rounded-full bg-amber-400/10 text-amber-400 flex items-center justify-center mx-auto border border-amber-400/20">
                <Calendar className="w-8 h-8 opacity-60" />
              </div>
              <div className="space-y-1">
                <h3 className="font-display text-base font-bold text-white">У вас пока нет активных записей</h3>
                <p className="text-xs text-gray-400 max-w-sm mx-auto">
                  Выберите мастера в каталоге или дизайн в галерее, забронируйте удобное время и синхронизируйте его с вашим календарём!
                </p>
              </div>
              <button
                onClick={() => {
                  onClose();
                  onOpenBooking();
                }}
                className="btn-vangogh-gold text-xs py-2.5 px-6"
              >
                <Sparkles className="w-3.5 h-3.5 mr-1.5" />
                <span>Забронировать сеанс</span>
              </button>
            </div>
          ) : (
            <div className="space-y-4">
              {confirmedAppointments.map((apt) => {
                const artist = artists.find(a => a.id === apt.artistId);

                return (
                  <div
                    key={apt.id}
                    className={`p-4 sm:p-5 rounded-xl border transition-all space-y-4 ${
                      isDark 
                        ? 'bg-[#0b0e18]/80 border-cyan-500/20 hover:border-amber-400/50' 
                        : 'bg-amber-50/50 border-amber-300 hover:border-amber-500'
                    }`}
                  >
                    {/* Top Row: Artist & Service info */}
                    <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
                      <div className="flex items-start gap-3">
                        <img
                          src={apt.artistAvatar}
                          alt={apt.artistName}
                          className="w-12 h-12 rounded-xl object-cover ring-1 ring-amber-400/40 shrink-0"
                          referrerPolicy="no-referrer"
                          onError={(e) => {
                            e.currentTarget.src = '/assets/images/avatar_master_artist_1790123890131.jpg';
                          }}
                        />
                        <div className="space-y-1">
                          <div className="flex items-center gap-2">
                            <h4 className="font-display font-bold text-sm sm:text-base text-white">
                              {apt.serviceName}
                            </h4>
                            <span className="text-[10px] font-mono px-2 py-0.2 rounded-full bg-emerald-500/15 text-emerald-400 border border-emerald-400/30">
                              {apt.status === 'escrow_locked' ? 'Escrow Locked' : 'Confirmed'}
                            </span>
                          </div>
                          <p className="text-xs text-gray-300 font-medium">
                            Мастер: <span className="text-amber-300">{apt.artistName}</span>
                          </p>
                          {artist?.salonAddress && (
                            <p className="text-[11px] text-gray-400 flex items-center gap-1">
                              <MapPin className="w-3 h-3 text-cyan-400 shrink-0" />
                              <span className="truncate max-w-[280px] sm:max-w-md">{artist.salonAddress}</span>
                            </p>
                          )}
                        </div>
                      </div>

                      {/* Scheduled Date/Time Badge */}
                      <div className="flex sm:flex-col items-center sm:items-end justify-between border-t sm:border-t-0 pt-2 sm:pt-0 border-white/5 font-mono text-right">
                        <div className="flex items-center gap-1.5 text-amber-300 font-bold text-xs sm:text-sm">
                          <Calendar className="w-3.5 h-3.5 text-amber-400" />
                          <span>{apt.date}</span>
                        </div>
                        <div className="flex items-center gap-1 text-[11px] text-cyan-300">
                          <Clock className="w-3 h-3 text-cyan-400" />
                          <span>{apt.timeSlot}</span>
                        </div>
                        <div className="text-[11px] text-gray-400 pt-0.5">
                          ${apt.price} USD ({apt.cryptoEquivalent || apt.currency})
                        </div>
                      </div>
                    </div>

                    {/* Reference Look or Custom Notes if available */}
                    {(apt.referenceLookTitle || apt.customNotes) && (
                      <div className="p-2.5 rounded-lg bg-black/30 border border-white/5 text-xs text-gray-300 space-y-1">
                        {apt.referenceLookTitle && (
                          <div className="text-[11px] text-amber-300 font-mono">
                            Референс: {apt.referenceLookTitle}
                          </div>
                        )}
                        {apt.customNotes && (
                          <div className="text-[11px] text-gray-400 italic">
                            «{apt.customNotes}»
                          </div>
                        )}
                      </div>
                    )}

                    {/* Calendar Sync Control Bar */}
                    <div className="pt-2 border-t border-white/10">
                      <CalendarSyncButtons
                        appointment={apt}
                        artist={artist}
                        variant="inline"
                        onNotification={onNotification}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-4 bg-black/40 border-t border-amber-500/20 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-gray-400 font-mono">
          <div className="flex items-center gap-1.5">
            <ShieldCheck className="w-4 h-4 text-emerald-400" />
            <span>Все записи защищены смарт-контрактом эскроу</span>
          </div>

          <div className="flex items-center gap-3">
            {confirmedAppointments.length > 1 && (
              <button
                onClick={handleDownloadAll}
                className="text-amber-300 hover:text-amber-200 underline cursor-pointer"
              >
                Скачать единый .ICS для всех записей
              </button>
            )}
            <button
              onClick={onClose}
              className="px-5 py-2 rounded-lg bg-white/10 hover:bg-white/20 text-white font-semibold transition-colors cursor-pointer"
            >
              Закрыть
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
