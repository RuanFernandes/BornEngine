export type JsonValue = null | boolean | number | string | JsonValue[] | { [key: string]: JsonValue };

export type GameStorageStatus =
  | 'ok'
  | 'unsupported'
  | 'invalid_namespace'
  | 'invalid_key'
  | 'invalid_data'
  | 'not_found'
  | 'corrupt_data'
  | 'storage_error';

export interface GameStorageResult<T> {
  ok: boolean;
  status: GameStorageStatus;
  value: T | null;
}

/** @internal Backend contract. `writeAtomic` must leave the previous value intact on failure. */
export interface GameStorageBackend {
  isSupported(): boolean;
  read(path: string): string | null;
  writeAtomic(path: string, contents: string): boolean;
  remove(path: string): boolean;
}

const STORAGE_VERSION = 1;
const STORAGE_ROOT = '__bornengine_storage_v1__';

interface StoredEnvelope {
  version: number;
  appId: string;
  slot: string;
  key: string;
  data: JsonValue;
}

function result<T>(ok: boolean, status: GameStorageStatus, value: T | null = null): GameStorageResult<T> {
  return { ok, status, value };
}

function safeSegment(value: string): boolean {
  return typeof value === 'string' && value.length > 0 && value.length <= 64 &&
    /^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(value) && value.indexOf('..') < 0;
}

function safeKey(value: string): boolean {
  return typeof value === 'string' && value.length > 0 && value.length <= 128 &&
    /^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(value) && value.indexOf('..') < 0;
}

function isJsonValue(value: unknown, ancestors: unknown[] = []): value is JsonValue {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return true;
  if (typeof value === 'number') return value === value && value !== Infinity && value !== -Infinity;
  if (typeof value !== 'object') return false;
  if (ancestors.indexOf(value) >= 0) return false;

  ancestors.push(value);
  if (Array.isArray(value)) {
    for (let index = 0; index < value.length; index++) {
      if (!isJsonValue(value[index], ancestors)) {
        ancestors.pop();
        return false;
      }
    }
  } else {
    for (const key in value as any) {
      if (Object.prototype.hasOwnProperty.call(value, key) &&
          !isJsonValue((value as any)[key], ancestors)) {
        ancestors.pop();
        return false;
      }
    }
  }
  ancestors.pop();
  return true;
}

function stringifyJsonValue(root: JsonValue): string {
  const tasks: any[] = [{ kind: 'value', value: root }];
  const chunks: string[] = [];
  while (tasks.length > 0) {
    const task = tasks.pop();
    if (task.kind === 'text') {
      chunks.push(task.text);
      continue;
    }

    const value = task.value;
    if (value === null) chunks.push('null');
    else if (typeof value === 'string') chunks.push(stringifyJsonString(value));
    else if (typeof value === 'number') chunks.push('' + value);
    else if (typeof value === 'boolean') {
      if (value) chunks.push('true');
      else chunks.push('false');
    }
    else if (Array.isArray(value)) {
      tasks.push({ kind: 'text', text: ']' });
      for (let index = value.length - 1; index >= 0; index--) {
        tasks.push({ kind: 'value', value: value[index] });
        if (index > 0) tasks.push({ kind: 'text', text: ',' });
      }
      chunks.push('[');
    } else {
      const keys: string[] = [];
      for (const key in value) {
        if (Object.prototype.hasOwnProperty.call(value, key)) keys.push(key);
      }
      tasks.push({ kind: 'text', text: '}' });
      for (let index = keys.length - 1; index >= 0; index--) {
        const key = keys[index];
        tasks.push({ kind: 'value', value: value[key] });
        tasks.push({ kind: 'text', text: ':' });
        tasks.push({ kind: 'text', text: stringifyJsonString(key) });
        if (index > 0) tasks.push({ kind: 'text', text: ',' });
      }
      chunks.push('{');
    }
  }
  return chunks.join('');
}

