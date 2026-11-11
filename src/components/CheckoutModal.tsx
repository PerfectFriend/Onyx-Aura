import React, { useState } from 'react';
import { X, ShieldCheck, CheckCircle2, CreditCard, Lock, Sparkles, ArrowRight, Wallet, Receipt } from 'lucide-react';
import { Artist, NailService, PaymentCurrency, PortfolioItem, Appointment } from '../types';
import { computeSHA256 } from '../services/cryptocloud';
import { CornerFlourish } from './OrnamentalFlourish';
import { CalendarSyncButtons } from './CalendarSyncButtons';

interface CheckoutModalProps {
  isOpen: boolean;
  onClose: () => void;
  bookingDetails: {
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
  } | null;
  onPaymentSuccess: (appointment: Appointment) => void;
}

const RATES: Record<PaymentCurrency, { rate: number; symbol: string; isCrypto: boolean }> = {
  USD: { rate: 1.0, symbol: '$', isCrypto: false },
  EUR: { rate: 0.92, symbol: '€', isCrypto: false },
  GBP: { rate: 0.79, symbol: '£', isCrypto: false },
  USDC: { rate: 1.0, symbol: 'USDC', isCrypto: true },
  ETH: { rate: 0.00034, symbol: 'ETH', isCrypto: true },
  SOL: { rate: 0.0071, symbol: 'SOL', isCrypto: true },
  NAIL: { rate: 4.5, symbol: '$NAIL', isCrypto: true }, // Staking utility token
};

