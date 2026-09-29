// Finite SQL operations for GameDatabase. This module runs only inside the
// database worker; callers send typed values, never SQL source.
const MAX_BYTES = 256 * 1024 * 1024;
const MAX_SAFE = Number.MAX_SAFE_INTEGER;
const ok = (values = [], rows = 0) => ({ status: 0, rows, values });
const fail = (status) => ({ status, rows: 0, values: [] });
const identifier = (value) => typeof value === 'string' && /^[A-Za-z_][A-Za-z0-9_]{0,63}$/.test(value);
const namespace = (value) => typeof value === 'string' && value.length <= 128 &&
  /^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(value) && !value.includes('..');
const quote = (value) => `"${value}"`;
const object = (value) => value && typeof value === 'object' && !Array.isArray(value) && !(value instanceof Uint8Array);
const sorted = (value) => Object.keys(value).sort();
const allowed = (value, names) => object(value) && Object.keys(value).every((key) => names.includes(key));
const exact = (value) => Number.isSafeInteger(value);

function column(definition) {
  if (!allowed(definition, ['kind', 'options']) ||
      !['integer', 'real', 'text', 'blob', 'boolean'].includes(definition.kind) ||
      !allowed(definition.options, ['primaryKey', 'autoIncrement', 'notNull', 'nullable', 'unique', 'default'])) return false;
  const options = definition.options;
  for (const key of ['primaryKey', 'autoIncrement', 'notNull', 'nullable', 'unique']) {
    if (options[key] !== undefined && typeof options[key] !== 'boolean') return false;
  }
  if (options.autoIncrement && (!options.primaryKey || definition.kind !== 'integer')) return false;
  if (options.nullable && (options.notNull || options.primaryKey)) return false;
  return !Object.hasOwn(options, 'default') || validValue(definition, options.default);
}
function validValue(definition, value) {
  if (value === null) return !definition.options.notNull && !definition.options.primaryKey;
  switch (definition.kind) {
    case 'integer': return exact(value);
    case 'real': return typeof value === 'number' && Number.isFinite(value);
    case 'text': return typeof value === 'string';
    case 'blob': return value instanceof Uint8Array && value.length <= MAX_BYTES;
    case 'boolean': return typeof value === 'boolean';
    default: return false;
  }
}
function validSchema(schema) {
  if (!object(schema) || !Object.keys(schema).length) return false;
  const indexNames = new Set();
  for (const table of Object.keys(schema)) {
    const description = schema[table];
    if (!identifier(table) || !allowed(description, ['columns', 'indexes']) ||
        !object(description.columns) || !Object.keys(description.columns).length) return false;
    let primary = 0;
    for (const [name, descriptor] of Object.entries(description.columns)) {
      if (!identifier(name) || !column(descriptor)) return false;
      if (descriptor.options.primaryKey) primary++;
    }
    if (primary > 1 || (description.indexes !== undefined && !Array.isArray(description.indexes))) return false;
    for (const index of description.indexes || []) {
      if (!allowed(index, ['name', 'columns', 'unique']) || !identifier(index.name) ||
          indexNames.has(index.name) || Object.hasOwn(schema, index.name) ||
          (index.unique !== undefined && typeof index.unique !== 'boolean') ||
          !Array.isArray(index.columns) || !index.columns.length ||
          !index.columns.every((name) => Object.hasOwn(description.columns, name))) return false;
      indexNames.add(index.name);
    }
  }
  return true;
}
function sqlType(definition) {
  return definition.kind === 'boolean' || definition.kind === 'integer' ? 'INTEGER' : definition.kind.toUpperCase();
}
function tableSql(table, columns) {
  const definitions = sorted(columns).map((name) => {
    const descriptor = columns[name];
    const flags = descriptor.options;
    return `${quote(name)} ${sqlType(descriptor)}` +
      (flags.primaryKey ? ' PRIMARY KEY' : '') + (flags.autoIncrement ? ' AUTOINCREMENT' : '') +
      ((flags.notNull || flags.primaryKey) ? ' NOT NULL' : '') + (flags.unique ? ' UNIQUE' : '') +
      (descriptor.kind === 'boolean' ? ` CHECK (${quote(name)} IN (0, 1))` : '');
  });
  return `CREATE TABLE ${quote(table)} (${definitions.join(', ')}) STRICT`;
}
function dbValue(definition, value) { return definition.kind === 'boolean' && value !== null ? (value ? 1 : 0) : value; }
function fromDb(definition, value) {
  if (value === null) return validValue(definition, null) ? null : undefined;
  if (definition.kind === 'boolean') return value === 0 ? false : value === 1 ? true : undefined;
  if (definition.kind === 'blob') return value instanceof Uint8Array ? value : undefined;
  return validValue(definition, value) ? value : undefined;
}
function validateValues(columns, values, required) {
  if (!object(values)) return false;
  for (const [name, value] of Object.entries(values)) {
    if (!Object.hasOwn(columns, name) || !validValue(columns[name], value)) return false;
  }
  if (required) for (const [name, descriptor] of Object.entries(columns)) {
    const flags = descriptor.options;
    if ((flags.notNull || flags.primaryKey) && !flags.autoIncrement &&
        !Object.hasOwn(flags, 'default') && !Object.hasOwn(values, name)) return false;
  }
  return true;
}
function filterSql(filter, columns, depth = 0) {
  if (!object(filter) || depth > 32) return null;
  const parts = [], bind = [];
  for (const key of sorted(filter)) {
    const condition = filter[key];
    if (key === 'and' || key === 'or') {
      if (!Array.isArray(condition) || !condition.length) return null;
      const children = condition.map((child) => filterSql(child, columns, depth + 1));
      if (children.some((child) => child === null)) return null;
      parts.push(`(${children.map((child) => `(${child.sql || '1'})`).join(key === 'and' ? ' AND ' : ' OR ')})`);
      for (const child of children) bind.push(...child.bind);
      continue;
    }
    if (key === 'not') {
      const child = filterSql(condition, columns, depth + 1);
      if (!child) return null;
      parts.push(`NOT (${child.sql || '1'})`);
      bind.push(...child.bind);
      continue;
    }
    if (!Object.hasOwn(columns, key) || !object(condition) || Object.keys(condition).length !== 1) return null;
    const [operator] = Object.keys(condition);
    const value = condition[operator];
    const descriptor = columns[key];
    if (operator === 'isNull') {
      if (typeof value !== 'boolean') return null;
      parts.push(`${quote(key)} IS ${value ? '' : 'NOT '}NULL`);
    } else if (operator === 'in') {
      if (!Array.isArray(value) || !value.length || !value.every((item) => validValue(descriptor, item))) return null;
      parts.push(`${quote(key)} IN (${value.map(() => '?').join(', ')})`);
      bind.push(...value.map((item) => dbValue(descriptor, item)));
    } else {
      const symbols = { eq: '=', ne: '!=', gt: '>', gte: '>=', lt: '<', lte: '<=' };
      if (!Object.hasOwn(symbols, operator) || !validValue(descriptor, value)) return null;
      if (value === null && (operator === 'eq' || operator === 'ne')) {
        parts.push(`${quote(key)} IS ${operator === 'ne' ? 'NOT ' : ''}NULL`);
      } else {
        parts.push(`${quote(key)} ${symbols[operator]} ?`);
        bind.push(dbValue(descriptor, value));
      }
    }
  }
  return { sql: parts.join(' AND '), bind };
}
function run(db, sql, bind = []) { return db.exec({ sql, bind, rowMode: 'array', returnValue: 'resultRows' }); }
function mapError(error, fallback) {
  if (Number.isInteger(error?.status) && error.status >= 0 && error.status <= 15) return error.status;
  const code = error?.resultCode & 255;
  if (code === 5 || code === 6) return 8;
  if (code === 19) return 15;
  if (code === 11 || code === 26) return 13;
  if (code === 13 || error?.name === 'QuotaExceededError') return 11;
  if ([8, 10, 14].includes(code) || ['NotAllowedError', 'SecurityError', 'InvalidStateError'].includes(error?.name)) return 10;
  if (typeof error?.message === 'string' && error.message.includes('no such table')) return 7;
  return fallback;
}
function durableError(error) { return error?.name === 'QuotaExceededError' || (error?.resultCode & 255) === 13 ? 11 : 10; }

