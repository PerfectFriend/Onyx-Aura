// =============================================================================
// Stage 3 / Sprint 3.2 Content Security Policy Builder (L-08)
// - Production build: strict `script-src 'self'` (ZERO `'unsafe-inline'`),
//   self-hosted fonts (`font-src 'self' data:`), explicit image origin allowlist
//   without wildcard `https:` or `ws:`/`wss:` on `connect-src`.
// - Development preview: allows Vite React Refresh preamble & HMR WebSockets
//   while remaining completely isolated from built production `dist/index.html`.
// =============================================================================

export function buildContentSecurityPolicy(mode: 'development' | 'production'): string {
  if (mode === 'development') {
    return [
      "default-src 'self'",
      "script-src 'self' 'unsafe-inline'",
      "style-src 'self' 'unsafe-inline'",
      "font-src 'self' data:",
      "img-src 'self' data: blob: https://api.qrserver.com",
      "connect-src 'self' ws: wss:",
      "object-src 'none'",
      "base-uri 'self'",
      "form-action 'self'",
    ].join('; ') + ';';
  }

  return [
    "default-src 'self'",
    "script-src 'self'",
    "style-src 'self' 'unsafe-inline'",
    "font-src 'self' data:",
    "img-src 'self' data: blob: https://api.qrserver.com",
    "connect-src 'self'",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
  ].join('; ') + ';';
}
