import type { ColumnDescriptor, DatabaseSchema, DatabaseRow, IndexDescriptor } from './schema';
import { validColumnValue, validIdentifier, validateSchema } from './schema';

export type MigrationStep = {
  op: 'createTable' | 'dropTable' | 'addColumn' | 'dropColumn' |
    'createIndex' | 'dropIndex' | 'transform';
  table: string;
  name: string;
  values: Record<string, unknown>;
};

/** Finite migration plan: the backend never receives caller-authored SQL. */
export class MigrationBuilder<S extends DatabaseSchema> {
  readonly steps: MigrationStep[] = [];
  createTable(table: string, columns: Record<string, ColumnDescriptor>): void {
    this.steps.push({ op: 'createTable', table, name: '', values: columns });
  }
  dropTable(table: string): void { this.steps.push({ op: 'dropTable', table, name: '', values: {} }); }
  addColumn<T extends Extract<keyof S, string>, C extends Extract<keyof S[T]['columns'], string>>(
    table: T, column: C, descriptor: S[T]['columns'][C],
  ): void { this.steps.push({ op: 'addColumn', table, name: column, values: { descriptor } }); }
  dropColumn(table: string, column: string): void { this.steps.push({ op: 'dropColumn', table, name: column, values: {} }); }
  createIndex(table: string, index: IndexDescriptor): void {
    this.steps.push({ op: 'createIndex', table, name: index.name, values: { descriptor: index } });
  }
  dropIndex(table: string, index: string): void { this.steps.push({ op: 'dropIndex', table, name: index, values: {} }); }
  transform<T extends Extract<keyof S, string>>(table: T, values: Partial<DatabaseRow<S, T>>): void {
    this.steps.push({ op: 'transform', table, name: '', values });
  }
}

export interface DatabaseMigration<S extends DatabaseSchema = DatabaseSchema> { version: number; apply: (builder: MigrationBuilder<S>) => void; }

export function defineMigration<S extends DatabaseSchema>(version: number, _schema: S, apply: (builder: MigrationBuilder<S>) => void): DatabaseMigration<S> {
  return { version, apply };
}

export function validateMigrations<S extends DatabaseSchema>(schema: S, migrations: readonly DatabaseMigration<S>[]): MigrationStep[][] | null {
  const groups: MigrationStep[][] = [];
  const createdTables: Record<string, Record<string, ColumnDescriptor>> = {};
  let previous = 0;
  for (let i = 0; i < migrations.length; i++) {
    const migration = migrations[i];
    if (!migration || !Number.isSafeInteger(migration.version) || migration.version <= previous ||
        typeof migration.apply !== 'function') return null;
    previous = migration.version;
    const builder = new MigrationBuilder<S>();
    try { migration.apply(builder); } catch (_error) { return null; }
    if (builder.steps.length === 0) return null;
    for (let j = 0; j < builder.steps.length; j++) {
      const step = builder.steps[j];
      if (!validIdentifier(step.table)) return null;
      const table = Object.prototype.hasOwnProperty.call(schema, step.table) ? schema[step.table] : undefined;
      if (step.name && !validIdentifier(step.name)) return null;
      if (step.op === 'createTable') {
        if (!validateSchema({ [step.table]: { columns: step.values as Record<string, ColumnDescriptor> } })) return null;
        createdTables[step.table] = step.values as Record<string, ColumnDescriptor>;
      }
      if (step.op === 'dropTable') delete createdTables[step.table];
      if (step.op === 'addColumn') {
        if (!table || !table.columns[step.name]) return null;
        if (step.values.descriptor !== table.columns[step.name]) {
          const descriptor = step.values.descriptor as ColumnDescriptor;
          if (!descriptor || !validateSchema({ [step.table]: { columns: { [step.name]: descriptor } } })) return null;
        }
      }
      if (step.op === 'createIndex') {
          const descriptor = step.values.descriptor as IndexDescriptor;
          if (!descriptor || descriptor.name !== step.name || !descriptor.columns || descriptor.columns.length === 0) return null;
          const available = createdTables[step.table] || (table ? table.columns : null);
          if (!available) return null;
          for (let k = 0; k < descriptor.columns.length; k++) {
            if (!validIdentifier(descriptor.columns[k]) || !Object.prototype.hasOwnProperty.call(available, descriptor.columns[k])) return null;
          }
      }
      if (step.op === 'transform') {
        if (!table) return null;
        for (const key in step.values) {
          const column = table.columns[key];
          if (!column || (step.values[key] === null ? !!(column.options.notNull || column.options.primaryKey) :
              !validColumnValue(column.kind, step.values[key]))) return null;
        }
      }
    }
    groups.push(builder.steps);
  }
  return groups;
}