export function exportDatabase(sqlite, db) { return sqlite.capi.sqlite3_js_db_export(db.pointer); }

export function openSnapshotDatabase(sqlite, bytes) {
  if (!bytes) return new sqlite.oo1.DB();
  if (!(bytes instanceof Uint8Array) || bytes.length < 100 || bytes.length > MAX_BYTES ||
      new TextDecoder().decode(bytes.subarray(0, 16)) !== 'SQLite format 3\0') throw Object.assign(Error('invalid SQLite image'), { status: 13 });
  const db = new sqlite.oo1.DB();
  let pointer = 0;
  try {
    pointer = sqlite.capi.sqlite3_malloc(bytes.length);
    if (!pointer) throw Error('SQLite allocation failed');
    sqlite.wasm.heap8u().set(bytes, pointer);
    const flags = sqlite.capi.SQLITE_DESERIALIZE_FREEONCLOSE | sqlite.capi.SQLITE_DESERIALIZE_RESIZEABLE;
    const rc = sqlite.capi.sqlite3_deserialize(db.pointer, 'main', pointer, bytes.length, bytes.length, flags);
    pointer = 0; // SQLite owns the buffer, including when deserialize returns an error.
    db.checkRc(rc);
    return db;
  } catch (error) {
    if (pointer) sqlite.capi.sqlite3_free(pointer);
    db.close();
    throw error;
  }
}

