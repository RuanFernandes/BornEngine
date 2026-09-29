import type { ColumnDescriptor, DatabaseSchema, DatabaseRow, DatabaseInsert, DatabaseUpdate } from './schema';
import { validColumnValue, validNamespace, validateSchema } from './schema';
import type { DatabaseFilter, DatabaseSelect } from './query';
import { validateFilter, validateSelect, validateValues } from './query';
import type { DatabaseMigration, MigrationStep } from './migrations';
import { validateMigrations } from './migrations';

/** Stable wire status numbers; backend implementations must use these exact values. */
export type DatabaseStatus = 'ok' | 'invalid_namespace' | 'invalid_schema' | 'invalid_query' |
  'invalid_data' | 'not_open' | 'closed' | 'not_found' | 'busy' | 'unsupported' |
  'storage_error' | 'quota_exceeded' | 'migration_error' | 'corrupt_data' |
  'unsupported_version' | 'constraint_error';

const STATUS: DatabaseStatus[] = [
  'ok', 'invalid_namespace', 'invalid_schema', 'invalid_query', 'invalid_data',
  'not_open', 'closed', 'not_found', 'busy', 'unsupported', 'storage_error',
  'quota_exceeded', 'migration_error', 'corrupt_data', 'unsupported_version',
  'constraint_error',
];

export type DatabaseFailureStatus = Exclude<DatabaseStatus, 'ok'>;
export type DatabaseResult<T> =
  | { ok: true; status: 'ok'; value: T | null }
  | { ok: false; status: DatabaseFailureStatus; value: null };
export type DatabaseState = 'new' | 'open' | 'closed';

export interface GameDatabaseOptions<S extends DatabaseSchema> {
  appId: string;
  name: string;
  schema: S;
  migrations?: readonly DatabaseMigration<S>[];
  /** Volatile mode must be requested explicitly; persistent mode is the default. */
  inMemory?: boolean;
}

function result<T>(status: DatabaseStatus, value: T | null = null): DatabaseResult<T> {
  if (status === 'ok') return { ok: true, status: 'ok', value };
  return { ok: false, status, value: null };
}

function normalizeCallbackResult<T>(value: unknown): DatabaseResult<T> {
  if (!value || typeof value !== 'object') return result('storage_error');
  const candidate = value as { ok?: unknown; status?: unknown; value?: unknown };
  if (!Object.prototype.hasOwnProperty.call(candidate, 'value')) return result('storage_error');
  if (candidate.ok === true && candidate.status === 'ok') return result('ok', candidate.value as T);
  if (candidate.ok === false && typeof candidate.status === 'string' && candidate.status !== 'ok' &&
      STATUS.indexOf(candidate.status as DatabaseStatus) >= 0 && candidate.value === null) {
    return result(candidate.status as DatabaseFailureStatus);
  }
  return result('storage_error');
}

/**
 * Bounded FFI protocol v1. No operation accepts SQL. One scratch frame contains
 * recursive tagged values: 0=null, 1=f64, 2=UTF-8 string, 3=false, 4=true,
 * 5=bytes (length then octets), 6=array (length then values), 7=object
 * (key count then UTF-8 key/value pairs). Integers and lengths are exact f64s.
 * `submit(op, handle, argc)` snapshots the scratch frame and returns a ticket.
 * `poll(ticket)` returns 0 while pending, 1 when terminal. Result values use
 * kind 0=null, 1=f64, 2=string, 3=false, 4=true, 5=bytes. Select results are
 * row-major in declared column order; `result_rows` gives the row count.
 * The caller releases every terminal ticket. All bytes cross one octet at a
 * time to avoid Perry's i64-array ABI regression. Backends must bind values.
 * Arguments by operation: open [appId,name,inMemory,schema] -> [handle,version];
 * close []; insert [table,values] -> [rowId]; select [table,options,columns] -> rows;
 * update/delete [table,values,where] / [table,where] -> [affectedCount];
 * begin/commit/rollback []; migrate [version,steps]; export [] -> [bytes];
 * import [bytes]. Migration is one atomic backend transaction including the
 * version record. Commit/import report success only after durable persistence.
 * Close aborts an unfinished transaction so failed rollback/commit can safely
 * quarantine a handle without exposing uncommitted writes to later requests.
 */
