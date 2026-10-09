import './native-link';
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
const columnsWithInherited = Object.assign(Object.create({ ghost: columns.text({ nullable: true }) }), schema.entries.columns);
const inheritedColumnSchema = { entries: { ...schema.entries, columns: columnsWithInherited } } as typeof schema;
check('values reject an inherited column', !validateValues(inheritedColumnSchema, 'entries', { ghost: 'extra' }, false));
check('values reject a prototype method name without throwing', rejectsWithoutThrow(() =>
  validateValues(schema, 'entries', { toString: null }, false)));
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

// The harness links the default native build, which omits the `sqlite` feature; the documented
// contract for that build is that the API stays present and native operations return `unsupported`.
async function run(): Promise<void> {
const database = new GameDatabase({ appId: 'org.bornengine.harness', name: 'database_contract', schema });
check('native database starts new', database.state === 'new');
check('native open without the sqlite feature reports unsupported', (await database.open()).status === 'unsupported');
check('unsupported open leaves the database new', database.state === 'new');
check('unsupported open can be retried', (await database.open()).status === 'unsupported' && database.state === 'new');
const operations = [
  await database.insert('entries', { title: 'unopened' }),
  await database.select('entries'),
  await database.update('entries', { title: 'unopened' }, { id: { eq: 1 } }),
  await database.delete('entries', { id: { eq: 1 } }),
  await database.findByPrimaryKey('entries', 1),
  await database.export(),
  await database.import(new Uint8Array(100)),
  await database.close(),
];
check('operations on an unopened native database report not_open',
  operations.every((operation) => !operation.ok && operation.status === 'not_open' && operation.value === null));
let callbackRan = false;
const transaction = await database.transaction(async () => {
  callbackRan = true;
  return { ok: true as const, status: 'ok' as const, value: 1 };
});
check('transaction on an unopened native database reports not_open without running its callback',
  transaction.status === 'not_open' && !callbackRan);
const volatile = new GameDatabase({ appId: 'org.bornengine.harness', name: 'database_contract', schema, inMemory: true });
check('in-memory open without the sqlite feature reports unsupported',
  (await volatile.open()).status === 'unsupported' && volatile.state === 'new');

if (failures > 0) process.exitCode = 1;
}

void run().catch((error) => { console.error(error); process.exitCode = 1; });
