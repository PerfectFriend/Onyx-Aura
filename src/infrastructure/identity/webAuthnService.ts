// =============================================================================
// Stage 3 / Sprint 3.3 — WebAuthn / Passkeys Identity Service (N-05)
// - Honest verification states: `verification: 'signature_verified' | 'presence_only'`
//   (never marks assertion signature_verified without an authentic SPKI public key)
// - Enforces `UV` (User Verification) flag for `master` role assertions (W7)
// - Handles synced passkey `BE` (Backup Eligible, 0x08) flag on signCount (W10)
// - Extracts SPKI from `attestationObject` CBOR/COSE when `getPublicKey()` is absent
// - ES256 (DER -> IEEE P1363 r||s) & RS256 cryptographic verification via Web Crypto
// - Discoverable credential fallback (`allowCredentials: []`)
// =============================================================================

import {
  DEFAULT_SESSION_TTL_MS,
  createSessionExpiryIso,
  PasskeyCredentialRecord,
  WebAuthnCapabilityReport,
} from '../../domain/identity';
import {
  extractAttestedCredentialFromAttestationObject,
} from '../../domain/webauthnCbor';
import { UserRole } from '../../types';
import {
  assertNoSecretLikeFields,
  fromBase64Url,
  generateCryptographicChallenge,
  toBase64Url,
} from './secretHygiene';

function getCryptoSubtle(): SubtleCrypto | undefined {
  if (typeof globalThis !== 'undefined' && globalThis.crypto && globalThis.crypto.subtle) {
    return globalThis.crypto.subtle;
  }
  return undefined;
}

function concatBytes(a: Uint8Array, b: Uint8Array): Uint8Array {
  const out = new Uint8Array(a.length + b.length);
  out.set(a, 0);
  out.set(b, a.length);
  return out;
}

function constantTimeEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) {
    diff |= a[i] ^ b[i];
  }
  return diff === 0;
}

/**
 * Extracts a Base64URL SPKI public key + COSE algorithm from a raw WebAuthn
 * `attestationObject` if `AuthenticatorAttestationResponse.getPublicKey()` is unavailable (N-05).
 */
export function extractSpkiFromAttestationObject(
  attestationObject: ArrayBuffer | Uint8Array
): { spkiBase64Url: string; algorithm: number } | null {
  const parsed = extractAttestedCredentialFromAttestationObject(attestationObject);
  if (!parsed) return null;
  return {
    spkiBase64Url: parsed.spkiBase64Url,
    algorithm: parsed.algorithm,
  };
}

/**
 * Converts an ASN.1 DER-encoded ECDSA signature (`30 len 02 rLen r 02 sLen s`)
 * into raw 64-byte IEEE P1363 `(r || s)` required by Web Crypto `SubtleCrypto.verify`.
 */
export function derEcdsaToP1363(der: Uint8Array, coordinateSize = 32): Uint8Array {
  if (der.length < 8 || der[0] !== 0x30) {
    throw new Error('Invalid DER ECDSA signature: expected SEQUENCE header 0x30.');
  }

  let offset = 2;
  if ((der[1] & 0x80) !== 0) {
    const lenBytes = der[1] & 0x7f;
    offset = 2 + lenBytes;
  }

  if (der[offset] !== 0x02) {
    throw new Error('Invalid DER ECDSA signature: expected INTEGER tag for r.');
  }
  const rLen = der[offset + 1];
  const rStart = offset + 2;
  const rEnd = rStart + rLen;

  if (rEnd >= der.length || der[rEnd] !== 0x02) {
    throw new Error('Invalid DER ECDSA signature: expected INTEGER tag for s.');
  }
  const sLen = der[rEnd + 1];
  const sStart = rEnd + 2;
  const sEnd = sStart + sLen;

  if (sEnd > der.length) {
    throw new Error('Invalid DER ECDSA signature: truncated s integer.');
  }

  const rBytes = der.slice(rStart, rEnd);
  const sBytes = der.slice(sStart, sEnd);

  const out = new Uint8Array(coordinateSize * 2);

  const copyNormalized = (src: Uint8Array, destOffset: number) => {
    let trimmed = src;
    while (trimmed.length > coordinateSize && trimmed[0] === 0x00) {
      trimmed = trimmed.slice(1);
    }
    if (trimmed.length > coordinateSize) {
      throw new Error('Invalid DER ECDSA signature: integer exceeds curve coordinate width.');
    }
    out.set(trimmed, destOffset + (coordinateSize - trimmed.length));
  };

  copyNormalized(rBytes, 0);
  copyNormalized(sBytes, coordinateSize);
  return out;
}

