// =============================================================================
// Stage 3 — WebAuthn / Passkeys Identity Service
// - Genuine browser FIDO2 / WebAuthn registration & assertion when available
// - Private keys never leave hardware TPM / Secure Enclave; zero plaintext secrets
// - Explicit [SIM] demo fallback ONLY if user opts in inside sandbox/non-WebAuthn browser
// - Client-local verification scope only until Stage 4 backend challenge server
// =============================================================================

import {
  PasskeyCredentialRecord,
  WebAuthnCapabilityReport,
} from '../../domain/identity';
import { UserRole } from '../../types';
import {
  assertNoPlaintextSecrets,
  fromBase64Url,
  generateCryptographicChallenge,
  toBase64Url,
} from './secretHygiene';

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

/**
 * Registers a real WebAuthn Passkey on this device/browser.
 * Throws descriptive errors if sandboxed iframe permissions or user cancellation occur.
 */
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
      { type: 'public-key', alg: -7 },   // ES256 (ECDSA P-256)
      { type: 'public-key', alg: -257 }, // RS256
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
    isSimulatedFallback: false,
  };

  return assertNoPlaintextSecrets(record);
}

/**
 * Prompts browser WebAuthn assertion for any previously registered Passkey.
 * Note: Stage 3 verifies presence client-side; server signature verification launches in Stage 4.
 */
export async function authenticateWebAuthnPasskey(
  credentials: PasskeyCredentialRecord[]
): Promise<PasskeyCredentialRecord> {
  const realCredentials = credentials.filter(c => !c.isSimulatedFallback);
  if (realCredentials.length === 0) {
    throw new Error('No hardware/browser Passkey registered on this device yet.');
  }

  const capability = await detectWebAuthnSupport();
  if (!capability.isSupported) {
    throw new Error(capability.reason || 'WebAuthn is unsupported in this context.');
  }

  const challenge = generateCryptographicChallenge(32);
  const rpId = window.location.hostname;

  const publicKeyRequest: PublicKeyCredentialRequestOptions = {
    challenge: challenge as unknown as BufferSource,
    rpId,
    userVerification: 'preferred',
    timeout: 60000,
    allowCredentials: realCredentials.map(c => ({
      type: 'public-key' as const,
      id: fromBase64Url(c.rawIdBase64Url) as unknown as BufferSource,
      transports: c.transports as AuthenticatorTransport[] | undefined,
    })),
  };

  const assertion = (await navigator.credentials.get({
    publicKey: publicKeyRequest,
  })) as PublicKeyCredential | null;

  if (!assertion) {
    throw new Error('Passkey authentication did not complete.');
  }

  const matched =
    realCredentials.find(c => c.id === assertion.id) ||
    realCredentials.find(c => c.rawIdBase64Url === toBase64Url(assertion.rawId));

  if (!matched) {
    throw new Error('Returned Passkey credential is not recognized in local IndexedDB registry.');
  }

  return {
    ...matched,
    lastUsedAt: new Date().toISOString(),
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
    isSimulatedFallback: true,
  };

  return assertNoPlaintextSecrets(record);
}