declare function bloom_database_scratch_reset(): void;
declare function bloom_database_scratch_push_f64(value: number): void;
declare function bloom_database_scratch_push_string(value: string): void;
declare function bloom_database_scratch_push_byte(value: number): void;
declare function bloom_database_submit(op: number, handle: number, argc: number): number;
declare function bloom_database_poll(ticket: number): number;
declare function bloom_database_status(ticket: number): number;
declare function bloom_database_result_rows(ticket: number): number;
declare function bloom_database_result_count(ticket: number): number;
declare function bloom_database_result_kind(ticket: number, index: number): number;
declare function bloom_database_result_number(ticket: number, index: number): number;
declare function bloom_database_result_string(ticket: number, index: number): string;
declare function bloom_database_result_byte_count(ticket: number, index: number): number;
declare function bloom_database_result_byte(ticket: number, index: number, offset: number): number;
declare function bloom_database_release(ticket: number): void;

/** Frozen operation numbers: open=1, close=2, insert=3, select=4, update=5,
 * delete=6, begin=7, commit=8, rollback=9, migrate=10, export=11, import=12. */
const OP_OPEN = 1;
const OP_CLOSE = 2;
const OP_INSERT = 3;
const OP_SELECT = 4;
const OP_UPDATE = 5;
const OP_DELETE = 6;
const OP_BEGIN = 7;
const OP_COMMIT = 8;
const OP_ROLLBACK = 9;
const OP_MIGRATE = 10;
const OP_EXPORT = 11;
const OP_IMPORT = 12;

function writeValue(value: unknown, depth = 0): boolean {
  if (depth > 32) return false;
  if (value === null || value === undefined) { bloom_database_scratch_push_f64(0); return true; }
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) return false;
    bloom_database_scratch_push_f64(1); bloom_database_scratch_push_f64(value); return true;
  }
  if (typeof value === 'string') {
    bloom_database_scratch_push_f64(2); bloom_database_scratch_push_string(value); return true;
  }
  if (typeof value === 'boolean') { bloom_database_scratch_push_f64(value ? 4 : 3); return true; }
  if (value instanceof Uint8Array) {
    bloom_database_scratch_push_f64(5); bloom_database_scratch_push_f64(value.length);
    for (let i = 0; i < value.length; i++) bloom_database_scratch_push_byte(value[i]);
    return true;
  }
  if (Array.isArray(value)) {
    bloom_database_scratch_push_f64(6); bloom_database_scratch_push_f64(value.length);
    for (let i = 0; i < value.length; i++) if (!writeValue(value[i], depth + 1)) return false;
    return true;
  }
  if (typeof value !== 'object') return false;
  const record = value as Record<string, unknown>;
  const keys = Object.keys(record);
  bloom_database_scratch_push_f64(7); bloom_database_scratch_push_f64(keys.length);
  for (let i = 0; i < keys.length; i++) {
    bloom_database_scratch_push_string(keys[i]);
    if (!writeValue(record[keys[i]], depth + 1)) return false;
  }
  return true;
}

function readValue(ticket: number, index: number): unknown {
  const kind = bloom_database_result_kind(ticket, index);
  if (kind === 0) return null;
  if (kind === 1) return bloom_database_result_number(ticket, index);
  if (kind === 2) return bloom_database_result_string(ticket, index);
  if (kind === 3) return false;
  if (kind === 4) return true;
  if (kind === 5) {
    const length = bloom_database_result_byte_count(ticket, index);
    if (!Number.isInteger(length) || length < 0) return null;
    const bytes = new Uint8Array(length);
    for (let i = 0; i < length; i++) bytes[i] = bloom_database_result_byte(ticket, index, i);
    return bytes;
  }
  return null;
}

