import { Client, type Client as ColyseusClient, type Room } from '@colyseus/sdk';

const MAX_SOURCE_BYTES = 64 * 1024;
const MAX_OUTPUT_BYTES = 128 * 1024;

export type ScriptingManagerStatusKind =
  | 'disconnected'
  | 'connecting'
  | 'waiting'
  | 'connected'
  | 'publishing'
  | 'published'
  | 'rejected'
  | 'error';

export interface ScriptingManagerStatus {
  readonly state: ScriptingManagerStatusKind;
  readonly revision: number;
  readonly message: string;
}

interface ScriptSnapshot {
  readonly revision: number;
  readonly source: string;
  readonly javascript: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isSnapshot(value: unknown): value is ScriptSnapshot {
  if (!isRecord(value) || Object.keys(value).length !== 3 ||
      !Object.hasOwn(value, 'revision') || !Object.hasOwn(value, 'source') || !Object.hasOwn(value, 'javascript')) return false;
  return typeof value.revision === 'number' && Number.isSafeInteger(value.revision) && value.revision >= 0 &&
    typeof value.source === 'string' && new TextEncoder().encode(value.source).byteLength <= MAX_SOURCE_BYTES &&
    typeof value.javascript === 'string' && new TextEncoder().encode(value.javascript).byteLength <= MAX_OUTPUT_BYTES;
}

function websocketEndpoint(value: string): boolean {
  try {
    const url = new URL(value);
    return (url.protocol === 'ws:' || url.protocol === 'wss:') &&
      url.hostname.length > 0 && url.username.length === 0 && url.password.length === 0 && url.hash.length === 0;
  } catch (_error) {
    return false;
  }
}

/** Owns the workbench's direct connection to the shared script room. */
export class ScriptingManagerConnection {
  private client: ColyseusClient | null = null;
  private room: Room<any, any> | null = null;
  private currentStatus: ScriptingManagerStatus = {
    state: 'disconnected',
    revision: -1,
    message: 'Room disconnected',
  };
  private generation = 0;
  private readonly listeners = new Set<(status: ScriptingManagerStatus) => void>();
  private pendingPublish = false;
  private publishTimeout: ReturnType<typeof setTimeout> | null = null;

  get status(): ScriptingManagerStatus {
    return this.currentStatus;
  }

  get canPublish(): boolean {
    return this.room !== null && this.currentStatus.revision >= 0 && !this.pendingPublish &&
      ['connected', 'published', 'rejected'].includes(this.currentStatus.state);
  }

  onStatus(listener: (status: ScriptingManagerStatus) => void): () => void {
    this.listeners.add(listener);
    listener(this.currentStatus);
    return () => this.listeners.delete(listener);
  }

  async connect(endpoint: string): Promise<void> {
    this.dispose();
    const generation = ++this.generation;
    const normalizedEndpoint = endpoint.trim();
    if (!websocketEndpoint(normalizedEndpoint)) {
      this.setStatus('error', -1, 'Enter a valid ws:// or wss:// server address.');
      return;
    }

    this.setStatus('connecting', -1, 'Connecting to scripting manager…');
    let client: ColyseusClient;
    try {
      client = new Client(normalizedEndpoint);
    } catch (error) {
      this.setStatus('error', -1, this.errorMessage(error, 'Could not create a room connection.'));
      return;
    }
    this.client = client;

    try {
      const room = await client.joinOrCreate('scripting-manager') as Room<any, any>;
      if (generation !== this.generation) {
        void room.leave();
        return;
      }
      this.room = room;
      room.onMessage('clientScriptSnapshot', (value: unknown) => this.receiveSnapshot(generation, value));
      room.onMessage('clientScriptReload', (value: unknown) => this.receiveSnapshot(generation, value));
      room.onMessage('clientScriptResult', (value: unknown) => this.receivePublishResult(generation, value));
      room.onLeave((_code, reason) => {
        if (generation !== this.generation) return;
        this.room = null;
        this.client = null;
        this.clearPublishTimeout();
        this.pendingPublish = false;
        this.setStatus('disconnected', -1, reason || 'Scripting manager disconnected');
      });
      this.setStatus('waiting', -1, 'Connected · waiting for the current script…');
      room.send('requestClientScriptSnapshot', {});
    } catch (error) {
      if (generation !== this.generation) return;
      this.room = null;
      this.client = null;
      this.setStatus('error', -1, this.errorMessage(error, 'Could not join the scripting manager room.'));
    }
  }

