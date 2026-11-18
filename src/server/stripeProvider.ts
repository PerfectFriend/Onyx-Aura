// =============================================================================
// Stage 4 · Sprint 4.2 — Env-Driven Stripe Hosted Checkout (SAQ-A) & Webhooks
// - NEVER handles card numbers, expiry, or CVC (Zero-PCI boundary).
// - Reads STRIPE_SECRET_KEY / STRIPE_WEBHOOK_SECRET strictly from env/config.
// - Verifies Stripe-Signature (`t=...,v1=...`) using HMAC-SHA256 & timingSafeEqual.
// - Honestly reports unconfigured state so client falls back to [SIM] explicitly.
// =============================================================================

import { createHmac, randomUUID, timingSafeEqual } from 'node:crypto';
import { DepositIntent, PaymentIntentStatus, toMinorUnits } from '../domain/payments';
import { PaymentCurrency } from '../types';
import { ServerStateStore } from './serverStore';

export interface ServerPaymentProviderStatus {
  activeProviderId: 'stripe_hosted' | 'mock_sim';
  mode: 'hosted_psp' | 'simulated';
  isSimulated: boolean;
  hostedCheckoutConfigured: boolean;
  webhookVerificationConfigured: boolean;
  pciInputsAllowedInDom: false;
  plannedPspTarget: 'stripe_hosted_checkout_saq_a';
}

export interface CreateHostedCheckoutSessionInput {
  bookingReferenceId: string;
  artistId: string;
  artistName: string;
  serviceId: string;
  serviceName: string;
  amountUsd: number;
  displayCurrency: PaymentCurrency;
  originUrl: string;
}

export interface WebhookProcessResult {
  received: boolean;
  duplicate?: boolean;
  eventType?: string;
  updatedIntentId?: string;
  newStatus?: PaymentIntentStatus;
  rejectedReason?: string;
}

const MAX_DEPOSIT_MINOR_CENTS = 1_000_000; // $10,000.00 USD upper cap

export function verifyStripeWebhookSignature(params: {
  rawBody: Buffer | string;
  signatureHeader: string | undefined;
  webhookSecret: string;
  nowSeconds?: number;
  toleranceSeconds?: number;
}): { valid: boolean; reason?: string } {
  const { rawBody, signatureHeader, webhookSecret } = params;
  if (!webhookSecret) {
    return { valid: false, reason: 'STRIPE_WEBHOOK_SECRET is not configured.' };
  }
  if (!signatureHeader) {
    return { valid: false, reason: 'Missing Stripe-Signature header.' };
  }

  let timestampStr = '';
  const signatures: string[] = [];
  for (const part of signatureHeader.split(',')) {
    const [k, v] = part.split('=');
    if (!k || !v) continue;
    const key = k.trim();
    const val = v.trim();
    if (key === 't') timestampStr = val;
    if (key === 'v1') signatures.push(val);
  }

  const timestamp = Number(timestampStr);
  if (!Number.isFinite(timestamp) || signatures.length === 0) {
    return { valid: false, reason: 'Malformed Stripe-Signature header.' };
  }

  const nowSeconds = params.nowSeconds ?? Math.floor(Date.now() / 1000);
  const tolerance = params.toleranceSeconds ?? 300;
  if (Math.abs(nowSeconds - timestamp) > tolerance) {
    return { valid: false, reason: 'Stripe webhook timestamp outside replay tolerance window.' };
  }

  const payload = Buffer.isBuffer(rawBody) ? rawBody.toString('utf8') : rawBody;
  const expectedHex = createHmac('sha256', webhookSecret)
    .update(`${timestamp}.${payload}`, 'utf8')
    .digest('hex');
  const expectedBuf = Buffer.from(expectedHex, 'hex');

  for (const sigHex of signatures) {
    try {
      const providedBuf = Buffer.from(sigHex, 'hex');
      if (providedBuf.length === expectedBuf.length && timingSafeEqual(providedBuf, expectedBuf)) {
        return { valid: true };
      }
    } catch {
      // Ignore malformed hex candidate and continue checking remaining v1 signatures
    }
  }

  return { valid: false, reason: 'Stripe webhook HMAC signature mismatch.' };
}

export class StripeHostedCheckoutService {
  private readonly store: ServerStateStore;
  private readonly secretKey: string;
  private readonly webhookSecret: string;
  private readonly fetchFn: typeof fetch;
  private readonly apiBaseUrl: string;

  constructor(options: {
    store: ServerStateStore;
    secretKey?: string;
    webhookSecret?: string;
    fetchFn?: typeof fetch;
    apiBaseUrl?: string;
  }) {
    this.store = options.store;
    this.secretKey = options.secretKey ?? process.env.STRIPE_SECRET_KEY ?? '';
    this.webhookSecret = options.webhookSecret ?? process.env.STRIPE_WEBHOOK_SECRET ?? '';
    this.fetchFn = options.fetchFn ?? fetch;
    this.apiBaseUrl = options.apiBaseUrl ?? 'https://api.stripe.com';
  }

