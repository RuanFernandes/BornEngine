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
  const createdTables: Record<string, Record<string, ColumnDescriptor>> = Object.create(null);
  const droppedTables: string[] = [];
  const droppedColumns: string[] = [];
  const addedColumns: string[] = [];
  const createdIndexes: Record<string, string> = Object.create(null);
  const droppedIndexes: string[] = [];
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
      if (!step || !validIdentifier(step.table) || !step.values || typeof step.values !== 'object' ||
          !['createTable', 'dropTable', 'addColumn', 'dropColumn', 'createIndex', 'dropIndex', 'transform'].includes(step.op)) return null;
      const table = Object.prototype.hasOwnProperty.call(schema, step.table) ? schema[step.table] : undefined;
      if (step.name && !validIdentifier(step.name)) return null;
      const available = createdTables[step.table] ||
        (table && droppedTables.indexOf(step.table) < 0 ? table.columns : undefined);
      if (step.op === 'createTable') {
        if (createdTables[step.table]) return null;
        if (!validateSchema({ [step.table]: { columns: step.values as Record<string, ColumnDescriptor> } })) return null;
        createdTables[step.table] = { ...step.values } as Record<string, ColumnDescriptor>;
        const dropped = droppedTables.indexOf(step.table);
        if (dropped >= 0) droppedTables.splice(dropped, 1);
        for (let k = droppedColumns.length - 1; k >= 0; k--) {
          if (droppedColumns[k].indexOf(step.table + '\u0000') === 0) droppedColumns.splice(k, 1);
        }
        for (let k = addedColumns.length - 1; k >= 0; k--) {
          if (addedColumns[k].indexOf(step.table + '\u0000') === 0) addedColumns.splice(k, 1);
        }
      }
      if (step.op === 'dropTable') {
        if (!available) return null;
        delete createdTables[step.table];
        droppedTables.push(step.table);
        for (const indexName in createdIndexes) {
          if (createdIndexes[indexName] === step.table) delete createdIndexes[indexName];
        }
      }
      if (step.op === 'addColumn') {
        if (!available || !table || !Object.prototype.hasOwnProperty.call(table.columns, step.name)) return null;
        const descriptor = step.values.descriptor as ColumnDescriptor;
        if (!descriptor || !validateSchema({ [step.table]: { columns: { [step.name]: descriptor } } })) return null;
        const key = step.table + '\u0000' + step.name;
        if (createdTables[step.table] && Object.prototype.hasOwnProperty.call(createdTables[step.table], step.name) &&
            droppedColumns.indexOf(key) < 0) return null;
        if (addedColumns.indexOf(key) >= 0) return null;
        addedColumns.push(key);
        if (createdTables[step.table]) createdTables[step.table][step.name] = descriptor;
        const dropped = droppedColumns.indexOf(key);
        if (dropped >= 0) droppedColumns.splice(dropped, 1);
      }
      if (step.op === 'dropColumn') {
        const key = step.table + '\u0000' + step.name;
        if (!available || !Object.prototype.hasOwnProperty.call(available, step.name) || droppedColumns.indexOf(key) >= 0) return null;
        droppedColumns.push(key);
        if (createdTables[step.table]) delete createdTables[step.table][step.name];
        const added = addedColumns.indexOf(key);
        if (added >= 0) addedColumns.splice(added, 1);
      }
      if (step.op === 'createIndex') {
          const descriptor = step.values.descriptor as IndexDescriptor;
          if (!descriptor || !validIdentifier(step.name) || descriptor.name !== step.name ||
              !Array.isArray(descriptor.columns) || descriptor.columns.length === 0 ||
              (descriptor.unique !== undefined && typeof descriptor.unique !== 'boolean') ||
              Object.prototype.hasOwnProperty.call(createdIndexes, step.name) || !available) return null;
          for (let k = 0; k < descriptor.columns.length; k++) {
            if (!validIdentifier(descriptor.columns[k]) || !Object.prototype.hasOwnProperty.call(available, descriptor.columns[k]) ||
                droppedColumns.indexOf(step.table + '\u0000' + descriptor.columns[k]) >= 0) return null;
          }
          createdIndexes[step.name] = step.table;
          const dropped = droppedIndexes.indexOf(step.name);
          if (dropped >= 0) droppedIndexes.splice(dropped, 1);
      }
      if (step.op === 'dropIndex') {
        let finalIndex = false;
        if (table && table.indexes) for (let k = 0; k < table.indexes.length; k++) {
          if (table.indexes[k].name === step.name) finalIndex = true;
        }
        const createdHere = Object.prototype.hasOwnProperty.call(createdIndexes, step.name) &&
          createdIndexes[step.name] === step.table;
        if (!available || droppedIndexes.indexOf(step.name) >= 0 ||
            (!finalIndex && !createdHere)) return null;
        delete createdIndexes[step.name];
        droppedIndexes.push(step.name);
      }
      if (step.op === 'transform') {
        if (!table || !available) return null;
        for (const key in step.values) {
          const column = Object.prototype.hasOwnProperty.call(table.columns, key) ? table.columns[key] : undefined;
          if (!column || (step.values[key] === null ? !!(column.options.notNull || column.options.primaryKey) :
              !validColumnValue(column.kind, step.values[key]))) return null;
        }
      }
    }
    groups.push(builder.steps);
  }
  return groups;
}
