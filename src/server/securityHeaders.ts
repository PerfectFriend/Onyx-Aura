// =============================================================================
// Stage 4 · Sprint 4.2 — Express HTTP Security Headers Middleware
// - Emits real HTTP response headers (X-Content-Type-Options, Referrer-Policy,
//   Permissions-Policy, and Content-Security-Policy with frame-ancestors).
// - Preserves AI Studio preview iframe compatibility by allowing configurable
//   NAILIX_FRAME_ANCESTORS (default: 'self' + aistudio.google.com).
// =============================================================================

import type { NextFunction, Request, Response } from 'express';
import { buildContentSecurityPolicy } from '../infrastructure/security/csp';

export function buildServerHttpCsp(isProduction: boolean): string {
  const baseCsp = buildContentSecurityPolicy(isProduction ? 'production' : 'development');
  const frameAncestors =
    process.env.NAILIX_FRAME_ANCESTORS?.trim() ||
    (isProduction ? "'self'" : "'self' https://aistudio.google.com https://*.google.com");
  return `${baseCsp} frame-ancestors ${frameAncestors};`;
}

export function securityHeadersMiddleware(isProduction: boolean) {
  const cspHeader = buildServerHttpCsp(isProduction);
  return (req: Request, res: Response, next: NextFunction): void => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
    res.setHeader('Permissions-Policy', 'camera=(self), geolocation=(self), payment=()');
    res.setHeader('Content-Security-Policy', cspHeader);
    if (isProduction || req.secure || req.header('x-forwarded-proto') === 'https') {
      res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
    }
    next();
  };
}