export const CheckoutModal: React.FC<CheckoutModalProps> = ({
  isOpen,
  onClose,
  bookingDetails,
  onPaymentSuccess,
}) => {
  if (!isOpen || !bookingDetails) return null;

  const [selectedCurrency, setSelectedCurrency] = useState<PaymentCurrency>('USDC');
  const [tipPercentage, setTipPercentage] = useState<number>(18);
  const [isProcessing, setIsProcessing] = useState<boolean>(false);
  const [completedTx, setCompletedTx] = useState<{
    txHash: string;
    totalAmount: string;
    currency: PaymentCurrency;
  } | null>(null);
  const [confirmedAppointment, setConfirmedAppointment] = useState<Appointment | null>(null);

  // Card state for fiat
  const [cardNumber, setCardNumber] = useState<string>('•••• •••• •••• 4242');
  const [cardExp, setCardExp] = useState<string>('12/28');
  const [cardCvc, setCardCvc] = useState<string>('888');

  // Wallet address for crypto
  const [connectedWallet, setConnectedWallet] = useState<string>('0x71cA9...8E29 (Web3 Active)');

  const basePriceUSD = bookingDetails.service.priceUSD;
  const tipAmountUSD = Math.round((basePriceUSD * tipPercentage) / 100);
  const totalUSD = basePriceUSD + tipAmountUSD;

  // Convert to selected currency
  const currencyInfo = RATES[selectedCurrency];
  const convertedTotal = (totalUSD * currencyInfo.rate).toFixed(currencyInfo.isCrypto ? 4 : 2);

  const handlePay = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsProcessing(true);

    try {
      const txPayload = `${Date.now()}:${bookingDetails.artist.id}:${totalUSD}:${selectedCurrency}`;
      const txHash = await computeSHA256(txPayload);

      // Simulate network latency
      await new Promise(resolve => setTimeout(resolve, 1400));

      const newAppointment: Appointment = {
        id: `apt-${Date.now()}`,
        clientName: bookingDetails.clientName,
        clientPhone: bookingDetails.clientPhone,
        clientEmail: bookingDetails.clientEmail,
        artistId: bookingDetails.artist.id,
        artistName: bookingDetails.artist.name,
        artistAvatar: bookingDetails.artist.avatar,
        serviceId: bookingDetails.service.id,
        serviceName: bookingDetails.service.name,
        price: totalUSD,
        currency: selectedCurrency,
        cryptoEquivalent: currencyInfo.isCrypto ? `${convertedTotal} ${currencyInfo.symbol}` : undefined,
        date: bookingDetails.date,
        timeSlot: bookingDetails.timeSlot,
        status: 'escrow_locked',
        escrowTxHash: txHash,
        remindersEnabled: bookingDetails.enablePush || bookingDetails.enableSMS,
        pushReminderScheduled: bookingDetails.enablePush,
        smsReminderScheduled: bookingDetails.enableSMS,
        referenceLookTitle: bookingDetails.referenceLook?.title,
        referenceLookImage: bookingDetails.referenceLook?.image,
        customNotes: bookingDetails.customNotes,
        createdAt: new Date().toISOString(),
      };

      setCompletedTx({
        txHash,
        totalAmount: convertedTotal,
        currency: selectedCurrency,
      });
      setConfirmedAppointment(newAppointment);

      onPaymentSuccess(newAppointment);
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6 bg-black/85 backdrop-blur-md">
      <div 
        className="relative w-full max-w-xl gaudi-mosaic-card border border-amber-400/40 shadow-2xl flex flex-col max-h-[92vh]"
        onClick={e => e.stopPropagation()}
      >
        <CornerFlourish position="top-left" className="absolute top-2 left-2 z-10" size={32} />
        <CornerFlourish position="top-right" className="absolute top-2 right-2 z-10" size={32} />

        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-cyan-500/20">
          <div>
            <div className="text-xs font-mono text-amber-300">STEP 2 OF 2 · DECENTRALIZED MULTI-CURRENCY CHECKOUT</div>
            <h2 className="font-display text-lg font-bold text-white">Smart Contract Escrow Payment</h2>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-full text-gray-400 hover:text-white hover:bg-white/10 transition-colors cursor-pointer"
            aria-label="Close modal"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        {!completedTx ? (
          <form onSubmit={handlePay} className="p-6 overflow-y-auto space-y-6">
            
            {/* Order Summary Item */}
            <div className="p-4 bg-[#15171e] rounded-xl border border-[#272a33] flex items-center justify-between">
              <div>
                <span className="text-[11px] font-mono text-[#d4af37]">BOOKING SUMMARY</span>
                <h4 className="text-sm font-semibold text-white">{bookingDetails.service.name}</h4>
                <p className="text-xs text-[#9ca3af]">
                  With {bookingDetails.artist.name} · {bookingDetails.date} at {bookingDetails.timeSlot}
                </p>
              </div>
              <div className="text-right">
                <p className="font-mono text-base font-bold text-white">${basePriceUSD} USD</p>
                <p className="text-[10px] text-[#9ca3af]">{bookingDetails.service.durationMinutes} mins</p>
              </div>
            </div>

            {/* Currency Selector (Multi-Currency) */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <label className="text-xs font-medium uppercase tracking-wider text-[#9ca3af]">
                  Payment Currency (Fiat & Crypto)
                </label>
                {selectedCurrency === 'NAIL' && (
                  <span className="text-[11px] text-[#34d399] font-mono">5% Community Staking Rebate Applied</span>
                )}
              </div>
              <div className="grid grid-cols-4 sm:grid-cols-7 gap-2">
                {(['USDC', 'ETH', 'SOL', 'NAIL', 'USD', 'EUR', 'GBP'] as PaymentCurrency[]).map(curr => {
                  const isSelected = selectedCurrency === curr;
                  return (
                    <button
                      key={curr}
                      type="button"
                      onClick={() => setSelectedCurrency(curr)}
                      className={`py-2 px-1 text-xs font-mono font-medium rounded-lg border text-center transition-all cursor-pointer ${
                        isSelected
                          ? 'border-[#d4af37] bg-[#1a1b24] text-white shadow-sm'
                          : 'border-[#272a33] bg-[#12141a] text-[#9ca3af] hover:text-white hover:border-[#3b3f4d]'
                      }`}
                    >
                      {curr}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Tip Selection */}
            <div className="space-y-2">
              <label className="text-xs font-medium uppercase tracking-wider text-[#9ca3af]">
                Add Master Artist Gratuity
              </label>
              <div className="grid grid-cols-4 gap-2">
                {[0, 15, 18, 22].map(pct => (
                  <button
                    key={pct}
                    type="button"
                    onClick={() => setTipPercentage(pct)}
                    className={`py-2 text-xs font-mono rounded-lg border transition-all cursor-pointer ${
                      tipPercentage === pct
                        ? 'border-[#d4af37] bg-[#1a1b24] text-white font-semibold'
                        : 'border-[#272a33] bg-[#12141a] text-[#9ca3af] hover:text-white'
                    }`}
                  >
                    {pct === 0 ? 'No Tip' : `${pct}% (+$${Math.round((basePriceUSD * pct) / 100)})`}
                  </button>
                ))}
              </div>
            </div>

            {/* Payment Method Interface */}
            {currencyInfo.isCrypto ? (
              <div className="p-4 bg-[#12141a] rounded-xl border border-[#272a33] space-y-3">
                <div className="flex items-center justify-between text-xs">
                  <span className="text-[#9ca3af] flex items-center gap-1.5">
                    <Wallet className="w-3.5 h-3.5 text-[#38bdf8]" />
                    <span>Decentralized Wallet</span>
                  </span>
                  <span className="font-mono text-[#34d399] text-[11px]">Connected</span>
                </div>
                <div className="p-2.5 bg-[#0b0c10] rounded border border-[#272a33] font-mono text-xs text-white truncate">
                  {connectedWallet}
                </div>
                <p className="text-[11px] text-[#9ca3af]">
                  Network gas fee: ~0.0001 {selectedCurrency} · Instant cryptographic settlement
                </p>
              </div>
            ) : (
              <div className="p-4 bg-[#12141a] rounded-xl border border-[#272a33] space-y-3">
                <div className="flex items-center justify-between text-xs">
                  <span className="text-[#9ca3af] flex items-center gap-1.5">
                    <CreditCard className="w-3.5 h-3.5 text-[#d4af37]" />
                    <span>Card Checkout (Multi-Currency)</span>
                  </span>
                  <span className="text-[11px] text-[#9ca3af] flex items-center gap-1">
                    <Lock className="w-3 h-3 text-[#34d399]" />
                    <span>256-Bit Encrypted</span>
                  </span>
                </div>
                <input
                  type="text"
                  value={cardNumber}
                  onChange={e => setCardNumber(e.target.value)}
                  className="w-full px-3 py-2 text-xs bg-[#0b0c10] border border-[#272a33] rounded text-white font-mono"
                  placeholder="Card Number"
                />
                <div className="grid grid-cols-2 gap-2">
                  <input
                    type="text"
                    value={cardExp}
                    onChange={e => setCardExp(e.target.value)}
                    className="w-full px-3 py-2 text-xs bg-[#0b0c10] border border-[#272a33] rounded text-white font-mono"
                    placeholder="MM/YY"
                  />
                  <input
                    type="text"
                    value={cardCvc}
                    onChange={e => setCardCvc(e.target.value)}
                    className="w-full px-3 py-2 text-xs bg-[#0b0c10] border border-[#272a33] rounded text-white font-mono"
                    placeholder="CVC"
                  />
                </div>
              </div>
            )}

            {/* Smart Contract Escrow Guarantee Box */}
            <div className="p-3.5 rounded-lg bg-[#15171e] border border-[#272a33] flex items-start gap-3">
              <ShieldCheck className="w-5 h-5 text-[#d4af37] shrink-0 mt-0.5" />
              <div className="text-xs space-y-1">
                <p className="font-semibold text-white">Smart Contract Escrow Guarantee</p>
                <p className="text-[#9ca3af] leading-relaxed">
                  Your funds are locked in an immutable multi-sig escrow contract. The artist receives payment only after you verify the physical appointment completion in the app.
                </p>
              </div>
            </div>

            {/* Total Breakdown */}
            <div className="space-y-1.5 pt-2 border-t border-[#1f222b] text-xs">
              <div className="flex justify-between text-[#9ca3af]">
                <span>Service Base</span>
                <span className="font-mono tabular-nums">${basePriceUSD}</span>
              </div>
              <div className="flex justify-between text-[#9ca3af]">
                <span>Gratuity ({tipPercentage}%)</span>
                <span className="font-mono tabular-nums">${tipAmountUSD}</span>
              </div>
              <div className="flex justify-between text-white font-semibold text-sm pt-2 border-t border-[#1f222b]">
                <span>Total Escrow Deposit</span>
                <span className="font-mono text-base text-[#d4af37] tabular-nums">
                  {convertedTotal} {selectedCurrency} (${totalUSD} USD)
                </span>
              </div>
            </div>

            {/* Submit Button */}
            <div className="pt-2">
              <button
                type="submit"
                disabled={isProcessing}
                className="w-full py-3 text-xs font-bold uppercase tracking-wider btn-vangogh-gold flex items-center justify-center gap-2 shadow-xl cursor-pointer disabled:opacity-50"
              >
                {isProcessing ? (
                  <>
                    <span className="w-4 h-4 border-2 border-black border-t-transparent rounded-full animate-spin" />
                    <span>Broadcasting Escrow to Swarm...</span>
                  </>
                ) : (
                  <>
                    <Lock className="w-4 h-4" />
                    <span>Lock Escrow ({convertedTotal} {selectedCurrency})</span>
                  </>
                )}
              </button>
            </div>

          </form>
        ) : (
          /* Confirmation State */
          <div className="p-8 text-center space-y-6">
            <div className="w-16 h-16 rounded-full bg-[#10b981]/10 text-[#34d399] flex items-center justify-center mx-auto border border-[#34d399]/30">
              <CheckCircle2 className="w-8 h-8" />
            </div>

            <div className="space-y-2">
              <h3 className="font-display text-2xl font-bold text-white">Escrow Secured & Locked</h3>
              <p className="text-xs text-[#9ca3af] max-w-md mx-auto leading-relaxed">
                Your appointment with <span className="text-white font-medium">{bookingDetails.artist.name}</span> for{' '}
                <span className="text-white font-medium">{bookingDetails.service.name}</span> is confirmed for{' '}
                <span className="text-[#d4af37] font-medium">{bookingDetails.date}</span> at{' '}
                <span className="text-[#d4af37] font-medium">{bookingDetails.timeSlot}</span>.
              </p>
            </div>

            {/* Transaction Hash */}
            <div className="p-3 bg-[#15171e] rounded-lg border border-[#272a33] text-left text-xs font-mono space-y-1">
              <div className="flex justify-between text-[#9ca3af] text-[11px]">
                <span>SMART CONTRACT ESCROW TX</span>
                <span className="text-[#34d399]">CONFIRMED ON-CHAIN</span>
              </div>
              <p className="text-white truncate">{completedTx.txHash}</p>
              <div className="flex justify-between text-[11px] text-[#9ca3af] pt-1">
                <span>Amount: {completedTx.totalAmount} {completedTx.currency}</span>
                <span>Swarm Peers Notified: 4/4</span>
              </div>
            </div>

            {/* Reminder Badge */}
            <div className="text-xs text-[#9ca3af]">
              {bookingDetails.enableSMS && (
                <p>✓ 24h & 2h automated SMS reminders queued for {bookingDetails.clientPhone}</p>
              )}
              {bookingDetails.enablePush && (
                <p>✓ Instant push notifications active on this browser</p>
              )}
            </div>

            {/* Standardized Calendar Sync (Google Calendar & Apple Calendar .ICS Download) */}
            {confirmedAppointment && (
              <div className="pt-2 text-left">
                <CalendarSyncButtons
                  appointment={confirmedAppointment}
                  artist={bookingDetails.artist}
                  variant="banner"
                />
              </div>
            )}

            <div className="pt-4 flex items-center justify-center gap-3">
              <button
                onClick={onClose}
                className="px-6 py-2.5 text-xs font-semibold text-[#0b0c10] bg-[#d4af37] hover:bg-[#e6c158] rounded-md transition-all cursor-pointer shadow-lg active:scale-95"
              >
                Return to Network
              </button>
            </div>
          </div>
        )}

      </div>
    </div>
  );
};
