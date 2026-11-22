// =============================================================================
// Infrastructure storage drivers:
// 1) IndexedDBAdapter: genuine client-side IndexedDB persistence + atomic setMany (REAL).
// 2) MemoryStorageAdapter: deterministic in-memory fallback for SSR / Vitest.
// 3) ResilientStorageAdapter (L-01 / N-01): distinguishes "missing" vs "unreadable",
//    keeps health degraded until ALL unreadable keys & pending writes clear,
//    never masks unreadable keys by triggering seed writes.
// =============================================================================

import {
  StorageAdapter,
  StorageBackendKind,
  StorageEntry,
  StorageHealth,
  StorageHealthReport,
  StorageKey,
  StorageReadResult,
} from '../../domain/storage';
import { formatAppMessage } from '../../i18n/messages';

export const DEFAULT_DB_NAME = 'nailix_local_first_v1';
const DEFAULT_STORE_NAME = 'salon_kv';
const DEFAULT_DB_VERSION = 1;

function isFatalStorageError(err: unknown): boolean {
  const msg = err instanceof Error ? `${err.name} ${err.message}` : String(err);
  return /SecurityError|VersionError|IndexedDB is unavailable|IndexedDB disabled|private mode|blocked/i.test(
    msg
  );
}

async function delayMs(ms: number): Promise<void> {
  if (ms <= 0) return;
  await new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * In-memory StorageAdapter implementation backed by an optional shared Map.
 */
export class MemoryStorageAdapter implements StorageAdapter {
  public readonly backend: StorageBackendKind = 'memory';
  private store: Map<string, unknown>;

  constructor(backingMap: Map<string, unknown> = new Map()) {
    this.store = backingMap;
  }

  public get<T>(key: StorageKey): Promise<T | undefined> {
    if (!this.store.has(key)) return Promise.resolve(undefined);
    return Promise.resolve(structuredCloneSafe(this.store.get(key)) as T);
  }

  public async getDetailed<T>(key: StorageKey): Promise<StorageReadResult<T>> {
    if (!this.store.has(key)) return { status: 'missing' };
    const value = await this.get<T>(key);
    return value === undefined ? { status: 'missing' } : { status: 'ok', value };
  }

  public set<T>(key: StorageKey, value: T): Promise<void> {
    this.store.set(key, structuredCloneSafe(value));
    return Promise.resolve();
  }

  public async setMany(entries: ReadonlyArray<StorageEntry>): Promise<void> {
    const previous = new Map<StorageKey, { existed: boolean; value: unknown }>();
    for (const [key] of entries) {
      if (!previous.has(key)) {
        previous.set(key, {
          existed: this.store.has(key),
          value: this.store.has(key) ? structuredCloneSafe(this.store.get(key)) : undefined,
        });
      }
    }

    try {
      for (const [key, value] of entries) {
        await this.set(key, value);
      }
    } catch (err) {
      for (const [key, snap] of previous.entries()) {
        if (snap.existed) {
          this.store.set(key, snap.value);
        } else {
          this.store.delete(key);
        }
      }
      throw err;
    }
  }

  public remove(key: StorageKey): Promise<void> {
    this.store.delete(key);
    return Promise.resolve();
  }

  public keys(): Promise<string[]> {
    return Promise.resolve(Array.from(this.store.keys()));
  }

  public clear(): Promise<void> {
    this.store.clear();
    return Promise.resolve();
  }
}

/**
 * Native browser IndexedDB adapter with lazy connection pooling and single-transaction batch writes.
 */
export class IndexedDBAdapter implements StorageAdapter {
  public readonly backend: StorageBackendKind = 'indexeddb';
  private dbPromise: Promise<IDBDatabase> | null = null;
  private readonly dbName: string;
  private readonly storeName: string;

  constructor(dbName: string = DEFAULT_DB_NAME, storeName: string = DEFAULT_STORE_NAME) {
    this.dbName = dbName;
    this.storeName = storeName;
  }

  private openDatabase(): Promise<IDBDatabase> {
    if (this.dbPromise) return this.dbPromise;

    this.dbPromise = new Promise<IDBDatabase>((resolve, reject) => {
      if (typeof indexedDB === 'undefined') {
        reject(new Error('IndexedDB is unavailable in this environment'));
        return;
      }

      const request = indexedDB.open(this.dbName, DEFAULT_DB_VERSION);

      request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains(this.storeName)) {
          db.createObjectStore(this.storeName);
        }
      };

      request.onsuccess = () => {
        const db = request.result;
        db.onversionchange = () => {
          db.close();
          this.dbPromise = null;
        };
        resolve(db);
      };

      request.onerror = () => {
        this.dbPromise = null;
        reject(request.error || new Error('Failed to open IndexedDB database'));
      };
    });

    return this.dbPromise;
  }

  public async get<T>(key: StorageKey): Promise<T | undefined> {
    const db = await this.openDatabase();
    return new Promise<T | undefined>((resolve, reject) => {
      const tx = db.transaction(this.storeName, 'readonly');
      const store = tx.objectStore(this.storeName);
      const req = store.get(key);
      req.onsuccess = () => resolve(req.result as T | undefined);
      req.onerror = () => reject(req.error || new Error(`IndexedDB get failed for key "${key}"`));
    });
  }

  public async getDetailed<T>(key: StorageKey): Promise<StorageReadResult<T>> {
    const value = await this.get<T>(key);
    return value === undefined ? { status: 'missing' } : { status: 'ok', value };
  }

  public async set<T>(key: StorageKey, value: T): Promise<void> {
    return this.setMany([[key, value]]);
  }

  public async setMany(entries: ReadonlyArray<StorageEntry>): Promise<void> {
    if (entries.length === 0) return;
    const db = await this.openDatabase();
    return new Promise<void>((resolve, reject) => {
      const tx = db.transaction(this.storeName, 'readwrite');
      const store = tx.objectStore(this.storeName);
      for (const [key, value] of entries) {
        store.put(value, key);
      }
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error || new Error('IndexedDB batch transaction failed'));
      tx.onabort = () => reject(tx.error || new Error('IndexedDB batch transaction aborted'));
    });
  }

  public async remove(key: StorageKey): Promise<void> {
    const db = await this.openDatabase();
    return new Promise<void>((resolve, reject) => {
      const tx = db.transaction(this.storeName, 'readwrite');
      const store = tx.objectStore(this.storeName);
      store.delete(key);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error || new Error(`IndexedDB remove failed for key "${key}"`));
    });
  }

  public async keys(): Promise<string[]> {
    const db = await this.openDatabase();
    return new Promise<string[]>((resolve, reject) => {
      const tx = db.transaction(this.storeName, 'readonly');
      const store = tx.objectStore(this.storeName);
      const req = store.getAllKeys();
      req.onsuccess = () => resolve((req.result || []).map(String));
      req.onerror = () => reject(req.error || new Error('IndexedDB getAllKeys failed'));
    });
  }

  public async clear(): Promise<void> {
    const db = await this.openDatabase();
    return new Promise<void>((resolve, reject) => {
      const tx = db.transaction(this.storeName, 'readwrite');
      const store = tx.objectStore(this.storeName);
      store.clear();
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error || new Error('IndexedDB clear failed'));
    });
  }
}

