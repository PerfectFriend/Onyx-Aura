// =============================================================================
// Stage 4 · Sprint 4.1 — Pure Payment Domain Contracts & Provider Port
// - Zero UI or [SIM] dependencies in domain layer (Manifest Law 2).
// - Zero raw PAN / CVV / cardholder secret fields anywhere in JS/DOM (PCI Zero-Touch).
// - Strict provider port: production settlement must redirect to Hosted PSP
//   Checkout / Elements; simulated mode must declare `isSimulated: true`.
// =============================================================================

import { PaymentCurrency } from '../types';

export type PaymentMode = 'hosted_psp' | 'simulated';

export type PaymentIntentStatus =
  | 'requires_action'
  | 'authorized_hold'
  | 'captured'
  | 'released'
  | 'canceled'
  | 'failed';

export interface DepositIntent {
  id: string;
  bookingReferenceId: string;
  artistId: string;
  serviceId: string;
  /** Authoritative deposit amount in integer USD cents to prevent IEEE-754 drift. */
  amountMinor: number;
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
  createdAt: string;
  expiresAt: string;
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
