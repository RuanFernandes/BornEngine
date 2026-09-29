import test from 'node:test';
import assert from 'node:assert/strict';
import { createDatabaseBridge } from '../database_bridge.js';
import sqlite3InitModule from '@sqlite.org/sqlite-wasm';
import { createDatabaseService, openSnapshotDatabase, exportDatabase } from '../sqlite_database_service.js';
import { indexedDB as fakeIndexedDB } from 'fake-indexeddb';
import { createBrowserStorage } from '../database_storage.js';
import { build } from 'esbuild';

class ControlledWorker {
  messages = [];
  listeners = { message: [], error: [], messageerror: [] };
  addEventListener(kind, callback) { this.listeners[kind].push(callback); }
  removeEventListener(kind, callback) {
    this.listeners[kind] = this.listeners[kind].filter((entry) => entry !== callback);
  }
  postMessage(message) { this.messages.push(message); }
  emit(kind, data) {
    for (const callback of this.listeners[kind]) callback(kind === 'message' ? { data } : { message: 'worker failed' });
  }
  terminate() { this.terminated = true; }
}

function harness() {
  const worker = new ControlledWorker();
  return { worker, bridge: createDatabaseBridge({ createWorker: () => worker }) };
}

function push(bridge, value) {
  if (value === null) { bridge.bloom_database_scratch_push_f64(0); return; }
  if (typeof value === 'number') {
    bridge.bloom_database_scratch_push_f64(1);
    bridge.bloom_database_scratch_push_f64(value);
    return;
  }
  if (typeof value === 'string') {
    bridge.bloom_database_scratch_push_f64(2);
    bridge.bloom_database_scratch_push_string(value);
    return;
  }
  if (typeof value === 'boolean') { bridge.bloom_database_scratch_push_f64(value ? 4 : 3); return; }
  if (value instanceof Uint8Array) {
    bridge.bloom_database_scratch_push_f64(5);
    bridge.bloom_database_scratch_push_f64(value.length);
    for (const byte of value) bridge.bloom_database_scratch_push_byte(byte);
    return;
  }
  if (Array.isArray(value)) {
    bridge.bloom_database_scratch_push_f64(6);
    bridge.bloom_database_scratch_push_f64(value.length);
    for (const item of value) push(bridge, item);
    return;
  }
  bridge.bloom_database_scratch_push_f64(7);
  bridge.bloom_database_scratch_push_f64(Object.keys(value).length);
  for (const [key, item] of Object.entries(value)) {
    bridge.bloom_database_scratch_push_string(key);
    push(bridge, item);
  }
}

function submit(bridge, op, handle, args) {
  bridge.bloom_database_scratch_reset();
  for (const arg of args) push(bridge, arg);
  return bridge.bloom_database_submit(op, handle, args.length);
}

test('requests keep distinct tickets and results despite out-of-order worker replies', () => {
  const { worker, bridge } = harness();
  const one = submit(bridge, 1, 0, ['app', 'one', false, { saves: { columns: { id: { kind: 'integer', options: { primaryKey: true } } } } }]);
  const two = submit(bridge, 1, 0, ['app', 'two', false, { saves: { columns: { id: { kind: 'integer', options: { primaryKey: true } } } } }]);
  assert.deepEqual(worker.messages.map((message) => message.args[1]), ['one', 'two']);
  assert.equal(bridge.bloom_database_poll(one), 0);
  worker.emit('message', { id: two, status: 0, rows: 0, values: [22, 0] });
  assert.equal(bridge.bloom_database_poll(two), 1);
  assert.equal(bridge.bloom_database_result_number(two, 0), 22);
  assert.equal(bridge.bloom_database_poll(one), 0);
  worker.emit('message', { id: one, status: 8, rows: 0, values: [] });
  assert.equal(bridge.bloom_database_status(one), 8);
  bridge.bloom_database_release(one);
  assert.equal(bridge.bloom_database_poll(one), -1);
});