/**
 * Resilient wrapper (L-01, N-01, N-06):
 * - Distinguishes `{ status: 'missing' }` vs `{ status: 'unreadable' }` so a transient
 *   read glitch NEVER triggers seed overwrite of user data on disk.
 * - Retries transient single-key failures with short backoff.
 * - Keeps `health: 'degraded'` until BOTH `pendingRetryKeys` AND `unreadableKeys` are clear.
 */
export class ResilientStorageAdapter implements StorageAdapter {
  private readonly primary: StorageAdapter;
  private readonly shadow = new Map<string, unknown>();
  private readonly pendingRetryKeys = new Map<StorageKey, unknown>();
  private readonly unreadableKeys = new Map<StorageKey, string>();
  private health: StorageHealth = 'ok';
  private fatalFallback = false;
  private warnings: string[] = [];
  private lastError?: string;
  private readonly retryDelayMs: number;
  private readonly maxRetries: number;

  constructor(
    primary: StorageAdapter,
    options: { retryDelayMs?: number; maxRetries?: number } = {}
  ) {
    this.primary = primary;
    this.retryDelayMs = options.retryDelayMs ?? 12;
    this.maxRetries = options.maxRetries ?? 2;
  }

  public get backend(): StorageBackendKind {
    if (this.fatalFallback) return 'memory';
    return this.primary.backend;
  }

  public getPendingWriteCount(): number {
    return this.pendingRetryKeys.size;
  }

