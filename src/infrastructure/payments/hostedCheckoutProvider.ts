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
} from '../../domain/payments';
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

export async function createServerHostedCheckoutSession(params: {
  bookingReferenceId: string;
  artistId: string;
  artistName: string;
  serviceId: string;
  serviceName: string;
  amountUsd: number;
  displayCurrency: PaymentCurrency;
}): Promise<{ intent: DepositIntent; hostedCheckoutUrl: string }> {
  const res = await fetch('/api/payments/checkout-session', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      ...params,
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