function readRowValue(ticket: number, index: number, descriptor: ColumnDescriptor): { valid: boolean; value: unknown } {
  const kind = bloom_database_result_kind(ticket, index);
  if (kind === 0) {
    return { valid: !(descriptor.options.notNull || descriptor.options.primaryKey), value: null };
  }
  const expectedKind = descriptor.kind === 'text' ? 2 : descriptor.kind === 'blob' ? 5 :
    descriptor.kind === 'boolean' ? -1 : 1;
  if (descriptor.kind === 'boolean' ? kind !== 3 && kind !== 4 : kind !== expectedKind) {
    return { valid: false, value: null };
  }
  const value = readValue(ticket, index);
  return { valid: validColumnValue(descriptor.kind, value), value };
}

interface WireResponse { status: DatabaseStatus; ticket: number; rows: number; count: number; }

async function send(op: number, handle: number, args: unknown[]): Promise<WireResponse> {
  let ticket = 0;
  try {
    bloom_database_scratch_reset();
    for (let i = 0; i < args.length; i++) if (!writeValue(args[i])) return { status: 'invalid_data', ticket: 0, rows: 0, count: 0 };
    ticket = bloom_database_submit(op, handle, args.length);
    if (!Number.isSafeInteger(ticket) || ticket <= 0) return { status: 'unsupported', ticket: 0, rows: 0, count: 0 };
    let poll = bloom_database_poll(ticket);
    while (poll === 0) {
      await new Promise<void>((resolve) => setTimeout(resolve, 0));
      poll = bloom_database_poll(ticket);
    }
    if (poll !== 1) return { status: 'storage_error', ticket, rows: 0, count: 0 };
    const statusCode = bloom_database_status(ticket);
    const status = STATUS[statusCode] || 'storage_error';
    return { status, ticket, rows: bloom_database_result_rows(ticket), count: bloom_database_result_count(ticket) };
  } catch (_error) {
    if (ticket > 0) bloom_database_release(ticket);
    return { status: 'storage_error', ticket: 0, rows: 0, count: 0 };
  }
}

function release(response: WireResponse): void {
  if (response.ticket > 0) bloom_database_release(response.ticket);
}

export class GameDatabase<S extends DatabaseSchema> {
  readonly appId: string;
  readonly name: string;
  readonly schema: S;
  readonly migrations: readonly DatabaseMigration<S>[];
  readonly inMemory: boolean;
  private handle = 0;
  private lifecycle: DatabaseState = 'new';
  private transactionActive = false;
  private opening = false;

  constructor(options: GameDatabaseOptions<S>) {
    const config = options || {} as GameDatabaseOptions<S>;
    this.appId = config.appId;
    this.name = config.name;
    this.schema = config.schema;
    this.migrations = config.migrations || [];
    this.inMemory = config.inMemory === true;
  }

  get state(): DatabaseState { return this.lifecycle; }