export interface WebAuthnAssertionInput {
  clientDataJSON: ArrayBuffer | Uint8Array;
  authenticatorData: ArrayBuffer | Uint8Array;
  signature: ArrayBuffer | Uint8Array;
}

export interface VerifyAssertionParams {
  response: WebAuthnAssertionInput;
  expectedChallengeBase64Url: string;
  expectedOrigin: string;
  expectedRpId: string;
  /** Enforces User Verification (UV) flag (mandatory when role === 'master', N-05 / W7). */
  requireUserVerification?: boolean;
  storedCredential?: Pick<
    PasskeyCredentialRecord,
    'publicKeySpkiBase64Url' | 'algorithm' | 'signCount'
  > & { role?: UserRole };
}

export type AssertionVerificationLevel = 'signature_verified' | 'presence_only';

export interface VerifyAssertionResult {
  verification: AssertionVerificationLevel;
  cryptographicSignatureVerified: boolean;
  userPresent: boolean;
  userVerified: boolean;
  backupEligible: boolean;
  backupState: boolean;
  signCount: number;
  warnings: string[];
}

/**
 * Verifies a WebAuthn assertion response locally against WebAuthn L2 steps (L-04 / N-05):
 * - clientDataJSON (type, challenge, origin)
 * - authenticatorData (rpIdHash SHA-256, UP, UV for master, BE for synced passkeys, monotonic signCount)
 * - SPKI signature (ES256 / RS256). Without an SPKI public key, honestly reports `presence_only`.
 */
