// =============================================================================
// Stage 4 · Sprint 4.2 — Env-Driven Stripe Hosted Checkout (SAQ-A) & Webhooks
// - NEVER handles card numbers, expiry, or CVC (Zero-PCI boundary).
// - Reads STRIPE_SECRET_KEY / STRIPE_WEBHOOK_SECRET strictly from env/config.
// - Verifies Stripe-Signature (`t=...,v1=...`) using HMAC-SHA256 & timingSafeEqual.
// - Honestly reports unconfigured state so client falls back to [SIM] explicitly.
// =============================================================================

import { createHash, createHmac, randomUUID, timingSafeEqual } from 'node:crypto';
import { DepositIntent, PaymentIntentStatus, toMinorUnits } from '../domain/payments';
import { PaymentCurrency } from '../types';
import { ServerStateStore } from './serverStore';

export class StripeCheckoutConflictError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'StripeCheckoutConflictError';
  }
}

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
  appointmentDate?: string;
  appointmentTimeSlot?: string;
  ownerCredentialId?: string;
}

export interface WebhookProcessResult {
  received: boolean;
  duplicate?: boolean;
  unmatched?: boolean;
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

    // Q-03 & V-06: Booking-level idempotency (reuse open session only when service/artist/amount match)
    const existingForBooking = await this.store.getDepositIntentByBookingRef(input.bookingReferenceId);
    if (
      existingForBooking &&
      existingForBooking.status === 'requires_action' &&
      Date.parse(existingForBooking.expiresAt) > Date.now()
    ) {
      if (
        existingForBooking.artistId !== input.artistId ||
        existingForBooking.serviceId !== input.serviceId ||
        existingForBooking.amountMinor !== amountMinor
      ) {
        throw new StripeCheckoutConflictError(
          'Booking reference already has an active checkout session with different service or amount.'
        );
      }
      if (
        existingForBooking.ownerCredentialId &&
        input.ownerCredentialId &&
        existingForBooking.ownerCredentialId !== input.ownerCredentialId
      ) {
        throw new StripeCheckoutConflictError(
          'Booking reference already has an active checkout session owned by another Passkey credential.'
        );
      }
      if (existingForBooking.hostedCheckoutUrl) {
        return existingForBooking;
      }
    }

    const intentId = `intent_stripe_${randomUUID()}`;
    const origin = input.originUrl.replace(/\/+$/, '');
    const successUrl = `${origin}/?checkout_status=success&intent_id=${encodeURIComponent(intentId)}&booking_ref=${encodeURIComponent(input.bookingReferenceId)}`;
    const cancelUrl = `${origin}/?checkout_status=canceled&intent_id=${encodeURIComponent(intentId)}&booking_ref=${encodeURIComponent(input.bookingReferenceId)}`;

