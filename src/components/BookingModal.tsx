import React, { useState } from 'react';
import { X, Calendar, Clock, Bell } from 'lucide-react';
import { Artist, NailService, PortfolioItem } from '../types';
import { DEMO_CLIENT_PROFILE, getRelativeDateISO } from '../data/initialData';
import { CornerFlourish } from './OrnamentalFlourish';

interface BookingModalProps {
  isOpen: boolean;
  onClose: () => void;
  artists: Artist[];
  initialArtist?: Artist | null;
  initialLook?: PortfolioItem | null;
  onProceedToCheckout: (bookingDetails: {
    artist: Artist;
    service: NailService;
    date: string;
    timeSlot: string;
    clientName: string;
    clientPhone: string;
    clientEmail: string;
    customNotes: string;
    enablePush: boolean;
    enableSMS: boolean;
    referenceLook?: PortfolioItem;
  }) => void;
  onTestSMS: (phone: string, artistName: string, serviceName: string, date: string, time: string) => void;
  onTestPush: (artistName: string, serviceName: string) => void;
}

const TIME_SLOTS = [
  '10:00 AM',
  '11:30 AM',
  '01:00 PM',
  '02:30 PM',
  '04:00 PM',
  '05:30 PM',
  '07:00 PM',
];

export const BookingModal: React.FC<BookingModalProps> = ({
  isOpen,
  onClose,
  artists,
  initialArtist,
  initialLook,
  onProceedToCheckout,
  onTestSMS,
  onTestPush,
}) => {
  if (!isOpen) return null;

  return (
    <BookingModalContent
      onClose={onClose}
      artists={artists}
      initialArtist={initialArtist}
      initialLook={initialLook}
      onProceedToCheckout={onProceedToCheckout}
      onTestSMS={onTestSMS}
      onTestPush={onTestPush}
    />
  );
};

type BookingModalContentProps = Omit<BookingModalProps, 'isOpen'>;

