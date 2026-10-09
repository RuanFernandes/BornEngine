import type { ColumnDescriptor, DatabaseRow, DatabaseSchema } from './schema';
import { validColumnValue } from './schema';

export type Comparison<T> = { eq?: T; ne?: T; gt?: T; gte?: T; lt?: T; lte?: T; in?: readonly T[]; isNull?: boolean };
export type DatabaseFilter<R> = {
  [K in keyof R]?: Comparison<R[K]>;
} & { and?: readonly DatabaseFilter<R>[]; or?: readonly DatabaseFilter<R>[]; not?: DatabaseFilter<R> };
export interface DatabaseOrder<R> {
  column: Extract<keyof R, string>;
  direction?: 'asc' | 'desc';
}
export interface DatabaseSelect<R> {
  where?: DatabaseFilter<R>;
  orderBy?: readonly DatabaseOrder<R>[];
  limit?: number;
  offset?: number;
}

export function validateValues<S extends DatabaseSchema, T extends keyof S>(
  schema: S,
  tableName: T,
  values: Record<string, unknown>,
  requireRequired: boolean,
): boolean {
  if (!schema || typeof schema !== 'object') return false;
  const table = Object.prototype.hasOwnProperty.call(schema, tableName) ? schema[tableName] : undefined;
  if (!table || !values || typeof values !== 'object' || Array.isArray(values)) return false;
  for (const key in values) {
    if (!Object.prototype.hasOwnProperty.call(values, key)) continue;
    const descriptor = Object.prototype.hasOwnProperty.call(table.columns, key)
      ? (table.columns[key] as ColumnDescriptor)
      : undefined;
    if (!descriptor) return false;
    const value = values[key];
    if (value === null) {
      if (descriptor.options.notNull || descriptor.options.primaryKey) return false;
    } else if (!validColumnValue(descriptor.kind, value)) return false;
  }
  if (requireRequired)
    for (const key in table.columns) {
      if (!Object.prototype.hasOwnProperty.call(table.columns, key)) continue;
      const options = table.columns[key].options;
      if (
        !options.autoIncrement &&
        options.default === undefined &&
        (options.notNull || options.primaryKey) &&
        !Object.prototype.hasOwnProperty.call(values, key)
      )
        return false;
    }
  return true;
}

export function validateFilter<S extends DatabaseSchema, T extends keyof S>(
  schema: S,
  tableName: T,
  filter: unknown,
  depth = 0,
  seen: unknown[] = [],
): boolean {
  if (!schema || typeof schema !== 'object') return false;
  const table = Object.prototype.hasOwnProperty.call(schema, tableName) ? schema[tableName] : undefined;
  if (
    !table ||
    !filter ||
    typeof filter !== 'object' ||
    Array.isArray(filter) ||
    depth > 32 ||
    seen.indexOf(filter) >= 0
  )
    return false;
  seen.push(filter);
  const record = filter as Record<string, unknown>;
  for (const key in record) {
    if (!Object.prototype.hasOwnProperty.call(record, key)) continue;
    const value = record[key];
    if (key === 'and' || key === 'or') {
      if (!Array.isArray(value) || value.length === 0) return false;
      for (let i = 0; i < value.length; i++)
        if (!validateFilter(schema, tableName, value[i], depth + 1, seen)) return false;
      continue;
    }
    if (key === 'not') {
      if (!validateFilter(schema, tableName, value, depth + 1, seen)) return false;
      continue;
    }
    const column = Object.prototype.hasOwnProperty.call(table.columns, key) ? table.columns[key] : undefined;
    if (!column || !value || typeof value !== 'object' || Array.isArray(value)) return false;
    let comparisons = 0;
    for (const operator in value as Record<string, unknown>) {
      if (!Object.prototype.hasOwnProperty.call(value, operator)) continue;
      comparisons++;
      const compared = (value as Record<string, unknown>)[operator];
      if (operator === 'isNull') {
        if (typeof compared !== 'boolean') return false;
      } else if (operator === 'in') {
        if (!Array.isArray(compared) || compared.length === 0) return false;
        for (let i = 0; i < compared.length; i++) if (!validCompared(column, compared[i])) return false;
      } else if (
        operator === 'eq' ||
        operator === 'ne' ||
        operator === 'gt' ||
        operator === 'gte' ||
        operator === 'lt' ||
        operator === 'lte'
      ) {
        if (!validCompared(column, compared)) return false;
      } else return false;
    }
    if (comparisons !== 1) return false;
  }
  seen.pop();
  return true;
}

function validCompared(column: ColumnDescriptor, value: unknown): boolean {
  return value === null ? !(column.options.notNull || column.options.primaryKey) : validColumnValue(column.kind, value);
}

export function validateSelect<S extends DatabaseSchema, T extends keyof S>(
  schema: S,
  tableName: T,
  options: DatabaseSelect<DatabaseRow<S, T>>,
): boolean {
  if (
    !schema ||
    typeof schema !== 'object' ||
    !Object.prototype.hasOwnProperty.call(schema, tableName) ||
    !options ||
    typeof options !== 'object' ||
    Array.isArray(options)
  )
    return false;
  for (const key in options) {
    if (!Object.prototype.hasOwnProperty.call(options, key)) continue;
    if (key !== 'where' && key !== 'orderBy' && key !== 'limit' && key !== 'offset') return false;
  }
  if (options.where !== undefined && !validateFilter(schema, tableName, options.where)) return false;
  if (options.limit !== undefined && (!Number.isSafeInteger(options.limit) || options.limit < 0)) return false;
  if (options.offset !== undefined && (!Number.isSafeInteger(options.offset) || options.offset < 0)) return false;
  if (options.orderBy !== undefined) {
    if (!Array.isArray(options.orderBy)) return false;
    for (let i = 0; i < options.orderBy.length; i++) {
      const order = options.orderBy[i];
      if (
        !order ||
        !Object.prototype.hasOwnProperty.call(schema[tableName].columns, order.column) ||
        (order.direction !== undefined && order.direction !== 'asc' && order.direction !== 'desc')
      )
        return false;
    }
  }
  return true;
}