    const safeServiceName = input.serviceName.trim().slice(0, 80) || 'Haute Manicure';
    const safeArtistName = input.artistName.trim().slice(0, 64) || 'Master Artist';
    const safeBookingIdempotency = input.bookingReferenceId
      .replace(/[^a-zA-Z0-9_-]/g, '_')
      .slice(0, 48);
    const paramsDigest = createHash('sha256')
      .update(`${input.bookingReferenceId}|${input.artistId}|${input.serviceId}|${amountMinor}`)
      .digest('hex')
      .slice(0, 12);

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
        'Idempotency-Key': `checkout_${safeBookingIdempotency}_${paramsDigest}`,
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
      payment_intent?: unknown;
    };

    if (typeof sessionPayload.url !== 'string' || !sessionPayload.url.startsWith('https://')) {
      throw new Error('Stripe Checkout response did not include a valid HTTPS checkout URL.');
    }

    const now = Date.now();
    const expiresAtIso =
      typeof sessionPayload.expires_at === 'number'
        ? new Date(sessionPayload.expires_at * 1000).toISOString()
        : new Date(now + 30 * 60 * 1000).toISOString();
    const stripePaymentIntentId =
      typeof sessionPayload.payment_intent === 'string' && sessionPayload.payment_intent.trim()
        ? sessionPayload.payment_intent.trim()
        : undefined;

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
      ...(stripePaymentIntentId ? { stripePaymentIntentId } : {}),
      ...(input.appointmentDate ? { appointmentDate: input.appointmentDate } : {}),
      ...(input.appointmentTimeSlot ? { appointmentTimeSlot: input.appointmentTimeSlot } : {}),
      ...(input.ownerCredentialId ? { ownerCredentialId: input.ownerCredentialId } : {}),
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
          payment_intent?: unknown;
          metadata?: Record<string, unknown>;
          payment_status?: unknown;
          amount_total?: unknown;
          amount_received?: unknown;
          amount?: unknown;
          amount_refunded?: unknown;
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
    const metadataIntentId =
      obj?.metadata && typeof obj.metadata.intentId === 'string' ? obj.metadata.intentId : '';
    const objectPaymentIntentId =
      eventType.startsWith('payment_intent.') && typeof obj?.id === 'string'
        ? obj.id
        : typeof obj?.payment_intent === 'string'
          ? obj.payment_intent
          : '';

    let existing = metadataIntentId
      ? await this.store.getDepositIntent(metadataIntentId)
      : undefined;
    if (!existing && objectPaymentIntentId) {
      existing = await this.store.getDepositIntentByPaymentIntentId(objectPaymentIntentId);
    }

    if (!existing) {
      await this.store.markWebhookEventProcessed(eventId);
      return {
        received: true,
        duplicate: false,
        unmatched: true,
        eventType,
      };
    }

    const resolvedPaymentIntentId = objectPaymentIntentId || existing.stripePaymentIntentId;
    let finalStatus: PaymentIntentStatus = existing.status;
    let rejectedReason: string | undefined;

    if (
      eventType === 'checkout.session.completed' ||
      eventType === 'checkout.session.async_payment_succeeded' ||
      eventType === 'payment_intent.succeeded'
    ) {
      const candidateStatus: PaymentIntentStatus =
        eventType === 'payment_intent.succeeded' || obj?.payment_status === 'paid'
          ? 'captured'
          : 'authorized_hold';

      if (candidateStatus === 'captured') {
        const rawAmount = obj?.amount_total ?? obj?.amount_received ?? obj?.amount;
        const incomingAmount = typeof rawAmount === 'number' ? rawAmount : Number.NaN;
        const incomingCurrency =
          typeof obj?.currency === 'string' ? obj.currency.toLowerCase() : '';

        if (incomingAmount !== existing.amountMinor || incomingCurrency !== 'usd') {
          rejectedReason = 'amount_or_currency_mismatch';
          finalStatus = existing.status;
        } else if (
          existing.status === 'released' ||
          existing.status === 'partially_refunded' ||
          existing.status === 'disputed'
        ) {
          finalStatus = existing.status;
        } else {
          await this.store.saveDepositIntent({
            ...existing,
            status: 'captured',
            ...(resolvedPaymentIntentId ? { stripePaymentIntentId: resolvedPaymentIntentId } : {}),
          });
          finalStatus = 'captured';
        }
      } else if (
        existing.status !== 'captured' &&
        existing.status !== 'partially_refunded' &&
        existing.status !== 'released' &&
        existing.status !== 'disputed'
      ) {
        await this.store.saveDepositIntent({
          ...existing,
          status: candidateStatus,
          ...(resolvedPaymentIntentId ? { stripePaymentIntentId: resolvedPaymentIntentId } : {}),
        });
        finalStatus = candidateStatus;
      }
    } else if (eventType === 'charge.refunded') {
      const rawRefunded = obj?.amount_refunded;
      const refundedMinor =
        typeof rawRefunded === 'number' && Number.isFinite(rawRefunded) && rawRefunded >= 0
          ? Math.min(existing.amountMinor, Math.round(rawRefunded))
          : existing.amountMinor;

      if (refundedMinor > 0) {
        const nextRefundStatus: PaymentIntentStatus =
          refundedMinor < existing.amountMinor
            ? existing.status === 'disputed'
              ? 'disputed'
              : 'partially_refunded'
            : 'released';

        await this.store.saveDepositIntent({
          ...existing,
          status: nextRefundStatus,
          amountRefundedMinor: Math.max(existing.amountRefundedMinor ?? 0, refundedMinor),
          ...(resolvedPaymentIntentId ? { stripePaymentIntentId: resolvedPaymentIntentId } : {}),
        });
        finalStatus = nextRefundStatus;
      }
    } else if (eventType === 'charge.dispute.created') {
      const nextDisputeStatus: PaymentIntentStatus =
        existing.status === 'released' ? 'released' : 'disputed';
      await this.store.saveDepositIntent({
        ...existing,
        status: nextDisputeStatus,
        ...(resolvedPaymentIntentId ? { stripePaymentIntentId: resolvedPaymentIntentId } : {}),
      });
      finalStatus = nextDisputeStatus;
    } else if (
      eventType === 'checkout.session.expired' ||
      eventType === 'payment_intent.canceled' ||
      eventType === 'checkout.session.async_payment_failed' ||
      eventType === 'payment_intent.payment_failed'
    ) {
      const candidate: PaymentIntentStatus =
        eventType === 'checkout.session.expired' || eventType === 'payment_intent.canceled'
          ? 'canceled'
          : 'failed';
      if (
        existing.status !== 'captured' &&
        existing.status !== 'partially_refunded' &&
        existing.status !== 'released' &&
        existing.status !== 'disputed'
      ) {
        await this.store.saveDepositIntent({
          ...existing,
          status: candidate,
          ...(resolvedPaymentIntentId ? { stripePaymentIntentId: resolvedPaymentIntentId } : {}),
        });
        finalStatus = candidate;
      }
    }

    await this.store.markWebhookEventProcessed(eventId);
    return {
      received: true,
      duplicate: false,
      eventType,
      updatedIntentId: existing.id,
      newStatus: finalStatus,
      ...(rejectedReason ? { rejectedReason } : {}),
    };
  }
}
