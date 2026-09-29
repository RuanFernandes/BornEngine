import { columns, defineSchema, defineTable, validateSchema } from '../../src/storage/schema';
import { validateFilter, validateSelect, validateValues } from '../../src/storage/query';
import { defineMigration, validateMigrations } from '../../src/storage/migrations';
import { GameDatabase } from '../../src/storage/game-database';

let failures = 0;
function check(label: string, passed: boolean): void {
  if (passed) console.log('PASS ' + label);
  else { console.error('FAIL ' + label); failures++; }
}

const schema = defineSchema({
  entries: defineTable({ columns: {
    id: columns.integer({ primaryKey: true, autoIncrement: true }),
    title: columns.text({ notNull: true }),
    note: columns.text({ nullable: true }),
  }, indexes: [{ name: 'entries_title_idx', columns: ['title'] }] }),
});

const inherited = Object.create({ entries: schema.entries }) as typeof schema;
check('insert rejects an inherited table', !validateValues(inherited, 'entries', { title: 'a' }, true));
check('filter rejects an inherited table', !validateFilter(inherited, 'entries', { title: { eq: 'a' } }));
check('select rejects an inherited table', !validateSelect(inherited, 'entries', {}));
function rejectsWithoutThrow(action: () => boolean): boolean {
  try { return !action(); } catch (_error) { return false; }
}
check('query validators reject a missing schema without throwing',
  rejectsWithoutThrow(() => validateValues(null as any, 'entries', { title: 'a' }, true)) &&
  rejectsWithoutThrow(() => validateFilter(null as any, 'entries', {})) &&
  rejectsWithoutThrow(() => validateSelect(null as any, 'entries', {})));
check('schema rejects null descriptor options', !validateSchema({ entries: { columns: {
  id: { kind: 'integer', options: null },
} } } as any));
check('schema rejects array descriptor options', !validateSchema({ entries: { columns: {
  id: { kind: 'integer', options: [] },
} } } as any));

function migrationValid(apply: Parameters<typeof defineMigration<typeof schema>>[2]): boolean {
  return validateMigrations(schema, [defineMigration(1, schema, apply)]) !== null;
}
check('migration rejects unknown drop table', !migrationValid((m) => m.dropTable('missing')));
check('migration rejects unknown drop column', !migrationValid((m) => m.dropColumn('entries', 'missing')));
check('migration rejects unknown drop index', !migrationValid((m) => m.dropIndex('entries', 'missing')));
check('migration rejects invalid index descriptor', !migrationValid((m) => m.createIndex('entries', {
  name: 'entries_bad_idx', columns: ['title'], unique: 'yes' as any,
})));
check('migration rejects duplicate index creation', !migrationValid((m) => {
  m.createIndex('entries', { name: 'entries_title_idx', columns: ['title'] });
  m.createIndex('entries', { name: 'entries_title_idx', columns: ['title'] });
}));
check('migration rejects duplicate column addition', !migrationValid((m) => {
  m.createTable('entries', { id: schema.entries.columns.id, title: schema.entries.columns.title });
  m.addColumn('entries', 'note', schema.entries.columns.note);
  m.addColumn('entries', 'note', schema.entries.columns.note);
}));
check('migration rejects adding a column already created with its table', !migrationValid((m) => {
  m.createTable('entries', schema.entries.columns);
  m.addColumn('entries', 'note', schema.entries.columns.note);
}));
check('migration rejects inherited transform fields without throwing', rejectsWithoutThrow(() =>
  migrationValid((m) => m.transform('entries', { toString: null } as any))));
const twoTableSchema = defineSchema({
  ...schema,
  other: defineTable({ columns: { id: columns.integer({ primaryKey: true }) } }),
});
check('migration rejects dropping an index through another table',
  validateMigrations(twoTableSchema, [defineMigration(1, twoTableSchema, (m) => {
    m.createIndex('entries', { name: 'entries_title_idx', columns: ['title'] });
    m.dropIndex('other', 'entries_title_idx');
  })]) === null);
check('migration accepts an index on a newly added column', migrationValid((m) => {
  m.createTable('entries', { id: schema.entries.columns.id, title: schema.entries.columns.title });
  m.addColumn('entries', 'note', schema.entries.columns.note);
  m.createIndex('entries', { name: 'entries_note_idx', columns: ['note'] });
}));
check('migration can reuse an index name after dropping its table', migrationValid((m) => {
  m.createTable('entries', { id: schema.entries.columns.id, title: schema.entries.columns.title });
  m.createIndex('entries', { name: 'entries_title_idx', columns: ['title'] });
  m.dropTable('entries');
  m.createTable('entries', { id: schema.entries.columns.id, title: schema.entries.columns.title });
  m.createIndex('entries', { name: 'entries_title_idx', columns: ['title'] });
}));