  async open(): Promise<DatabaseResult<void>> {
    if (this.lifecycle === 'open') return result('ok');
    if (this.opening) return result('busy');
    if (!validNamespace(this.appId) || !validNamespace(this.name)) return result('invalid_namespace');
    if (!validateSchema(this.schema)) return result('invalid_schema');
    const groups = validateMigrations(this.schema, this.migrations);
    if (groups === null) return result('invalid_schema');
    this.opening = true;
    const opened = await send(OP_OPEN, 0, [this.appId, this.name, this.inMemory, this.schema]);
    if (opened.status !== 'ok') { release(opened); this.opening = false; return result(opened.status); }
    if (opened.count !== 2) { release(opened); this.opening = false; return result('corrupt_data'); }
    this.handle = Number(readValue(opened.ticket, 0));
    const currentVersion = Number(readValue(opened.ticket, 1));
    release(opened);
    if (!Number.isSafeInteger(this.handle) || this.handle <= 0 || !Number.isSafeInteger(currentVersion)) {
      if (this.handle > 0) { const closed = await send(OP_CLOSE, this.handle, []); release(closed); this.handle = 0; }
      this.opening = false;
      return result('storage_error');
    }
    const latestVersion = this.migrations.length > 0 ? this.migrations[this.migrations.length - 1].version : 0;
    if (currentVersion > latestVersion || currentVersion < 0) {
      const closed = await send(OP_CLOSE, this.handle, []);
      release(closed);
      this.handle = 0;
      this.opening = false;
      return result('unsupported_version');
    }
    for (let i = 0; i < this.migrations.length; i++) {
      if (this.migrations[i].version <= currentVersion) continue;
      const migrated = await send(OP_MIGRATE, this.handle, [this.migrations[i].version, groups[i]]);
      const status = migrated.status;
      release(migrated);
      if (status !== 'ok') {
        const closed = await send(OP_CLOSE, this.handle, []);
        release(closed);
        this.handle = 0;
        this.opening = false;
        return result(status === 'storage_error' ? 'migration_error' : status);
      }
    }
    this.lifecycle = 'open';
    this.opening = false;
    return result('ok');
  }

  async close(): Promise<DatabaseResult<void>> {
    if (this.lifecycle !== 'open') return result(this.lifecycle === 'closed' ? 'closed' : 'not_open');
    if (this.transactionActive) return result('busy');
    const response = await send(OP_CLOSE, this.handle, []);
    const status = response.status;
    release(response);
    if (status === 'ok') { this.handle = 0; this.lifecycle = 'closed'; }
    return result(status);
  }

  private ready(inTransaction: boolean): DatabaseStatus {
    if (this.lifecycle !== 'open') return this.lifecycle === 'closed' ? 'closed' : 'not_open';
    if (inTransaction && !this.transactionActive) return 'closed';
    if (this.transactionActive && !inTransaction) return 'busy';
    return 'ok';
  }

  async insert<T extends Extract<keyof S, string>>(table: T, values: DatabaseInsert<S, T>): Promise<DatabaseResult<number>> {
    return this.insertInternal(table, values, false);
  }

  async insertInternal<T extends Extract<keyof S, string>>(table: T, values: DatabaseInsert<S, T>, inTransaction: boolean): Promise<DatabaseResult<number>> {
    const state = this.ready(inTransaction);
    if (state !== 'ok') return result(state);
    if (!validateValues(this.schema, table, values as Record<string, unknown>, true)) return result('invalid_data');
    const response = await send(OP_INSERT, this.handle, [table, values]);
    const value = response.status === 'ok' && response.count === 1 ? readValue(response.ticket, 0) : null;
    const output = result<number>(response.status === 'ok' && !Number.isSafeInteger(value) ? 'corrupt_data' : response.status,
      Number.isSafeInteger(value) ? value as number : null);
    release(response);
    return output;
  }

  async select<T extends Extract<keyof S, string>>(table: T, options: DatabaseSelect<DatabaseRow<S, T>> = {}): Promise<DatabaseResult<DatabaseRow<S, T>[]>> {
    return this.selectInternal(table, options, false);
  }

  async selectInternal<T extends Extract<keyof S, string>>(table: T, options: DatabaseSelect<DatabaseRow<S, T>>, inTransaction: boolean): Promise<DatabaseResult<DatabaseRow<S, T>[]>> {
    const state = this.ready(inTransaction);
    if (state !== 'ok') return result(state);
    if (!validateSelect(this.schema, table, options)) return result('invalid_query');
    const names = Object.keys(this.schema[table].columns);
    const response = await send(OP_SELECT, this.handle, [table, options, names]);
    if (response.status !== 'ok') { release(response); return result(response.status); }
    if (!Number.isSafeInteger(response.rows) || response.rows < 0 ||
        !Number.isSafeInteger(response.count) || response.count !== response.rows * names.length) {
      release(response); return result('corrupt_data');
    }
    const rows: DatabaseRow<S, T>[] = [];
    for (let i = 0; i < response.rows; i++) {
      const row: Record<string, unknown> = {};
      for (let j = 0; j < names.length; j++) {
        const cell = readRowValue(response.ticket, i * names.length + j, this.schema[table].columns[names[j]]);
        if (!cell.valid) { release(response); return result('corrupt_data'); }
        row[names[j]] = cell.value;
      }
      rows.push(row as DatabaseRow<S, T>);
    }
    release(response);
    return result('ok', rows);
  }

