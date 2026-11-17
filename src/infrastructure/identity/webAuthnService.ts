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
 * Minimal deterministic CBOR decoder supporting uint, nint, bstr, tstr, array, and map
 * needed to extract `authData` and COSE public keys from WebAuthn `attestationObject`.
 */
function decodeCborValue(
  bytes: Uint8Array,
  offset = 0
): { value: unknown; nextOffset: number } {
  if (offset >= bytes.length) {
    throw new Error('Unexpected end of CBOR buffer.');
  }
  const initial = bytes[offset];
  const major = initial >> 5;
  const additional = initial & 0x1f;
  let cursor = offset + 1;

  const readUint = (info: number): number => {
    if (info < 24) return info;
    if (info === 24) {
      if (cursor >= bytes.length) throw new Error('Truncated CBOR uint8');
      return bytes[cursor++];
    }
    if (info === 25) {
      if (cursor + 2 > bytes.length) throw new Error('Truncated CBOR uint16');
      const v = (bytes[cursor] << 8) | bytes[cursor + 1];
      cursor += 2;
      return v;
    }
    if (info === 26) {
      if (cursor + 4 > bytes.length) throw new Error('Truncated CBOR uint32');
      const v =
        ((bytes[cursor] << 24) >>> 0) +
        (bytes[cursor + 1] << 16) +
        (bytes[cursor + 2] << 8) +
        bytes[cursor + 3];
      cursor += 4;
      return v;
    }
    throw new Error(`Unsupported CBOR length info ${info}`);
  };

  if (major === 0) {
    return { value: readUint(additional), nextOffset: cursor };
  }
  if (major === 1) {
    return { value: -1 - readUint(additional), nextOffset: cursor };
  }
  if (major === 2) {
    const len = readUint(additional);
    const slice = bytes.slice(cursor, cursor + len);
    return { value: slice, nextOffset: cursor + len };
  }
  if (major === 3) {
    const len = readUint(additional);
    const slice = bytes.slice(cursor, cursor + len);
    return { value: new TextDecoder().decode(slice), nextOffset: cursor + len };
  }
  if (major === 4) {
    const len = readUint(additional);
    const arr: unknown[] = [];
    for (let i = 0; i < len; i++) {
      const item = decodeCborValue(bytes, cursor);
      arr.push(item.value);
      cursor = item.nextOffset;
    }
    return { value: arr, nextOffset: cursor };
  }
  if (major === 5) {
    const len = readUint(additional);
    const map = new Map<unknown, unknown>();
    for (let i = 0; i < len; i++) {
      const key = decodeCborValue(bytes, cursor);
      const val = decodeCborValue(bytes, key.nextOffset);
      map.set(key.value, val.value);
      cursor = val.nextOffset;
    }
    return { value: map, nextOffset: cursor };
  }
  if (major === 7) {
    if (additional === 20) return { value: false, nextOffset: cursor };
    if (additional === 21) return { value: true, nextOffset: cursor };
    if (additional === 22) return { value: null, nextOffset: cursor };
    return { value: undefined, nextOffset: cursor };
  }

  throw new Error(`Unsupported CBOR major type ${major}`);
}

function encodeDerLength(len: number): Uint8Array {
  if (len < 0x80) return new Uint8Array([len]);
  if (len <= 0xff) return new Uint8Array([0x81, len]);
  return new Uint8Array([0x82, (len >> 8) & 0xff, len & 0xff]);
}

function encodeDerSequence(contents: Uint8Array): Uint8Array {
  const lenBytes = encodeDerLength(contents.length);
  const out = new Uint8Array(1 + lenBytes.length + contents.length);
  out[0] = 0x30;
  out.set(lenBytes, 1);
  out.set(contents, 1 + lenBytes.length);
  return out;
}

function encodeDerUnsignedInteger(raw: Uint8Array): Uint8Array {
  let start = 0;
  while (start < raw.length - 1 && raw[start] === 0) start++;
  let trimmed = raw.slice(start);
  if ((trimmed[0] & 0x80) !== 0) {
    const prefixed = new Uint8Array(trimmed.length + 1);
    prefixed[0] = 0x00;
    prefixed.set(trimmed, 1);
    trimmed = prefixed;
  }
  const lenBytes = encodeDerLength(trimmed.length);
  const out = new Uint8Array(1 + lenBytes.length + trimmed.length);
  out[0] = 0x02;
  out.set(lenBytes, 1);
  out.set(trimmed, 1 + lenBytes.length);
  return out;
}

function encodeDerBitString(bytes: Uint8Array): Uint8Array {
  const lenBytes = encodeDerLength(bytes.length + 1);
  const out = new Uint8Array(1 + lenBytes.length + 1 + bytes.length);
  out[0] = 0x03;
  out.set(lenBytes, 1);
  out[1 + lenBytes.length] = 0x00; // unused bits
  out.set(bytes, 1 + lenBytes.length + 1);
  return out;
}