test('scratch snapshots bytes and nested values before a later request resets the frame', () => {
  const { worker, bridge } = harness();
  const bytes = new Uint8Array([0, 127, 255]);
  submit(bridge, 12, 3, [bytes]);
  bytes[1] = 1;
  submit(bridge, 4, 3, ['saves', { where: { id: { eq: 4 } } }, ['id']]);
  assert.deepEqual(Array.from(worker.messages[0].args[0]), [0, 127, 255]);
  assert.deepEqual(JSON.parse(JSON.stringify(worker.messages[1].args[1])), { where: { id: { eq: 4 } } });
  assert.equal(worker.messages[1].handle, 3);
});

test('invalid scratch payload produces a terminal typed error without posting', () => {
  const { worker, bridge } = harness();
  bridge.bloom_database_scratch_reset();
  bridge.bloom_database_scratch_push_f64(5);
  bridge.bloom_database_scratch_push_f64(2);
  bridge.bloom_database_scratch_push_byte(256);
  const ticket = bridge.bloom_database_submit(12, 1, 1);
  assert.equal(bridge.bloom_database_poll(ticket), 1);
  assert.equal(bridge.bloom_database_status(ticket), 4);
  assert.equal(worker.messages.length, 0);
});

test('unsupported operations and malformed handles use frozen statuses', () => {
  const { worker, bridge } = harness();
  assert.equal(bridge.bloom_database_status(submit(bridge, 99, 1, [])), 9);
  assert.equal(bridge.bloom_database_status(submit(bridge, 7, -1, [])), 5);
  assert.equal(worker.messages.length, 0);
});

test('worker failure resolves pending tickets and shutdown prevents further requests', () => {
  const { worker, bridge } = harness();
  const one = submit(bridge, 7, 1, []);
  const two = submit(bridge, 7, 2, []);
  worker.emit('error');
  assert.equal(worker.terminated, true);
  assert.equal(bridge.bloom_database_poll(one), 1);
  assert.equal(bridge.bloom_database_status(one), 10);
  assert.equal(bridge.bloom_database_status(two), 10);
  bridge.shutdown();
  assert.equal(worker.terminated, true);
  const after = submit(bridge, 7, 1, []);
  assert.equal(bridge.bloom_database_status(after), 10);
});

test('messageerror disposes the worker and ignores late replies', () => {
  const { worker, bridge } = harness();
  const ticket = submit(bridge, 7, 1, []);
  worker.emit('messageerror');
  assert.equal(worker.terminated, true);
  worker.emit('message', { id: ticket, status: 0, rows: 0, values: [] });
  assert.equal(bridge.bloom_database_status(ticket), 10);
});

test('worker failure releases its persistent writer lock', async () => {
  const sqlite = await sqlite3InitModule();
  const held = new Set();
  const locks = { request: async (name, _options, callback) => {
    if (held.has(name)) return callback(null);
    held.add(name);
    try { return await callback({ name }); } finally { held.delete(name); }
  } };
  const environment = { sqlite, indexedDB: fakeIndexedDB, navigator: { locks }, opfsSupported: false };
  const service = createDatabaseService({ sqlite, openPersistent: createBrowserStorage(environment).open });
  const rival = createDatabaseService({ sqlite, openPersistent: createBrowserStorage(environment).open });
  class ServiceWorker extends ControlledWorker {
    postMessage(message) {
      this.pending = service.execute(message).then((result) => this.emit('message', { id: message.id, ...result }));
    }
    terminate() { super.terminate(); this.closed = service.shutdown(); }
  }
  const worker = new ServiceWorker();
  const bridge = createDatabaseBridge({ createWorker: () => worker });
  const ticket = submit(bridge, 1, 0, ['app', 'worker-lock', false, schema]);
  await worker.pending;
  assert.equal(bridge.bloom_database_status(ticket), 0);
  assert.equal((await rival.execute({ op: 1, handle: 0, args: ['app', 'worker-lock', false, schema] })).status, 8);
  worker.emit('error');
  await worker.closed;
  assert.equal(worker.terminated, true);
  assert.equal((await rival.execute({ op: 1, handle: 0, args: ['app', 'worker-lock', false, schema] })).status, 0);
  await rival.shutdown();
});

