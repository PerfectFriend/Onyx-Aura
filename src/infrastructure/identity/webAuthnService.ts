// =============================================================================
// Stage 3 / Sprint 3.2 — WebAuthn / Passkeys Identity Service
// - Genuine browser FIDO2 / WebAuthn registration & assertion when available
// - Real client-side cryptographic verification (L-04):
//     * clientDataJSON (type, challenge, origin)
//     * authenticatorData (rpIdHash SHA-256, UP/UV flags, monotonic signCount)
//     * ES256 (DER -> IEEE P1363 r||s) & RS256 signature verification vs stored SPKI
//     * Discoverable credential fallback (allowCredentials: []) if IDB was reset
// - Private keys never leave hardware TPM / Secure Enclave; zero plaintext secrets
// - Explicit [SIM] demo fallback + re-login inside non-WebAuthn sandboxes (L-12)
// - Client-local verification scope only until Stage 4 backend challenge server
// =============================================================================

import {
  DEFAULT_SESSION_TTL_MS,
  createSessionExpiryIso,
  PasskeyCredentialRecord,
  WebAuthnCapabilityReport,
} from '../../domain/identity';
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
 * Converts an ASN.1 DER-encoded ECDSA signature (`30 len 02 rLen r 02 sLen s`)
 * into raw 64-byte IEEE P1363 `(r || s)` required by Web Crypto `SubtleCrypto.verify`.
 */
export function derEcdsaToP1363(der: Uint8Array, coordinateSize = 32): Uint8Array {
  if (der.length < 8 || der[0] !== 0x30) {
    throw new Error('Invalid DER ECDSA signature: expected SEQUENCE header 0x30.');
  }

  let offset = 2;
  // Handle long-form DER length if present
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
  storedCredential?: Pick<PasskeyCredentialRecord, 'publicKeySpkiBase64Url' | 'algorithm' | 'signCount'>;
}

export interface VerifyAssertionResult {
  verified: boolean;
  cryptographicSignatureVerified: boolean;
  userPresent: boolean;
  userVerified: boolean;
  signCount: number;
}

/**
 * Verifies a WebAuthn assertion response locally against WebAuthn L2 steps (L-04):
 * clientDataJSON type/challenge/origin, rpIdHash, UP/UV flags, monotonic signCount,
 * and SPKI signature (ES256 / RS256) when the stored credential holds an SPKI key.
 */
export async function verifyWebAuthnAssertion({
  response,
  expectedChallengeBase64Url,
  expectedOrigin,
  expectedRpId,
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
  if (!userPresent) {
    throw new Error('WebAuthn assertion rejected: User Present (UP) flag is not set.');
  }

  const signCount =
    ((authDataBytes[33] << 24) >>> 0) +
    (authDataBytes[34] << 16) +
    (authDataBytes[35] << 8) +
    authDataBytes[36];

  const prevSignCount = storedCredential?.signCount ?? 0;
  if ((prevSignCount > 0 || signCount > 0) && signCount <= prevSignCount) {
    throw new Error(
      `Authenticator signCount did not advance (${signCount} <= ${prevSignCount}); possible cloned credential.`
    );
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
  }

  return {
    verified: true,
    cryptographicSignatureVerified,
    userPresent,
    userVerified,
    signCount,
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

export interface RegisterPasskeyParams {
  displayName: string;
  role: UserRole;
  existingCredentials?: PasskeyCredentialRecord[];
}

export async function registerWebAuthnPasskey({
  displayName,
  role,
  existingCredentials = [],
}: RegisterPasskeyParams): Promise<PasskeyCredentialRecord> {
  const capability = await detectWebAuthnSupport();
  if (!capability.isSupported) {
    throw new Error(capability.reason || 'WebAuthn is unsupported in this browser context.');
  }

  const cleanName = displayName.trim() || (role === 'master' ? 'Master Stylist' : 'Salon Guest');
  const challenge = generateCryptographicChallenge(32);
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
      userVerification: 'preferred',
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
  const alg =
    typeof attestationResponse.getPublicKeyAlgorithm === 'function'
      ? attestationResponse.getPublicKeyAlgorithm()
      : -7;

  const record: PasskeyCredentialRecord = {
    id: credential.id,
    rawIdBase64Url: toBase64Url(credential.rawId),
    publicKeySpkiBase64Url: publicKeyBuf ? toBase64Url(publicKeyBuf) : undefined,
    displayName: cleanName,
    role,
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
 * resident credentials (`allowCredentials: []`), then verifies clientDataJSON,
 * rpIdHash, UP flag, signCount, and cryptographic signature locally (L-04).
 */
export async function authenticateWebAuthnPasskey(
  credentials: PasskeyCredentialRecord[],
  options: { allowDiscoverableFallback?: boolean } = { allowDiscoverableFallback: true }
): Promise<{
  credential: PasskeyCredentialRecord;
  cryptographicSignatureVerified: boolean;
  discoveredNew: boolean;
}> {
  const realCredentials = credentials.filter(c => !c.isSimulatedFallback);
  if (realCredentials.length === 0 && !options.allowDiscoverableFallback) {
    throw new Error('No hardware/browser Passkey registered on this device yet.');
  }

  const capability = await detectWebAuthnSupport();
  if (!capability.isSupported) {
    throw new Error(capability.reason || 'WebAuthn is unsupported in this context.');
  }

  const challenge = generateCryptographicChallenge(32);
  const expectedChallengeBase64Url = toBase64Url(challenge);
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
    userVerification: 'preferred',
    timeout: 60000,
    // Empty allowCredentials enables discoverable / resident keys if local IDB was cleared (L-04)
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
    storedCredential: matched,
  });

  const nowIso = new Date().toISOString();

  if (matched) {
    return {
      credential: {
        ...matched,
        lastUsedAt: nowIso,
        signCount: verifyResult.signCount,
      },
      cryptographicSignatureVerified: verifyResult.cryptographicSignatureVerified,
      discoveredNew: false,
    };
  }

  // Recovered via discoverable credential (never self-escalates to 'master')
  const recovered: PasskeyCredentialRecord = assertNoSecretLikeFields({
    id: assertion.id,
    rawIdBase64Url: toBase64Url(assertion.rawId),
    displayName: 'Passkey Hardware Credential',
    role: 'client',
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
    cryptographicSignatureVerified: false,
    discoveredNew: true,
  };
}

/**
 * [SIM] Explicit simulated Passkey enrollment for environments where WebAuthn is blocked
 * (e.g., restricted iframe sandbox without publickey-credentials-create permission).
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
 * [SIM] Re-authenticates an already enrolled simulated demo Passkey so [SIM] users can
 * sign out and back in without minting duplicate records (L-12).
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
