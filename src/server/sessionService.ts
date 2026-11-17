// =============================================================================
// Stage 4 · Sprint 4.2 — HMAC-Signed HttpOnly Server Session Service
// - Issues opaque HMAC-SHA256 signed cookies (`nailix_sid`) backed by ServerStateStore.
// - Never trusts client-claimed roles; authoritative role comes strictly from stored session.
// =============================================================================

import { createHmac, randomBytes, randomUUID, timingSafeEqual } from 'node:crypto';
import type { Request, Response } from 'express';
import { DEFAULT_SESSION_TTL_MS } from '../domain/identity';
import { UserRole } from '../types';
import { ServerSessionRecord, ServerStateStore } from './serverStore';

export const SESSION_COOKIE_NAME = 'nailix_sid';

export class ServerSessionService {
  private readonly store: ServerStateStore;
  private readonly hmacSecret: Buffer;
  private readonly ttlMs: number;
  private readonly persistentSecretConfigured: boolean;

  constructor(options: {
    store: ServerStateStore;
    secret?: string;
    ttlMs?: number;
  }) {
    this.store = options.store;
    const rawSecret = options.secret || process.env.NAILIX_SESSION_SECRET;
    this.persistentSecretConfigured = Boolean(rawSecret && rawSecret.length >= 16);
    this.hmacSecret = this.persistentSecretConfigured && rawSecret
      ? Buffer.from(rawSecret, 'utf8')
      : randomBytes(32);
    this.ttlMs = options.ttlMs ?? DEFAULT_SESSION_TTL_MS;
  }

  public hasPersistentSecretConfigured(): boolean {
    return this.persistentSecretConfigured;
  }

  private signSessionId(sessionId: string): string {
    return createHmac('sha256', this.hmacSecret)
      .update(sessionId)
      .digest('base64')
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/g, '');
  }

  public formatToken(sessionId: string): string {
    return `${sessionId}.${this.signSessionId(sessionId)}`;
  }

  public verifyTokenSignature(token: string): string | null {
    const dotIndex = token.indexOf('.');
    if (dotIndex <= 0) return null;
    const sessionId = token.slice(0, dotIndex);
    const providedSig = token.slice(dotIndex + 1);
    if (!sessionId || !providedSig) return null;

    const expectedSig = this.signSessionId(sessionId);
    const a = Buffer.from(providedSig, 'utf8');
    const b = Buffer.from(expectedSig, 'utf8');
    if (a.length !== b.length) return null;
    return timingSafeEqual(a, b) ? sessionId : null;
  }

  public extractCookieToken(cookieHeader: string | undefined): string | null {
    if (!cookieHeader) return null;
    const parts = cookieHeader.split(';');
    for (const part of parts) {
      const idx = part.indexOf('=');
      if (idx === -1) continue;
      const name = part.slice(0, idx).trim();
      if (name === SESSION_COOKIE_NAME) {
        return decodeURIComponent(part.slice(idx + 1).trim());
      }
    }
    return null;
  }

  private shouldUseSecureCookie(req: Request): boolean {
    const proto = req.header('x-forwarded-proto');
    return req.secure || proto === 'https' || process.env.NODE_ENV === 'production';
  }

  private buildCookieFlags(req: Request, maxAgeSeconds: number): string {
    const flags = [
      `Path=/`,
      `HttpOnly`,
      `SameSite=Lax`,
      `Max-Age=${maxAgeSeconds}`,
    ];
    if (this.shouldUseSecureCookie(req)) {
      flags.push('Secure');
    }
    return flags.join('; ');
  }

  public async createAndSetSession(
    req: Request,
    res: Response,
    params: {
      credentialId: string;
      displayName: string;
      role: UserRole;
      verificationLevel: 'server_spki_verified' | 'presence_only';
    }
  ): Promise<ServerSessionRecord> {
    const nowMs = Date.now();
    const session: ServerSessionRecord = {
      sessionId: `sid-${randomUUID()}`,
      credentialId: params.credentialId,
      displayName: params.displayName,
      role: params.role,
      verificationLevel: params.verificationLevel,
      createdAt: new Date(nowMs).toISOString(),
      expiresAt: new Date(nowMs + this.ttlMs).toISOString(),
    };

    await this.store.saveSession(session);
    const token = this.formatToken(session.sessionId);
    const maxAgeSeconds = Math.max(60, Math.floor(this.ttlMs / 1000));
    res.setHeader(
      'Set-Cookie',
      `${SESSION_COOKIE_NAME}=${encodeURIComponent(token)}; ${this.buildCookieFlags(req, maxAgeSeconds)}`
    );
    return session;
  }

  public async getActiveSessionFromRequest(req: Request): Promise<ServerSessionRecord | null> {
    const token = this.extractCookieToken(req.header('cookie'));
    if (!token) return null;
    const sessionId = this.verifyTokenSignature(token);
    if (!sessionId) return null;
    const record = await this.store.getSession(sessionId);
    return record ?? null;
  }

  public async revokeSessionFromRequest(req: Request, res: Response): Promise<void> {
    const token = this.extractCookieToken(req.header('cookie'));
    const sessionId = token ? this.verifyTokenSignature(token) : null;
    if (sessionId) {
      await this.store.deleteSession(sessionId);
    }
    res.setHeader(
      'Set-Cookie',
      `${SESSION_COOKIE_NAME}=; ${this.buildCookieFlags(req, 0)}`
    );
  }
}