test('BFCache pagehide keeps the worker alive for a restored page', () => {
  const { worker, bridge } = harness();
  const first = submit(bridge, 7, 1, []);
  bridge.handlePageHide({ persisted: true });
  assert.equal(worker.terminated, undefined);
  worker.emit('message', { id: first, status: 0, rows: 0, values: [] });
  assert.equal(bridge.bloom_database_status(first), 0);
  bridge.handlePageHide({ persisted: false });
  assert.equal(worker.terminated, true);
});

test('abort leaves no late worker result and a competing writer receives busy', () => {
  const { worker, bridge } = harness();
  const pending = submit(bridge, 1, 0, ['app', 'one', false, {}]);
  bridge.abort(pending);
  assert.equal(bridge.bloom_database_status(pending), 10);
  worker.emit('message', { id: pending, status: 0, rows: 0, values: [1, 0] });
  assert.equal(bridge.bloom_database_status(pending), 10);
  const rival = submit(bridge, 1, 0, ['app', 'one', false, {}]);
  worker.emit('message', { id: rival, status: 8, rows: 0, values: [] });
  assert.equal(bridge.bloom_database_status(rival), 8);
});

const schema = { saves: { columns: {
  id: { kind: 'integer', options: { primaryKey: true, autoIncrement: true } },
  label: { kind: 'text', options: { notNull: true } },
  data: { kind: 'blob', options: {} },
  active: { kind: 'boolean', options: { default: false } },
} } };
const migration = [{ op: 'createTable', table: 'saves', name: '', values: schema.saves.columns }];

test('SQLite service migrates, binds CRUD values, and preserves export/import bytes', async () => {
  const sqlite = await sqlite3InitModule();
  const service = createDatabaseService({ sqlite });
  const opened = await service.execute({ op: 1, handle: 0, args: ['app', 'save', true, schema] });
  assert.equal(opened.status, 0);
  const handle = opened.values[0];
  assert.equal((await service.execute({ op: 10, handle, args: [1, migration] })).status, 0);
  const inserted = await service.execute({ op: 3, handle, args: ['saves', { label: 'one', data: new Uint8Array([0, 255]) }] });
  assert.equal(inserted.status, 0);
  assert.equal(inserted.values[0], 1);
  const selected = await service.execute({ op: 4, handle, args: ['saves', { where: { id: { eq: 1 } } }, ['id', 'label', 'data', 'active']] });
  assert.equal(selected.rows, 1);
  assert.deepEqual(selected.values.slice(0, 2), [1, 'one']);
  assert.deepEqual(Array.from(selected.values[2]), [0, 255]);
  assert.equal(selected.values[3], false);
  const image = (await service.execute({ op: 11, handle, args: [] })).values[0];
  assert.equal(new TextDecoder().decode(image.subarray(0, 16)), 'SQLite format 3\0');
  await service.execute({ op: 5, handle, args: ['saves', { label: 'two' }, { id: { eq: 1 } }] });
  assert.equal((await service.execute({ op: 12, handle, args: [image] })).status, 0);
  const restored = await service.execute({ op: 4, handle, args: ['saves', {}, ['label']] });
  assert.deepEqual(restored.values, ['one']);
  assert.deepEqual(Array.from((await service.execute({ op: 11, handle, args: [] })).values[0]), Array.from(image));
  assert.equal((await service.execute({ op: 2, handle, args: [] })).status, 0);
});

test('failed migration rolls back the schema and version', async () => {
  const sqlite = await sqlite3InitModule();
  const service = createDatabaseService({ sqlite });
  const handle = (await service.execute({ op: 1, handle: 0, args: ['app', 'rollback', true, schema] })).values[0];
  const bad = [...migration, { op: 'createTable', table: 'saves', name: '', values: schema.saves.columns }];
  assert.equal((await service.execute({ op: 10, handle, args: [1, bad] })).status, 12);
  assert.equal((await service.execute({ op: 3, handle, args: ['saves', { label: 'missing' }] })).status, 7);
  assert.equal((await service.execute({ op: 10, handle, args: [1, migration] })).status, 0);
});

