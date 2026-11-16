// =============================================================================
// Infrastructure storage drivers:
// 1) IndexedDBAdapter: genuine client-side IndexedDB persistence + atomic setMany (REAL).
// 2) MemoryStorageAdapter: deterministic in-memory fallback for SSR / Vitest.
// 3) ResilientStorageAdapter (L-01): retries transient key failures, distinguishes
//    fatal DB blocks from partial quota/IO glitches without forking storage, and
//    surfaces `storageHealth: 'ok' | 'degraded' | 'memory_only'`.
// =============================================================================

import {
  StorageAdapter,
  StorageBackendKind,
  StorageEntry,
  StorageHealth,
  StorageHealthReport,
  StorageKey,
} from '../../domain/storage';

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
 * Passing an external Map allows Vitest suites to simulate full page reloads
 * with a fresh SalonRepository instance reading previously persisted keys.
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

  public set<T>(key: StorageKey, value: T): Promise<void> {
    this.store.set(key, structuredCloneSafe(value));
    return Promise.resolve();
  }

  /**
   * Atomic multi-key write with rollback so partial failures (e.g. FlakyAdapter in tests)
   * never leave half-written collections.
   */
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

  public async set<T>(key: StorageKey, value: T): Promise<void> {
    return this.setMany([[key, value]]);
  }

  /**
   * Single-transaction multi-key write: either ALL keys commit together or the transaction aborts cleanly (L-07/L-11).
   */
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
 * Resilient wrapper (L-01):
 * - Retries transient single-key failures with short backoff.
 * - Never swaps out a healthy primary database mid-session on a single-key glitch
 *   (preserving outbox and earlier collections).
 * - Holds an in-memory shadow buffer for keys whose writes temporarily failed.
 * - Permanently falls back to `memory_only` ONLY on fatal session-wide engine blocks
 *   (e.g. `SecurityError` in strict private mode or unavailable IndexedDB).
 */
export class ResilientStorageAdapter implements StorageAdapter {
  private readonly primary: StorageAdapter;
  private readonly shadow = new Map<string, unknown>();
  private readonly pendingRetryKeys = new Map<StorageKey, unknown>();
  private health: StorageHealth;
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
    this.health = primary.backend === 'memory' ? 'ok' : 'ok';
    this.retryDelayMs = options.retryDelayMs ?? 12;
    this.maxRetries = options.maxRetries ?? 2;
  }

  public get backend(): StorageBackendKind {
    if (this.fatalFallback) return 'memory';
    return this.primary.backend;
  }

  public getHealthReport(): StorageHealthReport {
    return {
      health: this.health,
      backend: this.backend,
      warnings: [...this.warnings],
      lastError: this.lastError,
    };
  }

  public recordWarning(message: string): void {
    if (!this.warnings.includes(message)) {
      this.warnings.push(message);
    }
  }

  private transitionToMemoryOnly(reason: string): void {
    this.fatalFallback = true;
    this.health = 'memory_only';
    this.lastError = reason;
    this.recordWarning(
      `IndexedDB недоступна (${reason}). Включён временный режим памяти до конца сеанса.`
    );
  }

  private markDegraded(key: StorageKey | 'batch', reason: string): void {
    if (this.fatalFallback) return;
    this.health = 'degraded';
    this.lastError = reason;
    this.recordWarning(
      `Частичный сбой записи/чтения (${key}): ${reason}. Изменения временно буферизованы в памяти.`
    );
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

  public async retryPendingWrites(): Promise<void> {
    await this.flushRetryBuffer();
  }

  private async flushRetryBuffer(): Promise<void> {
    if (this.fatalFallback || this.pendingRetryKeys.size === 0) return;
    for (const [key, val] of Array.from(this.pendingRetryKeys.entries())) {
      try {
        await this.primary.set(key, val);
        this.pendingRetryKeys.delete(key);
      } catch (err) {
        if (isFatalStorageError(err)) {
          this.transitionToMemoryOnly(err instanceof Error ? err.message : String(err));
          return;
        }
      }
    }
    if (this.pendingRetryKeys.size === 0 && this.health === 'degraded') {
      this.health = 'ok';
      this.lastError = undefined;
    }
  }

  public async get<T>(key: StorageKey): Promise<T | undefined> {
    if (this.pendingRetryKeys.has(key)) {
      return structuredCloneSafe(this.pendingRetryKeys.get(key)) as T;
    }
    if (this.fatalFallback) {
      return this.shadow.has(key) ? (structuredCloneSafe(this.shadow.get(key)) as T) : undefined;
    }

    try {
      const value = await this.runWithRetry(() => this.primary.get<T>(key));
      if (value !== undefined) {
        this.shadow.set(key, structuredCloneSafe(value));
      }
      return value;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (isFatalStorageError(err)) {
        console.warn(`[LocalFirst] Fatal read error on "${this.primary.backend}":`, err);
        this.transitionToMemoryOnly(msg);
      } else {
        console.warn(`[LocalFirst] Transient read error on key "${key}", preserving primary store:`, err);
        this.markDegraded(key, msg);
      }
      return this.shadow.has(key) ? (structuredCloneSafe(this.shadow.get(key)) as T) : undefined;
    }
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
      }
      if (this.pendingRetryKeys.size === 0 && this.health === 'degraded') {
        this.health = 'ok';
        this.lastError = undefined;
      }
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
    if (this.fatalFallback) return;
    try {
      await this.primary.remove(key);
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

/**
 * Selects IndexedDB in capable browsers and falls back cleanly to MemoryStorageAdapter
 * in Node / SSR / restricted incognito sandboxes.
 */
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

function structuredCloneSafe<T>(value: T): T {
  if (typeof structuredClone === 'function') {
    return structuredClone(value);
  }
  return JSON.parse(JSON.stringify(value)) as T;
}
