// =============================================================================
// Stage 4 · Sprint 4.4 — Sliding-Window IP Rate Limiter Middleware (Q-06)
// - Bounds anonymous challenge/register/verify/checkout bursts per client IP
//   and returns HTTP 429 + Retry-After without extra dependencies.
// =============================================================================

import type { NextFunction, Request, Response } from 'express';

export interface SlidingWindowRateLimitOptions {
  windowMs: number;
  maxRequests: number;
  bucketLabel?: string;
  nowFn?: () => number;
  onRateLimited?: (clientKey: string, label: string) => void;
}

export function getClientIpKey(req: Request): string {
  const ip = typeof req.ip === 'string' && req.ip.trim() ? req.ip.trim() : undefined;
  const remote = req.socket?.remoteAddress?.trim();
  return ip || remote || 'unknown';
}

export function createSlidingWindowRateLimiter(options: SlidingWindowRateLimitOptions) {
  const hits = new Map<string, number[]>();
  const windowMs = Math.max(1_000, options.windowMs);
  const maxRequests = Math.max(1, options.maxRequests);
  const bucketLabel = options.bucketLabel ?? 'api';
  const nowFn = options.nowFn ?? Date.now;
  const maxTrackedClients = 5_000;

  return (req: Request, res: Response, next: NextFunction): void => {
    const now = nowFn();
    const clientKey = getClientIpKey(req);
    const cutoff = now - windowMs;

    const existing = hits.get(clientKey) ?? [];
    const active = existing.filter(ts => ts > cutoff);

    if (active.length >= maxRequests) {
      hits.set(clientKey, active);
      const oldest = active[0] ?? now;
      const retryAfterSec = Math.max(1, Math.ceil((oldest + windowMs - now) / 1000));
      res.setHeader('Retry-After', String(retryAfterSec));
      options.onRateLimited?.(clientKey, bucketLabel);
      res.status(429).json({
        error: `Too many requests to ${bucketLabel}; please retry after ${retryAfterSec}s.`,
      });
      return;
    }

    active.push(now);
    hits.set(clientKey, active);

    // Opportunistically bound map memory against distributed random-source floods
    if (hits.size > maxTrackedClients) {
      for (const [k, timestamps] of hits.entries()) {
        const fresh = timestamps.filter(ts => ts > cutoff);
        if (fresh.length === 0) {
          hits.delete(k);
        } else {
          hits.set(k, fresh);
        }
        if (hits.size <= maxTrackedClients) break;
      }
      if (hits.size > maxTrackedClients) {
        const oldestKey = hits.keys().next().value;
        if (typeof oldestKey === 'string') {
          hits.delete(oldestKey);
        }
      }
    }

    next();
  };
}
