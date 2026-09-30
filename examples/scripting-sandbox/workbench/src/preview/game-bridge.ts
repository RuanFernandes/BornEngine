export interface ScriptComponentLike {
  readonly status: string;
  dispose(): void;
}

/** Owns one live guest component and swaps only fully ready candidates. */
export class ScriptComponentSlot<T extends ScriptComponentLike> {
  private activeValue: T | null = null;

  get current(): T | null {
    return this.activeValue;
  }

  replace(
    candidate: T,
    attach: (candidate: T) => T | null,
    detach: (active: T) => void,
    activate: (candidate: T) => boolean = () => true,
  ): boolean {
    if (candidate.status !== 'ready') {
      candidate.dispose();
      return false;
    }
    const attached = attach(candidate);
    if (attached === null) {
      candidate.dispose();
      return false;
    }
    let activated = false;
    try {
      activated = activate(attached);
    } catch (_error) {
      activated = false;
    }
    if (!activated) {
      try {
        detach(attached);
      } catch (_error) {
        // The failed candidate must not prevent the currently active script
        // from remaining installed.
      }
      attached.dispose();
      return false;
    }
    const previous = this.activeValue;
    this.activeValue = attached;
    if (previous !== null) detach(previous);
    return true;
  }

  clear(detach: (active: T) => void): void {
    const previous = this.activeValue;
    this.activeValue = null;
    if (previous !== null) detach(previous);
  }
}

export interface ScriptRevisionPayload {
  readonly revision: number;
  readonly source: string;
  readonly javascript: string;
}

export type ScriptRevisionResult = 'invalid' | 'stale' | 'empty' | 'applied' | 'failed';

function isScriptRevisionPayload(value: unknown): value is ScriptRevisionPayload {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false;
  const payload = value as Record<string, unknown>;
  const keys = Object.keys(payload);
  if (keys.length !== 3 || !keys.includes('revision') || !keys.includes('source') || !keys.includes('javascript')) return false;
  if (typeof payload.revision !== 'number' || !Number.isSafeInteger(payload.revision) || payload.revision < 0 ||
      typeof payload.source !== 'string' || typeof payload.javascript !== 'string') return false;
  return new TextEncoder().encode(payload.source).byteLength <= 64 * 1024 &&
    new TextEncoder().encode(payload.javascript).byteLength <= 128 * 1024;
}

/** Accepts each server revision once and leaves component replacement to the caller. */
export class ScriptRevisionReceiver {
  private currentRevision = -1;

  get revision(): number { return this.currentRevision; }

  receive(value: unknown, apply: (payload: ScriptRevisionPayload) => boolean): ScriptRevisionResult {
    if (!isScriptRevisionPayload(value)) return 'invalid';
    if (value.revision <= this.currentRevision) return 'stale';
    this.currentRevision = value.revision;
    if (value.javascript.length === 0) return 'empty';
    try {
      return apply(value) ? 'applied' : 'failed';
    } catch (_error) {
      return 'failed';
    }
  }

  reset(): void { this.currentRevision = -1; }
}
