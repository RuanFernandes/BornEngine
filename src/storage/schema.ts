/** SQLite column declarations. Identifiers are validated before any backend request. */
export type ColumnKind = 'integer' | 'real' | 'text' | 'blob' | 'boolean';
export type ColumnValue<K extends ColumnKind> = K extends 'blob'
  ? Uint8Array
  : K extends 'text'
    ? string
    : K extends 'boolean'
      ? boolean
      : number;

export interface ColumnOptions<K extends ColumnKind> {
  primaryKey?: boolean;
  autoIncrement?: boolean;
  notNull?: boolean;
  nullable?: boolean;
  unique?: boolean;
  default?: ColumnValue<K> | null;
}

export interface ColumnDescriptor<K extends ColumnKind = ColumnKind, O = ColumnOptions<K>> {
  kind: K;
  options: O;
}

function column<K extends ColumnKind, const O extends ColumnOptions<K>>(kind: K, options: O): ColumnDescriptor<K, O> {
  return { kind, options };
}

export const columns = {
  integer: <const O extends ColumnOptions<'integer'>>(options: O = {} as O) => column('integer', options),
  real: <const O extends ColumnOptions<'real'>>(options: O = {} as O) => column('real', options),
  text: <const O extends ColumnOptions<'text'>>(options: O = {} as O) => column('text', options),
  blob: <const O extends ColumnOptions<'blob'>>(options: O = {} as O) => column('blob', options),
  boolean: <const O extends ColumnOptions<'boolean'>>(options: O = {} as O) => column('boolean', options),
};

export interface IndexDescriptor<C extends string = string> {
  name: string;
  columns: readonly C[];
  unique?: boolean;
}

export interface TableDescriptor<C extends Record<string, ColumnDescriptor> = Record<string, ColumnDescriptor>> {
  columns: C;
  indexes?: readonly IndexDescriptor<Extract<keyof C, string>>[];
}

export type DatabaseSchema = Record<string, TableDescriptor<any>>;

export function defineTable<C extends Record<string, ColumnDescriptor>>(table: TableDescriptor<C>): TableDescriptor<C> {
  return table;
}

export function defineSchema<S extends DatabaseSchema>(schema: S): S {
  return schema;
}

type InferredColumn<C> =
  C extends ColumnDescriptor<infer K, infer O>
    ? ColumnValue<K> | (O extends { notNull: true } | { primaryKey: true } ? never : null)
    : never;

export type DatabaseRow<S extends DatabaseSchema, T extends keyof S> = {
  [K in keyof S[T]['columns']]: InferredColumn<S[T]['columns'][K]>;
};

type OptionalInsertKey<C> =
  C extends ColumnDescriptor<any, infer O>
    ? O extends { autoIncrement: true } | { default: unknown }
      ? true
      : O extends { notNull: true } | { primaryKey: true }
        ? false
        : true
    : false;

export type DatabaseInsert<S extends DatabaseSchema, T extends keyof S> = {
  [K in keyof S[T]['columns'] as OptionalInsertKey<S[T]['columns'][K]> extends true ? never : K]: InferredColumn<
    S[T]['columns'][K]
  >;
} & {
  [K in keyof S[T]['columns'] as OptionalInsertKey<S[T]['columns'][K]> extends true ? K : never]?: InferredColumn<
    S[T]['columns'][K]
  >;
};

export type DatabaseUpdate<S extends DatabaseSchema, T extends keyof S> = Partial<DatabaseRow<S, T>>;

export function validIdentifier(name: string): boolean {
  return typeof name === 'string' && name.length > 0 && name.length <= 64 && /^[A-Za-z_][A-Za-z0-9_]*$/.test(name);
}

export function validNamespace(name: string): boolean {
  return (
    typeof name === 'string' &&
    name.length > 0 &&
    name.length <= 128 &&
    /^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(name) &&
    name.indexOf('..') < 0
  );
}

export function validateSchema(schema: DatabaseSchema): boolean {
  if (schema === null || typeof schema !== 'object') return false;
  let tableCount = 0;
  const indexNames: string[] = [];
  for (const tableName in schema) {
    if (!Object.prototype.hasOwnProperty.call(schema, tableName)) continue;
    tableCount++;
    if (!validIdentifier(tableName)) return false;
    const table = schema[tableName];
    if (!table || !table.columns || typeof table.columns !== 'object') return false;
    let columnCount = 0;
    let primaryCount = 0;
    for (const columnName in table.columns) {
      if (!Object.prototype.hasOwnProperty.call(table.columns, columnName)) continue;
      columnCount++;
      if (!validIdentifier(columnName)) return false;
      const descriptor = table.columns[columnName];
      if (!descriptor || !['integer', 'real', 'text', 'blob', 'boolean'].includes(descriptor.kind)) return false;
      const options = descriptor.options;
      if (!options || typeof options !== 'object' || Array.isArray(options)) return false;
      const flags = ['primaryKey', 'autoIncrement', 'notNull', 'nullable', 'unique'];
      for (const option in options) {
        if (option !== 'default' && flags.indexOf(option) < 0) return false;
      }
      for (let i = 0; i < flags.length; i++) {
        const flag = flags[i];
        if (
          (options as Record<string, unknown>)[flag] !== undefined &&
          typeof (options as Record<string, unknown>)[flag] !== 'boolean'
        )
          return false;
      }
      if (options.primaryKey) primaryCount++;
      if (options.autoIncrement && (!options.primaryKey || descriptor.kind !== 'integer')) return false;
      if (options.nullable && (options.notNull || options.primaryKey)) return false;
      if (
        options.default !== undefined &&
        (options.default === null
          ? !!(options.notNull || options.primaryKey)
          : !validColumnValue(descriptor.kind, options.default))
      )
        return false;
    }
    if (columnCount === 0 || primaryCount > 1) return false;
    const indexes = table.indexes || [];
    if (!Array.isArray(indexes)) return false;
    for (let i = 0; i < indexes.length; i++) {
      const index = indexes[i];
      if (
        !index ||
        !validIdentifier(index.name) ||
        !Array.isArray(index.columns) ||
        index.columns.length === 0 ||
        (index.unique !== undefined && typeof index.unique !== 'boolean')
      )
        return false;
      if (indexNames.indexOf(index.name) >= 0 || Object.prototype.hasOwnProperty.call(schema, index.name)) return false;
      indexNames.push(index.name);
      for (let j = 0; j < index.columns.length; j++) {
        if (!Object.prototype.hasOwnProperty.call(table.columns, index.columns[j])) return false;
      }
    }
  }
  return tableCount > 0;
}

export function validColumnValue(kind: ColumnKind, value: unknown): boolean {
  if (kind === 'blob') return value instanceof Uint8Array;
  if (kind === 'text') return typeof value === 'string';
  if (kind === 'boolean') return typeof value === 'boolean';
  if (typeof value !== 'number' || !Number.isFinite(value)) return false;
  return kind === 'real' || Number.isSafeInteger(value);
}
