import { Room, type Client } from '@colyseus/core';
import { validateAndCompileClientScript } from '../sandbox/client-script.js';

interface ClientScriptSnapshot {
  readonly revision: number;
  readonly source: string;
  readonly javascript: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function hasOnlyKeys(value: Record<string, unknown>, keys: readonly string[]): boolean {
  const actual = Object.keys(value);
  return actual.length === keys.length && actual.every((key) => keys.includes(key));
}

/** Stores validated shared client scripts and publishes accepted revisions to game clients. */
export class ScriptingManagerRoom extends Room {
  maxClients = 32;
  private snapshot: ClientScriptSnapshot = { revision: 0, source: '', javascript: '' };

  onCreate(): void {
    this.onMessage('publishClientScript', (client, payload: unknown) => this.publish(client, payload));
    this.onMessage('requestClientScriptSnapshot', (client) => this.sendSnapshot(client));
  }

  onJoin(client: Client): void {
    this.sendSnapshot(client);
  }

  private sendSnapshot(client: Client): void {
    client.send('clientScriptSnapshot', { ...this.snapshot });
  }

  private publish(client: Client, payload: unknown): void {
    if (!isRecord(payload) || !hasOnlyKeys(payload, ['baseRevision', 'source']) ||
        typeof payload.baseRevision !== 'number' || !Number.isSafeInteger(payload.baseRevision) ||
        payload.baseRevision < 0 || typeof payload.source !== 'string') {
      this.reject(client, 'malformed');
      return;
    }
    if (payload.baseRevision !== this.snapshot.revision) {
      this.reject(client, 'stale-revision');
      return;
    }
    if (this.snapshot.revision >= Number.MAX_SAFE_INTEGER) {
      this.reject(client, 'revision-exhausted');
      return;
    }

    const result = validateAndCompileClientScript(payload.source);
    if (!result.ok) {
      this.reject(client, 'invalid-script', result.diagnostics);
      return;
    }

    this.snapshot = {
      revision: this.snapshot.revision + 1,
      source: payload.source,
      javascript: result.javascript,
    };
    client.send('clientScriptResult', { result: 'accepted', revision: this.snapshot.revision });
    this.broadcast('clientScriptReload', { ...this.snapshot });
  }

  private reject(client: Client, reason: string, diagnostics?: readonly string[]): void {
    client.send('clientScriptResult', {
      result: 'rejected',
      currentRevision: this.snapshot.revision,
      reason,
      ...(diagnostics === undefined ? {} : { diagnostics: [...diagnostics] }),
    });
  }

  /** Read-only dev inspection surface for tests and local tooling. */
  getClientScriptSnapshot(): ClientScriptSnapshot {
    return { ...this.snapshot };
  }
}