function checkImage(sqlite, bytes, current) {
  const candidate = openSnapshotDatabase(sqlite, bytes);
  try {
    if (candidate.selectValue('PRAGMA integrity_check') !== 'ok') { candidate.close(); return { status: 13 }; }
    const version = candidate.selectValue('PRAGMA user_version');
    if (version !== current.version) { candidate.close(); return { status: 14 }; }
    const physical = (db) => run(db, "SELECT type, name, tbl_name, sql FROM sqlite_master WHERE sql IS NOT NULL ORDER BY type, name");
    if (JSON.stringify(physical(candidate)) !== JSON.stringify(physical(current.db))) { candidate.close(); return { status: 13 }; }
    return { candidate, status: 0 };
  } catch { candidate.close(); return { status: 13 }; }
}

export function createDatabaseService({ sqlite, openPersistent } = {}) {
  let nextHandle = 1;
  const handles = new Map(), keys = new Map();
  async function persist(handle) { if (handle.persist) await handle.persist(handle.db); }
  async function quarantine(handleId, handle) {
    try { handle.db.close(); } catch { /* release the writer lock below */ }
    try { await handle.close?.(); } catch { /* the connection is unusable */ }
    handles.delete(handleId);
    keys.delete(handle.key);
  }
  async function restore(handleId, handle, snapshot) {
    try {
      handle.db.close();
      handle.db = openSnapshotDatabase(sqlite, snapshot);
      return true;
    } catch {
      await quarantine(handleId, handle);
      return false;
    }
  }
  async function write(handleId, handle, action, fallback = 10) {
    const snapshot = handle.persist && !handle.transaction ? exportDatabase(sqlite, handle.db) : null;
    let response;
    try {
      response = action();
    } catch (error) {
      if (snapshot && !await restore(handleId, handle, snapshot)) return fail(10);
      return fail(mapError(error, fallback));
    }
    if (response.status !== 0 || handle.transaction) return response;
    try { await persist(handle); return response; }
    catch (error) {
      if (snapshot && !await restore(handleId, handle, snapshot)) return fail(10);
      return fail(durableError(error));
    }
  }
  async function execute({ op, handle: handleId, args }) {
    if (!exact(op) || op < 1 || op > 12) return fail(9);
    if (!exact(handleId) || handleId < 0) return fail(5);
    if (!Array.isArray(args)) return fail(4);
    if (op === 1) {
      if (args.length !== 4) return fail(4);
      const [appId, name, inMemory, schema] = args;
      if (!namespace(appId) || !namespace(name)) return fail(1);
      if (typeof inMemory !== 'boolean') return fail(4);
      if (!validSchema(schema)) return fail(2);
      const key = `${appId}\0${name}`;
      if (keys.has(key)) return fail(8);
      let storage;
      try {
        storage = inMemory ? { db: new sqlite.oo1.DB() } : await openPersistent?.(key);
        if (!storage?.db) return fail(10);
        storage.db.exec('PRAGMA foreign_keys = ON; PRAGMA synchronous = FULL; PRAGMA journal_mode = DELETE');
        if (storage.db.selectValue('PRAGMA integrity_check') !== 'ok') {
          storage.db.close(); storage.close?.(); return fail(13);
        }
        const version = storage.db.selectValue('PRAGMA user_version');
        if (!exact(version) || version < 0) { storage.db.close(); storage.close?.(); return fail(14); }
        const id = nextHandle++;
        handles.set(id, { ...storage, key, schema, version, transaction: false });
        keys.set(key, id);
        return ok([id, version]);
      } catch (error) {
        try { storage?.db?.close(); storage?.close?.(); } catch { /* release best effort */ }
        return fail(error?.status ?? mapError(error, 10));
      }
    }
    const handle = handles.get(handleId);
    if (!handle) return fail(6);
    if (op === 2) {
      let error;
      try { if (handle.transaction) handle.db.exec('ROLLBACK'); } catch (failure) { error = failure; }
      try { handle.db.close(); } catch (failure) { error ||= failure; }
      try { await handle.close?.(); } catch (failure) { error ||= failure; }
      handles.delete(handleId); keys.delete(handle.key);
      return error ? fail(mapError(error, 10)) : ok();
    }
    if (op === 7) {
      if (handle.transaction) return fail(8);
      try {
        handle.transactionSnapshot = handle.persist ? exportDatabase(sqlite, handle.db) : null;
        handle.db.exec('BEGIN IMMEDIATE'); handle.transaction = true; return ok();
      }
      catch (error) { return fail(mapError(error, 10)); }
    }
    if (op === 8 || op === 9) {
      if (op === 9 && handle.rollbackAcknowledgment) {
        handle.rollbackAcknowledgment = false;
        return ok();
      }
      if (!handle.transaction) return fail(6);
      if (op === 9) {
        try { handle.db.exec('ROLLBACK'); }
        catch { await quarantine(handleId, handle); return fail(10); }
        handle.transaction = false;
        handle.transactionSnapshot = null;
        return ok();
      }
      try { handle.db.exec('COMMIT'); }
      catch (error) {
        try { handle.db.exec('ROLLBACK'); }
        catch { await quarantine(handleId, handle); return fail(10); }
        handle.transaction = false;
        handle.transactionSnapshot = null;
        handle.rollbackAcknowledgment = true;
        return fail(mapError(error, 10));
      }
      handle.transaction = false;
      try { await persist(handle); handle.transactionSnapshot = null; return ok(); }
      catch (error) {
        const snapshot = handle.transactionSnapshot;
        handle.transactionSnapshot = null;
        if (snapshot && !await restore(handleId, handle, snapshot)) return fail(10);
        handle.rollbackAcknowledgment = true;
        return fail(durableError(error));
      }
    }
    if (op === 11) {
      if (handle.transaction) return fail(8);
      try { const bytes = exportDatabase(sqlite, handle.db); return bytes.length <= MAX_BYTES ? ok([bytes]) : fail(9); }
      catch (error) { return fail(mapError(error, 10)); }
    }
    if (op === 12) {
      if (args.length !== 1 || !(args[0] instanceof Uint8Array)) return fail(4);
      if (handle.transaction) return fail(8);
      let validated;
      try { validated = checkImage(sqlite, args[0], handle); }
      catch (error) { return fail(mapError(error, 13)); }
      if (validated.status !== 0) return fail(validated.status);
      const candidate = validated.candidate;
      let previous;
      try {
        if (handle.import) {
          const backup = exportDatabase(sqlite, handle.db);
          handle.db.close();
          try { await handle.import(args[0]); }
          catch (error) {
            await handle.import(backup);
            handle.db = await handle.reopen();
            throw error;
          }
          handle.db = await handle.reopen();
          candidate.close();
        } else {
          previous = handle.db;
          handle.db = candidate;
          await persist(handle);
          previous.close();
          previous = undefined;
        }
        return ok();
      } catch (error) {
        if (previous) handle.db = previous;
        candidate?.close();
        return fail(durableError(error));
      }
    }
    if (op === 10) {
      if (args.length !== 2 || handle.transaction) return fail(handle.transaction ? 8 : 4);
      const [version, steps] = args;
      if (!exact(version) || version <= 0 || version > 2147483647 || version <= handle.version) return fail(14);
      if (!Array.isArray(steps) || !steps.length) return fail(2);
      const snapshot = handle.persist ? exportDatabase(sqlite, handle.db) : null;
      try {
        handle.db.exec('BEGIN IMMEDIATE');
        for (const step of steps) applyMigration(handle.db, step);
        handle.db.exec(`PRAGMA user_version = ${version}`);
        handle.db.exec('COMMIT');
      } catch (error) {
        let rolledBack = false;
        try { handle.db.exec('ROLLBACK'); rolledBack = true; } catch { /* recovery below */ }
        if (snapshot && !await restore(handleId, handle, snapshot)) return fail(10);
        if (!snapshot && !rolledBack) { await quarantine(handleId, handle); return fail(10); }
        return fail(mapError(error, 12));
      }
      try { await persist(handle); }
      catch (error) {
        if (snapshot && !await restore(handleId, handle, snapshot)) return fail(10);
        return fail(durableError(error));
      }
      handle.version = version;
      return ok();
    }
    if (![3, 4, 5, 6].includes(op)) return fail(9);
    const expected = { 3: 2, 4: 3, 5: 3, 6: 2 }[op];
    if (args.length !== expected || typeof args[0] !== 'string') return fail(4);
    const table = args[0], columns = handle.schema[table]?.columns;
    if (!columns) return fail(3);
    if (op === 3) {
      const values = object(args[1]) ? { ...args[1] } : null;
      if (!values) return fail(4);
      for (const [name, descriptor] of Object.entries(columns)) {
        if (!Object.hasOwn(values, name) && Object.hasOwn(descriptor.options, 'default')) values[name] = descriptor.options.default;
      }
      if (!validateValues(columns, values, true)) return fail(4);
      const names = sorted(values);
      const sql = names.length ? `INSERT INTO ${quote(table)} (${names.map(quote).join(', ')}) VALUES (${names.map(() => '?').join(', ')})` :
        `INSERT INTO ${quote(table)} DEFAULT VALUES`;
      return write(handleId, handle, () => {
        run(handle.db, sql, names.map((name) => dbValue(columns[name], values[name])));
        return ok([handle.db.selectValue('SELECT last_insert_rowid()')]);
      }, 4);
    }
    if (op === 4) {
      const options = args[1], names = args[2];
      if (!allowed(options, ['where', 'orderBy', 'limit', 'offset']) || !Array.isArray(names) ||
          !names.length || !names.every((name) => Object.hasOwn(columns, name))) return fail(3);
      const filter = options.where === undefined ? { sql: '', bind: [] } : filterSql(options.where, columns);
      if (!filter || (options.limit !== undefined && (!exact(options.limit) || options.limit < 0)) ||
          (options.offset !== undefined && (!exact(options.offset) || options.offset < 0)) ||
          (options.orderBy !== undefined && !Array.isArray(options.orderBy))) return fail(3);
      let sql = `SELECT ${names.map(quote).join(', ')} FROM ${quote(table)}`;
      if (filter.sql) sql += ` WHERE ${filter.sql}`;
      if (options.orderBy?.length) {
        if (!options.orderBy.every((order) => allowed(order, ['column', 'direction']) &&
            Object.hasOwn(columns, order.column) && (order.direction === undefined || ['asc', 'desc'].includes(order.direction)))) return fail(3);
        sql += ` ORDER BY ${options.orderBy.map((order) => `${quote(order.column)} ${order.direction === 'desc' ? 'DESC' : 'ASC'}`).join(', ')}`;
      }
      const bind = [...filter.bind];
      if (options.limit !== undefined) { sql += ' LIMIT ?'; bind.push(options.limit); }
      if (options.offset !== undefined) { if (options.limit === undefined) sql += ' LIMIT -1'; sql += ' OFFSET ?'; bind.push(options.offset); }
      try {
        const rows = run(handle.db, sql, bind);
        if (rows.length * names.length > 1_000_000) return fail(9);
        const values = [];
        for (const row of rows) for (let i = 0; i < names.length; i++) {
          const value = fromDb(columns[names[i]], row[i]);
          if (value === undefined) return fail(13);
          values.push(value);
        }
        return ok(values, rows.length);
      } catch (error) { return fail(mapError(error, 3)); }
    }
    if (op === 5) {
      const values = args[1];
      if (!object(values) || !Object.keys(values).length || !validateValues(columns, values, false)) return fail(4);
      const filter = filterSql(args[2], columns);
      if (!filter) return fail(3);
      const names = sorted(values);
      const sql = `UPDATE ${quote(table)} SET ${names.map((name) => `${quote(name)} = ?`).join(', ')}` + (filter.sql ? ` WHERE ${filter.sql}` : '');
      return write(handleId, handle, () => { run(handle.db, sql, [...names.map((name) => dbValue(columns[name], values[name])), ...filter.bind]); return ok([handle.db.changes()]); }, 4);
    }
    const filter = filterSql(args[1], columns);
    if (!filter) return fail(3);
    const sql = `DELETE FROM ${quote(table)}` + (filter.sql ? ` WHERE ${filter.sql}` : '');
    return write(handleId, handle, () => { run(handle.db, sql, filter.bind); return ok([handle.db.changes()]); }, 3);
  }
  return { execute, shutdown: async () => {
    for (const [id, handle] of handles) {
      try { if (handle.transaction) handle.db.exec('ROLLBACK'); } catch { /* closing follows */ }
      await quarantine(id, handle);
    }
  } };
}

