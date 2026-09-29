import sqlite3InitModule from '@sqlite.org/sqlite-wasm';
import { createDatabaseService } from './sqlite_database_service.js';
import { createBrowserStorage } from './database_storage.js';

let servicePromise;
let queue = Promise.resolve();

async function service() {
  if (!servicePromise) servicePromise = (async () => {
    const sqlite = await sqlite3InitModule({
      locateFile: (path) => new URL(path, import.meta.url).href,
    });
    const storage = createBrowserStorage({ sqlite, indexedDB, navigator });
    return createDatabaseService({ sqlite, openPersistent: storage.open });
  })();
  return servicePromise;
}

self.addEventListener('message', (event) => {
  const request = event.data;
  if (!request || !Number.isSafeInteger(request.id) || request.id <= 0) return;
  queue = queue.then(async () => {
    try {
      const result = await (await service()).execute(request);
      self.postMessage({ id: request.id, ...result });
    } catch {
      self.postMessage({ id: request.id, status: 10, rows: 0, values: [] });
    }
  });
});
