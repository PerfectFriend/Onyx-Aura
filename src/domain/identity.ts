// =============================================================================
// Domain contracts for Stage 3 Identity & WebAuthn Passkeys.
// Strict Zero-Plaintext-Secrets invariant: only public credential IDs & public SPKI
// keys are represented here; private keys remain hardware-bound in TPM/Enclave.
// =============================================================================

import { UserRole } from '../types';

export type AuthMethod = 'none' | 'webauthn_passkey' | 'demo_passkey_sim';

export interface PasskeyCredentialRecord {
  id: string;
  rawIdBase64Url: string;
  /** Optional SPKI public key bytes (Base64URL), never private key material. */
  publicKeySpkiBase64Url?: string;
  displayName: string;
  role: UserRole;
  rpId: string;
  algorithm: number;
  createdAt: string;
  lastUsedAt: string;
  transports: string[];
  /** Explicit flag separating genuine hardware/platform WebAuthn from sandbox [SIM] preview. */
  isSimulatedFallback: boolean;
}

export interface IdentitySession {
  authenticated: boolean;
  credentialId: string | null;
  displayName: string;
  role: UserRole;
  authMethod: AuthMethod;
  signedInAt: string | null;
  /** Stage 3 verifies user presence locally; backend assertion verification starts Stage 4. */
  verificationScope: 'client_local_only';
}

export interface WebAuthnCapabilityReport {
  isSupported: boolean;
  platformAuthenticatorAvailable: boolean;
  isSecureContext: boolean;
  reason?: string;
}

export const DEFAULT_ANONYMOUS_SESSION: IdentitySession = {
  authenticated: false,
  credentialId: null,
  displayName: 'Гость',
  role: 'client',
  authMethod: 'none',
  signedInAt: null,
  verificationScope: 'client_local_only',
};