test('snapshot commits precede write replies and reopen restores rows', async () => {
  const sqlite = await sqlite3InitModule();
  const images = new Map();
  let commits = 0;
  const persistent = async (key) => {
    const db = openSnapshotDatabase(sqlite, images.get(key));
    return { db, persist: async () => { images.set(key, exportDatabase(sqlite, db)); commits++; }, close: () => {} };
  };
  let service = createDatabaseService({ sqlite, openPersistent: persistent });
  let handle = (await service.execute({ op: 1, handle: 0, args: ['app', 'reopen', false, schema] })).values[0];
  assert.equal((await service.execute({ op: 10, handle, args: [1, migration] })).status, 0);
  const inserted = await service.execute({ op: 3, handle, args: ['saves', { label: 'persisted' }] });
  assert.equal(inserted.status, 0);
  assert.equal(commits, 2);
  await service.execute({ op: 2, handle, args: [] });
  service = createDatabaseService({ sqlite, openPersistent: persistent });
  handle = (await service.execute({ op: 1, handle: 0, args: ['app', 'reopen', false, schema] })).values[0];
  assert.deepEqual((await service.execute({ op: 4, handle, args: ['saves', {}, ['label']] })).values, ['persisted']);
  assert.equal((await service.execute({ op: 1, handle: 0, args: ['app', 'reopen', false, schema] })).status, 8);
});

test('IndexedDB fallback persists across worker services and releases the writer lock', async () => {
  const sqlite = await sqlite3InitModule();
  const held = new Set();
  const locks = { request: async (name, _options, callback) => {
    if (held.has(name)) return callback(null);
    held.add(name);
    try { return await callback({ name }); } finally { held.delete(name); }
  } };
  const environment = { sqlite, indexedDB: fakeIndexedDB, navigator: { locks }, opfsSupported: false };
  const first = createDatabaseService({ sqlite, openPersistent: createBrowserStorage(environment).open });
  const second = createDatabaseService({ sqlite, openPersistent: createBrowserStorage(environment).open });
  const firstOpen = await first.execute({ op: 1, handle: 0, args: ['idb', 'state', false, schema] });
  const handle = firstOpen.values[0];
  assert.equal(firstOpen.status, 0);
  assert.equal((await second.execute({ op: 1, handle: 0, args: ['idb', 'state', false, schema] })).status, 8);
  await first.execute({ op: 10, handle, args: [1, migration] });
  assert.equal((await first.execute({ op: 3, handle, args: ['saves', { label: 'from idb' }] })).status, 0);
  assert.equal((await first.execute({ op: 2, handle, args: [] })).status, 0);
  const reopened = await second.execute({ op: 1, handle: 0, args: ['idb', 'state', false, schema] });
  assert.equal(reopened.status, 0);
  assert.deepEqual((await second.execute({ op: 4, handle: reopened.values[0], args: ['saves', {}, ['label']] })).values, ['from idb']);
  await second.shutdown();
});

test('column rebuild migrations keep rows and explicit indexes', async () => {
  const sqlite = await sqlite3InitModule();
  let saved;
  const persistent = async () => ({
    db: openSnapshotDatabase(sqlite, saved),
    persist: async (db) => { saved = exportDatabase(sqlite, db); },
  });
  const nextSchema = { saves: { columns: { ...schema.saves.columns,
    score: { kind: 'integer', options: { default: 7 } },
  } } };
  let service = createDatabaseService({ sqlite, openPersistent: persistent });
  let handle = (await service.execute({ op: 1, handle: 0, args: ['app', 'rebuild', false, schema] })).values[0];
  await service.execute({ op: 10, handle, args: [1, migration] });
  await service.execute({ op: 3, handle, args: ['saves', { label: 'keep' }] });
  await service.execute({ op: 2, handle, args: [] });
  service = createDatabaseService({ sqlite, openPersistent: persistent });
  handle = (await service.execute({ op: 1, handle: 0, args: ['app', 'rebuild', false, nextSchema] })).values[0];
  const steps = [
    { op: 'createIndex', table: 'saves', name: 'save_label', values: { descriptor: { name: 'save_label', columns: ['label'] } } },
    { op: 'addColumn', table: 'saves', name: 'score', values: { descriptor: nextSchema.saves.columns.score } },
  ];
  assert.equal((await service.execute({ op: 10, handle, args: [2, steps] })).status, 0);
  const rows = await service.execute({ op: 4, handle, args: ['saves', {}, ['label', 'score']] });
  assert.deepEqual(rows.values, ['keep', 7]);
  assert.equal((await service.execute({ op: 6, handle, args: ['saves', { score: { eq: 7 } }] })).values[0], 1);
});