export async function verifyWebAuthnAssertion({
  response,
  expectedChallengeBase64Url,
  expectedOrigin,
  expectedRpId,
  requireUserVerification,
  storedCredential,
}: VerifyAssertionParams): Promise<VerifyAssertionResult> {
  const clientDataBytes =
    response.clientDataJSON instanceof Uint8Array
      ? response.clientDataJSON
      : new Uint8Array(response.clientDataJSON);
  const authDataBytes =
    response.authenticatorData instanceof Uint8Array
      ? response.authenticatorData
      : new Uint8Array(response.authenticatorData);
  const sigBytes =
    response.signature instanceof Uint8Array
      ? response.signature
      : new Uint8Array(response.signature);

  const warnings: string[] = [];

  // 1. Validate clientDataJSON
  let clientData: { type?: string; challenge?: string; origin?: string };
  try {
    clientData = JSON.parse(new TextDecoder().decode(clientDataBytes)) as {
      type?: string;
      challenge?: string;
      origin?: string;
    };
  } catch {
    throw new Error('Malformed WebAuthn clientDataJSON payload.');
  }

  if (clientData.type !== 'webauthn.get') {
    throw new Error(`Unexpected WebAuthn ceremony type "${clientData.type}".`);
  }
  if (clientData.challenge !== expectedChallengeBase64Url) {
    throw new Error('WebAuthn challenge mismatch: potential replay rejected.');
  }
  if (clientData.origin !== expectedOrigin) {
    throw new Error(`WebAuthn origin mismatch (${clientData.origin} !== ${expectedOrigin}).`);
  }

  // 2. Validate authenticatorData structure & rpIdHash
  if (authDataBytes.length < 37) {
    throw new Error('Invalid WebAuthn authenticatorData length (< 37 bytes).');
  }

  const subtle = getCryptoSubtle();
  if (!subtle) {
    throw new Error('Web Crypto SubtleCrypto is required to verify WebAuthn assertion.');
  }

  const expectedRpIdHash = new Uint8Array(
    await subtle.digest('SHA-256', new TextEncoder().encode(expectedRpId))
  );
  const actualRpIdHash = authDataBytes.slice(0, 32);
  if (!constantTimeEqual(actualRpIdHash, expectedRpIdHash)) {
    throw new Error(`WebAuthn rpIdHash mismatch for RP "${expectedRpId}".`);
  }

  const flags = authDataBytes[32];
  const userPresent = (flags & 0x01) !== 0;
  const userVerified = (flags & 0x04) !== 0;
  const backupEligible = (flags & 0x08) !== 0;
  const backupState = (flags & 0x10) !== 0;

  if (!userPresent) {
    throw new Error('WebAuthn assertion rejected: User Present (UP) flag is not set.');
  }

  const mustVerifyUser = requireUserVerification ?? storedCredential?.role === 'master';
  if (mustVerifyUser && !userVerified) {
    throw new Error(
      'WebAuthn assertion rejected: User Verification (UV / biometrics or PIN) is required for master access.'
    );
  }

  const signCount =
    ((authDataBytes[33] << 24) >>> 0) +
    (authDataBytes[34] << 16) +
    (authDataBytes[35] << 8) +
    authDataBytes[36];

  const prevSignCount = storedCredential?.signCount ?? 0;
  if ((prevSignCount > 0 || signCount > 0) && signCount <= prevSignCount) {
    if (backupEligible) {
      warnings.push(
        `Multi-device synced Passkey (BE=1) returned non-monotonic signCount (${signCount} <= ${prevSignCount}).`
      );
    } else {
      throw new Error(
        `Authenticator signCount did not advance (${signCount} <= ${prevSignCount}); possible cloned credential.`
      );
    }
  }

  // 3. Cryptographic signature verification against stored SPKI public key
  let cryptographicSignatureVerified = false;
  if (storedCredential?.publicKeySpkiBase64Url) {
    const spkiBytes = fromBase64Url(storedCredential.publicKeySpkiBase64Url);
    const clientDataHash = new Uint8Array(
      await subtle.digest('SHA-256', clientDataBytes as unknown as BufferSource)
    );
    const signedData = concatBytes(authDataBytes, clientDataHash);
    const alg = storedCredential.algorithm;

    if (alg === -7) {
      const publicKey = await subtle.importKey(
        'spki',
        spkiBytes as unknown as BufferSource,
        { name: 'ECDSA', namedCurve: 'P-256' },
        false,
        ['verify']
      );
      const rawSig = derEcdsaToP1363(sigBytes, 32);
      const valid = await subtle.verify(
        { name: 'ECDSA', hash: 'SHA-256' },
        publicKey,
        rawSig as unknown as BufferSource,
        signedData as unknown as BufferSource
      );
      if (!valid) {
        throw new Error('WebAuthn ES256 cryptographic signature verification failed.');
      }
      cryptographicSignatureVerified = true;
    } else if (alg === -257) {
      const publicKey = await subtle.importKey(
        'spki',
        spkiBytes as unknown as BufferSource,
        { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
        false,
        ['verify']
      );
      const valid = await subtle.verify(
        { name: 'RSASSA-PKCS1-v1_5' },
        publicKey,
        sigBytes as unknown as BufferSource,
        signedData as unknown as BufferSource
      );
      if (!valid) {
        throw new Error('WebAuthn RS256 cryptographic signature verification failed.');
      }
      cryptographicSignatureVerified = true;
    } else {
      throw new Error(`Unsupported WebAuthn algorithm (${alg}) for client verification.`);
    }
  } else {
    warnings.push(
      'SPKI public key unavailable in local registry; assertion checked at presence_only level.'
    );
  }

  return {
    verification: cryptographicSignatureVerified ? 'signature_verified' : 'presence_only',
    cryptographicSignatureVerified,
    userPresent,
    userVerified,
    backupEligible,
    backupState,
    signCount,
    warnings,
  };
}

export async function detectWebAuthnSupport(): Promise<WebAuthnCapabilityReport> {
  if (typeof window === 'undefined') {
    return {
      isSupported: false,
      platformAuthenticatorAvailable: false,
      isSecureContext: false,
      reason: 'Browser window is unavailable (SSR / Node test context).',
    };
  }

  const isSecureContext = Boolean(window.isSecureContext);
  const hasWebAuthn =
    typeof PublicKeyCredential !== 'undefined' &&
    typeof navigator !== 'undefined' &&
    Boolean(navigator.credentials) &&
    typeof navigator.credentials.create === 'function' &&
    typeof navigator.credentials.get === 'function';

  if (!hasWebAuthn || !isSecureContext) {
    return {
      isSupported: false,
      platformAuthenticatorAvailable: false,
      isSecureContext,
      reason: !isSecureContext
        ? 'WebAuthn requires HTTPS or localhost secure context.'
        : 'Browser does not expose PublicKeyCredential API.',
    };
  }

  try {
    const platformAvailable =
      typeof PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable === 'function'
        ? await PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable()
        : false;

    return {
      isSupported: true,
      platformAuthenticatorAvailable: platformAvailable,
      isSecureContext,
    };
  } catch {
    return {
      isSupported: true,
      platformAuthenticatorAvailable: false,
      isSecureContext,
    };
  }
}

export type ChallengeSource = 'server_stub' | 'client_csprng_fallback';

export interface ServerChallengeStubVerification {
  attempted: boolean;
  accepted: boolean;
  verificationTier: 'server_spki_verified' | 'challenge_stub_only' | 'not_attempted';
  cryptographicServerVerified: boolean;
  serverRole?: UserRole;
  notice?: string;
}

export async function fetchServerIdentitySessionStatus(): Promise<{
  authenticated: boolean;
  credentialId?: string;
  role?: UserRole;
  verificationScope: 'client_local_only' | 'server_spki_verified';
}> {
  if (typeof fetch !== 'function') {
    return { authenticated: false, verificationScope: 'client_local_only' };
  }
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 1200);
    const res = await fetch('/api/auth/session', {
      credentials: 'same-origin',
      signal: controller.signal,
    });
    clearTimeout(timeout);
    if (!res.ok) {
      return { authenticated: false, verificationScope: 'client_local_only' };
    }
    return (await res.json()) as {
      authenticated: boolean;
      credentialId?: string;
      role?: UserRole;
      verificationScope: 'client_local_only' | 'server_spki_verified';
    };
  } catch {
    return { authenticated: false, verificationScope: 'client_local_only' };
  }
}