  public getHealthReport(): StorageHealthReport {
    return {
      health: this.health,
      backend: this.backend,
      warnings: [...this.warnings],
      lastError: this.lastError,
      unreadableKeys: Array.from(this.unreadableKeys.keys()),
      pendingWriteKeys: Array.from(this.pendingRetryKeys.keys()),
    };
  }

  public recordWarning(message: string): void {
    if (!this.warnings.includes(message)) {
      this.warnings.push(message);
    }
  }

  private recomputeHealth(): void {
    if (this.fatalFallback) {
      this.health = 'memory_only';
      return;
    }
    if (this.pendingRetryKeys.size === 0 && this.unreadableKeys.size === 0) {
      this.health = 'ok';
      this.lastError = undefined;
    } else {
      this.health = 'degraded';
    }
  }

  private transitionToMemoryOnly(reason: string): void {
    this.fatalFallback = true;
    this.health = 'memory_only';
    this.lastError = reason;
    this.recordWarning(formatAppMessage('storage.idb_unavailable', { reason }));
  }

  private markDegraded(key: StorageKey | 'batch', reason: string): void {
    if (this.fatalFallback) return;
    this.health = 'degraded';
    this.lastError = reason;
    this.recordWarning(formatAppMessage('storage.rw_degraded', { key, reason }));
  }

  private async runWithRetry<T>(fn: () => Promise<T>): Promise<T> {
    let lastErr: unknown;
    for (let attempt = 0; attempt <= this.maxRetries; attempt++) {
      try {
        return await fn();
      } catch (err) {
        lastErr = err;
        if (isFatalStorageError(err)) {
          throw err;
        }
        if (attempt < this.maxRetries) {
          await delayMs(this.retryDelayMs * (attempt + 1));
        }
      }
    }
    throw lastErr;
  }

  public async retryPendingWrites(): Promise<boolean> {
    await this.flushRetryBuffer();
    return this.pendingRetryKeys.size === 0;
  }

  private async flushRetryBuffer(): Promise<void> {
    if (this.fatalFallback || this.pendingRetryKeys.size === 0) return;
    for (const [key, val] of Array.from(this.pendingRetryKeys.entries())) {
      try {
        await this.primary.set(key, val);
        this.pendingRetryKeys.delete(key);
        this.unreadableKeys.delete(key);
      } catch (err) {
        if (isFatalStorageError(err)) {
          this.transitionToMemoryOnly(err instanceof Error ? err.message : String(err));
          return;
        }
      }
    }
    this.recomputeHealth();
  }

  public async getDetailed<T>(key: StorageKey): Promise<StorageReadResult<T>> {
    if (this.pendingRetryKeys.has(key)) {
      return {
        status: 'ok',
        value: structuredCloneSafe(this.pendingRetryKeys.get(key)) as T,
      };
    }
    if (this.fatalFallback) {
      if (this.shadow.has(key)) {
        return { status: 'ok', value: structuredCloneSafe(this.shadow.get(key)) as T };
      }
      return { status: 'missing' };
    }

    try {
      const value = await this.runWithRetry(() => this.primary.get<T>(key));
      this.unreadableKeys.delete(key);
      this.recomputeHealth();
      if (value === undefined) {
        return { status: 'missing' };
      }
      this.shadow.set(key, structuredCloneSafe(value));
      return { status: 'ok', value };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (isFatalStorageError(err)) {
        console.warn(`[LocalFirst] Fatal read error on "${this.primary.backend}":`, err);
        this.transitionToMemoryOnly(msg);
        if (this.shadow.has(key)) {
          return { status: 'ok', value: structuredCloneSafe(this.shadow.get(key)) as T };
        }
        return { status: 'missing' };
      }

      console.warn(`[LocalFirst] Transient read error on key "${key}", preserving primary store:`, err);
      this.unreadableKeys.set(key, msg);
      this.markDegraded(key, msg);
      if (this.shadow.has(key)) {
        return { status: 'ok', value: structuredCloneSafe(this.shadow.get(key)) as T };
      }
      return { status: 'unreadable', error: msg };
    }
  }

  public async get<T>(key: StorageKey): Promise<T | undefined> {
    const res = await this.getDetailed<T>(key);
    return res.status === 'ok' ? res.value : undefined;
  }

  public async set<T>(key: StorageKey, value: T): Promise<void> {
    await this.setMany([[key, value]]);
  }

