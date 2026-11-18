// =============================================================================
// Pure Isomorphic WebAuthn CBOR / authData / COSE-to-SPKI Parser
// - Zero Node-only or Browser-only globals; shared by client webAuthnService
//   and server webAuthnServerVerifier (Q-01 attestedCredentialData binding).
// =============================================================================

export function toBase64UrlBytes(bytes: Uint8Array): string {
  if (typeof Buffer !== 'undefined') {
    return Buffer.from(bytes)
      .toString('base64')
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/g, '');
  }
  let binary = '';
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

export function fromBase64UrlBytes(b64u: string): Uint8Array {
  const padded = b64u.replace(/-/g, '+').replace(/_/g, '/');
  const padLen = (4 - (padded.length % 4)) % 4;
  const normalized = `${padded}${'='.repeat(padLen)}`;
  if (typeof Buffer !== 'undefined') {
    return new Uint8Array(Buffer.from(normalized, 'base64'));
  }
  const binary = atob(normalized);
  const out = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    out[i] = binary.charCodeAt(i);
  }
  return out;
}

function concatUint8(a: Uint8Array, b: Uint8Array): Uint8Array {
  const out = new Uint8Array(a.length + b.length);
  out.set(a, 0);
  out.set(b, a.length);
  return out;
}

/**
 * Minimal deterministic CBOR decoder supporting uint, nint, bstr, tstr, array, and map
 * needed to extract `authData` and COSE public keys from WebAuthn payloads.
 */
export function decodeCborValue(
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
    if (cursor + len > bytes.length) throw new Error('Truncated CBOR bstr');
    const slice = bytes.slice(cursor, cursor + len);
    return { value: slice, nextOffset: cursor + len };
  }
  if (major === 3) {
    const len = readUint(additional);
    if (cursor + len > bytes.length) throw new Error('Truncated CBOR tstr');
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
  out[1 + lenBytes.length] = 0x00;
  out.set(bytes, 1 + lenBytes.length + 1);
  return out;
}

export interface ParsedAttestedCredentialData {
  rpIdHash: Uint8Array;
  flags: number;
  signCount: number;
  credentialIdBytes: Uint8Array;
  credentialIdBase64Url: string;
  spkiBase64Url: string;
  algorithm: number;
}

/**
 * Parses WebAuthn authenticatorData containing AT (0x40) attestedCredentialData
 * and extracts credentialId + canonical DER SPKI + COSE algorithm.
 */
export function parseAttestedCredentialDataFromAuthData(
  authData: Uint8Array
): ParsedAttestedCredentialData | null {
  try {
    if (authData.length < 55) return null;

    const rpIdHash = authData.slice(0, 32);
    const flags = authData[32];
    const hasAttestedCredentialData = (flags & 0x40) !== 0;
    if (!hasAttestedCredentialData) return null;

    const signCount =
      ((authData[33] << 24) >>> 0) +
      (authData[34] << 16) +
      (authData[35] << 8) +
      authData[36];

    // 32 (rpIdHash) + 1 (flags) + 4 (signCount) + 16 (aaguid) = offset 53
    const credIdLen = (authData[53] << 8) | authData[54];
    const credIdEnd = 55 + credIdLen;
    if (credIdLen === 0 || credIdEnd >= authData.length) return null;

    const credentialIdBytes = authData.slice(55, credIdEnd);
    const cose = decodeCborValue(authData, credIdEnd);
    if (!(cose.value instanceof Map)) return null;

    const coseMap = cose.value as ReadonlyMap<unknown, unknown>;
    const kty = coseMap.get(1);
    const rawAlg = coseMap.get(3);
    const alg = typeof rawAlg === 'number' ? rawAlg : -7;

    // EC2 (kty = 2), P-256 (crv = 1) -> ES256 (-7)
    if (kty === 2) {
      const crv = coseMap.get(-1);
      const x = coseMap.get(-2);
      const y = coseMap.get(-3);
      if (
        crv === 1 &&
        x instanceof Uint8Array &&
        y instanceof Uint8Array &&
        x.length === 32 &&
        y.length === 32
      ) {
        const spkiPrefix = new Uint8Array([
          0x30, 0x59, 0x30, 0x13, 0x06, 0x07, 0x2a, 0x86, 0x48, 0xce, 0x3d, 0x02, 0x01, 0x06,
          0x08, 0x2a, 0x86, 0x48, 0xce, 0x3d, 0x03, 0x01, 0x07, 0x03, 0x42, 0x00, 0x04,
        ]);
        const spki = concatUint8(spkiPrefix, concatUint8(x, y));
        return {
          rpIdHash,
          flags,
          signCount,
          credentialIdBytes,
          credentialIdBase64Url: toBase64UrlBytes(credentialIdBytes),
          spkiBase64Url: toBase64UrlBytes(spki),
          algorithm: alg,
        };
      }
    }

    // RSA (kty = 3, RS256 -257)
    if (kty === 3) {
      const n = coseMap.get(-1);
      const e = coseMap.get(-2);
      if (n instanceof Uint8Array && e instanceof Uint8Array) {
        const rsaAlgId = new Uint8Array([
          0x30, 0x0d, 0x06, 0x09, 0x2a, 0x86, 0x48, 0x86, 0xf7, 0x0d, 0x01, 0x01, 0x01, 0x05, 0x00,
        ]);
        const pubKeySeq = encodeDerSequence(
          concatUint8(encodeDerUnsignedInteger(n), encodeDerUnsignedInteger(e))
        );
        const spki = encodeDerSequence(concatUint8(rsaAlgId, encodeDerBitString(pubKeySeq)));
        return {
          rpIdHash,
          flags,
          signCount,
          credentialIdBytes,
          credentialIdBase64Url: toBase64UrlBytes(credentialIdBytes),
          spkiBase64Url: toBase64UrlBytes(spki),
          algorithm: alg,
        };
      }
    }

    return null;
  } catch {
    return null;
  }
}

export function extractAuthDataFromAttestationObject(
  attestationObject: ArrayBuffer | Uint8Array
): Uint8Array | null {
  try {
    const raw =
      attestationObject instanceof Uint8Array
        ? attestationObject
        : new Uint8Array(attestationObject);
    const decoded = decodeCborValue(raw, 0);
    if (!(decoded.value instanceof Map)) return null;
    const authData = (decoded.value as ReadonlyMap<unknown, unknown>).get('authData');
    return authData instanceof Uint8Array ? authData : null;
  } catch {
    return null;
  }
}

export function extractAttestedCredentialFromAttestationObject(
  attestationObject: ArrayBuffer | Uint8Array
): ParsedAttestedCredentialData | null {
  const authData = extractAuthDataFromAttestationObject(attestationObject);
  if (!authData) return null;
  return parseAttestedCredentialDataFromAuthData(authData);
}
