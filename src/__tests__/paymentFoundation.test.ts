import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import type { AddressInfo } from 'node:net';
import express from 'express';
import { describe, it, expect } from 'vitest';
import { formatMinorUsd, toMinorUnits } from '../domain/payments';
import { MockPaymentProvider } from '../infrastructure/payments/mockPaymentProvider';
import { createFoundationApiRouter } from '../server/apiRouter';
import { WebAuthnChallengeStubStore } from '../server/challengeService';

const PROJECT_ROOT = path.resolve(import.meta.dirname, '..', '..');

function toBase64Url(input: string | Uint8Array): string {
  const buf = typeof input === 'string' ? Buffer.from(input, 'utf8') : Buffer.from(input);
  return buf
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/g, '');
}

function makeAuthDataWithUpFlag(upSet: boolean): string {
  const bytes = new Uint8Array(37);
  // RP ID hash zeroes, byte 32 = flags (0x01 = UP)
  bytes[32] = upSet ? 0x01 : 0x00;
  return toBase64Url(bytes);
}

describe('Stage 4 · Sprint 4.1 Payment & Server Identity Foundation', () => {
  it('Zero-PCI Watchdog: zero card/PAN/MMYY/CVV/CVC input elements exist anywhere in UI components or CheckoutModal', () => {
    const uiFiles: string[] = [path.join(PROJECT_ROOT, 'src', 'App.tsx')];
    const componentsDir = path.join(PROJECT_ROOT, 'src', 'components');
    for (const entry of fs.readdirSync(componentsDir)) {
      if (/\.(ts|tsx)$/.test(entry)) {
        uiFiles.push(path.join(componentsDir, entry));
      }
    }

    const pciViolations: string[] = [];
    const forbiddenCardInputRegex =
      /<input[^>]+(?:card\s*number|pan\b|cvv|cvc|mm\/?yy|4242\s*•|cardholder|credit[\s_-]*card|debit[\s_-]*card|cc-number|cc-csc|cc-exp)/i;

    for (const filePath of uiFiles) {
      const content = fs.readFileSync(filePath, 'utf8');
      const lines = content.split(/\r?\n/);
      // Check both single lines and multiline <input ...> blocks
      const inputTags = content.match(/<input\b[^>]*>/gi) ?? [];
      for (const tag of inputTags) {
        if (forbiddenCardInputRegex.test(tag)) {
          pciViolations.push(`${path.relative(PROJECT_ROOT, filePath)} -> ${tag.slice(0, 120)}`);
        }
      }
      lines.forEach((line, idx) => {
        if (/\b(?:setCardNumber|setCardExp|setCardCvc|cardNumber|cardCvc)\b/.test(line)) {
          pciViolations.push(`${path.relative(PROJECT_ROOT, filePath)}:${idx + 1} -> ${line.trim()}`);
        }
      });
    }

    expect(pciViolations).toEqual([]);

    const checkoutSrc = fs.readFileSync(
      path.join(PROJECT_ROOT, 'src', 'components', 'CheckoutModal.tsx'),
      'utf8'
    );
    expect(checkoutSrc).toContain('defaultPaymentProvider');
    expect(checkoutSrc).toContain('[SIM] ZERO CARD INPUTS');
  });

  it('src/domain/payments.ts handles minor units cleanly and rejects invalid deposit amounts', () => {
    expect(toMinorUnits(145.5)).toBe(14550);
    expect(toMinorUnits(0)).toBe(0);
    expect(() => toMinorUnits(-10)).toThrow(/Invalid deposit amount/);
    expect(() => toMinorUnits(Number.NaN)).toThrow(/Invalid deposit amount/);
    expect(formatMinorUsd(14550)).toBe('145.50');
    expect(formatMinorUsd(-5)).toBe('0.00');
  });

  it('[SIM] MockPaymentProvider implements full deposit lifecycle honestly without card DOM collection', async () => {
    const provider = new MockPaymentProvider({ simulatedDelayMs: 0 });
    expect(provider.isSimulated).toBe(true);
    expect(provider.mode).toBe('simulated');

    const caps = provider.getCapabilities();
    expect(caps.collectsCardInDom).toBe(false);
    expect(caps.acceptsRealMoney).toBe(false);
    expect(caps.isSimulated).toBe(true);
    expect(caps.label).toContain('[SIM]');

    const intent = await provider.createDepositIntent({
      bookingReferenceId: 'apt-test-1',
      artistId: 'artist-1',
      serviceId: 'svc-1',
      amountUsd: 165.25,
      displayCurrency: 'USD',
    });

    expect(intent.status).toBe('requires_action');
    expect(intent.amountMinor).toBe(16525);
    expect(intent.isSimulated).toBe(true);
    expect(intent.providerId).toBe('mock_sim');

    const session = await provider.confirmDeposit({
      intent,
      idempotencyKey: 'idem-apt-test-1',
    });
    expect(session.status).toBe('authorized_hold');
    expect(session.isSimulated).toBe(true);
    expect(session.authorizationRef.length).toBeGreaterThanOrEqual(32);

    const released = await provider.releaseDeposit({
      intentId: intent.id,
      authorizationRef: session.authorizationRef,
    });
    expect(released.status).toBe('released');

    const canceled = await provider.cancelDeposit(intent.id);
    expect(canceled.status).toBe('canceled');
  });

  it('WebAuthnChallengeStubStore enforces single-use, TTL, origin/challenge bindings, UP flag, and honest server status', () => {
    const store = new WebAuthnChallengeStubStore(120_000);
    const t0 = 1_700_000_000_000;

    const issued = store.issueChallenge({ ceremony: 'authentication', role: 'client', nowMs: t0 });
    expect(issued.ttlSeconds).toBe(120);
    expect(issued.verificationTier).toBe('challenge_stub_only');
    expect(store.getPendingCount()).toBe(1);

    const validClientData = toBase64Url(
      JSON.stringify({
        type: 'webauthn.get',
        challenge: issued.challengeBase64Url,
        origin: 'https://nailix.example',
      })
    );

    const okResult = store.verifyChallengeStub(
      {
        challengeId: issued.challengeId,
        clientDataJSONBase64Url: validClientData,
        authenticatorDataBase64Url: makeAuthDataWithUpFlag(true),
        expectedOrigin: 'https://nailix.example',
      },
      t0 + 5_000
    );

    expect(okResult.accepted).toBe(true);
    expect(okResult.challengeConsumed).toBe(true);
    expect(okResult.verificationTier).toBe('challenge_stub_only');
    // Crucial Honesty Guarantee: stub must NEVER claim server cryptographic verification
    expect(okResult.cryptographicServerVerified).toBe(false);
    expect(store.getPendingCount()).toBe(0);

    // Replay with the same challengeId MUST fail
    const replayResult = store.verifyChallengeStub(
      {
        challengeId: issued.challengeId,
        clientDataJSONBase64Url: validClientData,
      },
      t0 + 6_000
    );
    expect(replayResult.accepted).toBe(false);
    expect(replayResult.challengeConsumed).toBe(false);
    expect(replayResult.cryptographicServerVerified).toBe(false);

    // Expired TTL
    const chExp = store.issueChallenge({ ceremony: 'authentication', role: 'master', nowMs: t0 });
    const expiredResult = store.verifyChallengeStub(
      {
        challengeId: chExp.challengeId,
        clientDataJSONBase64Url: toBase64Url(
          JSON.stringify({
            type: 'webauthn.get',
            challenge: chExp.challengeBase64Url,
            origin: 'https://nailix.example',
          })
        ),
      },
      t0 + 125_000
    );
    expect(expiredResult.accepted).toBe(false);
    expect(expiredResult.error).toContain('expired');

    // Ceremony type mismatch
    const chType = store.issueChallenge({ ceremony: 'registration', role: 'client', nowMs: t0 });
    const badTypeResult = store.verifyChallengeStub(
      {
        challengeId: chType.challengeId,
        clientDataJSONBase64Url: toBase64Url(
          JSON.stringify({
            type: 'webauthn.get', // mismatch for registration
            challenge: chType.challengeBase64Url,
            origin: 'https://nailix.example',
          })
        ),
      },
      t0 + 1_000
    );
    expect(badTypeResult.accepted).toBe(false);
    expect(badTypeResult.error).toContain('webauthn.create');

    // Challenge mismatch
    const chMis = store.issueChallenge({ ceremony: 'authentication', role: 'client', nowMs: t0 });
    const badChallengeResult = store.verifyChallengeStub(
      {
        challengeId: chMis.challengeId,
        clientDataJSONBase64Url: toBase64Url(
          JSON.stringify({
            type: 'webauthn.get',
            challenge: 'tampered_challenge_value',
            origin: 'https://nailix.example',
          })
        ),
      },
      t0 + 1_000
    );
    expect(badChallengeResult.accepted).toBe(false);
    expect(badChallengeResult.error).toContain('Challenge binding mismatch');

    // Origin mismatch
    const chOrg = store.issueChallenge({ ceremony: 'authentication', role: 'client', nowMs: t0 });
    const badOriginResult = store.verifyChallengeStub(
      {
        challengeId: chOrg.challengeId,
        clientDataJSONBase64Url: toBase64Url(
          JSON.stringify({
            type: 'webauthn.get',
            challenge: chOrg.challengeBase64Url,
            origin: 'https://evil.example',
          })
        ),
        expectedOrigin: 'https://nailix.example',
      },
      t0 + 1_000
    );
    expect(badOriginResult.accepted).toBe(false);
    expect(badOriginResult.error).toContain('Origin mismatch');

    // Missing UP flag in authenticatorData
    const chUp = store.issueChallenge({ ceremony: 'authentication', role: 'client', nowMs: t0 });
    const missingUpResult = store.verifyChallengeStub(
      {
        challengeId: chUp.challengeId,
        clientDataJSONBase64Url: toBase64Url(
          JSON.stringify({
            type: 'webauthn.get',
            challenge: chUp.challengeBase64Url,
            origin: 'https://nailix.example',
          })
        ),
        authenticatorDataBase64Url: makeAuthDataWithUpFlag(false),
      },
      t0 + 1_000
    );
    expect(missingUpResult.accepted).toBe(false);
    expect(missingUpResult.error).toContain('UP flag');
  });

  it('Express Foundation API Router serves /payments/provider and enforces single-use challenge lifecycle over HTTP', async () => {
    const app = express();
    const store = new WebAuthnChallengeStubStore();
    app.use('/api', createFoundationApiRouter(store));

    const server = http.createServer(app);
    await new Promise<void>(resolve => {
      server.listen(0, '127.0.0.1', () => resolve());
    });

    try {
      const addr = server.address() as AddressInfo;
      const baseUrl = `http://127.0.0.1:${addr.port}/api`;

      const providerRes = await fetch(`${baseUrl}/payments/provider`);
      expect(providerRes.status).toBe(200);
      const providerJson = (await providerRes.json()) as Record<string, unknown>;
      expect(providerJson.activeProviderId).toBe('mock_sim');
      expect(providerJson.isSimulated).toBe(true);
      expect(providerJson.pciInputsAllowedInDom).toBe(false);
      expect(providerJson.hostedCheckoutConfigured).toBe(false);

      const challengeRes = await fetch(`${baseUrl}/auth/webauthn/challenge`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ceremony: 'authentication', role: 'client' }),
      });
      expect(challengeRes.status).toBe(200);
      const challengeJson = (await challengeRes.json()) as {
        challengeId: string;
        challengeBase64Url: string;
        verificationTier: string;
      };
      expect(challengeJson.challengeId).toMatch(/^ch-/);
      expect(challengeJson.verificationTier).toBe('challenge_stub_only');

      const serverOrigin = `http://127.0.0.1:${addr.port}`;
      const clientDataB64u = toBase64Url(
        JSON.stringify({
          type: 'webauthn.get',
          challenge: challengeJson.challengeBase64Url,
          origin: serverOrigin,
        })
      );

      const verifyRes = await fetch(`${baseUrl}/auth/webauthn/verify`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          challengeId: challengeJson.challengeId,
          clientDataJSONBase64Url: clientDataB64u,
          authenticatorDataBase64Url: makeAuthDataWithUpFlag(true),
          expectedOrigin: serverOrigin,
        }),
      });
      expect(verifyRes.status).toBe(200);
      const verifyJson = (await verifyRes.json()) as Record<string, unknown>;
      expect(verifyJson.accepted).toBe(true);
      expect(verifyJson.verificationTier).toBe('challenge_stub_only');
      expect(verifyJson.cryptographicServerVerified).toBe(false);

      // Replay must return HTTP 400
      const replayRes = await fetch(`${baseUrl}/auth/webauthn/verify`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          challengeId: challengeJson.challengeId,
          clientDataJSONBase64Url: clientDataB64u,
        }),
      });
      expect(replayRes.status).toBe(400);
    } finally {
      await new Promise<void>((resolve, reject) => {
        server.close(err => (err ? reject(err) : resolve()));
      });
    }
  });
});