  async findByPrimaryKey<T extends Extract<keyof S, string>>(table: T, key: string | number): Promise<DatabaseResult<DatabaseRow<S, T> | null>> {
    const state = this.ready(false);
    if (state !== 'ok') return result(state);
    const descriptor = Object.prototype.hasOwnProperty.call(this.schema, table) ? this.schema[table] : undefined;
    if (!descriptor) return result('invalid_query');
    let primary = '';
    for (const name in descriptor.columns) if (descriptor.columns[name].options.primaryKey) primary = name;
    if (!primary) return result('invalid_schema');
    const selected = await this.select(table, { where: { [primary]: { eq: key } }, limit: 1 } as DatabaseSelect<DatabaseRow<S, T>>);
    return selected.ok ? result('ok', selected.value && selected.value.length ? selected.value[0] : null) : result(selected.status);
  }

  async update<T extends Extract<keyof S, string>>(table: T, values: DatabaseUpdate<S, T>, where: DatabaseFilter<DatabaseRow<S, T>>): Promise<DatabaseResult<number>> {
    return this.updateInternal(table, values, where, false);
  }

  async updateInternal<T extends Extract<keyof S, string>>(table: T, values: DatabaseUpdate<S, T>, where: DatabaseFilter<DatabaseRow<S, T>>, inTransaction: boolean): Promise<DatabaseResult<number>> {
    const state = this.ready(inTransaction);
    if (state !== 'ok') return result(state);
    if (!validateValues(this.schema, table, values as Record<string, unknown>, false) || Object.keys(values).length === 0) return result('invalid_data');
    if (!validateFilter(this.schema, table, where)) return result('invalid_query');
    const response = await send(OP_UPDATE, this.handle, [table, values, where]);
    const value = response.status === 'ok' && response.count === 1 ? readValue(response.ticket, 0) : null;
    const output = result<number>(response.status === 'ok' && !Number.isSafeInteger(value) ? 'corrupt_data' : response.status,
      Number.isSafeInteger(value) ? value as number : null);
    release(response);
    return output;
  }

  async delete<T extends Extract<keyof S, string>>(table: T, where: DatabaseFilter<DatabaseRow<S, T>>): Promise<DatabaseResult<number>> {
    return this.deleteInternal(table, where, false);
  }

  async deleteInternal<T extends Extract<keyof S, string>>(table: T, where: DatabaseFilter<DatabaseRow<S, T>>, inTransaction: boolean): Promise<DatabaseResult<number>> {
    const state = this.ready(inTransaction);
    if (state !== 'ok') return result(state);
    if (!validateFilter(this.schema, table, where)) return result('invalid_query');
    const response = await send(OP_DELETE, this.handle, [table, where]);
    const value = response.status === 'ok' && response.count === 1 ? readValue(response.ticket, 0) : null;
    const output = result<number>(response.status === 'ok' && !Number.isSafeInteger(value) ? 'corrupt_data' : response.status,
      Number.isSafeInteger(value) ? value as number : null);
    release(response);
    return output;
  }