  publish(source: string): void {
    const room = this.room;
    if (room === null || this.currentStatus.revision < 0 || this.pendingPublish) {
      this.setStatus('error', this.currentStatus.revision, 'Connect and wait for the current script before publishing.');
      return;
    }
    if (new TextEncoder().encode(source).byteLength > MAX_SOURCE_BYTES) {
      this.setStatus('rejected', this.currentStatus.revision, 'Script source exceeds the 64 KiB limit.');
      return;
    }

    this.pendingPublish = true;
    this.setStatus('publishing', this.currentStatus.revision, 'Validating and publishing script…');
    room.send('publishClientScript', { baseRevision: this.currentStatus.revision, source });
    this.clearPublishTimeout();
    this.publishTimeout = setTimeout(() => {
      if (!this.pendingPublish) return;
      this.pendingPublish = false;
      this.setStatus('error', this.currentStatus.revision, 'The server did not confirm the script update.');
    }, 10_000);
  }

  dispose(): void {
    this.generation += 1;
    this.clearPublishTimeout();
    this.pendingPublish = false;
    const room = this.room;
    this.room = null;
    this.client = null;
    if (room !== null) void room.leave();
    this.setStatus('disconnected', -1, 'Room disconnected');
  }

  private receiveSnapshot(generation: number, value: unknown): void {
    if (generation !== this.generation || !isSnapshot(value) || value.revision < this.currentStatus.revision) return;
    const revision = value.revision;
    if (this.currentStatus.state === 'publishing' && revision === this.currentStatus.revision) {
      this.setStatus('publishing', revision, 'Server accepted the script · waiting for confirmation…');
      return;
    }
    if (this.currentStatus.state === 'published' && revision === this.currentStatus.revision) return;
    this.setStatus('connected', revision, `Connected · revision ${revision}`);
  }

  private receivePublishResult(generation: number, value: unknown): void {
    if (generation !== this.generation || !isRecord(value)) return;
    if (value.result === 'accepted' && typeof value.revision === 'number' &&
        Number.isSafeInteger(value.revision) && value.revision >= 0) {
      this.pendingPublish = false;
      this.clearPublishTimeout();
      this.setStatus('published', Math.max(this.currentStatus.revision, value.revision), `Published revision ${value.revision}`);
      return;
    }
    if (value.result !== 'rejected') return;

    const revision = typeof value.currentRevision === 'number' && Number.isSafeInteger(value.currentRevision) && value.currentRevision >= 0
      ? Math.max(this.currentStatus.revision, value.currentRevision)
      : this.currentStatus.revision;
    const diagnostics = Array.isArray(value.diagnostics)
      ? value.diagnostics.filter((item): item is string => typeof item === 'string').slice(0, 20).join('\n')
      : '';
    const reason = typeof value.reason === 'string' ? value.reason : 'invalid-script';
    this.pendingPublish = false;
    this.clearPublishTimeout();
    this.setStatus('rejected', revision, diagnostics || `Script rejected: ${reason}`);
  }

  private setStatus(state: ScriptingManagerStatusKind, revision: number, message: string): void {
    this.currentStatus = { state, revision, message };
    for (const listener of this.listeners) {
      try { listener(this.currentStatus); } catch (_error) { /* Keep other status listeners alive. */ }
    }
  }

  private clearPublishTimeout(): void {
    if (this.publishTimeout === null) return;
    clearTimeout(this.publishTimeout);
    this.publishTimeout = null;
  }

  private errorMessage(error: unknown, fallback: string): string {
    return error instanceof Error ? error.message : fallback;
  }
}