export async function logoutServerIdentitySession(): Promise<void> {
  if (typeof fetch !== 'function') return;
  try {
    await fetch('/api/auth/logout', {
      method: 'POST',
      credentials: 'same-origin',
    });
  } catch {
    // Ignore network failures during local sign-out
  }
}

async function requestWebAuthnChallengeWithFallback(
  ceremony: 'registration' | 'authentication'
): Promise<{
  challengeBytes: Uint8Array;
  challengeBase64Url: string;
  challengeId?: string;
  challengeSource: ChallengeSource;
}> {
  if (
    typeof fetch === 'function' &&
    typeof window !== 'undefined' &&
    window.location?.origin &&
    window.location.origin.startsWith('http')
  ) {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 1200);
      const res = await fetch('/api/auth/webauthn/challenge', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ceremony }),
        signal: controller.signal,
      });
      clearTimeout(timeout);
      if (res.ok) {
        const data = (await res.json()) as {
          challengeId?: unknown;
          challengeBase64Url?: unknown;
        };
        if (
          typeof data.challengeId === 'string' &&
          typeof data.challengeBase64Url === 'string' &&
          data.challengeBase64Url.length >= 16
        ) {
          return {
            challengeId: data.challengeId,
            challengeBase64Url: data.challengeBase64Url,
            challengeBytes: fromBase64Url(data.challengeBase64Url),
            challengeSource: 'server_stub',
          };
        }
      }
    } catch {
      // Offline / static bundle / Vitest sandbox cleanly falls back to local CSPRNG
    }
  }

  const challengeBytes = generateCryptographicChallenge(32);
  return {
    challengeBytes,
    challengeBase64Url: toBase64Url(challengeBytes),
    challengeSource: 'client_csprng_fallback',
  };
}

