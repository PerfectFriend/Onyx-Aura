// =============================================================================
// Stage 3 Security & Secret Hygiene helpers:
// - Cryptographically random challenges (Web Crypto getRandomValues)
// - Base64URL encoding/decoding for WebAuthn ArrayBuffers
// - Plaintext secret & private-key guard before persisting or exporting payloads
// =============================================================================

const FORBIDDEN_SECRET_PATTERNS: { label: string; regex: RegExp }[] = [
  { label: 'PEM private key header', regex: /-----BEGIN [A-Z0-9 ]*PRIVATE KEY-----/i },
  { label: 'privateKey field', regex: /"privateKey"\s*:/i },
  { label: 'secretKey field', regex: /"secretKey"\s*:/i },
  { label: 'seedPhrase field', regex: /"seedPhrase"\s*:/i },
  { label: 'mnemonic field', regex: /"mnemonic"\s*:/i },
  { label: 'password field', regex: /"password"\s*:\s*"[^"]+"/i },
  { label: 'GitHub PAT', regex: /ghp_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{20,}/ },
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
  if (typeof crypto === 'undefined' || typeof crypto.getRandomValues !== 'function') {
    throw new Error('Web Crypto getRandomValues is required for challenge generation.');
  }
  const challenge = new Uint8Array(byteLength);
  crypto.getRandomValues(challenge);
  return challenge;
}

/**
 * Verifies a serialized object or JSON export contains zero plaintext private keys,
 * mnemonic phrases, passwords, or access tokens (Evolution Plan Stage 3).
 */
export function detectPlaintextSecrets(serialized: string): string[] {
  const hits: string[] = [];
  for (const { label, regex } of FORBIDDEN_SECRET_PATTERNS) {
    if (regex.test(serialized)) {
      hits.push(label);
    }
  }
  return hits;
}

export function assertNoPlaintextSecrets<T>(value: T): T {
  const serialized = typeof value === 'string' ? value : JSON.stringify(value);
  const violations = detectPlaintextSecrets(serialized);
  if (violations.length > 0) {
    throw new Error(
      `Security policy violation: plaintext secret material detected (${violations.join(', ')}).`
    );
  }
  return value;
}
