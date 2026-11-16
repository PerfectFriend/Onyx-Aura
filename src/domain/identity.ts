// =============================================================================
// Domain contracts for Stage 3 Identity & WebAuthn Passkeys.
// Strict second-line secret guard: zero passwords or private keys in JS models.
// Language-agnostic domain values: displayName is null for anonymous sessions (L-18).
// =============================================================================

import { UserRole } from '../types';

export type AuthMethod = 'none' | 'webauthn_passkey' | 'demo_passkey_sim';

/** Default session TTL: 8 hours (enforced locally until backend sessions launch in Stage 4). */
export const DEFAULT_SESSION_TTL_MS = 8 * 60 * 60 * 1000;

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
  /** Monotonic signature counter checked on local assertions to flag cloned authenticators (L-04). */
  signCount?: number;
  /** Explicit flag separating genuine hardware/platform WebAuthn from sandbox [SIM] preview. */
  isSimulatedFallback: boolean;
}

export interface IdentitySession {
  authenticated: boolean;
  credentialId: string | null;
  /** Null when unauthenticated; UI renders localized guest label instead of hardcoded Russian in domain (L-18). */
  displayName: string | null;
  role: UserRole;
  authMethod: AuthMethod;
  signedInAt: string | null;
  /** ISO expiration timestamp enforcing bounded local session lifetime (L-04). */
  expiresAt: string | null;
  /** Stage 3 verifies WebAuthn signature locally; backend challenge/authorization starts Stage 4. */
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
  displayName: null,
  role: 'client',
  authMethod: 'none',
  signedInAt: null,
  expiresAt: null,
  verificationScope: 'client_local_only',
};

export function createSessionExpiryIso(fromMs: number = Date.now(), ttlMs: number = DEFAULT_SESSION_TTL_MS): string {
  return new Date(fromMs + ttlMs).toISOString();
}

export function isIdentitySessionExpired(session: IdentitySession, nowMs: number = Date.now()): boolean {
  if (!session.authenticated) return false;
  if (!session.expiresAt) return true;
  const expiryMs = Date.parse(session.expiresAt);
  if (!Number.isFinite(expiryMs)) return true;
  return nowMs >= expiryMs;
}