async function submitChallengeServerVerification(params: {
  challengeId?: string;
  credentialId?: string;
  clientDataJSON: ArrayBuffer;
  authenticatorData?: ArrayBuffer;
  signature?: ArrayBuffer;
  expectedOrigin: string;
}): Promise<ServerChallengeStubVerification> {
  if (!params.challengeId || typeof fetch !== 'function') {
    return {
      attempted: false,
      accepted: false,
      verificationTier: 'not_attempted',
      cryptographicServerVerified: false,
    };
  }

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 1200);
    const res = await fetch('/api/auth/webauthn/verify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'same-origin',
      body: JSON.stringify({
        challengeId: params.challengeId,
        credentialId: params.credentialId,
        clientDataJSONBase64Url: toBase64Url(params.clientDataJSON),
        authenticatorDataBase64Url: params.authenticatorData
          ? toBase64Url(params.authenticatorData)
          : undefined,
        signatureBase64Url: params.signature ? toBase64Url(params.signature) : undefined,
        expectedOrigin: params.expectedOrigin,
      }),
      signal: controller.signal,
    });
    clearTimeout(timeout);
    const data = (await res.json()) as {
      accepted?: unknown;
      verificationTier?: unknown;
      cryptographicServerVerified?: unknown;
      notice?: unknown;
      session?: { role?: unknown };
    };
    const tier =
      data.verificationTier === 'server_spki_verified'
        ? 'server_spki_verified'
        : 'challenge_stub_only';
    const serverRole =
      data.session?.role === 'master' || data.session?.role === 'client'
        ? data.session.role
        : undefined;
    return {
      attempted: true,
      accepted: res.ok && data.accepted === true,
      verificationTier: tier,
      cryptographicServerVerified: Boolean(res.ok && data.cryptographicServerVerified === true),
      serverRole,
      notice: typeof data.notice === 'string' ? data.notice : undefined,
    };
  } catch {
    return {
      attempted: true,
      accepted: false,
      verificationTier: 'challenge_stub_only',
      cryptographicServerVerified: false,
    };
  }
}

export interface RegisterPasskeyParams {
  displayName: string;
  role: UserRole;
  masterInviteCode?: string;
  existingCredentials?: PasskeyCredentialRecord[];
}