function applyMigration(db, step) {
  if (!allowed(step, ['op', 'table', 'name', 'values']) || !identifier(step.table) ||
      typeof step.name !== 'string' || (step.name && !identifier(step.name)) || !object(step.values)) throw Error('invalid migration');
  const { op, table, name, values } = step;
  if (op === 'createTable') {
    if (!Object.keys(values).length || !Object.entries(values).every(([key, descriptor]) => identifier(key) && column(descriptor))) throw Error('invalid table');
    db.exec(tableSql(table, values));
  } else if (op === 'dropTable') db.exec(`DROP TABLE ${quote(table)}`);
  else if (op === 'addColumn') {
    if (!column(values.descriptor)) throw Error('invalid column');
    rebuildTable(db, table, { name, descriptor: values.descriptor });
  } else if (op === 'dropColumn') rebuildTable(db, table, null, name);
  else if (op === 'createIndex') {
    const descriptor = values.descriptor;
    if (!allowed(descriptor, ['name', 'columns', 'unique']) || descriptor.name !== name ||
        !Array.isArray(descriptor.columns) || !descriptor.columns.length || !descriptor.columns.every(identifier)) throw Error('invalid index');
    db.exec(`CREATE ${descriptor.unique ? 'UNIQUE ' : ''}INDEX ${quote(name)} ON ${quote(table)} (${descriptor.columns.map(quote).join(', ')})`);
  } else if (op === 'dropIndex') {
    if (db.selectValue("SELECT tbl_name FROM sqlite_master WHERE type = 'index' AND name = ?", [name]) !== table) throw Error('wrong index owner');
    db.exec(`DROP INDEX ${quote(name)}`);
  } else if (op === 'transform') {
    if (!Object.keys(values).length || !Object.keys(values).every(identifier)) throw Error('invalid transform');
    const names = sorted(values);
    run(db, `UPDATE ${quote(table)} SET ${names.map((key) => `${quote(key)} = ?`).join(', ')}`, names.map((key) => typeof values[key] === 'boolean' ? Number(values[key]) : values[key]));
  } else throw Error('invalid migration operation');
}