test('failed durable transaction commit restores the last committed image', async () => {
  const sqlite = await sqlite3InitModule();
  let saved;
  let failNext = false;
  const service = createDatabaseService({ sqlite, openPersistent: async () => ({
    db: openSnapshotDatabase(sqlite, saved),
    persist: async (db) => {
      if (failNext) { failNext = false; throw Object.assign(Error('full'), { name: 'QuotaExceededError' }); }
      saved = exportDatabase(sqlite, db);
    },
  }) });
  const handle = (await service.execute({ op: 1, handle: 0, args: ['app', 'full', false, schema] })).values[0];
  await service.execute({ op: 10, handle, args: [1, migration] });
  await service.execute({ op: 3, handle, args: ['saves', { label: 'old' }] });
  await service.execute({ op: 7, handle, args: [] });
  await service.execute({ op: 3, handle, args: ['saves', { label: 'new' }] });
  failNext = true;
  assert.equal((await service.execute({ op: 8, handle, args: [] })).status, 11);
  assert.deepEqual((await service.execute({ op: 4, handle, args: ['saves', {}, ['label']] })).values, ['old']);
});

test('new transaction rollback is not consumed by a stale failed-commit acknowledgment', async () => {
  const sqlite = await sqlite3InitModule();
  let saved;
  let failNext = false;
  const service = createDatabaseService({ sqlite, openPersistent: async () => ({
    db: openSnapshotDatabase(sqlite, saved),
    persist: async (db) => {
      if (failNext) { failNext = false; throw Object.assign(Error('full'), { name: 'QuotaExceededError' }); }
      saved = exportDatabase(sqlite, db);
    },
  }) });
  const handle = (await service.execute({ op: 1, handle: 0, args: ['app', 'ack-reuse', false, schema] })).values[0];
  assert.equal((await service.execute({ op: 10, handle, args: [1, migration] })).status, 0);
  assert.equal((await service.execute({ op: 3, handle, args: ['saves', { label: 'committed' }] })).status, 0);
  assert.equal((await service.execute({ op: 7, handle, args: [] })).status, 0);
  assert.equal((await service.execute({ op: 3, handle, args: ['saves', { label: 'failed' }] })).status, 0);
  failNext = true;
  assert.equal((await service.execute({ op: 8, handle, args: [] })).status, 11);
  assert.equal((await service.execute({ op: 7, handle, args: [] })).status, 0);
  assert.equal((await service.execute({ op: 3, handle, args: ['saves', { label: 'rolled back' }] })).status, 0);
  assert.equal((await service.execute({ op: 9, handle, args: [] })).status, 0);
  assert.deepEqual((await service.execute({ op: 4, handle, args: ['saves', {}, ['label']] })).values, ['committed']);
  assert.equal((await service.execute({ op: 2, handle, args: [] })).status, 0);
});

test('add and drop column rebuilds retain native column order and surviving rows', async () => {
  const sqlite = await sqlite3InitModule();
  const service = createDatabaseService({ sqlite });
  const handle = (await service.execute({ op: 1, handle: 0, args: ['app', 'column-order', true, schema] })).values[0];
  await service.execute({ op: 10, handle, args: [1, migration] });
  await service.execute({ op: 3, handle, args: ['saves', { label: 'existing' }] });
  const added = { kind: 'integer', options: { default: 9 } };
  assert.equal((await service.execute({ op: 10, handle, args: [2, [
    { op: 'addColumn', table: 'saves', name: 'age', values: { descriptor: added } },
  ]] })).status, 0);
  const image = (await service.execute({ op: 11, handle, args: [] })).values[0];
  const copy = openSnapshotDatabase(sqlite, image);
  const sql = copy.selectValue("SELECT sql FROM sqlite_master WHERE name='saves'");
  assert.ok(sql.indexOf('"age"') < sql.indexOf('"data"'));
  copy.close();
  assert.equal((await service.execute({ op: 10, handle, args: [3, [
    { op: 'dropColumn', table: 'saves', name: 'data', values: {} },
  ]] })).status, 0);
  const finalImage = (await service.execute({ op: 11, handle, args: [] })).values[0];
  const finalCopy = openSnapshotDatabase(sqlite, finalImage);
  assert.deepEqual(finalCopy.exec({ sql: 'SELECT age, label FROM saves', rowMode: 'array', returnValue: 'resultRows' }), [[9, 'existing']]);
  finalCopy.close();
});