export async function registerWebAuthnPasskey({
  displayName,
  role,
  masterInviteCode,
  existingCredentials = [],
}: RegisterPasskeyParams): Promise<PasskeyCredentialRecord> {
  const capability = await detectWebAuthnSupport();
  if (!capability.isSupported) {
    throw new Error(capability.reason || 'WebAuthn is unsupported in this browser context.');
  }

  const cleanName = displayName.trim() || (role === 'master' ? 'Master Stylist' : 'Salon Guest');
  const challengeResult = await requestWebAuthnChallengeWithFallback('registration');
  const challenge = challengeResult.challengeBytes;
  const userIdBytes = generateCryptographicChallenge(16);
  const rpId = window.location.hostname;

  const excludeCredentials: PublicKeyCredentialDescriptor[] = existingCredentials
    .filter(cred => !cred.isSimulatedFallback)
    .map(cred => ({
      type: 'public-key' as const,
      id: fromBase64Url(cred.rawIdBase64Url) as unknown as BufferSource,
    }));

  const publicKeyOptions: PublicKeyCredentialCreationOptions = {
    challenge: challenge as unknown as BufferSource,
    rp: {
      name: 'Nailix Haute Manicure',
      id: rpId,
    },
    user: {
      id: userIdBytes as unknown as BufferSource,
      name: `${cleanName.toLowerCase().replace(/[^a-z0-9._-]+/g, '-') || 'guest'}@nailix.local`,
      displayName: cleanName,
    },
    pubKeyCredParams: [
      { type: 'public-key', alg: -7 },
      { type: 'public-key', alg: -257 },
    ],
    authenticatorSelection: {
      residentKey: 'preferred',
      userVerification: role === 'master' || Boolean(masterInviteCode) ? 'required' : 'preferred',
    },
    timeout: 60000,
    attestation: 'none',
    excludeCredentials,
  };

  const credential = (await navigator.credentials.create({
    publicKey: publicKeyOptions,
  })) as PublicKeyCredential | null;

  if (!credential) {
    throw new Error('Passkey creation returned no credential.');
  }

  const attestationResponse = credential.response as AuthenticatorAttestationResponse;

  const publicKeyBuf =
    typeof attestationResponse.getPublicKey === 'function'
      ? attestationResponse.getPublicKey()
      : null;
  const transports =
    typeof attestationResponse.getTransports === 'function'
      ? attestationResponse.getTransports()
      : [];
  let alg =
    typeof attestationResponse.getPublicKeyAlgorithm === 'function'
      ? attestationResponse.getPublicKeyAlgorithm()
      : -7;

  let publicKeySpkiBase64Url = publicKeyBuf ? toBase64Url(publicKeyBuf) : undefined;
  if (!publicKeySpkiBase64Url && attestationResponse.attestationObject) {
    const extracted = extractSpkiFromAttestationObject(attestationResponse.attestationObject);
    if (extracted) {
      publicKeySpkiBase64Url = extracted.spkiBase64Url;
      alg = extracted.algorithm;
    }
  }

  const authenticatorDataBuf =
    typeof attestationResponse.getAuthenticatorData === 'function'
      ? attestationResponse.getAuthenticatorData()
      : undefined;
  const attestationObjectBuf = attestationResponse.attestationObject;

  // Authoritative role starts as server-assigned ('client' unless server grants via invite code)
  let authoritativeRole: UserRole =
    challengeResult.challengeSource === 'server_stub' ? 'client' : role;

  // Register public SPKI key + consume registration challenge on backend when available
  if (challengeResult.challengeSource === 'server_stub' && challengeResult.challengeId) {
    if (publicKeySpkiBase64Url && (authenticatorDataBuf || attestationObjectBuf)) {
      const regRes = await fetch('/api/auth/webauthn/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify({
          challengeId: challengeResult.challengeId,
          credentialId: credential.id,
          rawIdBase64Url: toBase64Url(credential.rawId),
          publicKeySpkiBase64Url,
          clientDataJSONBase64Url: toBase64Url(attestationResponse.clientDataJSON),
          authenticatorDataBase64Url: authenticatorDataBuf
            ? toBase64Url(authenticatorDataBuf)
            : undefined,
          attestationObjectBase64Url: attestationObjectBuf
            ? toBase64Url(attestationObjectBuf)
            : undefined,
          expectedOrigin: window.location.origin,
          rpId,
          algorithm: alg,
          displayName: cleanName,
          masterInviteCode: masterInviteCode?.trim() || undefined,
        }),
      });
      if (regRes.ok) {
        const regPayload = (await regRes.json()) as { session?: { role?: unknown } };
        authoritativeRole = regPayload.session?.role === 'master' ? 'master' : 'client';
      } else if ([400, 403, 409, 429].includes(regRes.status)) {
        const errPayload = (await regRes.json().catch(() => ({}))) as { error?: unknown };
        throw new Error(
          typeof errPayload.error === 'string'
            ? errPayload.error
            : `Сервер отклонил регистрацию Passkey (${regRes.status}).`
        );
      }
    } else {
      await submitChallengeServerVerification({
        challengeId: challengeResult.challengeId,
        clientDataJSON: attestationResponse.clientDataJSON,
        expectedOrigin: window.location.origin,
      });
    }
  }

  const record: PasskeyCredentialRecord = {
    id: credential.id,
    rawIdBase64Url: toBase64Url(credential.rawId),
    publicKeySpkiBase64Url,
    displayName: cleanName,
    role: authoritativeRole,
    rpId,
    algorithm: alg,
    createdAt: new Date().toISOString(),
    lastUsedAt: new Date().toISOString(),
    transports,
    signCount: 0,
    isSimulatedFallback: false,
  };

  return assertNoSecretLikeFields(record);
}

