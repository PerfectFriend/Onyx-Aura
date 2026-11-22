// =============================================================================
// Stage 5 · Sprint 5.1 — Unified Cryptographic ID Generator (V-07)
// - Uses crypto.randomUUID() wherever supported (modern browsers & Node >= 19)
// - Falls back honestly to crypto.getRandomValues() UUIDv4 formatting or a
//   monotonic sequence when running inside stripped test shims (never Math.random).
// =============================================================================

let monotonicFallbackCounter = 0;

function formatUuidV4FromBytes(bytes: Uint8Array): string {
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = Array.from(bytes, b => b.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20, 32)}`;
}

export function createRawUuid(): string {
  const webCrypto = globalThis.crypto;
  if (webCrypto && typeof webCrypto.randomUUID === 'function') {
    return webCrypto.randomUUID();
  }
  if (webCrypto && typeof webCrypto.getRandomValues === 'function') {
    const bytes = new Uint8Array(16);
    webCrypto.getRandomValues(bytes);
    return formatUuidV4FromBytes(bytes);
  }
  monotonicFallbackCounter += 1;
  return `00000000-0000-4000-8000-${Date.now().toString(16).slice(-8).padStart(8, '0')}${monotonicFallbackCounter.toString(16).padStart(4, '0')}`;
}

export function createId(prefix?: string): string {
  const raw = createRawUuid();
  return prefix ? `${prefix}-${raw}` : raw;
}

export function createShortId(prefix?: string, length: number = 8): string {
  const safeLen = Math.max(4, Math.min(32, Math.trunc(length)));
  const compact = createRawUuid().replace(/-/g, '').slice(0, safeLen);
  return prefix ? `${prefix}-${compact}` : compact;
}