test('failed durable import preserves the prior open image', async () => {
  const sqlite = await sqlite3InitModule();
  let saved;
  let failNext = false;
  const service = createDatabaseService({ sqlite, openPersistent: async () => ({
    db: openSnapshotDatabase(sqlite, saved),
    persist: async (db) => {
      if (failNext) { failNext = false; throw Object.assign(Error('full'), { name: 'QuotaExceededError' }); }
      saved = exportDatabase(sqlite, db);
    },
  }) });
  const handle = (await service.execute({ op: 1, handle: 0, args: ['app', 'failed-import', false, schema] })).values[0];
  await service.execute({ op: 10, handle, args: [1, migration] });
  await service.execute({ op: 3, handle, args: ['saves', { label: 'before' }] });
  const before = (await service.execute({ op: 11, handle, args: [] })).values[0];
  await service.execute({ op: 5, handle, args: ['saves', { label: 'current' }, { id: { eq: 1 } }] });
  failNext = true;
  assert.equal((await service.execute({ op: 12, handle, args: [before] })).status, 11);
  assert.deepEqual((await service.execute({ op: 4, handle, args: ['saves', {}, ['label']] })).values, ['current']);
});

test('invalid SQLite import bytes report corrupt_data', async () => {
  const sqlite = await sqlite3InitModule();
  const service = createDatabaseService({ sqlite });
  const handle = (await service.execute({ op: 1, handle: 0, args: ['app', 'corrupt', true, schema] })).values[0];
  assert.equal((await service.execute({ op: 12, handle, args: [new Uint8Array([1, 2, 3])] })).status, 13);
});

test('public transaction keeps the failed durable commit status through rollback and close', async () => {
  const sqlite = await sqlite3InitModule();
  const compiled = await build({
    entryPoints: [new URL('../../../src/storage/game-database.ts', import.meta.url).pathname],
    bundle: true, format: 'esm', platform: 'node', write: false,
  });
  const { GameDatabase } = await import(`data:text/javascript;base64,${Buffer.from(compiled.outputFiles[0].text).toString('base64')}`);
  const operations = [];
  let failCommit = '';
  const service = createDatabaseService({ sqlite, openPersistent: async () => ({
    db: new sqlite.oo1.DB(),
    persist: async () => {
      if (failCommit) { const name = failCommit; failCommit = ''; throw Object.assign(Error('snapshot failed'), { name }); }
    },
  }) });
  class ServiceWorker extends ControlledWorker {
    postMessage(message) {
      operations.push(message.op);
      this.pending = (this.pending || Promise.resolve()).then(async () => {
        const result = await service.execute(message);
        if (!this.terminated) this.emit('message', { id: message.id, ...result });
      });
    }
    terminate() { super.terminate(); this.closed = service.shutdown(); }
  }
  const worker = new ServiceWorker();
  const bridge = createDatabaseBridge({ createWorker: () => worker });
  const names = Object.keys(bridge).filter((name) => name.startsWith('bloom_database_'));
  const previous = names.map((name) => globalThis[name]);
  for (const name of names) globalThis[name] = bridge[name];
  try {
    const database = new GameDatabase({ appId: 'app', name: 'public-commit', schema,
      migrations: [{ version: 1, apply(builder) { builder.createTable('saves', schema.saves.columns); } }] });
    const opened = await database.open();
    assert.equal(opened.status, 'ok');
    failCommit = 'QuotaExceededError';
    const result = await database.transaction(async (transaction) => transaction.insert('saves', { label: 'new' }));
    assert.equal(result.status, 'quota_exceeded');
    assert.deepEqual(operations.slice(-2), [8, 9]);
    assert.equal((await database.close()).status, 'ok');
    assert.deepEqual(operations.slice(-3), [8, 9, 2]);
    const migrationFailure = new GameDatabase({ appId: 'app', name: 'public-migration', schema,
      migrations: [{ version: 1, apply(builder) { builder.createTable('saves', schema.saves.columns); } }] });
    failCommit = 'AbortError';
    assert.equal((await migrationFailure.open()).status, 'storage_error');
  } finally {
    for (let i = 0; i < names.length; i++) {
      if (previous[i] === undefined) delete globalThis[names[i]];
      else globalThis[names[i]] = previous[i];
    }
    bridge.shutdown();
    await worker.closed;
  }
});

