// =============================================================================
// Stage 4 · Sprint 4.1 — Pure Payment Domain Contracts & Provider Port
// - Zero UI or [SIM] dependencies in domain layer (Manifest Law 2).
// - Zero raw PAN / CVV / cardholder secret fields anywhere in JS/DOM (PCI Zero-Touch).
// - Strict provider port: production settlement must redirect to Hosted PSP
//   Checkout / Elements; simulated mode must declare `isSimulated: true`.
// =============================================================================

import { Appointment, PaymentCurrency } from '../types';

export type PaymentMode = 'hosted_psp' | 'simulated';

export type PaymentIntentStatus =
  | 'requires_action'
  | 'authorized_hold'
  | 'captured'
  | 'partially_refunded'
  | 'released'
  | 'disputed'
  | 'canceled'
  | 'failed';

export const ALLOWED_PAYMENT_CURRENCIES: readonly PaymentCurrency[] = [
  'USD',
  'EUR',
  'GBP',
  'USDC',
  'ETH',
  'SOL',
  'NAIL',
] as const;

export function isAllowedPaymentCurrency(value: unknown): value is PaymentCurrency {
  return (
    typeof value === 'string' &&
    (ALLOWED_PAYMENT_CURRENCIES as readonly string[]).includes(value)
  );
}

export interface DepositIntent {
  id: string;
  bookingReferenceId: string;
  artistId: string;
  serviceId: string;
  /** Authoritative deposit amount in integer USD cents to prevent IEEE-754 drift. */
  amountMinor: number;
  /** Cumulative refunded amount in integer USD cents (V-03). */
  amountRefundedMinor?: number;
  /** Settlement currency code (USD cents until real multi-currency PSP routing). */
  currency: 'USD';
  /** UI preview currency selected by the client. */
  displayCurrency: PaymentCurrency;
  status: PaymentIntentStatus;
  mode: PaymentMode;
  providerId: string;
  providerLabel: string;
  isSimulated: boolean;
  hostedCheckoutUrl?: string;
  /** Internal Stripe PaymentIntent id for fallback webhook correlation (never exposed publicly). */
  stripePaymentIntentId?: string;
  /** Server-validated appointment slot stored with the intent (V-02). */
  appointmentDate?: string;
  appointmentTimeSlot?: string;
  createdAt: string;
  expiresAt: string;
}

/**
 * Minimal non-sensitive projection returned by public GET /api/payments/intents/:id (V-02).
 */
export interface PublicDepositIntentView {
  id: string;
  bookingReferenceId: string;
  artistId: string;
  serviceId: string;
  amountMinor: number;
  amountRefundedMinor?: number;
  currency: 'USD';
  displayCurrency: PaymentCurrency;
  status: PaymentIntentStatus;
  appointmentDate?: string;
  appointmentTimeSlot?: string;
  createdAt: string;
  expiresAt: string;
}

export function toPublicDepositIntentView(intent: DepositIntent): PublicDepositIntentView {
  return {
    id: intent.id,
    bookingReferenceId: intent.bookingReferenceId,
    artistId: intent.artistId,
    serviceId: intent.serviceId,
    amountMinor: intent.amountMinor,
    ...(typeof intent.amountRefundedMinor === 'number'
      ? { amountRefundedMinor: intent.amountRefundedMinor }
      : {}),
    currency: intent.currency,
    displayCurrency: intent.displayCurrency,
    status: intent.status,
    ...(intent.appointmentDate ? { appointmentDate: intent.appointmentDate } : {}),
    ...(intent.appointmentTimeSlot ? { appointmentTimeSlot: intent.appointmentTimeSlot } : {}),
    createdAt: intent.createdAt,
    expiresAt: intent.expiresAt,
  };
}

/**
 * Strictly binds a server DepositIntent to a local Appointment without trusting URL query params (V-02).
 */
export function matchIntentToAppointment(
  intent: Pick<PublicDepositIntentView, 'id' | 'bookingReferenceId' | 'artistId' | 'serviceId'>,
  appointments: readonly Appointment[]
): Appointment | undefined {
  return appointments.find(
    app =>
      app.id === intent.bookingReferenceId &&
      app.artistId === intent.artistId &&
      app.serviceId === intent.serviceId &&
      (!app.escrowTxHash || app.escrowTxHash === intent.id)
  );
}

export interface DepositSession {
  sessionId: string;
  intentId: string;
  providerId: string;
  providerLabel: string;
  mode: PaymentMode;
  isSimulated: boolean;
  authorizationRef: string;
  isRealSha256: boolean;
  status: PaymentIntentStatus;
  recordedAt: string;
}

export interface CreateDepositIntentRequest {
  bookingReferenceId: string;
  artistId: string;
  serviceId: string;
  amountUsd: number;
  displayCurrency: PaymentCurrency;
}

export interface ConfirmDepositRequest {
  intent: DepositIntent;
  idempotencyKey: string;
}

export interface ReleaseDepositRequest {
  intentId: string;
  authorizationRef: string;
}

export interface PaymentProviderCapabilities {
  providerId: string;
  label: string;
  mode: PaymentMode;
  isSimulated: boolean;
  acceptsRealMoney: boolean;
  collectsCardInDom: false;
  notice: string;
}

/**
 * Pure Payment Provider Port (Stripe Hosted Checkout / PSP adapters implement this interface).
 */
export interface PaymentProvider {
  readonly id: string;
  readonly label: string;
  readonly mode: PaymentMode;
  readonly isSimulated: boolean;
  getCapabilities(): PaymentProviderCapabilities;
  createDepositIntent(req: CreateDepositIntentRequest): Promise<DepositIntent>;
  confirmDeposit(req: ConfirmDepositRequest): Promise<DepositSession>;
  releaseDeposit(req: ReleaseDepositRequest): Promise<{ status: 'released'; updatedAt: string }>;
  cancelDeposit(intentId: string): Promise<{ status: 'canceled'; updatedAt: string }>;
}

/**
 * Converts a dollar decimal (e.g., 145.5) into integer minor units (14550 cents) safely.
 */
export function toMinorUnits(amountUsd: number): number {
  if (!Number.isFinite(amountUsd) || amountUsd < 0) {
    throw new Error(`Invalid deposit amount: ${String(amountUsd)}`);
  }
  return Math.round(amountUsd * 100);
}

/**
 * Formats integer cents to a fixed 2-decimal USD string.
 */
export function formatMinorUsd(amountMinor: number): string {
  if (!Number.isFinite(amountMinor) || amountMinor < 0) {
    return '0.00';
  }
  return (Math.round(amountMinor) / 100).toFixed(2);
}
