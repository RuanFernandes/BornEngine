import { GameDatabase, columns, defineSchema, defineTable, defineMigration } from '../../src/storage';
import type { DatabaseResult, DatabaseRow, DatabaseFilter } from '../../src/storage';

const initialColumns = {
  id: columns.integer({ primaryKey: true, autoIncrement: true }),
  slot: columns.text({ notNull: true, unique: true }),
  level: columns.integer({ notNull: true, default: 1 }),
  score: columns.real({ notNull: true }),
  payload: columns.blob({ nullable: true }),
  notes: columns.text(),
};

const schema = defineSchema({
  saves: defineTable({
    columns: {
      ...initialColumns,
      completed: columns.boolean({ notNull: true, default: false }),
    },
    indexes: [{ name: 'saves_level_idx', columns: ['level'] }],
  }),
});

type Save = DatabaseRow<typeof schema, 'saves'>;
declare const saved: Save;
const slot: string = saved.slot;
const score: number = saved.score;
const payload: Uint8Array | null = saved.payload;
const notes: string | null = saved.notes;
const completed: boolean = saved.completed;
// @ts-expect-error real column rows are numeric
const invalidScore: string = saved.score;
const filter: DatabaseFilter<Save> = {
  and: [{ score: { gte: 100 } }, { completed: { eq: false } }],
};
// @ts-expect-error score comparisons require numbers
const invalidFilter: DatabaseFilter<Save> = { score: { gte: 'high' } };

const migrations = [
  defineMigration(1, schema, (migration) => {
    migration.createTable('saves', initialColumns);
    migration.createIndex('saves', { name: 'saves_level_idx', columns: ['level'] });
  }),
  defineMigration(2, schema, (migration) => {
    migration.addColumn('saves', 'completed', schema.saves.columns.completed);
    migration.transform('saves', { completed: false });
    // @ts-expect-error transforms use declared columns
    migration.transform('saves', { missing: true });
  }),
];

const database = new GameDatabase({
  appId: 'org.example.game',
  name: 'progress',
  schema,
  migrations,
});

async function contract(): Promise<DatabaseResult<Uint8Array>> {
  const opened: DatabaseResult<void> = await database.open();
  if (!opened.ok) return { ok: false, status: opened.status, value: null };
  const inserted = await database.insert('saves', {
    slot: 'main', score: 100, completed: false,
  });
  if (!inserted.ok) return { ok: false, status: inserted.status, value: null };
  const rows: DatabaseResult<Save[]> = await database.select('saves', {
    where: filter, orderBy: [{ column: 'score', direction: 'desc' }], limit: 10,
  });
  // @ts-expect-error ordering uses declared columns
  database.select('saves', { orderBy: [{ column: 'missing' }] });
  const found: DatabaseResult<Save | null> = await database.findByPrimaryKey('saves', 1);
  const changed: DatabaseResult<number> = await database.update('saves', { score: 120 }, { slot: { eq: 'main' } });
  const removed: DatabaseResult<number> = await database.delete('saves', { slot: { eq: 'old' } });
  const transaction: DatabaseResult<number> = await database.transaction(async (tx) => {
    const write = await tx.insert('saves', { slot: 'backup', score: 50, completed: false });
    return write.ok ? { ok: true, status: 'ok', value: 1 } : { ok: false, status: write.status, value: null };
  });
  const backup: DatabaseResult<Uint8Array> = await database.export();
  if (backup.ok && backup.value !== null) {
    const restored: DatabaseResult<void> = await database['import'](backup.value);
    if (!restored.ok) return { ok: false, status: restored.status, value: null };
  }
  const closed: DatabaseResult<void> = await database.close();
  void rows; void found; void changed; void removed; void transaction; void closed;
  return backup;
}

export type DatabaseContractFixture = [typeof slot, typeof score, typeof payload, typeof notes, typeof completed, typeof contract];