const BookingModalContent: React.FC<BookingModalContentProps> = ({
  onClose,
  artists,
  initialArtist,
  initialLook,
  onProceedToCheckout,
  onTestSMS,
  onTestPush,
}) => {
  const minDateISO = getRelativeDateISO(0);

  const [selectedArtistId, setSelectedArtistId] = useState<string>(
    initialArtist?.id || initialLook?.artistId || artists[0]?.id || ''
  );

  const currentArtist = artists.find(a => a.id === selectedArtistId) || artists[0];

  const [selectedServiceId, setSelectedServiceId] = useState<string>(
    currentArtist?.services[0]?.id || ''
  );
  const currentService =
    currentArtist?.services.find(s => s.id === selectedServiceId) || currentArtist?.services[0];

  const [selectedDate, setSelectedDate] = useState<string>(() => getRelativeDateISO(2));
  const [selectedSlot, setSelectedSlot] = useState<string>('02:30 PM');

  const [clientName, setClientName] = useState<string>(DEMO_CLIENT_PROFILE.name);
  const [clientPhone, setClientPhone] = useState<string>(DEMO_CLIENT_PROFILE.phone);
  const [clientEmail, setClientEmail] = useState<string>(DEMO_CLIENT_PROFILE.email);
  const [customNotes, setCustomNotes] = useState<string>(
    'Prefer coffin shape length 2; matte velvet base with sculpted liquid chrome crests.'
  );

  const [enablePush, setEnablePush] = useState<boolean>(true);
  const [enableSMS, setEnableSMS] = useState<boolean>(true);
  const [smsTestDispatched, setSmsTestDispatched] = useState<boolean>(false);
  const [pushTestDispatched, setPushTestDispatched] = useState<boolean>(false);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentArtist || !currentService) return;

    onProceedToCheckout({
      artist: currentArtist,
      service: currentService,
      date: selectedDate,
      timeSlot: selectedSlot,
      clientName,
      clientPhone,
      clientEmail,
      customNotes,
      enablePush,
      enableSMS,
      referenceLook: initialLook || undefined,
    });
  };

  const handleTriggerTestSMS = () => {
    if (!currentArtist || !currentService) return;
    onTestSMS(clientPhone, currentArtist.name, currentService.name, selectedDate, selectedSlot);
    setSmsTestDispatched(true);
    setTimeout(() => setSmsTestDispatched(false), 3000);
  };

  const handleTriggerTestPush = () => {
    if (!currentArtist || !currentService) return;
    onTestPush(currentArtist.name, currentService.name);
    setPushTestDispatched(true);
    setTimeout(() => setPushTestDispatched(false), 3000);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6 bg-black/85 backdrop-blur-md">
      <div
        className="relative w-full max-w-2xl gaudi-mosaic-card border border-amber-400/40 shadow-2xl max-h-[92vh] flex flex-col"
        onClick={e => e.stopPropagation()}
      >
        <CornerFlourish position="top-left" className="absolute top-2 left-2 z-10" size={32} />
        <CornerFlourish position="top-right" className="absolute top-2 right-2 z-10" size={32} />

        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-cyan-500/20">
          <div>
            <div className="text-xs font-mono text-amber-300">STEP 1 OF 2 · APPOINTMENT CONFIGURATION</div>
            <h2 className="font-display text-lg font-bold text-white">Book Couture Manicure Session</h2>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-full text-gray-400 hover:text-white hover:bg-white/10 transition-colors cursor-pointer"
            aria-label="Close modal"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content Body */}
        <form onSubmit={handleSubmit} className="p-6 overflow-y-auto space-y-6">
          {/* Reference Look Card */}
          {initialLook && (
            <div className="flex items-center gap-4 p-3 bg-[#15171e] rounded-xl border border-[#272a33]">
              <img
                src={initialLook.image}
                alt={initialLook.title}
                className="w-16 h-16 rounded-lg object-cover"
                referrerPolicy="no-referrer"
                onError={(e) => {
                  e.currentTarget.src = '/assets/images/portfolio_gaudi_mosaic_nails_1790126128212.jpg';
                }}
              />
              <div className="flex-1">
                <div className="text-[11px] text-[#d4af37] font-mono">SELECTED REFERENCE LOOK</div>
                <h4 className="text-sm font-semibold text-white">{initialLook.title}</h4>
                <p className="text-xs text-[#9ca3af]">By {initialLook.artistName} · ${initialLook.priceUSD} USD</p>
              </div>
            </div>
          )}

          {/* Artist Selector */}
          <div className="space-y-2">
            <label className="text-xs font-medium uppercase tracking-wider text-[#9ca3af]">Select Master Artist</label>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              {artists.map(art => {
                const isSelected = art.id === selectedArtistId;
                return (
                  <button
                    key={art.id}
                    type="button"
                    onClick={() => {
                      setSelectedArtistId(art.id);
                      if (art.services[0]) setSelectedServiceId(art.services[0].id);
                    }}
                    className={`flex items-center gap-3 p-3 rounded-lg border text-left transition-all cursor-pointer ${
                      isSelected
                        ? 'border-[#d4af37] bg-[#1a1b24]'
                        : 'border-[#272a33] bg-[#12141a] hover:border-[#3b3f4d]'
                    }`}
                  >
                    <img
                      src={art.avatar}
                      alt={art.name}
                      className="w-9 h-9 rounded-full object-cover"
                      referrerPolicy="no-referrer"
                      onError={(e) => {
                        e.currentTarget.src = '/assets/images/avatar_master_artist_1790123890131.jpg';
                      }}
                    />
                    <div className="truncate">
                      <p className="text-xs font-semibold text-white truncate">{art.name}</p>
                      <p className="text-[11px] text-[#9ca3af] truncate">★ {art.rating} ({art.totalReviews})</p>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Service Selector */}
          {currentArtist && (
            <div className="space-y-2">
              <label className="text-xs font-medium uppercase tracking-wider text-[#9ca3af]">Choose Haute Technique Service</label>
              <div className="space-y-2">
                {currentArtist.services.map(srv => {
                  const isSelected = srv.id === selectedServiceId;
                  return (
                    <div
                      key={srv.id}
                      onClick={() => setSelectedServiceId(srv.id)}
                      className={`p-3.5 rounded-lg border flex items-center justify-between cursor-pointer transition-all ${
                        isSelected
                          ? 'border-[#d4af37] bg-[#1a1b24]'
                          : 'border-[#272a33] bg-[#12141a] hover:border-[#3b3f4d]'
                      }`}
                    >
                      <div className="space-y-1 pr-4">
                        <div className="flex items-center gap-2">
                          <p className="text-sm font-semibold text-white">{srv.name}</p>
                          <span className="text-[11px] text-[#d4af37] font-mono">· {srv.durationMinutes} mins</span>
                        </div>
                        <p className="text-xs text-[#9ca3af] leading-relaxed">{srv.description}</p>
                      </div>
                      <div className="text-right shrink-0">
                        <p className="font-mono text-base font-bold text-white">${srv.priceUSD}</p>
                        <p className="text-[10px] text-[#9ca3af]">Session Deposit [SIM]</p>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Date & Time Slot Picker */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-2">
              <label className="text-xs font-medium uppercase tracking-wider text-[#9ca3af] flex items-center gap-1.5">
                <Calendar className="w-3.5 h-3.5 text-[#d4af37]" />
                <span>Appointment Date</span>
              </label>
              <input
                type="date"
                value={selectedDate}
                min={minDateISO}
                onChange={e => setSelectedDate(e.target.value)}
                className="w-full px-3 py-2 text-sm bg-[#12141a] border border-[#272a33] rounded-lg text-white focus:outline-none focus:border-[#d4af37]"
                required
              />
            </div>

            <div className="space-y-2">
              <label className="text-xs font-medium uppercase tracking-wider text-[#9ca3af] flex items-center gap-1.5">
                <Clock className="w-3.5 h-3.5 text-[#d4af37]" />
                <span>Available Time Slot (Demo Static Slots)</span>
              </label>
              <select
                value={selectedSlot}
                onChange={e => setSelectedSlot(e.target.value)}
                className="w-full px-3 py-2 text-sm bg-[#12141a] border border-[#272a33] rounded-lg text-white focus:outline-none focus:border-[#d4af37]"
              >
                {TIME_SLOTS.map(slot => (
                  <option key={slot} value={slot}>{slot}</option>
                ))}
              </select>
            </div>
          </div>

          {/* Client Contact Info */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="space-y-2">
              <label className="text-xs font-medium uppercase tracking-wider text-[#9ca3af]">Your Full Name</label>
              <input
                type="text"
                value={clientName}
                onChange={e => setClientName(e.target.value)}
                placeholder="Client Name"
                className="w-full px-3 py-2 text-sm bg-[#12141a] border border-[#272a33] rounded-lg text-white focus:outline-none focus:border-[#d4af37]"
                required
              />
            </div>

            <div className="space-y-2">
              <label className="text-xs font-medium uppercase tracking-wider text-[#9ca3af]">Mobile Phone</label>
              <input
                type="tel"
                value={clientPhone}
                onChange={e => setClientPhone(e.target.value)}
                placeholder="+34 600 000 000"
                className="w-full px-3 py-2 text-sm bg-[#12141a] border border-[#272a33] rounded-lg text-white focus:outline-none focus:border-[#d4af37]"
                required
              />
            </div>

            <div className="space-y-2">
              <label className="text-xs font-medium uppercase tracking-wider text-[#9ca3af]">Email (for Calendar)</label>
              <input
                type="email"
                value={clientEmail}
                onChange={e => setClientEmail(e.target.value)}
                placeholder="guest.demo@nailix.example"
                className="w-full px-3 py-2 text-sm bg-[#12141a] border border-[#272a33] rounded-lg text-white focus:outline-none focus:border-[#d4af37]"
                required
              />
            </div>
          </div>

          {/* Reminder Preview Section [SIM] */}
          <div className="p-4 rounded-xl bg-[#15171e] border border-red-500/40 space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Bell className="w-4 h-4 text-[#d4af37]" />
                <h4 className="text-sm font-semibold text-white">Reminder Previews [SIM]</h4>
              </div>
              <span className="text-[11px] font-mono text-red-300">[SIM] Local In-App Toast</span>
            </div>

            <p className="text-xs text-[#9ca3af]">
              [SIM] Previews 24h & 2h alerts immediately inside the app toast ledger. No external SMS gateway is connected.
            </p>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
              <div className="p-3 bg-[#101218] rounded-lg border border-[#272a33] flex items-center justify-between">
                <div>
                  <p className="text-xs font-semibold text-white">Push Alert Preview [SIM]</p>
                  <p className="text-[11px] text-[#9ca3af]">Browser tray / in-app toast</p>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={handleTriggerTestPush}
                    className="text-[10px] text-[#38bdf8] hover:underline cursor-pointer"
                  >
                    {pushTestDispatched ? 'Previewed!' : 'Test Push'}
                  </button>
                  <input
                    type="checkbox"
                    checked={enablePush}
                    onChange={e => setEnablePush(e.target.checked)}
                    className="w-4 h-4 accent-[#d4af37] rounded cursor-pointer"
                  />
                </div>
              </div>

              <div className="p-3 bg-[#101218] rounded-lg border border-[#272a33] flex items-center justify-between">
                <div>
                  <p className="text-xs font-semibold text-white">Simulated SMS [SIM]</p>
                  <p className="text-[11px] text-[#9ca3af]">In-app demo preview only</p>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={handleTriggerTestSMS}
                    className="text-[10px] text-[#d4af37] hover:underline cursor-pointer"
                  >
                    {smsTestDispatched ? 'Previewed!' : 'Test SMS'}
                  </button>
                  <input
                    type="checkbox"
                    checked={enableSMS}
                    onChange={e => setEnableSMS(e.target.checked)}
                    className="w-4 h-4 accent-[#d4af37] rounded cursor-pointer"
                  />
                </div>
              </div>
            </div>
          </div>

          {/* Custom Notes */}
          <div className="space-y-2">
            <label className="text-xs font-medium uppercase tracking-wider text-[#9ca3af]">Custom Art Request & Prep Notes</label>
            <textarea
              rows={2}
              value={customNotes}
              onChange={e => setCustomNotes(e.target.value)}
              className="w-full px-3 py-2 text-xs bg-[#12141a] border border-[#272a33] rounded-lg text-white focus:outline-none focus:border-[#d4af37]"
            />
          </div>

          {/* Action buttons */}
          <div className="pt-2 flex items-center justify-between border-t border-[#1f222b]">
            <div className="text-xs">
              <span className="text-[#9ca3af]">Estimated Total: </span>
              <span className="font-mono text-base font-bold text-white">${currentService?.priceUSD || 0} USD</span>
            </div>

            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 text-xs text-[#9ca3af] hover:text-white transition-colors cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="btn-vangogh-gold text-xs py-2 px-5 flex items-center gap-1.5 shadow-lg"
              >
                <span>Proceed to Checkout [SIM]</span>
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
};