  public async setMany(entries: ReadonlyArray<StorageEntry>): Promise<void> {
    if (entries.length === 0) return;
    for (const [key, value] of entries) {
      this.shadow.set(key, structuredCloneSafe(value));
    }

    if (this.fatalFallback) {
      return;
    }

    await this.flushRetryBuffer();

    try {
      await this.runWithRetry(async () => {
        if (typeof this.primary.setMany === 'function') {
          await this.primary.setMany(entries);
        } else {
          for (const [key, value] of entries) {
            await this.primary.set(key, value);
          }
        }
      });
      for (const [key] of entries) {
        this.pendingRetryKeys.delete(key);
        this.unreadableKeys.delete(key);
      }
      this.recomputeHealth();
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (isFatalStorageError(err)) {
        console.warn(`[LocalFirst] Fatal write error on "${this.primary.backend}":`, err);
        this.transitionToMemoryOnly(msg);
        return;
      }
      console.warn(`[LocalFirst] Transient write error (keeping primary intact):`, err);
      this.markDegraded(entries.length === 1 ? entries[0][0] : 'batch', msg);
      for (const [key, value] of entries) {
        this.pendingRetryKeys.set(key, structuredCloneSafe(value));
      }
    }
  }

  public async remove(key: StorageKey): Promise<void> {
    this.shadow.delete(key);
    this.pendingRetryKeys.delete(key);
    this.unreadableKeys.delete(key);
    if (this.fatalFallback) {
      this.recomputeHealth();
      return;
    }
    try {
      await this.primary.remove(key);
      this.recomputeHealth();
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (isFatalStorageError(err)) {
        this.transitionToMemoryOnly(msg);
      } else {
        this.markDegraded(key, msg);
      }
    }
  }

  public async keys(): Promise<string[]> {
    if (this.fatalFallback) {
      return Array.from(this.shadow.keys());
    }
    try {
      const primaryKeys = await this.primary.keys();
      const merged = new Set([...primaryKeys, ...this.pendingRetryKeys.keys()]);
      return Array.from(merged);
    } catch {
      return Array.from(this.shadow.keys());
    }
  }

  public async clear(): Promise<void> {
    this.shadow.clear();
    this.pendingRetryKeys.clear();
    this.unreadableKeys.clear();
    if (!this.fatalFallback) {
      try {
        await this.primary.clear();
      } catch (err) {
        if (isFatalStorageError(err)) {
          this.transitionToMemoryOnly(err instanceof Error ? err.message : String(err));
        }
      }
    }
    this.warnings = [];
    this.lastError = undefined;
    if (!this.fatalFallback) {
      this.health = 'ok';
    }
  }
}

let activeStorageStatus: { backend: StorageBackendKind; health: StorageHealth } = {
  backend: typeof indexedDB !== 'undefined' ? 'indexeddb' : 'memory',
  health: 'ok',
};

export function setActiveStorageStatus(status: {
  backend: StorageBackendKind;
  health: StorageHealth;
}): void {
  activeStorageStatus = status;
}

export function getActiveStorageStatus(): {
  backend: StorageBackendKind;
  health: StorageHealth;
} {
  return activeStorageStatus;
}

export function createDefaultStorageAdapter(): StorageAdapter {
  if (typeof indexedDB !== 'undefined') {
    return new IndexedDBAdapter();
  }
  return new MemoryStorageAdapter();
}

export async function emergencyDeleteLocalDatabase(
  dbName: string = DEFAULT_DB_NAME
): Promise<void> {
  if (typeof indexedDB === 'undefined') return;
  await new Promise<void>((resolve) => {
    const req = indexedDB.deleteDatabase(dbName);
    req.onsuccess = () => resolve();
    req.onerror = () => resolve();
    req.onblocked = () => resolve();
  });
}

/**
 * Exports all quarantined raw storage entries (if any) from default IndexedDB for user recovery (N-03).
 */
export async function exportQuarantinedEntriesFromDefaultDb(): Promise<Record<string, unknown> | null> {
  if (typeof indexedDB === 'undefined') return null;
  try {
    const adapter = new IndexedDBAdapter();
    const allKeys = await adapter.keys();
    const qKeys = allKeys.filter(k => k.startsWith('quarantine:'));
    if (qKeys.length === 0) return null;
    const dump: Record<string, unknown> = {};
    for (const qk of qKeys) {
      dump[qk] = await adapter.get(qk as StorageKey);
    }
    return dump;
  } catch {
    return null;
  }
}

function structuredCloneSafe<T>(value: T): T {
  if (typeof structuredClone === 'function') {
    return structuredClone(value);
  }
  return JSON.parse(JSON.stringify(value)) as T;
}
