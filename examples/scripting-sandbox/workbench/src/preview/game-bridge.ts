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

  replace(candidate: T, attach: (candidate: T) => T | null, detach: (active: T) => void): boolean {
    if (candidate.status !== 'ready') {
      candidate.dispose();
      return false;
    }
    const attached = attach(candidate);
    if (attached === null) {
      candidate.dispose();
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