  async transaction<T>(callback: (tx: DatabaseTransaction<S>) => Promise<DatabaseResult<T>>): Promise<DatabaseResult<T>> {
    const state = this.ready(false);
    if (state !== 'ok') return result(state);
    this.transactionActive = true;
    const begun = await send(OP_BEGIN, this.handle, []);
    const beginStatus = begun.status;
    release(begun);
    if (beginStatus !== 'ok') { this.transactionActive = false; return result(beginStatus); }
    const tx = new DatabaseTransaction(this);
    let value: DatabaseResult<T>;
    try { value = normalizeCallbackResult<T>(await callback(tx)); } catch (_error) { value = result('storage_error'); }
    if (!value.ok || tx.failed) {
      const rolled = await send(OP_ROLLBACK, this.handle, []);
      const rollbackStatus = rolled.status;
      release(rolled);
      if (rollbackStatus !== 'ok') {
        await this.quarantine();
        return result('storage_error');
      }
      this.transactionActive = false;
      return result(tx.failed || value.status);
    }
    const committed = await send(OP_COMMIT, this.handle, []);
    const commitStatus = committed.status;
    release(committed);
    if (commitStatus === 'ok') {
      this.transactionActive = false;
      return value;
    }
    const rolled = await send(OP_ROLLBACK, this.handle, []);
    const rollbackStatus = rolled.status;
    release(rolled);
    if (rollbackStatus !== 'ok') {
      await this.quarantine();
      return result('storage_error');
    }
    this.transactionActive = false;
    return result(commitStatus);
  }

  private async quarantine(): Promise<void> {
    const closed = await send(OP_CLOSE, this.handle, []);
    release(closed);
    this.handle = 0;
    this.transactionActive = false;
    this.lifecycle = 'closed';
  }

  async export(): Promise<DatabaseResult<Uint8Array>> {
    const state = this.ready(false);
    if (state !== 'ok') return result(state);
    const response = await send(OP_EXPORT, this.handle, []);
    const bytes = response.status === 'ok' && response.count === 1 ? readValue(response.ticket, 0) : null;
    const output = bytes instanceof Uint8Array ? result('ok', bytes) : result<Uint8Array>(response.status === 'ok' ? 'corrupt_data' : response.status);
    release(response);
    return output;
  }

  async import(bytes: Uint8Array): Promise<DatabaseResult<void>> {
    const state = this.ready(false);
    if (state !== 'ok') return result(state);
    if (!(bytes instanceof Uint8Array) || bytes.length < 100) return result('invalid_data');
    const header = 'SQLite format 3\u0000';
    for (let i = 0; i < header.length; i++) if (bytes[i] !== header.charCodeAt(i)) return result('corrupt_data');
    const response = await send(OP_IMPORT, this.handle, [bytes]);
    const status = response.status;
    release(response);
    return result(status);
  }
}

export class DatabaseTransaction<S extends DatabaseSchema> {
  failed: DatabaseStatus | null = null;
  constructor(private readonly database: GameDatabase<S>) {}
  private observe<T>(value: DatabaseResult<T>): DatabaseResult<T> {
    if (!value.ok && this.failed === null) this.failed = value.status;
    return value;
  }
  async insert<T extends Extract<keyof S, string>>(table: T, values: DatabaseInsert<S, T>): Promise<DatabaseResult<number>> {
    return this.observe(await this.database.insertInternal(table, values, true));
  }
  async select<T extends Extract<keyof S, string>>(table: T, options: DatabaseSelect<DatabaseRow<S, T>> = {}): Promise<DatabaseResult<DatabaseRow<S, T>[]>> {
    return this.observe(await this.database.selectInternal(table, options, true));
  }
  async update<T extends Extract<keyof S, string>>(table: T, values: DatabaseUpdate<S, T>, where: DatabaseFilter<DatabaseRow<S, T>>): Promise<DatabaseResult<number>> {
    return this.observe(await this.database.updateInternal(table, values, where, true));
  }
  async delete<T extends Extract<keyof S, string>>(table: T, where: DatabaseFilter<DatabaseRow<S, T>>): Promise<DatabaseResult<number>> {
    return this.observe(await this.database.deleteInternal(table, where, true));
  }
}
