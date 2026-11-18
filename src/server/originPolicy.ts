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
  explicitOrigins?: string[],
  isProduction: boolean = process.env.NODE_ENV === 'production'
): string[] {
  const allowed = new Set<string>(resolveConfiguredOrigins(explicitOrigins));

  // Q-05: In production, NEVER auto-trust request Host / X-Forwarded-Host headers.
  // Require explicit NAILIX_ALLOWED_ORIGINS, APP_URL, or injected explicitOrigins.
  if (isProduction) {
    return Array.from(allowed);
  }

  const requestDerived = deriveRequestOrigin(req);
  if (requestDerived) {
    allowed.add(requestDerived);
  }

  // In non-production dev/proxy environments, allow Origin HTTP header when hostname matches Host.
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
  isProduction?: boolean;
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

  const isProd = params.isProduction ?? process.env.NODE_ENV === 'production';
  const allowed = getAllowedOriginsForRequest(params.req, params.explicitOrigins, isProd);
  if (!allowed.includes(normalizedClient)) {
    return {
      ok: false,
      error: isProd && allowed.length === 0
        ? 'No allowed origins configured in production (set NAILIX_ALLOWED_ORIGINS or APP_URL).'
        : `Untrusted WebAuthn origin (${normalizedClient}); configure NAILIX_ALLOWED_ORIGINS if behind a custom domain.`,
    };
  }

  return { ok: true, authoritativeOrigin: normalizedClient };
}

export function validateMutationOriginHeader(params: {
  req: Request;
  explicitOrigins?: string[];
  isProduction?: boolean;
}): { ok: true } | { ok: false; error: string } {
  const isProd = params.isProduction ?? process.env.NODE_ENV === 'production';
  const secFetchSite = params.req.header('sec-fetch-site')?.trim().toLowerCase();
  if (secFetchSite === 'cross-site') {
    return { ok: false, error: 'Cross-site mutation request rejected (Sec-Fetch-Site).' };
  }

  const rawOrigin = params.req.header('origin');
  if (!rawOrigin) {
    return { ok: true };
  }

  const normalized = normalizeOrigin(rawOrigin);
  if (!normalized) {
    return { ok: false, error: 'Malformed HTTP Origin header.' };
  }

  const allowed = getAllowedOriginsForRequest(params.req, params.explicitOrigins, isProd);
  if (!allowed.includes(normalized)) {
    return { ok: false, error: `Untrusted mutation Origin (${normalized}).` };
  }

  return { ok: true };
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
  isProduction?: boolean;
}): { ok: true; originUrl: string } | { ok: false; error: string } {
  const isProd = params.isProduction ?? process.env.NODE_ENV === 'production';
  const allowed = getAllowedOriginsForRequest(params.req, params.explicitOrigins, isProd);
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

  const derived = isProd ? allowed[0] : (deriveRequestOrigin(params.req) ?? allowed[0]);
  if (!derived) {
    return { ok: false, error: 'Unable to determine trusted origin for Stripe redirect.' };
  }
  return { ok: true, originUrl: derived };
}