/**
 * Prompts browser WebAuthn assertion for registered Passkeys OR discoverable
 * resident credentials (`allowCredentials: []`), enforcing UV for `master`,
 * `BE` synced passkey handling, honest `signature_verified` vs `presence_only` levels (N-05),
 * and Stage 4.2 server-side SPKI verification + HttpOnly session when registered on backend.
 */
export async function authenticateWebAuthnPasskey(
  credentials: PasskeyCredentialRecord[],
  options: { allowDiscoverableFallback?: boolean } = { allowDiscoverableFallback: true }
): Promise<{
  credential: PasskeyCredentialRecord;
  verification: AssertionVerificationLevel;
  cryptographicSignatureVerified: boolean;
  discoveredNew: boolean;
  warnings: string[];
  challengeSource: ChallengeSource;
  serverStubVerification: ServerChallengeStubVerification;
}> {
  const realCredentials = credentials.filter(c => !c.isSimulatedFallback);
  if (realCredentials.length === 0 && !options.allowDiscoverableFallback) {
    throw new Error('No hardware/browser Passkey registered on this device yet.');
  }

  const capability = await detectWebAuthnSupport();
  if (!capability.isSupported) {
    throw new Error(capability.reason || 'WebAuthn is unsupported in this context.');
  }

  const hasMasterCandidate = realCredentials.some(c => c.role === 'master');
  const challengeResult = await requestWebAuthnChallengeWithFallback('authentication');
  const challenge = challengeResult.challengeBytes;
  const expectedChallengeBase64Url = challengeResult.challengeBase64Url;
  const rpId = window.location.hostname;
  const expectedOrigin = window.location.origin;

  const allowCredentials: PublicKeyCredentialDescriptor[] = realCredentials.map(c => ({
    type: 'public-key' as const,
    id: fromBase64Url(c.rawIdBase64Url) as unknown as BufferSource,
    transports: c.transports as AuthenticatorTransport[] | undefined,
  }));

  const publicKeyRequest: PublicKeyCredentialRequestOptions = {
    challenge: challenge as unknown as BufferSource,
    rpId,
    userVerification: hasMasterCandidate ? 'required' : 'preferred',
    timeout: 60000,
    allowCredentials: allowCredentials.length > 0 ? allowCredentials : [],
  };

  const assertion = (await navigator.credentials.get({
    publicKey: publicKeyRequest,
  })) as PublicKeyCredential | null;

  if (!assertion) {
    throw new Error('Passkey authentication did not complete.');
  }

  const assertionResponse = assertion.response as AuthenticatorAssertionResponse;
  const matched =
    realCredentials.find(c => c.id === assertion.id) ||
    realCredentials.find(c => c.rawIdBase64Url === toBase64Url(assertion.rawId));

  const verifyResult = await verifyWebAuthnAssertion({
    response: {
      clientDataJSON: assertionResponse.clientDataJSON,
      authenticatorData: assertionResponse.authenticatorData,
      signature: assertionResponse.signature,
    },
    expectedChallengeBase64Url,
    expectedOrigin,
    expectedRpId: rpId,
    requireUserVerification: matched?.role === 'master',
    storedCredential: matched,
  });

  const serverStubVerification = await submitChallengeServerVerification({
    challengeId: challengeResult.challengeId,
    credentialId: assertion.id,
    clientDataJSON: assertionResponse.clientDataJSON,
    authenticatorData: assertionResponse.authenticatorData,
    signature: assertionResponse.signature,
    expectedOrigin,
  });

  const nowIso = new Date().toISOString();

  if (matched) {
    return {
      credential: {
        ...matched,
        role:
          serverStubVerification.cryptographicServerVerified && serverStubVerification.serverRole
            ? serverStubVerification.serverRole
            : matched.role,
        lastUsedAt: nowIso,
        signCount: verifyResult.signCount,
      },
      verification: verifyResult.verification,
      cryptographicSignatureVerified: verifyResult.cryptographicSignatureVerified,
      discoveredNew: false,
      warnings: verifyResult.warnings,
      challengeSource: challengeResult.challengeSource,
      serverStubVerification,
    };
  }

  // Recovered via discoverable credential (never self-escalates to 'master', honest presence_only)
  const recovered: PasskeyCredentialRecord = assertNoSecretLikeFields({
    id: assertion.id,
    rawIdBase64Url: toBase64Url(assertion.rawId),
    displayName: 'Passkey Hardware Credential',
    role:
      serverStubVerification.cryptographicServerVerified && serverStubVerification.serverRole
        ? serverStubVerification.serverRole
        : 'client',
    rpId,
    algorithm: -7,
    createdAt: nowIso,
    lastUsedAt: nowIso,
    transports: ['internal'],
    signCount: verifyResult.signCount,
    isSimulatedFallback: false,
  });

  return {
    credential: recovered,
    verification: verifyResult.verification,
    cryptographicSignatureVerified: false,
    discoveredNew: true,
    warnings: verifyResult.warnings,
    challengeSource: challengeResult.challengeSource,
    serverStubVerification,
  };
}

