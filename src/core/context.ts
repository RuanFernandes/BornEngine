/** Internal owner for one BornEngine runtime and its context-bound resources. */
export interface ContextResource {
  dispose(): void;
}

let nextContextId = 1;
let activeContext: GameContext | null = null;

export const CONTEXT_ALREADY_ACTIVE_ERROR = 'Only one BornEngine Game may be active at a time.';

export class GameContext {
  readonly id: number;
  isReady = false;
  isDisposed = false;
  error: string | null = null;

  private resources: ContextResource[] = [];

  private constructor() {
    this.id = nextContextId++;
  }

  static create(): GameContext | null {
    if (activeContext !== null && !activeContext.isDisposed) return null;

    const context = new GameContext();
    activeContext = context;
    return context;
  }

  markReady(): void {
    if (!this.isDisposed) {
      this.error = null;
      this.isReady = true;
    }
  }

  markFailed(message: string): void {
    this.isReady = false;
    this.error = message;
  }

  owns(resource: { contextId: number }): boolean {
    return !this.isDisposed && resource.contextId === this.id;
  }

  register(resource: ContextResource & { contextId: number }): boolean {
    if (!this.isReady || this.isDisposed || resource.contextId !== this.id) return false;
    this.resources.push(resource);
    return true;
  }

  unregister(resource: ContextResource): void {
    const index = this.resources.lastIndexOf(resource);
    if (index >= 0) this.resources.splice(index, 1);
  }

  disposeResources(): void {
    const pending = this.resources.slice();
    this.resources.length = 0;

    for (let index = pending.length - 1; index >= 0; index--) {
      pending[index].dispose();
    }
  }

  dispose(): void {
    if (this.isDisposed) return;

    this.disposeResources();
    this.isReady = false;
    this.isDisposed = true;
    if (activeContext === this) activeContext = null;
  }
}
