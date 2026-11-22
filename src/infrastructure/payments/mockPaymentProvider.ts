// =============================================================================
// Stage 4 · Sprint 4.1 — [SIM] MockPaymentProvider (Foundation Demo Only)
// - Implements PaymentProvider port with explicit `[SIM]` markers & zero card DOM inputs.
// - Never settles real fiat or crypto; swaps cleanly for Hosted PSP in Stage 4.2+.
// =============================================================================

import {
  ConfirmDepositRequest,
  CreateDepositIntentRequest,
  DepositIntent,
  DepositSession,
  PaymentProvider,
  PaymentProviderCapabilities,
  ReleaseDepositRequest,
  toMinorUnits,
} from '../../domain/payments';
import { createId } from '../../domain/ids';
import { computeSHA256Detailed } from '../../simulation/cryptocloud';

export class MockPaymentProvider implements PaymentProvider {
  public readonly id = 'mock_sim';
  public readonly label = '[SIM] MockPaymentProvider';
  public readonly mode = 'simulated' as const;
  public readonly isSimulated = true as const;
  private readonly simulatedDelayMs: number;

  constructor(options: { simulatedDelayMs?: number } = {}) {
    this.simulatedDelayMs = options.simulatedDelayMs ?? 350;
  }

  public getCapabilities(): PaymentProviderCapabilities {
    return {
      providerId: this.id,
      label: this.label,
      mode: this.mode,
      isSimulated: true,
      acceptsRealMoney: false,
      collectsCardInDom: false,
      notice:
        '[SIM] Demo provider active: zero card/PAN/CVV inputs in Nailix DOM and zero real charges. Stage 4.2+ will redirect to Hosted PSP Checkout.',
    };
  }

  public async createDepositIntent(req: CreateDepositIntentRequest): Promise<DepositIntent> {
    const amountMinor = toMinorUnits(req.amountUsd);
    const now = Date.now();
    return Promise.resolve({
      id: createId('intent_sim'),
      bookingReferenceId: req.bookingReferenceId,
      artistId: req.artistId,
      serviceId: req.serviceId,
      amountMinor,
      currency: 'USD',
      displayCurrency: req.displayCurrency,
      status: 'requires_action',
      mode: this.mode,
      providerId: this.id,
      providerLabel: this.label,
      isSimulated: true,
      createdAt: new Date(now).toISOString(),
      expiresAt: new Date(now + 15 * 60 * 1000).toISOString(),
    });
  }

  public async confirmDeposit(req: ConfirmDepositRequest): Promise<DepositSession> {
    if (this.simulatedDelayMs > 0) {
      await new Promise(resolve => setTimeout(resolve, this.simulatedDelayMs));
    }

    const refInput = `SIM_DEPOSIT:${req.intent.id}:${req.idempotencyKey}:${req.intent.amountMinor}`;
    const { hash, isRealSha256 } = await computeSHA256Detailed(refInput);

    return {
      sessionId: createId('sess_sim'),
      intentId: req.intent.id,
      providerId: this.id,
      providerLabel: this.label,
      mode: this.mode,
      isSimulated: true,
      authorizationRef: hash,
      isRealSha256,
      status: 'authorized_hold',
      recordedAt: new Date().toISOString(),
    };
  }

  public async releaseDeposit(_req: ReleaseDepositRequest): Promise<{
    status: 'released';
    updatedAt: string;
  }> {
    return Promise.resolve({
      status: 'released',
      updatedAt: new Date().toISOString(),
    });
  }

  public async cancelDeposit(_intentId: string): Promise<{
    status: 'canceled';
    updatedAt: string;
  }> {
    return Promise.resolve({
      status: 'canceled',
      updatedAt: new Date().toISOString(),
    });
  }
}

export const defaultPaymentProvider: PaymentProvider = new MockPaymentProvider();
