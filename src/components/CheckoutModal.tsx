import React, { useEffect, useState } from 'react';
import { X, ShieldCheck, CheckCircle2, CreditCard, Lock, Wallet, ExternalLink } from 'lucide-react';
import { Artist, NailService, PaymentCurrency, PortfolioItem, Appointment } from '../types';
import { PaymentProviderCapabilities } from '../domain/payments';
import {
  createServerHostedCheckoutSession,
  resolveActivePaymentCapabilities,
} from '../infrastructure/payments/hostedCheckoutProvider';
import { defaultPaymentProvider } from '../infrastructure/payments/mockPaymentProvider';
import { CornerFlourish } from './OrnamentalFlourish';
import { CalendarSyncButtons } from './CalendarSyncButtons';

interface BookingDetailsPayload {
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
}

interface CheckoutModalProps {
  isOpen: boolean;
  onClose: () => void;
  bookingDetails: BookingDetailsPayload | null;
  onPaymentSuccess: (appointment: Appointment) => void;
  onHostedPendingCreated?: (appointment: Appointment) => Promise<void> | void;
}

const RATES: Record<PaymentCurrency, { rate: number; symbol: string; isCrypto: boolean }> = {
  USD: { rate: 1.0, symbol: '$', isCrypto: false },
  EUR: { rate: 0.92, symbol: '€', isCrypto: false },
  GBP: { rate: 0.79, symbol: '£', isCrypto: false },
  USDC: { rate: 1.0, symbol: 'USDC', isCrypto: true },
  ETH: { rate: 0.00034, symbol: 'ETH', isCrypto: true },
  SOL: { rate: 0.0071, symbol: 'SOL', isCrypto: true },
  NAIL: { rate: 4.5, symbol: '$NAIL [SIM]', isCrypto: true },
};

export const CheckoutModal: React.FC<CheckoutModalProps> = ({
  isOpen,
  onClose,
  bookingDetails,
  onPaymentSuccess,
  onHostedPendingCreated,
}) => {
  if (!isOpen || !bookingDetails) return null;

  return (
    <CheckoutModalContent
      onClose={onClose}
      bookingDetails={bookingDetails}
      onPaymentSuccess={onPaymentSuccess}
      onHostedPendingCreated={onHostedPendingCreated}
    />
  );
};

interface CheckoutModalContentProps {
  onClose: () => void;
  bookingDetails: BookingDetailsPayload;
  onPaymentSuccess: (appointment: Appointment) => void;
  onHostedPendingCreated?: (appointment: Appointment) => Promise<void> | void;
}