/**
 * [SIM] Explicit simulated Passkey enrollment for environments where WebAuthn is blocked.
 */
export function createSimulatedDemoPasskey(
  displayName: string,
  role: UserRole
): PasskeyCredentialRecord {
  const randomId = toBase64Url(generateCryptographicChallenge(16));
  const cleanName = displayName.trim() || (role === 'master' ? 'Master Stylist [SIM]' : 'Guest [SIM]');

  const record: PasskeyCredentialRecord = {
    id: `sim-passkey-${randomId.slice(0, 12)}`,
    rawIdBase64Url: randomId,
    displayName: cleanName.includes('[SIM]') ? cleanName : `${cleanName} [SIM]`,
    role,
    rpId: typeof window !== 'undefined' ? window.location.hostname : 'localhost',
    algorithm: -7,
    createdAt: new Date().toISOString(),
    lastUsedAt: new Date().toISOString(),
    transports: ['internal'],
    signCount: 0,
    isSimulatedFallback: true,
  };

  return assertNoSecretLikeFields(record);
}

/**
 * [SIM] Re-authenticates an already enrolled simulated demo Passkey.
 */
export function authenticateDemoPasskeySim(
  credentials: PasskeyCredentialRecord[],
  preferredId?: string
): PasskeyCredentialRecord {
  const simCredentials = credentials.filter(c => c.isSimulatedFallback);
  if (simCredentials.length === 0) {
    throw new Error('Нет сохранённого [SIM] демо-ключа. Создайте [SIM] Passkey один раз.');
  }
  const matched =
    (preferredId ? simCredentials.find(c => c.id === preferredId) : undefined) || simCredentials[0];
  return {
    ...matched,
    lastUsedAt: new Date().toISOString(),
    signCount: (matched.signCount ?? 0) + 1,
  };
}

export function buildSessionExpiryFromNow(ttlMs: number = DEFAULT_SESSION_TTL_MS): string {
  return createSessionExpiryIso(Date.now(), ttlMs);
}
