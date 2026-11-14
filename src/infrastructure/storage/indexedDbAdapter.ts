// =============================================================================
// Infrastructure storage drivers:
// 1) IndexedDBAdapter: genuine client-side IndexedDB persistence (REAL).
// 2) MemoryStorageAdapter: deterministic in-memory fallback for SSR / Vitest /
//    restricted private contexts where window.indexedDB is unavailable.
// =============================================================================

import { StorageAdapter, StorageBackendKind, StorageKey } from '../../domain/storage';

const DEFAULT_DB_NAME = 'nailix_local_first_v1';
const DEFAULT_STORE_NAME = 'salon_kv';
const DEFAULT_DB_VERSION = 1;

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

  public async get<T>(key: StorageKey): Promise<T | undefined> {
    if (!this.store.has(key)) return undefined;
    return structuredCloneSafe(this.store.get(key)) as T;
  }

  public async set<T>(key: StorageKey, value: T): Promise<void> {
    this.store.set(key, structuredCloneSafe(value));
  }

  public async remove(key: StorageKey): Promise<void> {
    this.store.delete(key);
  }

  public async keys(): Promise<string[]> {
    return Array.from(this.store.keys());
  }

  public async clear(): Promise<void> {
    this.store.clear();
  }
}

/**
 * Native browser IndexedDB adapter with lazy connection pooling and transaction safety.
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
    const db = await this.openDatabase();
    return new Promise<void>((resolve, reject) => {
      const tx = db.transaction(this.storeName, 'readwrite');
      const store = tx.objectStore(this.storeName);
      store.put(value, key);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error || new Error(`IndexedDB set failed for key "${key}"`));
      tx.onabort = () => reject(tx.error || new Error(`IndexedDB set aborted for key "${key}"`));
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
 * Selects IndexedDB in capable browsers and falls back cleanly to MemoryStorageAdapter
 * in Node / SSR / restricted incognito sandboxes.
 */
export function createDefaultStorageAdapter(): StorageAdapter {
  if (typeof indexedDB !== 'undefined') {
    return new IndexedDBAdapter();
  }
  return new MemoryStorageAdapter();
}

function structuredCloneSafe<T>(value: T): T {
  if (typeof structuredClone === 'function') {
    return structuredClone(value);
  }
  return JSON.parse(JSON.stringify(value)) as T;
}