test('failed OPFS-style commit rolls back uncommitted rows before later reads', async () => {
  const sqlite = await sqlite3InitModule();
  let failCommit = false;
  const service = createDatabaseService({ sqlite, openPersistent: async () => {
    const db = new sqlite.oo1.DB();
    return { db: new Proxy(db, { get(target, property) {
      if (property === 'exec') return (...args) => {
        if (args[0] === 'COMMIT' && failCommit) { failCommit = false; throw Error('OPFS commit failed'); }
        return target.exec(...args);
      };
      const value = target[property];
      return typeof value === 'function' ? value.bind(target) : value;
    } }), close: () => {} };
  } });
  const handle = (await service.execute({ op: 1, handle: 0, args: ['app', 'opfs-commit', false, schema] })).values[0];
  assert.equal((await service.execute({ op: 10, handle, args: [1, migration] })).status, 0);
  assert.equal((await service.execute({ op: 7, handle, args: [] })).status, 0);
  assert.equal((await service.execute({ op: 3, handle, args: ['saves', { label: 'uncommitted' }] })).status, 0);
  failCommit = true;
  assert.equal((await service.execute({ op: 8, handle, args: [] })).status, 10);
  assert.equal((await service.execute({ op: 9, handle, args: [] })).status, 0);
  assert.deepEqual((await service.execute({ op: 4, handle, args: ['saves', {}, ['label']] })).values, []);
  assert.equal((await service.execute({ op: 2, handle, args: [] })).status, 0);
});

test('failed OPFS rollback quarantines the handle and releases its writer', async () => {
  const sqlite = await sqlite3InitModule();
  let closes = 0;
  const service = createDatabaseService({ sqlite, openPersistent: async () => {
    const db = new sqlite.oo1.DB();
    return { db: new Proxy(db, { get(target, property) {
      if (property === 'exec') return (...args) => {
        if (args[0] === 'COMMIT' || args[0] === 'ROLLBACK') throw Error('OPFS I/O failed');
        return target.exec(...args);
      };
      const value = target[property];
      return typeof value === 'function' ? value.bind(target) : value;
    } }), close: () => { closes++; } };
  } });
  const handle = (await service.execute({ op: 1, handle: 0, args: ['app', 'rollback-failure', false, schema] })).values[0];
  assert.equal((await service.execute({ op: 7, handle, args: [] })).status, 0);
  assert.equal((await service.execute({ op: 8, handle, args: [] })).status, 10);
  assert.equal(closes, 1);
  assert.equal((await service.execute({ op: 9, handle, args: [] })).status, 6);
  assert.equal((await service.execute({ op: 4, handle, args: ['saves', {}, ['label']] })).status, 6);
  assert.equal((await service.execute({ op: 1, handle: 0, args: ['app', 'rollback-failure', false, schema] })).status, 0);
  await service.shutdown();
});