function stringifyJsonString(value: string): string {
  let output = '"';
  for (let index = 0; index < value.length; index++) {
    const character = value.charAt(index);
    const code = value.charCodeAt(index);
    if (code === 34) output = output + '\\"';
    else if (code === 92) output = output + '\\\\';
    else if (code === 10) output = output + '\\n';
    else if (code === 13) output = output + '\\r';
    else if (code === 9) output = output + '\\t';
    else if (code === 8) output = output + '\\b';
    else if (code === 12) output = output + '\\f';
    else if (code < 32) {
      let hex = code.toString(16);
      while (hex.length < 4) hex = '0' + hex;
      output = output + '\\u' + hex;
    } else output = output + character;
  }
  return output + '"';
}

class UnsupportedStorageBackend implements GameStorageBackend {
  isSupported(): boolean { return false; }
  read(_path: string): string | null { return null; }
  writeAtomic(_path: string, _contents: string): boolean { return false; }
  remove(_path: string): boolean { return false; }
}

/**
 * Versioned JSON save/settings storage scoped to one application and slot.
 * `createGameStorage` selects the built-in backend. Callers can inject a
 * verified app-data backend for another host.
 */
export class GameStorage {
  private readonly backend: GameStorageBackend;
  private readonly namespaceValid: boolean;

  constructor(
    readonly appId: string,
    readonly slot = 'default',
    backend?: GameStorageBackend,
  ) {
    this.backend = backend ?? new UnsupportedStorageBackend();
    this.namespaceValid = safeSegment(appId) && safeSegment(slot);
  }

  get isSupported(): boolean { return this.backend.isSupported(); }

  /** Read a JSON-safe payload from this app and slot. */
  read<T = JsonValue>(key: string): GameStorageResult<T> {
    const path = this.pathFor(key);
    if (typeof path !== 'string') return path;
    if (!this.backend.isSupported()) return result<T>(false, 'unsupported');

    const contents = this.backend.read(path);
    if (contents === null) return result<T>(false, 'not_found');
    let envelope: StoredEnvelope;
    try {
      envelope = JSON.parse(contents) as StoredEnvelope;
    } catch (_error) {
      return result<T>(false, 'corrupt_data');
    }
    if (envelope === null || typeof envelope !== 'object' ||
        envelope.version !== STORAGE_VERSION || envelope.appId !== this.appId ||
        envelope.slot !== this.slot || envelope.key !== key || !isJsonValue(envelope.data)) {
      return result<T>(false, 'corrupt_data');
    }
    return result<T>(true, 'ok', envelope.data as T);
  }

  /** Atomically replace one key with a versioned JSON envelope. */
  write<T>(key: string, data: T): GameStorageResult<boolean> {
    const path = this.pathFor(key);
    if (typeof path !== 'string') return path;
    if (!this.backend.isSupported()) return result<boolean>(false, 'unsupported');
    if (!isJsonValue(data)) return result<boolean>(false, 'invalid_data');

    let contents: string;
    try {
      contents = stringifyJsonValue({
        version: STORAGE_VERSION,
        appId: this.appId,
        slot: this.slot,
        key,
        data,
      });
    } catch (_error) {
      return result<boolean>(false, 'invalid_data');
    }
    if (!this.backend.writeAtomic(path, contents)) return result<boolean>(false, 'storage_error');
    return result<boolean>(true, 'ok', true);
  }

  /** Check for a valid record in this app and slot. */
  exists(key: string): GameStorageResult<boolean> {
    const readResult = this.read<JsonValue>(key);
    if (readResult.status === 'not_found') return result<boolean>(true, 'ok', false);
    if (!readResult.ok) return result<boolean>(false, readResult.status);
    return result<boolean>(true, 'ok', true);
  }

  /** Remove one key. Removing a missing key succeeds with `value === false`. */
  remove(key: string): GameStorageResult<boolean> {
    const path = this.pathFor(key);
    if (typeof path !== 'string') return path;
    if (!this.backend.isSupported()) return result<boolean>(false, 'unsupported');
    const exists = this.backend.read(path) !== null;
    if (!exists) return result<boolean>(true, 'ok', false);
    if (!this.backend.remove(path)) return result<boolean>(false, 'storage_error');
    return result<boolean>(true, 'ok', true);
  }

  private pathFor(key: string): string | GameStorageResult<any> {
    if (!this.namespaceValid) return result(false, 'invalid_namespace');
    if (!safeKey(key)) return result(false, 'invalid_key');
    return `${STORAGE_ROOT}/${this.appId}/${this.slot}/${key}`;
  }
}