/**
 * Extracts a Base64URL SPKI public key + COSE algorithm from a raw WebAuthn
 * `attestationObject` if `AuthenticatorAttestationResponse.getPublicKey()` is unavailable (N-05).
 */
export function extractSpkiFromAttestationObject(
  attestationObject: ArrayBuffer | Uint8Array
): { spkiBase64Url: string; algorithm: number } | null {
  try {
    const raw =
      attestationObject instanceof Uint8Array
        ? attestationObject
        : new Uint8Array(attestationObject);
    const decoded = decodeCborValue(raw, 0);
    if (!(decoded.value instanceof Map)) return null;
    const attestationMap = decoded.value as ReadonlyMap<unknown, unknown>;
    const authData = attestationMap.get('authData');
    if (!(authData instanceof Uint8Array) || authData.length < 55) return null;

    const flags = authData[32];
    const hasAttestedCredentialData = (flags & 0x40) !== 0;
    if (!hasAttestedCredentialData) return null;

    // 32 (rpIdHash) + 1 (flags) + 4 (signCount) + 16 (aaguid) = offset 53
    const credIdLen = (authData[53] << 8) | authData[54];
    const coseOffset = 55 + credIdLen;
    if (coseOffset >= authData.length) return null;

    const cose = decodeCborValue(authData, coseOffset);
    if (!(cose.value instanceof Map)) return null;
    const coseMap = cose.value as ReadonlyMap<unknown, unknown>;

    const kty = coseMap.get(1);
    const rawAlg = coseMap.get(3);
    const alg = typeof rawAlg === 'number' ? rawAlg : -7;

    // EC2 (kty = 2), P-256 (crv = 1)
    if (kty === 2) {
      const crv = coseMap.get(-1);
      const x = coseMap.get(-2);
      const y = coseMap.get(-3);
      if (crv === 1 && x instanceof Uint8Array && y instanceof Uint8Array && x.length === 32 && y.length === 32) {
        const spkiPrefix = new Uint8Array([
          0x30, 0x59, 0x30, 0x13, 0x06, 0x07, 0x2a, 0x86, 0x48, 0xce, 0x3d, 0x02, 0x01, 0x06,
          0x08, 0x2a, 0x86, 0x48, 0xce, 0x3d, 0x03, 0x01, 0x07, 0x03, 0x42, 0x00, 0x04,
        ]);
        const spki = concatBytes(spkiPrefix, concatBytes(x, y));
        return { spkiBase64Url: toBase64Url(spki), algorithm: alg };
      }
    }

    // RSA (kty = 3, RS256)
    if (kty === 3) {
      const n = coseMap.get(-1);
      const e = coseMap.get(-2);
      if (n instanceof Uint8Array && e instanceof Uint8Array) {
        const rsaAlgId = new Uint8Array([
          0x30, 0x0d, 0x06, 0x09, 0x2a, 0x86, 0x48, 0x86, 0xf7, 0x0d, 0x01, 0x01, 0x01, 0x05, 0x00,
        ]);
        const pubKeySeq = encodeDerSequence(
          concatBytes(encodeDerUnsignedInteger(n), encodeDerUnsignedInteger(e))
        );
        const spki = encodeDerSequence(concatBytes(rsaAlgId, encodeDerBitString(pubKeySeq)));
        return { spkiBase64Url: toBase64Url(spki), algorithm: alg };
      }
    }

    return null;
  } catch {
    return null;
  }
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
      userVerification: role === 'master' ? 'required' : 'preferred',
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

  const record: PasskeyCredentialRecord = {
    id: credential.id,
    rawIdBase64Url: toBase64Url(credential.rawId),
    publicKeySpkiBase64Url,
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
 * resident credentials (`allowCredentials: []`), enforcing UV for `master`,
 * `BE` synced passkey handling, and honest `signature_verified` vs `presence_only` levels (N-05).
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

  const hasMasterCandidate = realCredentials.some(c => c.role === 'master');

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

  const nowIso = new Date().toISOString();

  if (matched) {
    return {
      credential: {
        ...matched,
        lastUsedAt: nowIso,
        signCount: verifyResult.signCount,
      },
      verification: verifyResult.verification,
      cryptographicSignatureVerified: verifyResult.cryptographicSignatureVerified,
      discoveredNew: false,
      warnings: verifyResult.warnings,
    };
  }

  // Recovered via discoverable credential (never self-escalates to 'master', honest presence_only)
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
    verification: verifyResult.verification,
    cryptographicSignatureVerified: false,
    discoveredNew: true,
    warnings: verifyResult.warnings,
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