type StubValue = { kind: number; value: number | string | Uint8Array | null };
interface StubResponse { op: number; status: number; values: StubValue[]; rows: number; }
const queued: StubResponse[] = [];
const tickets = new Map<number, StubResponse>();
const calls: number[] = [];
let nextTicket = 1;
function enqueue(op: number, status = 0, values: StubValue[] = [], rows = 0): void {
  queued.push({ op, status, values, rows });
}
function stub(name: string, value: (...args: any[]) => unknown): void {
  (globalThis as any)[name] = value;
}
stub('bloom_database_scratch_reset', () => {});
stub('bloom_database_scratch_push_f64', () => {});
stub('bloom_database_scratch_push_string', () => {});
stub('bloom_database_scratch_push_byte', () => {});
stub('bloom_database_submit', (op: number) => {
  calls.push(op);
  const index = queued.findIndex((response) => response.op === op);
  const response = index >= 0 ? queued.splice(index, 1)[0] : { op, status: 0, values: [], rows: 0 };
  const ticket = nextTicket++;
  tickets.set(ticket, response);
  return ticket;
});
stub('bloom_database_poll', () => 1);
stub('bloom_database_status', (ticket: number) => tickets.get(ticket)?.status ?? 10);
stub('bloom_database_result_rows', (ticket: number) => tickets.get(ticket)?.rows ?? 0);
stub('bloom_database_result_count', (ticket: number) => tickets.get(ticket)?.values.length ?? 0);
stub('bloom_database_result_kind', (ticket: number, index: number) => tickets.get(ticket)?.values[index]?.kind ?? -1);
stub('bloom_database_result_number', (ticket: number, index: number) => tickets.get(ticket)?.values[index]?.value ?? 0);
stub('bloom_database_result_string', (ticket: number, index: number) => tickets.get(ticket)?.values[index]?.value ?? '');
stub('bloom_database_result_byte_count', (ticket: number, index: number) => (tickets.get(ticket)?.values[index]?.value as Uint8Array)?.length ?? 0);
stub('bloom_database_result_byte', (ticket: number, index: number, offset: number) => (tickets.get(ticket)?.values[index]?.value as Uint8Array)?.[offset] ?? 0);
stub('bloom_database_release', (ticket: number) => { tickets.delete(ticket); });

async function openedDatabase(): Promise<GameDatabase<typeof schema>> {
  enqueue(1, 0, [{ kind: 1, value: 1 }, { kind: 1, value: 0 }]);
  const database = new GameDatabase({ appId: 'org.example.game', name: 'test', schema });
  check('stub database opens', (await database.open()).ok);
  return database;
}

async function run(): Promise<void> {
const database = await openedDatabase();
enqueue(4, 0, [{ kind: 2, value: 'bad-id' }, { kind: 2, value: 'title' }, { kind: 0, value: null }], 1);
check('select rejects text for integer column', (await database.select('entries')).status === 'corrupt_data');
enqueue(4, 0, [{ kind: 1, value: 1 }, { kind: 0, value: null }, { kind: 0, value: null }], 1);
check('select rejects null for not-null column', (await database.select('entries')).status === 'corrupt_data');

const rollbackDb = await openedDatabase();
calls.length = 0;
enqueue(7);
enqueue(9, 10);
enqueue(2);
const rollback = await rollbackDb.transaction(async () => ({ ok: false as const, status: 'invalid_data' as const, value: null }));
check('failed rollback reports storage_error', rollback.status === 'storage_error');
check('failed rollback closes uncertain handle', rollbackDb.state === 'closed' && calls.includes(2));

const commitDb = await openedDatabase();
calls.length = 0;
enqueue(7);
enqueue(8, 11);
enqueue(9);
const commit = await commitDb.transaction(async () => ({ ok: true as const, status: 'ok' as const, value: 1 }));
check('failed commit attempts rollback', commit.status === 'quota_exceeded' && calls.join(',') === '7,8,9');
check('successful rollback keeps handle usable', commitDb.state === 'open');

const malformedDb = await openedDatabase();
calls.length = 0;
enqueue(7);
enqueue(9);
const malformed = await malformedDb.transaction(async () => ({ ok: true, status: 'invalid_data', value: 1 } as any));
check('malformed callback result is normalized and rolled back', malformed.status === 'storage_error' && calls.join(',') === '7,9');

if (failures > 0) process.exitCode = 1;
}

void run().catch((error) => { console.error(error); process.exitCode = 1; });
