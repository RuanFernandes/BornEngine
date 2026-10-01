export const PREVIEW_PROTOCOL_VERSION = 1;
export const CLIENT_SCRIPT_SOURCE_MAX_BYTES = 64 * 1024;
export const CLIENT_SCRIPT_OUTPUT_MAX_BYTES = 128 * 1024;
const MAX_DIAGNOSTIC_BYTES = 2 * 1024;

export type PreviewRequest =
  | { type: 'preview:apply-client-script'; revision: number; javascript: string }
  | { type: 'preview:publish-client-script'; revision: number; source: string }
  | { type: 'preview:connect-room'; endpoint: string; roomName: string }
  | { type: 'preview:disconnect-room' };

export type PreviewStatus =
  | 'booting'
  | 'ready'
  | 'running'
  | 'error'
  | 'connecting'
  | 'connected'
  | 'disconnected';

export type PreviewResponse =
  | { type: 'preview:ready'; protocol: typeof PREVIEW_PROTOCOL_VERSION }
  | { type: 'preview:status'; status: PreviewStatus; message?: string }
  | { type: 'preview:publisher'; canPublish: boolean }
  | { type: 'preview:script-result'; revision: number; result: 'applied' | 'published' | 'rejected'; error?: string };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function hasOnlyKeys(value: Record<string, unknown>, keys: readonly string[]): boolean {
  const actual = Object.keys(value);
  return actual.length === keys.length && actual.every((key) => keys.includes(key));
}

function hasKeys(value: Record<string, unknown>, required: readonly string[], optional: readonly string[] = []): boolean {
  const actual = Object.keys(value);
  return required.every((key) => Object.hasOwn(value, key)) &&
    actual.every((key) => required.includes(key) || optional.includes(key));
}

function isRevision(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;
}

function utf8Length(value: string): number {
  return new TextEncoder().encode(value).byteLength;
}

function isBoundedString(value: unknown, maxBytes: number, allowEmpty = false): value is string {
  return typeof value === 'string' && (allowEmpty || value.length > 0) && utf8Length(value) <= maxBytes;
}

function isRoomEndpoint(value: unknown): value is string {
  if (typeof value !== 'string' || value.length > 2048) return false;
  try {
    const url = new URL(value);
    return (url.protocol === 'ws:' || url.protocol === 'wss:') &&
      url.hostname.length > 0 && url.username.length === 0 && url.password.length === 0 && url.hash.length === 0;
  } catch (_error) {
    return false;
  }
}

export function isPreviewRequest(value: unknown): value is PreviewRequest {
  if (!isRecord(value) || typeof value.type !== 'string') return false;

  switch (value.type) {
    case 'preview:apply-client-script':
      return hasOnlyKeys(value, ['type', 'revision', 'javascript']) && isRevision(value.revision) &&
        isBoundedString(value.javascript, CLIENT_SCRIPT_OUTPUT_MAX_BYTES);
    case 'preview:publish-client-script':
      return hasOnlyKeys(value, ['type', 'revision', 'source']) && isRevision(value.revision) &&
        isBoundedString(value.source, CLIENT_SCRIPT_SOURCE_MAX_BYTES);
    case 'preview:connect-room':
      return hasOnlyKeys(value, ['type', 'endpoint', 'roomName']) && isRoomEndpoint(value.endpoint) &&
        typeof value.roomName === 'string' && /^[a-zA-Z0-9:_-]{1,64}$/.test(value.roomName);
    case 'preview:disconnect-room':
      return hasOnlyKeys(value, ['type']);
    default:
      return false;
  }
}

export function isPreviewResponse(value: unknown): value is PreviewResponse {
  if (!isRecord(value) || typeof value.type !== 'string') return false;

  switch (value.type) {
    case 'preview:ready':
      return hasOnlyKeys(value, ['type', 'protocol']) && value.protocol === PREVIEW_PROTOCOL_VERSION;
    case 'preview:status': {
      if (!hasKeys(value, ['type', 'status'], ['message'])) return false;
      const statuses: readonly unknown[] = ['booting', 'ready', 'running', 'error', 'connecting', 'connected', 'disconnected'];
      return statuses.includes(value.status) &&
        (value.message === undefined || isBoundedString(value.message, MAX_DIAGNOSTIC_BYTES, true));
    }
    case 'preview:publisher':
      return hasOnlyKeys(value, ['type', 'canPublish']) && typeof value.canPublish === 'boolean';
    case 'preview:script-result':
      return hasKeys(value, ['type', 'revision', 'result'], ['error']) && isRevision(value.revision) &&
        ['applied', 'published', 'rejected'].includes(String(value.result)) &&
        (value.error === undefined || isBoundedString(value.error, MAX_DIAGNOSTIC_BYTES, true));
    default:
      return false;
  }
}

/** Rejects room callbacks that arrive after a different connection becomes active. */
export function isCurrentRoomCallback(
  capturedGeneration: number,
  currentGeneration: number,
  capturedRoom: object,
  activeRoom: object | null,
): boolean {
  return capturedGeneration === currentGeneration && capturedRoom === activeRoom;
}

/** Accepts only strictly newer client-script revisions. */
export class PreviewRevisionGate {
  private currentRevision: number;

  constructor(initialRevision = -1) {
    this.currentRevision = isRevision(initialRevision) ? initialRevision : -1;
  }

  get revision(): number {
    return this.currentRevision;
  }

  accept(revision: number): boolean {
    if (!isRevision(revision) || revision <= this.currentRevision) return false;
    this.currentRevision = revision;
    return true;
  }

  reset(revision = -1): void {
    this.currentRevision = revision === -1 || isRevision(revision) ? revision : -1;
  }

  setRevision(revision: number): boolean {
    if (!isRevision(revision)) return false;
    this.currentRevision = revision;
    return true;
  }
}
