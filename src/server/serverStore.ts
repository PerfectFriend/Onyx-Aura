// =============================================================================
// Stage 4 · Sprint 4.2 — Persistent Server State Store (.data/nailix-server.json)
// - Stores registered WebAuthn public keys (SPKI only, zero private keys),
//   server sessions for HttpOnly cookies, deposit intents, and processed
//   Stripe webhook event IDs for idempotency.
// - Serializes writes atomically via temp file + rename to prevent torn JSON.
// =============================================================================

import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { DepositIntent } from '../domain/payments';
import { UserRole } from '../types';

export interface ServerPasskeyRecord {
  id: string;
  rawIdBase64Url: string;
  publicKeySpkiBase64Url: string;
  algorithm: number;
  displayName: string;
  role: UserRole;
  rpId: string;
  signCount: number;
  createdAt: string;
  lastUsedAt: string;
}

export interface ServerSessionRecord {
  sessionId: string;
  credentialId: string;
  displayName: string;
  role: UserRole;
  verificationLevel: 'server_spki_verified' | 'presence_only';
  createdAt: string;
  expiresAt: string;
}

export interface PersistedServerSnapshot {
  version: 1;
  passkeys: Record<string, ServerPasskeyRecord>;
  sessions: Record<string, ServerSessionRecord>;
  depositIntents: Record<string, DepositIntent>;
  processedWebhookEvents: string[];
}

function emptySnapshot(): PersistedServerSnapshot {
  return {
    version: 1,
    passkeys: {},
    sessions: {},
    depositIntents: {},
    processedWebhookEvents: [],
  };
}

const FORBIDDEN_RECORD_KEYS = new Set(['__proto__', 'constructor', 'prototype']);

function assertSafeRecordId(id: string, kind: string): void {
  if (!id || FORBIDDEN_RECORD_KEYS.has(id)) {
    throw new Error(`Invalid ${kind} identifier.`);
  }
}

function assertPublicOnlyPasskey(record: ServerPasskeyRecord): void {
  assertSafeRecordId(record.id, 'passkey');
  const forbidden = record as unknown as Record<string, unknown>;
  for (const key of ['privateKey', 'secretKey', 'seedPhrase', 'mnemonic', 'password']) {
    if (key in forbidden && forbidden[key] !== undefined) {
      throw new Error(`Refusing to persist disallowed secret field "${key}" in server passkey store.`);
    }
  }
}

export interface ServerStateStore {
  getPasskey(credentialId: string): Promise<ServerPasskeyRecord | undefined>;
  listPasskeysByRole(role?: UserRole): Promise<ServerPasskeyRecord[]>;
  upsertPasskey(record: ServerPasskeyRecord): Promise<void>;
  getSession(sessionId: string): Promise<ServerSessionRecord | undefined>;
  saveSession(session: ServerSessionRecord): Promise<void>;
  deleteSession(sessionId: string): Promise<void>;
  getDepositIntent(intentId: string): Promise<DepositIntent | undefined>;
  getDepositIntentByBookingRef(bookingReferenceId: string): Promise<DepositIntent | undefined>;
  saveDepositIntent(intent: DepositIntent): Promise<void>;
  hasProcessedWebhookEvent(eventId: string): Promise<boolean>;
  markWebhookEventProcessed(eventId: string): Promise<void>;
}

const MAX_WEBHOOK_EVENT_HISTORY = 500;
const MAX_PASSKEYS_STORE = 1000;
const MAX_SESSIONS_STORE = 2000;
const MAX_DEPOSIT_INTENTS = 500;

export class InMemoryServerStateStore implements ServerStateStore {
  protected snapshot: PersistedServerSnapshot = emptySnapshot();

  public async getPasskey(credentialId: string): Promise<ServerPasskeyRecord | undefined> {
    if (!credentialId || FORBIDDEN_RECORD_KEYS.has(credentialId)) return undefined;
    await this.ensureLoaded();
    return Object.prototype.hasOwnProperty.call(this.snapshot.passkeys, credentialId)
      ? this.snapshot.passkeys[credentialId]
      : undefined;
  }

  public async listPasskeysByRole(role?: UserRole): Promise<ServerPasskeyRecord[]> {
    await this.ensureLoaded();
    const all = Object.values(this.snapshot.passkeys);
    return role ? all.filter(pk => pk.role === role) : all;
  }

  public async upsertPasskey(record: ServerPasskeyRecord): Promise<void> {
    assertPublicOnlyPasskey(record);
    await this.mutate(state => {
      const exists = Object.prototype.hasOwnProperty.call(state.passkeys, record.id);
      if (!exists && Object.keys(state.passkeys).length >= MAX_PASSKEYS_STORE) {
        throw new Error('Server passkey registry capacity limit reached.');
      }
      state.passkeys[record.id] = { ...record };
    });
  }

  public async getSession(sessionId: string): Promise<ServerSessionRecord | undefined> {
    if (!sessionId || FORBIDDEN_RECORD_KEYS.has(sessionId)) return undefined;
    await this.ensureLoaded();
    if (!Object.prototype.hasOwnProperty.call(this.snapshot.sessions, sessionId)) {
      return undefined;
    }
    const rec = this.snapshot.sessions[sessionId];
    const expiresMs = Date.parse(rec.expiresAt);
    if (!Number.isFinite(expiresMs) || Date.now() >= expiresMs) {
      await this.deleteSession(sessionId);
      return undefined;
    }
    return rec;
  }