test('failed OPFS migration rollback also quarantines its connection', async () => {
  const sqlite = await sqlite3InitModule();
  let closes = 0;
  const service = createDatabaseService({ sqlite, openPersistent: async () => {
    const db = new sqlite.oo1.DB();
    return { db: new Proxy(db, { get(target, property) {
      if (property === 'exec') return (...args) => {
        if (args[0] === 'ROLLBACK') throw Error('OPFS rollback failed');
        return target.exec(...args);
      };
      const value = target[property];
      return typeof value === 'function' ? value.bind(target) : value;
    } }), close: () => { closes++; } };
  } });
  const handle = (await service.execute({ op: 1, handle: 0, args: ['app', 'migration-rollback-failure', false, schema] })).values[0];
  assert.equal((await service.execute({ op: 10, handle, args: [1, [...migration, ...migration]] })).status, 10);
  assert.equal(closes, 1);
  assert.equal((await service.execute({ op: 11, handle, args: [] })).status, 6);
});

test('OPFS corruption does not fall back to an empty IndexedDB database', async () => {
  const sqlite = await sqlite3InitModule();
  let indexedOpens = 0;
  const brokenSqlite = Object.create(sqlite);
  brokenSqlite.installOpfsSAHPoolVfs = async () => ({
    OpfsSAHPoolDb: class { constructor() { throw Object.assign(Error('database disk image is malformed'), { resultCode: 11 }); } },
    pauseVfs() {},
  });
  const locks = { request: async (_name, _options, callback) => callback({}) };
  const storage = createBrowserStorage({ sqlite: brokenSqlite, opfsSupported: true,
    navigator: { locks }, indexedDB: { open() { indexedOpens++; throw Error('must not open IndexedDB'); } } });
  await assert.rejects(storage.open('app\0corrupt'), (error) => error.status === 13);
  assert.equal(indexedOpens, 0);
});

test('recognized unsupported OPFS capability falls back to IndexedDB', async () => {
  const sqlite = await sqlite3InitModule();
  const unsupported = Object.create(sqlite);
  unsupported.installOpfsSAHPoolVfs = async () => { throw Object.assign(Error('unsupported'), { name: 'NotSupportedError' }); };
  const locks = { request: async (_name, _options, callback) => callback({}) };
  const storage = createBrowserStorage({ sqlite: unsupported, opfsSupported: true,
    navigator: { locks }, indexedDB: fakeIndexedDB });
  const opened = await storage.open('app\0unsupported');
  assert.ok(opened.db);
  opened.db.close();
  opened.close();
});

test('durable snapshot errors retain storage and quota statuses across write, migration, import, and commit', async () => {
  const sqlite = await sqlite3InitModule();
  for (const [name, expected] of [['AbortError', 10], ['QuotaExceededError', 11]]) {
    let saved;
    let failNext = false;
    const service = createDatabaseService({ sqlite, openPersistent: async () => ({
      db: openSnapshotDatabase(sqlite, saved),
      persist: async (db) => {
        if (failNext) { failNext = false; throw Object.assign(Error('snapshot failed'), { name }); }
        saved = exportDatabase(sqlite, db);
      },
    }) });
    const handle = (await service.execute({ op: 1, handle: 0, args: ['app', `statuses-${name}`, false, schema] })).values[0];
    failNext = true;
    assert.equal((await service.execute({ op: 10, handle, args: [1, migration] })).status, expected, `${name} migration`);
    assert.equal((await service.execute({ op: 10, handle, args: [1, migration] })).status, 0);
    failNext = true;
    assert.equal((await service.execute({ op: 3, handle, args: ['saves', { label: 'write' }] })).status, expected, `${name} write`);
    assert.equal((await service.execute({ op: 3, handle, args: ['saves', { label: 'saved' }] })).status, 0);
    const image = (await service.execute({ op: 11, handle, args: [] })).values[0];
    assert.equal((await service.execute({ op: 5, handle, args: ['saves', { label: 'changed' }, { id: { eq: 1 } }] })).status, 0);
    failNext = true;
    assert.equal((await service.execute({ op: 12, handle, args: [image] })).status, expected, `${name} import`);
    assert.equal((await service.execute({ op: 7, handle, args: [] })).status, 0);
    assert.equal((await service.execute({ op: 3, handle, args: ['saves', { label: 'pending' }] })).status, 0);
    failNext = true;
    assert.equal((await service.execute({ op: 8, handle, args: [] })).status, expected, `${name} commit`);
    assert.equal((await service.execute({ op: 9, handle, args: [] })).status, 0);
    await service.shutdown();
  }
});