function rebuildTable(db, table, added = null, removed = null) {
  const originalSql = db.selectValue("SELECT sql FROM sqlite_master WHERE type='table' AND name=?", [table]);
  if (typeof originalSql !== 'string') throw Error('missing table');
  const normalized = originalSql.toUpperCase();
  const original = run(db, `PRAGMA table_info(${quote(table)})`);
  if (!original.length) throw Error('empty table');
  const columns = Object.create(null);
  for (const [, name, type, notNull, , primary] of original) {
    if (!identifier(name) || !['INTEGER', 'REAL', 'TEXT', 'BLOB'].includes(type)) throw Error('unsupported column');
    const booleanCheck = `CHECK (${quote(name).toUpperCase()} IN (0, 1))`;
    columns[name] = { kind: type === 'INTEGER' ? (normalized.includes(booleanCheck) ? 'boolean' : 'integer') : type.toLowerCase(),
      options: { primaryKey: !!primary, autoIncrement: !!primary && type === 'INTEGER' && normalized.includes('AUTOINCREMENT'), notNull: !!notNull } };
  }
  const previousSequence = Object.values(columns).some((item) => item.options.autoIncrement) ?
    db.selectValue('SELECT seq FROM sqlite_sequence WHERE name=?', [table]) : null;
  if (added) {
    if (Object.hasOwn(columns, added.name)) throw Error('duplicate column');
    columns[added.name] = added.descriptor;
  }
  if (removed) {
    if (Object.keys(columns).length <= 1 || !Object.hasOwn(columns, removed)) throw Error('invalid column removal');
    delete columns[removed];
  }
  const indexes = [];
  const reserved = new Set();
  for (const [, indexName, unique, origin] of run(db, `PRAGMA index_list(${quote(table)})`)) {
    if (origin === 'pk') continue;
    const indexColumns = run(db, `PRAGMA index_info(${quote(indexName)})`).map((row) => row[2]).filter((name) => typeof name === 'string');
    if (!indexColumns.length || indexColumns.some((name) => !Object.hasOwn(columns, name))) continue;
    let name = indexName;
    if (origin === 'u') {
      let serial = 0;
      while (reserved.has(`__bornengine_unique_${serial}`) ||
          db.selectValue('SELECT EXISTS(SELECT 1 FROM sqlite_master WHERE name=?)', [`__bornengine_unique_${serial}`])) serial++;
      name = `__bornengine_unique_${serial}`;
      reserved.add(name);
    }
    indexes.push({ name, unique: !!unique, columns: indexColumns });
  }
  const temp = `__bornengine_migrate_${table}`;
  db.exec(tableSql(temp, columns));
  const retained = original.map((row) => row[1]).filter((name) => name !== removed);
  const target = added ? [...retained, added.name] : retained;
  if (!target.length) throw Error('empty rebuilt table');
  const select = retained.map(quote);
  const bind = [];
  if (added) {
    if (Object.hasOwn(added.descriptor.options, 'default')) {
      select.push('?');
      bind.push(dbValue(added.descriptor, added.descriptor.options.default));
    } else {
      if (added.descriptor.options.notNull && db.selectValue(`SELECT COUNT(*) FROM ${quote(table)}`) > 0) throw Error('required column on populated table');
      select.push('NULL');
    }
  }
  run(db, `INSERT INTO ${quote(temp)} (${target.map(quote).join(', ')}) SELECT ${select.join(', ')} FROM ${quote(table)}`, bind);
  db.exec(`DROP TABLE ${quote(table)}; ALTER TABLE ${quote(temp)} RENAME TO ${quote(table)}`);
  if (previousSequence !== null && previousSequence !== undefined) {
    const current = db.selectValue('SELECT seq FROM sqlite_sequence WHERE name=?', [table]);
    const sequence = Math.max(current ?? 0, previousSequence);
    if (current === null || current === undefined) run(db, 'INSERT INTO sqlite_sequence (name, seq) VALUES (?, ?)', [table, sequence]);
    else run(db, 'UPDATE sqlite_sequence SET seq=? WHERE name=?', [sequence, table]);
  }
  for (const index of indexes) {
    db.exec(`CREATE ${index.unique ? 'UNIQUE ' : ''}INDEX ${quote(index.name)} ON ${quote(table)} (${index.columns.map(quote).join(', ')})`);
  }
}