  public async saveSession(session: ServerSessionRecord): Promise<void> {
    assertSafeRecordId(session.sessionId, 'session');
    const expiresMs = Date.parse(session.expiresAt);
    if (!Number.isFinite(expiresMs)) {
      throw new Error('Refusing to persist session with invalid expiresAt timestamp.');
    }
    await this.mutate(state => {
      // Opportunistically purge expired sessions
      const now = Date.now();
      for (const [sid, existing] of Object.entries(state.sessions)) {
        const exp = Date.parse(existing.expiresAt);
        if (!Number.isFinite(exp) || now >= exp) {
          delete state.sessions[sid];
        }
      }
      const sessionIds = Object.keys(state.sessions);
      if (sessionIds.length >= MAX_SESSIONS_STORE) {
        const oldest = sessionIds[0];
        if (oldest) delete state.sessions[oldest];
      }
      state.sessions[session.sessionId] = { ...session };
    });
  }

  public async deleteSession(sessionId: string): Promise<void> {
    if (!sessionId || FORBIDDEN_RECORD_KEYS.has(sessionId)) return;
    await this.mutate(state => {
      delete state.sessions[sessionId];
    });
  }

  public async getDepositIntent(intentId: string): Promise<DepositIntent | undefined> {
    if (!intentId || FORBIDDEN_RECORD_KEYS.has(intentId)) return undefined;
    await this.ensureLoaded();
    return Object.prototype.hasOwnProperty.call(this.snapshot.depositIntents, intentId)
      ? this.snapshot.depositIntents[intentId]
      : undefined;
  }

  public async getDepositIntentByBookingRef(
    bookingReferenceId: string
  ): Promise<DepositIntent | undefined> {
    if (!bookingReferenceId) return undefined;
    await this.ensureLoaded();
    const candidates = Object.values(this.snapshot.depositIntents).filter(
      item => item.bookingReferenceId === bookingReferenceId
    );
    return candidates[candidates.length - 1];
  }

  public async saveDepositIntent(intent: DepositIntent): Promise<void> {
    assertSafeRecordId(intent.id, 'deposit intent');
    await this.mutate(state => {
      const now = Date.now();
      const entries = Object.entries(state.depositIntents);
      if (entries.length >= MAX_DEPOSIT_INTENTS) {
        // First prune expired requires_action or finished intents
        for (const [id, existing] of entries) {
          const exp = Date.parse(existing.expiresAt);
          const isExpiredUnpaid =
            existing.status === 'requires_action' && Number.isFinite(exp) && now >= exp;
          const isFinished =
            existing.status === 'canceled' ||
            existing.status === 'failed' ||
            existing.status === 'released';
          if (isExpiredUnpaid || isFinished) {
            delete state.depositIntents[id];
          }
          if (Object.keys(state.depositIntents).length < MAX_DEPOSIT_INTENTS) break;
        }
        // If still over cap, evict oldest entries
        const remainingKeys = Object.keys(state.depositIntents);
        while (remainingKeys.length >= MAX_DEPOSIT_INTENTS) {
          const drop = remainingKeys.shift();
          if (drop) delete state.depositIntents[drop];
        }
      }
      state.depositIntents[intent.id] = { ...intent };
    });
  }

  public async hasProcessedWebhookEvent(eventId: string): Promise<boolean> {
    await this.ensureLoaded();
    return this.snapshot.processedWebhookEvents.includes(eventId);
  }

  public async markWebhookEventProcessed(eventId: string): Promise<void> {
    await this.mutate(state => {
      if (!state.processedWebhookEvents.includes(eventId)) {
        state.processedWebhookEvents.push(eventId);
        if (state.processedWebhookEvents.length > MAX_WEBHOOK_EVENT_HISTORY) {
          state.processedWebhookEvents = state.processedWebhookEvents.slice(-MAX_WEBHOOK_EVENT_HISTORY);
        }
      }
    });
  }

  protected async ensureLoaded(): Promise<void> {
    // Base in-memory implementation needs no disk initialization
  }

  protected async mutate(fn: (state: PersistedServerSnapshot) => void): Promise<void> {
    await this.ensureLoaded();
    fn(this.snapshot);
  }
}

export class FileServerStateStore extends InMemoryServerStateStore {
  private readonly filePath: string;
  private loaded = false;
  private writeQueue: Promise<void> = Promise.resolve();

  constructor(filePath: string = path.resolve(process.cwd(), '.data', 'nailix-server.json')) {
    super();
    this.filePath = filePath;
  }

  protected override async ensureLoaded(): Promise<void> {
    if (this.loaded) return;
    try {
      const raw = await readFile(this.filePath, 'utf8');
      const parsed = JSON.parse(raw) as Partial<PersistedServerSnapshot>;
      this.snapshot = {
        version: 1,
        passkeys: parsed.passkeys && typeof parsed.passkeys === 'object' ? parsed.passkeys : {},
        sessions: parsed.sessions && typeof parsed.sessions === 'object' ? parsed.sessions : {},
        depositIntents:
          parsed.depositIntents && typeof parsed.depositIntents === 'object'
            ? parsed.depositIntents
            : {},
        processedWebhookEvents: Array.isArray(parsed.processedWebhookEvents)
          ? parsed.processedWebhookEvents.filter((id): id is string => typeof id === 'string')
          : [],
      };
    } catch {
      this.snapshot = emptySnapshot();
    }
    this.loaded = true;
  }

  protected override async mutate(fn: (state: PersistedServerSnapshot) => void): Promise<void> {
    const task = this.writeQueue.then(async () => {
      await this.ensureLoaded();
      fn(this.snapshot);
      const dir = path.dirname(this.filePath);
      await mkdir(dir, { recursive: true });
      const tmpPath = `${this.filePath}.tmp`;
      await writeFile(tmpPath, JSON.stringify(this.snapshot, null, 2), 'utf8');
      await rename(tmpPath, this.filePath);
    });
    this.writeQueue = task.catch(() => undefined);
    await task;
  }
}
