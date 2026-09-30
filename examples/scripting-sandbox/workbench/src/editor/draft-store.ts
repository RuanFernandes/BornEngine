const DRAFT_PREFIX = 'bornengine:sandbox:draft:v1:';
const MAX_SOURCE_BYTES = 64 * 1024;
const DRAFT_FORMAT = 'bornengine-client-script';

interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export type DraftImportResult =
  | { readonly ok: true; readonly source: string }
  | { readonly ok: false; readonly error: string };

function byteLength(value: string): number {
  return new TextEncoder().encode(value).byteLength;
}

function validId(value: string): boolean {
  return /^[a-zA-Z0-9][a-zA-Z0-9:_-]{0,63}$/.test(value);
}

function validSource(source: unknown): source is string {
  return typeof source === 'string' && source.trim().length > 0 && byteLength(source) <= MAX_SOURCE_BYTES;
}

/** Per-browser client-script drafts; no shared code is written to the server. */
export class ClientDraftStore {
  private readonly storage: StorageLike | null;

  constructor(storage?: StorageLike | null) {
    if (storage !== undefined) {
      this.storage = storage;
    } else {
      try {
        this.storage = typeof localStorage === 'undefined' ? null : localStorage;
      } catch (_error) {
        this.storage = null;
      }
    }
  }

  load(modelId: string): string | null {
    if (this.storage === null || !validId(modelId)) return null;
    try {
      const value = this.storage.getItem(`${DRAFT_PREFIX}${modelId}`);
      return value !== null && validSource(value) ? value : null;
    } catch (_error) {
      return null;
    }
  }

  save(modelId: string, source: string): boolean {
    if (this.storage === null || !validId(modelId) || !validSource(source)) return false;
    try {
      this.storage.setItem(`${DRAFT_PREFIX}${modelId}`, source);
      return true;
    } catch (_error) {
      return false;
    }
  }

  remove(modelId: string): boolean {
    if (this.storage === null || !validId(modelId)) return false;
    try {
      this.storage.removeItem(`${DRAFT_PREFIX}${modelId}`);
      return true;
    } catch (_error) {
      return false;
    }
  }
}

export function exportClientDraft(source: string): string {
  if (!validSource(source)) throw new Error('Client script must be non-empty and no larger than 64 KiB.');
  return JSON.stringify({ format: DRAFT_FORMAT, version: 1, source }, null, 2);
}

export function importClientDraft(contents: string): DraftImportResult {
  if (typeof contents !== 'string' || byteLength(contents) > MAX_SOURCE_BYTES + 4096) {
    return { ok: false, error: 'Import file exceeds the 64 KiB script limit.' };
  }
  let source = contents;
  const trimmed = contents.trim();
  if (trimmed.startsWith('{')) {
    try {
      const value = JSON.parse(trimmed) as unknown;
      if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
        const record = value as Record<string, unknown>;
        if (record.format !== DRAFT_FORMAT || record.version !== 1 || Object.keys(record).length !== 3 ||
            !Object.hasOwn(record, 'source')) {
          return { ok: false, error: 'This JSON file is not a BornEngine client-script draft.' };
        }
        source = typeof record.source === 'string' ? record.source : '';
      }
    } catch (_error) {
      // A TypeScript behavior can start with a block; treat non-JSON text as source.
    }
  }
  if (!validSource(source)) return { ok: false, error: 'Script must be non-empty and no larger than 64 KiB.' };
  return { ok: true, source };
}