const CheckoutModalContent: React.FC<CheckoutModalContentProps> = ({
  onClose,
  bookingDetails,
  onPaymentSuccess,
  onHostedPendingCreated,
}) => {
  const [selectedCurrency, setSelectedCurrency] = useState<PaymentCurrency>('USDC');
  const [tipPercentage, setTipPercentage] = useState<number>(18);
  const [isProcessing, setIsProcessing] = useState<boolean>(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [capabilities, setCapabilities] = useState<PaymentProviderCapabilities>(() =>
    defaultPaymentProvider.getCapabilities()
  );
  const [completedTx, setCompletedTx] = useState<{
    txHash: string;
    isRealSha256: boolean;
    totalAmount: string;
    currency: PaymentCurrency;
  } | null>(null);
  const [confirmedAppointment, setConfirmedAppointment] = useState<Appointment | null>(null);

  useEffect(() => {
    let active = true;
    resolveActivePaymentCapabilities()
      .then(caps => {
        if (active) setCapabilities(caps);
      })
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, []);

  const demoWalletLabel = '0xSIM_WALLET_71cA9...8E29 (Demo Preview)';

  const basePriceUSD = bookingDetails.service.priceUSD;
  const tipAmountUSD = Math.round((basePriceUSD * tipPercentage) / 100);
  const totalUSD = basePriceUSD + tipAmountUSD;

  const currencyInfo = RATES[selectedCurrency];
  const convertedTotal = (totalUSD * currencyInfo.rate).toFixed(currencyInfo.isCrypto ? 4 : 2);
  const isHostedStripeFlow = !currencyInfo.isCrypto && !capabilities.isSimulated;

  const handlePay = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsProcessing(true);
    setErrorMessage(null);

    try {
      const bookingRefId =
        typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
          ? `apt-${crypto.randomUUID().slice(0, 8)}`
          : `apt-${Date.now()}`;

      if (isHostedStripeFlow) {
        const { intent, hostedCheckoutUrl } = await createServerHostedCheckoutSession({
          bookingReferenceId: bookingRefId,
          artistId: bookingDetails.artist.id,
          serviceId: bookingDetails.service.id,
          tipPercentage,
          displayCurrency: selectedCurrency,
        });

        // Q-04: Save pending booking in IndexedDB BEFORE redirecting to Stripe Hosted Checkout
        const pendingAppointment: Appointment = {
          id: bookingRefId,
          clientName: bookingDetails.clientName,
          clientPhone: bookingDetails.clientPhone,
          clientEmail: bookingDetails.clientEmail,
          artistId: bookingDetails.artist.id,
          artistName: bookingDetails.artist.name,
          artistAvatar: bookingDetails.artist.avatar,
          serviceId: bookingDetails.service.id,
          serviceName: bookingDetails.service.name,
          price: Number((intent.amountMinor / 100).toFixed(2)),
          currency: selectedCurrency,
          date: bookingDetails.date,
          timeSlot: bookingDetails.timeSlot,
          status: 'pending',
          escrowTxHash: intent.id,
          remindersEnabled: bookingDetails.enablePush || bookingDetails.enableSMS,
          pushReminderScheduled: bookingDetails.enablePush,
          smsReminderScheduled: bookingDetails.enableSMS,
          referenceLookTitle: bookingDetails.referenceLook?.title,
          referenceLookImage: bookingDetails.referenceLook?.image,
          customNotes: bookingDetails.customNotes,
          createdAt: intent.createdAt,
          origin: 'user',
        };
        await onHostedPendingCreated?.(pendingAppointment);

        window.location.assign(hostedCheckoutUrl);
        return;
      }

      const intent = await defaultPaymentProvider.createDepositIntent({
        bookingReferenceId: bookingRefId,
        artistId: bookingDetails.artist.id,
        serviceId: bookingDetails.service.id,
        amountUsd: totalUSD,
        displayCurrency: selectedCurrency,
      });

      const session = await defaultPaymentProvider.confirmDeposit({
        intent,
        idempotencyKey: `idem-${bookingRefId}`,
      });

      const newAppointment: Appointment = {
        id: bookingRefId,
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
        escrowTxHash: session.authorizationRef,
        remindersEnabled: bookingDetails.enablePush || bookingDetails.enableSMS,
        pushReminderScheduled: bookingDetails.enablePush,
        smsReminderScheduled: bookingDetails.enableSMS,
        referenceLookTitle: bookingDetails.referenceLook?.title,
        referenceLookImage: bookingDetails.referenceLook?.image,
        customNotes: bookingDetails.customNotes,
        createdAt: session.recordedAt,
      };

      setCompletedTx({
        txHash: session.authorizationRef,
        isRealSha256: session.isRealSha256,
        totalAmount: convertedTotal,
        currency: selectedCurrency,
      });
      setConfirmedAppointment(newAppointment);
      onPaymentSuccess(newAppointment);
    } catch (err) {
      setErrorMessage(
        err instanceof Error ? err.message : 'Unable to complete demo checkout snapshot.'
      );
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
            <div className="flex items-center gap-2">
              <span className="text-xs font-mono text-amber-300">STEP 2 OF 2 · MULTI-CURRENCY PREVIEW</span>
              <span className="px-1.5 py-0.5 text-[9px] font-bold rounded bg-red-950/90 text-red-300 border border-red-500/60 tracking-wider">
                [SIM] DEMO CHECKOUT
              </span>
            </div>
            <h2 className="font-display text-lg font-bold text-white">Deposit Checkout [SIM]</h2>
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
          <form onSubmit={(e) => { void handlePay(e); }} className="p-6 overflow-y-auto space-y-6">
            {errorMessage && (
              <div className="p-3 rounded-lg bg-red-950/70 border border-red-500/50 text-xs text-red-200">
                {errorMessage}
              </div>
            )}

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
                <p id="checkout-currency-label" className="text-xs font-medium uppercase tracking-wider text-[#9ca3af]">
                  Estimated Display Currency [SIM Rates]
                </p>
                {selectedCurrency === 'NAIL' && (
                  <span className="text-[11px] text-[#34d399] font-mono">[SIM] Demo Token Preview</span>
                )}
              </div>
              <div role="group" aria-labelledby="checkout-currency-label" className="grid grid-cols-4 sm:grid-cols-7 gap-2">
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
              <p id="checkout-tip-label" className="text-xs font-medium uppercase tracking-wider text-[#9ca3af]">
                Add Master Artist Gratuity
              </p>
              <div role="group" aria-labelledby="checkout-tip-label" className="grid grid-cols-4 gap-2">
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
              <div className="p-4 bg-[#12141a] rounded-xl border border-red-500/30 space-y-3">
                <div className="flex items-center justify-between text-xs">
                  <span className="text-[#9ca3af] flex items-center gap-1.5">
                    <Wallet className="w-3.5 h-3.5 text-[#38bdf8]" />
                    <span>Wallet Preview [SIM]</span>
                  </span>
                  <span className="font-mono text-red-300 text-[11px]">[SIM] Local Mock</span>
                </div>
                <div className="p-2.5 bg-[#0b0c10] rounded border border-[#272a33] font-mono text-xs text-white truncate">
                  {demoWalletLabel}
                </div>
                <p className="text-[11px] text-[#9ca3af]">
                  [SIM] Static demo rate · No real blockchain transaction or wallet signing occurs.
                </p>
              </div>
            ) : (
              <div
                className={`p-4 bg-[#12141a] rounded-xl border space-y-2.5 ${
                  isHostedStripeFlow ? 'border-emerald-500/40' : 'border-red-500/30'
                }`}
              >
                <div className="flex items-center justify-between text-xs">
                  <span className="text-[#9ca3af] flex items-center gap-1.5">
                    <CreditCard className="w-3.5 h-3.5 text-[#d4af37]" />
                    <span>{capabilities.label}</span>
                  </span>
                  <span
                    className={`text-[11px] font-mono ${
                      isHostedStripeFlow ? 'text-emerald-300' : 'text-red-300'
                    }`}
                  >
                    {isHostedStripeFlow ? 'SAQ-A · ZERO CARD INPUTS' : '[SIM] ZERO CARD INPUTS'}
                  </span>
                </div>
                <p className="text-[11px] text-[#9ca3af] leading-relaxed">
                  {capabilities.notice}
                </p>
              </div>
            )}

            {/* Honest Deposit Notice Box */}
            <div
              className={`p-3.5 rounded-lg border flex items-start gap-3 ${
                isHostedStripeFlow
                  ? 'bg-emerald-950/20 border-emerald-500/40'
                  : 'bg-red-950/25 border-red-500/40'
              }`}
            >
              <ShieldCheck
                className={`w-5 h-5 shrink-0 mt-0.5 ${
                  isHostedStripeFlow ? 'text-emerald-300' : 'text-red-300'
                }`}
              />
              <div className="text-xs space-y-1">
                <p className="font-semibold text-white">
                  {isHostedStripeFlow
                    ? 'Stripe Hosted Checkout (SAQ-A)'
                    : 'Demo Deposit Guarantee [SIM]'}
                </p>
                <p className="text-[#9ca3af] leading-relaxed">
                  {isHostedStripeFlow
                    ? 'You will be redirected to Stripe Hosted Checkout. Nailix never renders card inputs or sees PAN/CVC details.'
                    : '[SIM] Local session simulation: no real money, card charge, or smart contract execution takes place. Booking state lives in memory for this browser session.'}
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
                <span>{isHostedStripeFlow ? 'Deposit Total' : 'Simulated Total [SIM]'}</span>
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
                    <span>
                      {isHostedStripeFlow
                        ? 'Connecting to Stripe Checkout...'
                        : 'Saving Demo Booking [SIM]...'}
                    </span>
                  </>
                ) : isHostedStripeFlow ? (
                  <>
                    <ExternalLink className="w-4 h-4" />
                    <span>Proceed to Stripe Checkout (${totalUSD} USD)</span>
                  </>
                ) : (
                  <>
                    <Lock className="w-4 h-4" />
                    <span>Confirm Demo Deposit ({convertedTotal} {selectedCurrency}) [SIM]</span>
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
              <h3 className="font-display text-2xl font-bold text-white">Demo Booking Recorded [SIM]</h3>
              <p className="text-xs text-[#9ca3af] max-w-md mx-auto leading-relaxed">
                Your session preview with <span className="text-white font-medium">{bookingDetails.artist.name}</span> for{' '}
                <span className="text-white font-medium">{bookingDetails.service.name}</span> is set for{' '}
                <span className="text-[#d4af37] font-medium">{bookingDetails.date}</span> at{' '}
                <span className="text-[#d4af37] font-medium">{bookingDetails.timeSlot}</span>.
              </p>
            </div>

            {/* Transaction Hash */}
            <div className="p-3 bg-[#15171e] rounded-lg border border-red-500/40 text-left text-xs font-mono space-y-1">
              <div className="flex justify-between text-[#9ca3af] text-[11px]">
                <span className="flex items-center gap-1.5">
                  <span className="px-1 py-0.2 bg-red-900/60 text-red-300 rounded text-[9px] font-bold">[SIM]</span>
                  <span>LOCAL BOOKING REF</span>
                </span>
                <span className="text-red-300 font-bold">
                  {completedTx.isRealSha256 ? '[SIM] LOCAL SHA-256' : '[SIM] PSEUDOHASH (non-HTTPS)'}
                </span>
              </div>
              <p className="text-white truncate">{completedTx.txHash}</p>
              <div className="flex justify-between text-[11px] text-[#9ca3af] pt-1">
                <span>Demo Amount: {completedTx.totalAmount} {completedTx.currency}</span>
                <span>BroadcastChannel [SIM]</span>
              </div>
            </div>

            {/* Reminder Badge */}
            <div className="text-xs text-[#9ca3af]">
              {bookingDetails.enableSMS && (
                <p>✓ [SIM] In-app SMS preview queued for {bookingDetails.clientPhone} (no carrier text sent)</p>
              )}
              {bookingDetails.enablePush && (
                <p>✓ [SIM] In-app notification preview triggered for this browser session</p>
              )}
            </div>

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
                Return to Salon
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