  public isConfigured(): boolean {
    return Boolean(this.secretKey && this.secretKey.trim().startsWith('sk_'));
  }

  public isWebhookConfigured(): boolean {
    return Boolean(this.webhookSecret && this.webhookSecret.trim().length >= 8);
  }

  public getProviderStatus(): ServerPaymentProviderStatus {
    const configured = this.isConfigured();
    return {
      activeProviderId: configured ? 'stripe_hosted' : 'mock_sim',
      mode: configured ? 'hosted_psp' : 'simulated',
      isSimulated: !configured,
      hostedCheckoutConfigured: configured,
      webhookVerificationConfigured: this.isWebhookConfigured(),
      pciInputsAllowedInDom: false,
      plannedPspTarget: 'stripe_hosted_checkout_saq_a',
    };
  }

  public async createHostedCheckoutSession(
    input: CreateHostedCheckoutSessionInput
  ): Promise<DepositIntent> {
    if (!this.isConfigured()) {
      throw new Error(
        'Stripe Hosted Checkout is not configured (missing STRIPE_SECRET_KEY in server environment).'
      );
    }

    const amountMinor = toMinorUnits(input.amountUsd);
    if (amountMinor < 50 || amountMinor > MAX_DEPOSIT_MINOR_CENTS) {
      throw new Error('Stripe deposit amount must be between $0.50 and $10,000.00 USD.');
    }

    // Q-03: Booking-level idempotency (reuse open, unexpired checkout session if already created)
    const existingForBooking = await this.store.getDepositIntentByBookingRef(input.bookingReferenceId);
    if (
      existingForBooking &&
      existingForBooking.status === 'requires_action' &&
      existingForBooking.amountMinor === amountMinor &&
      existingForBooking.hostedCheckoutUrl &&
      Date.parse(existingForBooking.expiresAt) > Date.now()
    ) {
      return existingForBooking;
    }

    const intentId = `intent_stripe_${randomUUID()}`;
    const origin = input.originUrl.replace(/\/+$/, '');
    const successUrl = `${origin}/?checkout_status=success&intent_id=${encodeURIComponent(intentId)}&booking_ref=${encodeURIComponent(input.bookingReferenceId)}`;
    const cancelUrl = `${origin}/?checkout_status=canceled&intent_id=${encodeURIComponent(intentId)}&booking_ref=${encodeURIComponent(input.bookingReferenceId)}`;

    const safeServiceName = input.serviceName.trim().slice(0, 80) || 'Haute Manicure';
    const safeArtistName = input.artistName.trim().slice(0, 64) || 'Master Artist';
    const safeBookingIdempotency = input.bookingReferenceId
      .replace(/[^a-zA-Z0-9_-]/g, '_')
      .slice(0, 64);

    const form = new URLSearchParams();
    form.set('mode', 'payment');
    form.set('payment_method_types[0]', 'card');
    form.set('success_url', successUrl);
    form.set('cancel_url', cancelUrl);
    form.set('line_items[0][quantity]', '1');
    form.set('line_items[0][price_data][currency]', 'usd');
    form.set('line_items[0][price_data][unit_amount]', String(amountMinor));
    form.set(
      'line_items[0][price_data][product_data][name]',
      `Nailix Deposit — ${safeServiceName} (${safeArtistName})`
    );
    form.set('metadata[intentId]', intentId);
    form.set('metadata[bookingReferenceId]', input.bookingReferenceId);
    form.set('metadata[artistId]', input.artistId);
    form.set('metadata[serviceId]', input.serviceId);
    // Q-09: Propagate metadata to PaymentIntent so payment_intent.* & charge.* webhooks correlate reliably
    form.set('payment_intent_data[metadata][intentId]', intentId);
    form.set('payment_intent_data[metadata][bookingReferenceId]', input.bookingReferenceId);
    form.set('payment_intent_data[metadata][artistId]', input.artistId);
    form.set('payment_intent_data[metadata][serviceId]', input.serviceId);

    const response = await this.fetchFn(`${this.apiBaseUrl}/v1/checkout/sessions`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.secretKey.trim()}`,
        'Content-Type': 'application/x-www-form-urlencoded',
        'Idempotency-Key': `checkout_${safeBookingIdempotency}`,
      },
      body: form.toString(),
      signal: AbortSignal.timeout(10_000),
    });

    if (!response.ok) {
      const errText = await response.text().catch(() => '');
      throw new Error(`Stripe Hosted Checkout error (${response.status}): ${errText.slice(0, 200)}`);
    }

    const sessionPayload = (await response.json()) as {
      id?: unknown;
      url?: unknown;
      expires_at?: unknown;
    };

    if (typeof sessionPayload.url !== 'string' || !sessionPayload.url.startsWith('https://')) {
      throw new Error('Stripe Checkout response did not include a valid HTTPS checkout URL.');
    }

    const now = Date.now();
    const expiresAtIso =
      typeof sessionPayload.expires_at === 'number'
        ? new Date(sessionPayload.expires_at * 1000).toISOString()
        : new Date(now + 30 * 60 * 1000).toISOString();

    const intent: DepositIntent = {
      id: intentId,
      bookingReferenceId: input.bookingReferenceId,
      artistId: input.artistId,
      serviceId: input.serviceId,
      amountMinor,
      currency: 'USD',
      displayCurrency: input.displayCurrency,
      status: 'requires_action',
      mode: 'hosted_psp',
      providerId: 'stripe_hosted',
      providerLabel: 'Stripe Hosted Checkout (SAQ-A)',
      isSimulated: false,
      hostedCheckoutUrl: sessionPayload.url,
      createdAt: new Date(now).toISOString(),
      expiresAt: expiresAtIso,
    };

    await this.store.saveDepositIntent(intent);
    return intent;
  }

  public async handleWebhookEvent(params: {
    rawBody: Buffer | string;
    signatureHeader: string | undefined;
    nowSeconds?: number;
  }): Promise<WebhookProcessResult> {
    const sigCheck = verifyStripeWebhookSignature({
      rawBody: params.rawBody,
      signatureHeader: params.signatureHeader,
      webhookSecret: this.webhookSecret.trim(),
      nowSeconds: params.nowSeconds,
    });
    if (!sigCheck.valid) {
      throw new Error(sigCheck.reason || 'Invalid Stripe webhook signature.');
    }

    const text = Buffer.isBuffer(params.rawBody)
      ? params.rawBody.toString('utf8')
      : params.rawBody;
    const event = JSON.parse(text) as {
      id?: unknown;
      type?: unknown;
      data?: {
        object?: {
          id?: unknown;
          metadata?: Record<string, unknown>;
          payment_status?: unknown;
          amount_total?: unknown;
          amount_received?: unknown;
          amount?: unknown;
          currency?: unknown;
        };
      };
    };

    const eventId = typeof event.id === 'string' ? event.id : '';
    const eventType = typeof event.type === 'string' ? event.type : '';
    if (!eventId || !eventType) {
      throw new Error('Malformed Stripe webhook event payload.');
    }

    if (await this.store.hasProcessedWebhookEvent(eventId)) {
      return { received: true, duplicate: true, eventType };
    }

    const obj = event.data?.object;
    const intentId =
      obj?.metadata && typeof obj.metadata.intentId === 'string' ? obj.metadata.intentId : '';

    let candidateStatus: PaymentIntentStatus | undefined;
    let isRefundEvent = false;
    if (eventType === 'checkout.session.completed' || eventType === 'checkout.session.async_payment_succeeded') {
      candidateStatus = obj?.payment_status === 'paid' ? 'captured' : 'authorized_hold';
    } else if (eventType === 'payment_intent.succeeded') {
      candidateStatus = 'captured';
    } else if (eventType === 'checkout.session.expired' || eventType === 'payment_intent.canceled') {
      candidateStatus = 'canceled';
    } else if (eventType === 'checkout.session.async_payment_failed' || eventType === 'payment_intent.payment_failed') {
      candidateStatus = 'failed';
    } else if (eventType === 'charge.refunded' || eventType === 'charge.dispute.created') {
      candidateStatus = 'released';
      isRefundEvent = true;
    }

    let finalStatus: PaymentIntentStatus | undefined = candidateStatus;
    let rejectedReason: string | undefined;

    if (intentId && candidateStatus) {
      const existing = await this.store.getDepositIntent(intentId);
      if (existing) {
        if (candidateStatus === 'captured') {
          const rawAmount = obj?.amount_total ?? obj?.amount_received ?? obj?.amount;
          const incomingAmount = typeof rawAmount === 'number' ? rawAmount : Number.NaN;
          const incomingCurrency =
            typeof obj?.currency === 'string' ? obj.currency.toLowerCase() : '';

          // Q-04 / Q-09: strictly verify paid amount & USD currency before marking captured
          if (incomingAmount !== existing.amountMinor || incomingCurrency !== 'usd') {
            rejectedReason = 'amount_or_currency_mismatch';
            finalStatus = existing.status;
          } else if (existing.status === 'released') {
            finalStatus = existing.status;
          } else {
            await this.store.saveDepositIntent({
              ...existing,
              status: 'captured',
            });
            finalStatus = 'captured';
          }
        } else if (isRefundEvent) {
          await this.store.saveDepositIntent({
            ...existing,
            status: 'released',
          });
          finalStatus = 'released';
        } else if (existing.status === 'captured' || existing.status === 'released') {
          // Do not regress captured/released intents back to canceled/failed/hold on late events
          finalStatus = existing.status;
        } else {
          await this.store.saveDepositIntent({
            ...existing,
            status: candidateStatus,
          });
          finalStatus = candidateStatus;
        }
      }
    }

    await this.store.markWebhookEventProcessed(eventId);
    return {
      received: true,
      duplicate: false,
      eventType,
      updatedIntentId: intentId || undefined,
      newStatus: finalStatus,
      ...(rejectedReason ? { rejectedReason } : {}),
    };
  }
}
