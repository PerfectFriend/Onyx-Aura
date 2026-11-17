// =============================================================================
// Stage 4 · Sprint 4.2 — Real Server-Side WebAuthn SPKI Cryptographic Verifier
// - Verifies ES256 (-7) and RS256 (-257) FIDO2 assertions using Node crypto.verify
//   against SPKI public keys stored server-side.
// - Checks rpIdHash (SHA-256), UP bit (0x01), mandatory UV bit (0x04) for 'master',
//   monotonic signCount with BE (0x08) synced-passkey tolerance, and clientDataJSON.
// - Never falsifies cryptographic verification when server SPKI is missing.
// =============================================================================

import { createHash, createPublicKey, timingSafeEqual, verify as cryptoVerify } from 'node:crypto';
import { UserRole } from '../types';
import { ServerPasskeyRecord } from './serverStore';

function fromBase64Url(b64u: string): Buffer {
  const padded = b64u.replace(/-/g, '+').replace(/_/g, '/');
  const padLen = (4 - (padded.length % 4)) % 4;
  return Buffer.from(`${padded}${'='.repeat(padLen)}`, 'base64');
}

function sha256(buf: Buffer | string): Buffer {
  return createHash('sha256').update(buf).digest();
}

export interface ServerRegistrationCheckInput {
  expectedChallengeBase64Url: string;
  clientDataJSONBase64Url: string;
  publicKeySpkiBase64Url: string;
  expectedOrigin?: string;
  rpId: string;
  algorithm: number;
  role: UserRole;
  authenticatorDataBase64Url?: string;
}

export interface ServerRegistrationCheckResult {
  ok: boolean;
  error?: string;
  initialSignCount: number;
}

export function validateSpkiKeyForRegistration(
  publicKeySpkiBase64Url: string,
  algorithm: number
): boolean {
  try {
    const spkiBuf = fromBase64Url(publicKeySpkiBase64Url);
    if (spkiBuf.length < 32) return false;
    const keyObj = createPublicKey({ key: spkiBuf, format: 'der', type: 'spki' });
    if (algorithm === -7) {
      return keyObj.asymmetricKeyType === 'ec';
    }
    if (algorithm === -257) {
      return keyObj.asymmetricKeyType === 'rsa' || keyObj.asymmetricKeyType === 'rsa-pss';
    }
    return false;
  } catch {
    return false;
  }
}

export function verifyRegistrationBindingOnServer(
  input: ServerRegistrationCheckInput
): ServerRegistrationCheckResult {
  let clientData: { type?: unknown; challenge?: unknown; origin?: unknown };
  try {
    const raw = fromBase64Url(input.clientDataJSONBase64Url).toString('utf8');
    clientData = JSON.parse(raw) as { type?: unknown; challenge?: unknown; origin?: unknown };
  } catch {
    return { ok: false, error: 'Malformed clientDataJSON during registration.', initialSignCount: 0 };
  }

  if (clientData.type !== 'webauthn.create') {
    return { ok: false, error: 'Expected webauthn.create in clientDataJSON.', initialSignCount: 0 };
  }
  if (clientData.challenge !== input.expectedChallengeBase64Url) {
    return { ok: false, error: 'Registration challenge mismatch.', initialSignCount: 0 };
  }
  if (typeof clientData.origin !== 'string' || !clientData.origin.trim()) {
    return { ok: false, error: 'Missing origin in registration clientDataJSON.', initialSignCount: 0 };
  }
  if (input.expectedOrigin && clientData.origin !== input.expectedOrigin) {
    return { ok: false, error: 'Registration origin mismatch.', initialSignCount: 0 };
  }

  if (!validateSpkiKeyForRegistration(input.publicKeySpkiBase64Url, input.algorithm)) {
    return {
      ok: false,
      error: 'Invalid or unsupported SPKI public key (requires ES256 -7 or RS256 -257).',
      initialSignCount: 0,
    };
  }

  let initialSignCount = 0;
  if (input.authenticatorDataBase64Url) {
    const authData = fromBase64Url(input.authenticatorDataBase64Url);
    if (authData.length < 37) {
      return { ok: false, error: 'AuthenticatorData too short (< 37 bytes).', initialSignCount: 0 };
    }
    const expectedRpHash = sha256(input.rpId);
    if (!timingSafeEqual(authData.subarray(0, 32), expectedRpHash)) {
      return { ok: false, error: 'Registration rpIdHash mismatch.', initialSignCount: 0 };
    }
    const flags = authData[32];
    if ((flags & 0x01) === 0) {
      return { ok: false, error: 'Registration missing UP (User Present) bit.', initialSignCount: 0 };
    }
    if (input.role === 'master' && (flags & 0x04) === 0) {
      return {
        ok: false,
        error: 'Master role registration requires UV (User Verification) bit.',
        initialSignCount: 0,
      };
    }
    initialSignCount = authData.readUInt32BE(33);
  }

  return { ok: true, initialSignCount };
}

