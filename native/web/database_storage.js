import { exportDatabase, openSnapshotDatabase } from './sqlite_database_service.js';

function storageFailure(error) {
  const name = error?.name;
  if (name === 'QuotaExceededError') return 11;
  if (name === 'NoModificationAllowedError' || name === 'InvalidModificationError') return 8;
  if ([11, 26].includes(error?.resultCode & 255)) return 13;
  return 10;
}

function unsupportedOpfs(error) { return error?.name === 'NotSupportedError'; }

function openIndexedDb(indexedDB) {
  return new Promise((resolve, reject) => {
    let request;
    try { request = indexedDB.open('bornengine-sqlite-v1', 1); }
    catch (error) { reject(error); return; }
    request.onupgradeneeded = () => request.result.createObjectStore('databases');
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
    request.onblocked = () => reject(Object.assign(Error('database blocked'), { status: 8 }));
  });
}

function readSnapshot(database, key) {
  return new Promise((resolve, reject) => {
    let request;
    try { request = database.transaction('databases', 'readonly').objectStore('databases').get(key); }
    catch (error) { reject(error); return; }
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function commitSnapshot(database, key, bytes) {
  return new Promise((resolve, reject) => {
    let transaction;
    try {
      transaction = database.transaction('databases', 'readwrite');
      transaction.objectStore('databases').put(bytes, key);
    } catch (error) { reject(error); return; }
    transaction.oncomplete = () => resolve();
    transaction.onabort = () => reject(transaction.error || Error('snapshot aborted'));
    transaction.onerror = () => reject(transaction.error || Error('snapshot failed'));
  });
}

async function writerLock(locks, key) {
  if (!locks?.request) throw Object.assign(Error('Web Locks unavailable'), { status: 10 });
  let acquired;
  const entered = new Promise((resolve) => { acquired = resolve; });
  let release;
  const request = locks.request(`bornengine-sqlite:${key}`, { mode: 'exclusive', ifAvailable: true }, (lock) => {
    if (!lock) { acquired(false); return; }
    return new Promise((resolve) => { release = resolve; acquired(true); });
  }).catch((error) => { acquired(false); throw error; });
  if (!await entered) {
    await request;
    throw Object.assign(Error('writer already open'), { status: 8 });
  }
  return () => release?.();
}

async function poolName(key, crypto) {
  if (!crypto?.subtle) throw Object.assign(Error('digest unavailable'), { status: 10 });
  const bytes = new TextEncoder().encode(key);
  const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', bytes));
  return 'bornengine-' + Array.from(digest, (byte) => byte.toString(16).padStart(2, '0')).join('');
}

/** One worker owns SQLite connections. Web Locks enforce an origin-wide writer. */
export function createBrowserStorage({ sqlite, indexedDB, navigator, crypto = globalThis.crypto, opfsSupported } = {}) {
  const pools = new Map();
  const supportsOpfs = opfsSupported ?? !!(navigator?.storage?.getDirectory &&
    globalThis.FileSystemFileHandle?.prototype?.createSyncAccessHandle && sqlite?.installOpfsSAHPoolVfs);
  async function open(key) {
    const unlock = await writerLock(navigator?.locks, key);
    try {
      if (supportsOpfs) {
        const name = await poolName(key, crypto);
        let pool = pools.get(name);
        try {
          if (!pool) {
            pool = await sqlite.installOpfsSAHPoolVfs({ name, initialCapacity: 8 });
            pools.set(name, pool);
          } else if (pool.isPaused?.()) await pool.unpauseVfs();
          const filename = '/main.sqlite3';
          const db = new pool.OpfsSAHPoolDb(filename);
          return {
            db,
            close: () => { try { pool.pauseVfs(); } finally { unlock(); } },
            import: async (bytes) => pool.importDb(filename, bytes),
            reopen: async () => new pool.OpfsSAHPoolDb(filename),
          };
        } catch (error) {
          try { pool?.pauseVfs?.(); } catch { /* preserve the original failure */ }
          if (!unsupportedOpfs(error)) throw error;
        }
      }
      if (!indexedDB) throw Object.assign(Error('IndexedDB unavailable'), { status: 10 });
      const database = await openIndexedDb(indexedDB);
      let bytes;
      try { bytes = await readSnapshot(database, key); }
      catch (error) { database.close(); throw error; }
      const db = openSnapshotDatabase(sqlite, bytes);
      return {
        db,
        persist: async (connection) => commitSnapshot(database, key, exportDatabase(sqlite, connection)),
        close: () => { database.close(); unlock(); },
      };
    } catch (error) {
      unlock();
      throw Object.assign(Error(error?.message || 'storage unavailable'), {
        status: error?.status ?? storageFailure(error),
      });
    }
  }
  return { open };
}
