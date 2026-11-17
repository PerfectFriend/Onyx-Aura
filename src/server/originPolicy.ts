// =============================================================================
// Stage 4 · Sprint 4.3 — Server Origin, RP ID & Checkout Redirect Policy
// - Never trusts self-asserted `req.body.expectedOrigin` or arbitrary `rpId`.
// - Derives authoritative allowed origins from NAILIX_ALLOWED_ORIGINS + HTTP Host,
//   enforces WebAuthn effective-domain RP ID matching, and blocks open redirects
//   in Stripe Hosted Checkout `success_url` / `cancel_url`.
// =============================================================================

import type { Request } from 'express';

function normalizeOrigin(raw: string): string | null {
  try {
    const parsed = new URL(raw.trim());
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      return null;
    }
    return parsed.origin.toLowerCase();
  } catch {
    return null;
  }
}

function getHostname(origin: string): string | null {
  try {
    return new URL(origin).hostname.toLowerCase();
  } catch {
    return null;
  }
}

export function resolveConfiguredOrigins(explicitOrigins?: string[]): string[] {
  const envRaw = process.env.NAILIX_ALLOWED_ORIGINS ?? '';
  const runtimeAppUrl =
    process.env.APP_URL && process.env.APP_URL.startsWith('http') ? [process.env.APP_URL] : [];
  const combined = [
    ...(explicitOrigins ?? []),
    ...runtimeAppUrl,
    ...envRaw
      .split(',')
      .map(s => s.trim())
      .filter(Boolean),
  ];

  const normalized = new Set<string>();
  for (const item of combined) {
    const origin = normalizeOrigin(item);
    if (origin) normalized.add(origin);
  }
  return Array.from(normalized);
}

export function deriveRequestOrigin(req: Request): string | null {
  const forwardedHost = req.header('x-forwarded-host')?.split(',')[0]?.trim();
  const host = forwardedHost || req.header('host')?.trim();
  if (!host) return null;

  const forwardedProto = req.header('x-forwarded-proto')?.split(',')[0]?.trim().toLowerCase();
  const proto = forwardedProto === 'https' || req.secure ? 'https' : 'http';
  return normalizeOrigin(`${proto}://${host}`);
}

export function getAllowedOriginsForRequest(
  req: Request,
  explicitOrigins?: string[]
): string[] {
  const allowed = new Set<string>(resolveConfiguredOrigins(explicitOrigins));

  const requestDerived = deriveRequestOrigin(req);
  if (requestDerived) {
    allowed.add(requestDerived);
  }

  // In HTTP reverse-proxy / dev environments, allow the HTTP Origin header ONLY when
  // its hostname matches the Host / X-Forwarded-Host hostname (same host, e.g. TLS-terminated proxy).
  const originHeader = req.header('origin');
  const normalizedHeader = originHeader ? normalizeOrigin(originHeader) : null;
  if (normalizedHeader && requestDerived) {
    const reqHost = getHostname(requestDerived);
    const hdrHost = getHostname(normalizedHeader);
    if (reqHost && hdrHost && reqHost === hdrHost) {
      allowed.add(normalizedHeader);
    }
  }

  return Array.from(allowed);
}

export function validateWebAuthnOrigin(params: {
  clientOrigin: string | undefined;
  bodyExpectedOrigin?: string;
  req: Request;
  explicitOrigins?: string[];
}): { ok: true; authoritativeOrigin: string } | { ok: false; error: string } {
  const normalizedClient = params.clientOrigin ? normalizeOrigin(params.clientOrigin) : null;
  if (!normalizedClient) {
    return { ok: false, error: 'Invalid or non-HTTP(S) origin inside clientDataJSON.' };
  }

  // If the client passed an `Origin` HTTP header, clientData.origin MUST match it (anti-spoofing)
  const rawOriginHeader = params.req.header('origin');
  if (rawOriginHeader) {
    const normalizedHeader = normalizeOrigin(rawOriginHeader);
    if (!normalizedHeader || normalizedHeader !== normalizedClient) {
      return {
        ok: false,
        error: 'clientDataJSON.origin does not match HTTP Origin header.',
      };
    }
  }

  // If the request body also supplied expectedOrigin, it may narrow but NEVER widen policy
  if (params.bodyExpectedOrigin) {
    const normalizedExpected = normalizeOrigin(params.bodyExpectedOrigin);
    if (!normalizedExpected || normalizedExpected !== normalizedClient) {
      return {
        ok: false,
        error: 'Origin mismatch against request binding.',
      };
    }
  }

  const allowed = getAllowedOriginsForRequest(params.req, params.explicitOrigins);
  if (!allowed.includes(normalizedClient)) {
    return {
      ok: false,
      error: `Untrusted WebAuthn origin (${normalizedClient}); configure NAILIX_ALLOWED_ORIGINS if behind a custom domain.`,
    };
  }

  return { ok: true, authoritativeOrigin: normalizedClient };
}

export function isValidRpIdFormat(rpId: string): boolean {
  return (
    rpId.length > 0 &&
    rpId.length <= 253 &&
    /^[a-z0-9.-]+$/i.test(rpId) &&
    !rpId.startsWith('.') &&
    !rpId.endsWith('.') &&
    !rpId.includes('..')
  );
}

export function validateRpIdForOrigin(rpId: string, authoritativeOrigin: string): boolean {
  const normalizedRpId = rpId.trim().toLowerCase();
  if (!isValidRpIdFormat(normalizedRpId)) return false;

  const originHost = getHostname(authoritativeOrigin);
  if (!originHost) return false;

  // WebAuthn RP ID effective domain match: exact host OR valid parent domain (excluding bare suffixes unless localhost)
  if (originHost === normalizedRpId) {
    return true;
  }

  const dotCount = normalizedRpId.split('.').length - 1;
  if (dotCount >= 1 && originHost.endsWith(`.${normalizedRpId}`)) {
    return true;
  }

  return false;
}

export function resolveTrustedCheckoutOriginUrl(params: {
  candidateOriginUrl?: string;
  req: Request;
  explicitOrigins?: string[];
}): { ok: true; originUrl: string } | { ok: false; error: string } {
  const allowed = getAllowedOriginsForRequest(params.req, params.explicitOrigins);
  if (params.candidateOriginUrl) {
    const normalized = normalizeOrigin(params.candidateOriginUrl);
    if (!normalized || !allowed.includes(normalized)) {
      return {
        ok: false,
        error: `Untrusted checkout redirect origin (${params.candidateOriginUrl}).`,
      };
    }
    return { ok: true, originUrl: normalized };
  }

  const derived = deriveRequestOrigin(params.req) ?? allowed[0];
  if (!derived) {
    return { ok: false, error: 'Unable to determine trusted origin for Stripe redirect.' };
  }
  return { ok: true, originUrl: derived };
}
