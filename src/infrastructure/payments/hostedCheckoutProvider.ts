// =============================================================================
// Stage 4 · Sprint 4.2 — Hosted PSP Client Adapter (Stripe Checkout SAQ-A)
// - Queries `/api/payments/provider` to determine whether real Stripe Hosted
//   Checkout is configured on the server; falls back transparently to [SIM]
//   MockPaymentProvider when unconfigured.
// - Strictly forbids card inputs in React DOM (`collectsCardInDom: false`).
// =============================================================================

import {
  DepositIntent,
  PaymentProviderCapabilities,
  PublicDepositIntentView,
} from '../../domain/payments';
import { AuthoritativeDepositQuote } from '../../domain/serviceCatalog';
import { PaymentCurrency } from '../../types';
import { defaultPaymentProvider } from './mockPaymentProvider';

export interface ServerProviderProbeResult {
  activeProviderId: 'stripe_hosted' | 'mock_sim';
  mode: 'hosted_psp' | 'simulated';
  isSimulated: boolean;
  hostedCheckoutConfigured: boolean;
  webhookVerificationConfigured: boolean;
  pciInputsAllowedInDom: false;
}

export async function probeServerPaymentProvider(): Promise<ServerProviderProbeResult> {
  if (typeof fetch === 'function') {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 1200);
      const res = await fetch('/api/payments/provider', { signal: controller.signal });
      clearTimeout(timeout);
      if (res.ok) {
        return (await res.json()) as ServerProviderProbeResult;
      }
    } catch {
      // Offline / static preview cleanly resolves to simulated default
    }
  }

  return {
    activeProviderId: 'mock_sim',
    mode: 'simulated',
    isSimulated: true,
    hostedCheckoutConfigured: false,
    webhookVerificationConfigured: false,
    pciInputsAllowedInDom: false,
  };
}

export async function fetchServerDepositQuote(params: {
  artistId: string;
  serviceId: string;
  tipPercentage: number;
}): Promise<AuthoritativeDepositQuote | null> {
  if (typeof fetch !== 'function') return null;
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 1500);
    const qs = new URLSearchParams({
      artistId: params.artistId,
      serviceId: params.serviceId,
      tipPercentage: String(params.tipPercentage),
    });
    const res = await fetch(`/api/payments/quote?${qs.toString()}`, {
      credentials: 'same-origin',
      signal: controller.signal,
    });
    clearTimeout(timeout);
    if (!res.ok) return null;
    const data = (await res.json()) as { quote?: AuthoritativeDepositQuote };
    return data.quote ?? null;
  } catch {
    return null;
  }
}

export async function createServerHostedCheckoutSession(params: {
  bookingReferenceId: string;
  artistId: string;
  serviceId: string;
  tipPercentage: number;
  displayCurrency: PaymentCurrency;
  appointmentDate?: string;
  appointmentTimeSlot?: string;
}): Promise<{ intent: DepositIntent; hostedCheckoutUrl: string }> {
  const res = await fetch('/api/payments/checkout-session', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'same-origin',
    body: JSON.stringify({
      bookingReferenceId: params.bookingReferenceId,
      artistId: params.artistId,
      serviceId: params.serviceId,
      tipPercentage: params.tipPercentage,
      displayCurrency: params.displayCurrency,
      ...(params.appointmentDate ? { appointmentDate: params.appointmentDate } : {}),
      ...(params.appointmentTimeSlot ? { appointmentTimeSlot: params.appointmentTimeSlot } : {}),
      originUrl: typeof window !== 'undefined' ? window.location.origin : 'http://localhost:3000',
    }),
  });

  if (!res.ok) {
    const err = (await res.json().catch(() => ({}))) as { error?: unknown };
    throw new Error(
      typeof err.error === 'string'
        ? err.error
        : `Hosted checkout session failed (${res.status}).`
    );
  }

  const data = (await res.json()) as {
    intent: DepositIntent;
    hostedCheckoutUrl?: unknown;
  };

  if (typeof data.hostedCheckoutUrl !== 'string' || !data.hostedCheckoutUrl.startsWith('https://')) {
    throw new Error('Server returned an invalid Stripe Hosted Checkout URL.');
  }

  return {
    intent: data.intent,
    hostedCheckoutUrl: data.hostedCheckoutUrl,
  };
}

export async function fetchServerPaymentIntentStatus(
  intentId: string
): Promise<PublicDepositIntentView | null> {
  if (!intentId || typeof fetch !== 'function') return null;
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 3000);
    const res = await fetch(`/api/payments/intents/${encodeURIComponent(intentId)}`, {
      credentials: 'same-origin',
      signal: controller.signal,
    });
    clearTimeout(timeout);
    if (!res.ok) return null;
    const data = (await res.json()) as { intent?: PublicDepositIntentView };
    return data.intent ?? null;
  } catch {
    return null;
  }
}

export async function resolveActivePaymentCapabilities(): Promise<PaymentProviderCapabilities> {
  const probe = await probeServerPaymentProvider();
  if (probe.hostedCheckoutConfigured && !probe.isSimulated) {
    return {
      providerId: 'stripe_hosted',
      label: 'Stripe Hosted Checkout (SAQ-A)',
      mode: 'hosted_psp',
      isSimulated: false,
      acceptsRealMoney: true,
      collectsCardInDom: false,
      notice:
        'Stripe Hosted Checkout SAQ-A active on server: card details are entered exclusively on Stripe HTTPS checkout.',
    };
  }
  return defaultPaymentProvider.getCapabilities();
}
