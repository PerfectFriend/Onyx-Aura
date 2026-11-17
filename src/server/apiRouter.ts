// =============================================================================
// Stage 4 · Sprint 4.1 — Express API Router (/api/auth/webauthn/* & /api/payments/*)
// =============================================================================

import express, { Router } from 'express';
import { UserRole } from '../types';
import {
  defaultChallengeStubStore,
  getServerPaymentProviderStatus,
  WebAuthnChallengeStubStore,
} from './challengeService';

export function createFoundationApiRouter(
  challengeStore: WebAuthnChallengeStubStore = defaultChallengeStubStore
): Router {
  const router = express.Router();
  router.use(express.json({ limit: '64kb' }));

  router.get('/health', (_req, res) => {
    res.json({
      ok: true,
      stage: '4.1-foundation',
      pendingChallenges: challengeStore.getPendingCount(),
    });
  });

  router.get('/payments/provider', (_req, res) => {
    res.json(getServerPaymentProviderStatus());
  });

  router.post('/auth/webauthn/challenge', (req, res) => {
    const body =
      req.body && typeof req.body === 'object' ? (req.body as Record<string, unknown>) : {};
    const ceremony = body.ceremony === 'registration' ? 'registration' : 'authentication';
    const role: UserRole = body.role === 'master' ? 'master' : 'client';

    const issued = challengeStore.issueChallenge({ ceremony, role });
    res.status(200).json(issued);
  });

  router.post('/auth/webauthn/verify', (req, res) => {
    const body =
      req.body && typeof req.body === 'object' ? (req.body as Record<string, unknown>) : {};

    const challengeId = typeof body.challengeId === 'string' ? body.challengeId : '';
    const clientDataJSONBase64Url =
      typeof body.clientDataJSONBase64Url === 'string' ? body.clientDataJSONBase64Url : '';
    const authenticatorDataBase64Url =
      typeof body.authenticatorDataBase64Url === 'string'
        ? body.authenticatorDataBase64Url
        : undefined;
    const expectedOrigin =
      typeof body.expectedOrigin === 'string' ? body.expectedOrigin : undefined;

    if (!challengeId || !clientDataJSONBase64Url) {
      res.status(400).json({
        accepted: false,
        verificationTier: 'challenge_stub_only',
        cryptographicServerVerified: false,
        challengeConsumed: false,
        error: 'challengeId and clientDataJSONBase64Url are required.',
      });
      return;
    }

    const result = challengeStore.verifyChallengeStub({
      challengeId,
      clientDataJSONBase64Url,
      authenticatorDataBase64Url,
      expectedOrigin,
    });

    res.status(result.accepted ? 200 : 400).json(result);
  });

  return router;
}