export interface ServerAssertionCryptoInput {
  storedCredential: ServerPasskeyRecord;
  clientDataJSONBase64Url: string;
  authenticatorDataBase64Url: string;
  signatureBase64Url: string;
  expectedOrigin?: string;
}

export interface ServerAssertionCryptoResult {
  cryptographicSignatureValid: boolean;
  nextSignCount: number;
  warnings: string[];
  error?: string;
}

export function verifyAssertionSignatureOnServer(
  input: ServerAssertionCryptoInput
): ServerAssertionCryptoResult {
  const warnings: string[] = [];
  const clientDataBytes = fromBase64Url(input.clientDataJSONBase64Url);
  const authDataBytes = fromBase64Url(input.authenticatorDataBase64Url);
  const sigBytes = fromBase64Url(input.signatureBase64Url);

  if (authDataBytes.length < 37) {
    return {
      cryptographicSignatureValid: false,
      nextSignCount: input.storedCredential.signCount,
      warnings,
      error: 'Authenticator data shorter than 37 bytes.',
    };
  }

  if (input.expectedOrigin) {
    try {
      const parsed = JSON.parse(clientDataBytes.toString('utf8')) as { origin?: unknown };
      if (parsed.origin !== input.expectedOrigin) {
        return {
          cryptographicSignatureValid: false,
          nextSignCount: input.storedCredential.signCount,
          warnings,
          error: 'Origin mismatch during server assertion verification.',
        };
      }
    } catch {
      return {
        cryptographicSignatureValid: false,
        nextSignCount: input.storedCredential.signCount,
        warnings,
        error: 'Unparseable clientDataJSON.',
      };
    }
  }

  // 1. RP ID Hash check
  const expectedRpHash = sha256(input.storedCredential.rpId);
  const actualRpHash = authDataBytes.subarray(0, 32);
  if (!timingSafeEqual(actualRpHash, expectedRpHash)) {
    return {
      cryptographicSignatureValid: false,
      nextSignCount: input.storedCredential.signCount,
      warnings,
      error: 'WebAuthn rpIdHash mismatch on server.',
    };
  }

  // 2. Flags check (UP always, UV mandatory for master role)
  const flags = authDataBytes[32];
  const userPresent = (flags & 0x01) !== 0;
  const userVerified = (flags & 0x04) !== 0;
  const backupEligible = (flags & 0x08) !== 0;

  if (!userPresent) {
    return {
      cryptographicSignatureValid: false,
      nextSignCount: input.storedCredential.signCount,
      warnings,
      error: 'WebAuthn UP (User Present) flag is unset.',
    };
  }

  if (input.storedCredential.role === 'master' && !userVerified) {
    return {
      cryptographicSignatureValid: false,
      nextSignCount: input.storedCredential.signCount,
      warnings,
      error: 'Master authentication requires UV (User Verification) flag on server.',
    };
  }

  // 3. Monotonic signCount check with BE (synced passkey) tolerance
  const incomingCount = authDataBytes.readUInt32BE(33);
  const previousCount = input.storedCredential.signCount;
  if (previousCount > 0 || incomingCount > 0) {
    if (incomingCount <= previousCount) {
      if (backupEligible) {
        warnings.push(
          `Synced passkey (BE=1) reported non-incrementing signCount (${previousCount} -> ${incomingCount}).`
        );
      } else {
        return {
          cryptographicSignatureValid: false,
          nextSignCount: previousCount,
          warnings,
          error: `Potential cloned hardware authenticator: server signCount did not advance (${previousCount} -> ${incomingCount}).`,
        };
      }
    }
  }

  // 4. Cryptographic signature check over authData || SHA-256(clientDataJSON)
  let publicKeyObj;
  try {
    const spkiBuf = fromBase64Url(input.storedCredential.publicKeySpkiBase64Url);
    publicKeyObj = createPublicKey({ key: spkiBuf, format: 'der', type: 'spki' });
  } catch {
    return {
      cryptographicSignatureValid: false,
      nextSignCount: previousCount,
      warnings,
      error: 'Stored SPKI key on server is malformed.',
    };
  }

  const alg = input.storedCredential.algorithm;
  if (alg !== -7 && alg !== -257) {
    return {
      cryptographicSignatureValid: false,
      nextSignCount: previousCount,
      warnings,
      error: `Unsupported WebAuthn algorithm (${alg}) on server.`,
    };
  }

  const clientDataHash = sha256(clientDataBytes);
  const signedData = Buffer.concat([authDataBytes, clientDataHash]);
  const valid = cryptoVerify('sha256', signedData, publicKeyObj, sigBytes);

  if (!valid) {
    return {
      cryptographicSignatureValid: false,
      nextSignCount: previousCount,
      warnings,
      error: 'Cryptographic WebAuthn signature check failed on server.',
    };
  }

  return {
    cryptographicSignatureValid: true,
    nextSignCount: Math.max(previousCount, incomingCount),
    warnings,
  };
}
