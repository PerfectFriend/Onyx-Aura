// =============================================================================
// Stage 3 Security & Secret Hygiene helpers:
// - Cryptographically random challenges (Web Crypto getRandomValues)
// - Base64URL encoding/decoding for WebAuthn ArrayBuffers
// - Second-line stray secret detector (`assertNoSecretLikeFields`, L-05).
//   NOTE: Primary security boundary against unrequested secret fields is
//   strict allowlist schema validation in `src/domain/schemas.ts`.
// =============================================================================

const FORBIDDEN_SECRET_PATTERNS: { label: string; regex: RegExp }[] = [
  { label: 'PEM key block header', regex: /-----BEGIN\s+[A-Z0-9 _-]*-----/i },
  { label: 'private_key / privateKey field', regex: /"private_?key"\s*:/i },
  { label: 'secret_key / secretKey field', regex: /"secret_?key"\s*:/i },
  { label: 'JWK private "d" component', regex: /"d"\s*:\s*"[^"]+"/ },
  { label: 'API key / secret / token field', regex: /"(?:api_?key|api_?secret|access_?token|refresh_?token|auth_?token|secret_?token)"\s*:/i },
  { label: 'Bearer token', regex: /\bBearer\s+[A-Za-z0-9\-._~+/]+=*/i },
  { label: 'AWS access key ID', regex: /AKIA[0-9A-Z]{16}/ },
  { label: 'seedPhrase / mnemonic field', regex: /"(?:seed_?phrase|mnemonic)"\s*:/i },
  { label: 'password field', regex: /"password"\s*:\s*(?:"[^"]+"|\d+)/i },
  { label: 'GitHub PAT', regex: /gh[pousr]_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{20,}/ },
];

export function toBase64Url(input: ArrayBuffer | Uint8Array): string {
  const bytes = input instanceof Uint8Array ? input : new Uint8Array(input);
  let binary = '';
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  const base64 =
    typeof btoa === 'function'
      ? btoa(binary)
      : Buffer.from(bytes).toString('base64');
  return base64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

export function fromBase64Url(base64Url: string): Uint8Array {
  const padded = base64Url.replace(/-/g, '+').replace(/_/g, '/');
  const padLength = (4 - (padded.length % 4)) % 4;
  const base64 = padded + '='.repeat(padLength);

  if (typeof atob === 'function') {
    const binary = atob(base64);
    const out = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
      out[i] = binary.charCodeAt(i);
    }
    return out;
  }

  return new Uint8Array(Buffer.from(base64, 'base64'));
}

export function generateCryptographicChallenge(byteLength = 32): Uint8Array {
  const cryptoApi = typeof globalThis !== 'undefined' ? globalThis.crypto : undefined;
  if (!cryptoApi || typeof cryptoApi.getRandomValues !== 'function') {
    throw new Error('Web Crypto getRandomValues is required for challenge generation.');
  }
  const challenge = new Uint8Array(byteLength);
  cryptoApi.getRandomValues(challenge);
  return challenge;
}

/**
 * Second-line defense scanning serialized payloads for secret-like patterns
 * (private keys, JWK "d", API keys, Bearer tokens, AWS keys, passwords, PATs).
 * Primary defense is strict allowlist schema validation per entity (`src/domain/schemas.ts`).
 */
export function detectSecretLikeFields(serialized: string): string[] {
  const hits: string[] = [];
  for (const { label, regex } of FORBIDDEN_SECRET_PATTERNS) {
    if (regex.test(serialized)) {
      hits.push(label);
    }
  }
  return hits;
}

/**
 * Rejects any object or string matching second-line secret-like field heuristics.
 */
export function assertNoSecretLikeFields<T>(value: T): T {
  const serialized = typeof value === 'string' ? value : JSON.stringify(value);
  const violations = detectSecretLikeFields(serialized);
  if (violations.length > 0) {
    throw new Error(
      `Security policy violation: secret-like material detected (${violations.join(', ')}).`
    );
  }
  return value;
}

/** Backwards-compatible aliases kept for existing callers/tests. */
export const detectPlaintextSecrets = detectSecretLikeFields;
export const assertNoPlaintextSecrets = assertNoSecretLikeFields;
