/** Internal owner for one BornEngine runtime and its context-bound resources. */
export interface ContextResource {
  dispose(): void;
}

export interface ContextDrawable extends ContextResource {
  isLoaded: boolean;
  drawNative(position: { x: number; y: number }, tint: { r: number; g: number; b: number; a: number }): boolean;
}

export type ContextDrawHandler = (
  resource: ContextDrawable,
  position: { x: number; y: number },
  tint: { r: number; g: number; b: number; a: number },
) => boolean;
export type ContextRenderTargetHandler = (resource: ContextResource, action: 'begin' | 'end') => boolean;

let nextContextId = 1;
let activeContext: GameContext | null = null;

export const CONTEXT_ALREADY_ACTIVE_ERROR = 'Only one BornEngine Game may be active at a time.';

export class GameContext {
  readonly id: number;
  isReady = false;
  isDisposed = false;
  error: string | null = null;

  private resources: ContextResource[] = [];
  private drawHandler: ContextDrawHandler | null = null;
  private renderTargetHandler: ContextRenderTargetHandler | null = null;

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

  owns(resource: ContextResource): boolean {
    return !this.isDisposed && this.resources.indexOf(resource) >= 0;
  }

  register(resource: ContextResource): boolean {
    if (!this.isReady || this.isDisposed) return false;
    if (this.resources.indexOf(resource) >= 0) return true;
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

  setDrawHandler(handler: ContextDrawHandler | null): void { this.drawHandler = handler; }
  setRenderTargetHandler(handler: ContextRenderTargetHandler | null): void { this.renderTargetHandler = handler; }

  draw(resource: ContextDrawable, position: { x: number; y: number }, tint: { r: number; g: number; b: number; a: number }): boolean {
    if (!this.isReady || !this.owns(resource) || !resource.isLoaded || this.drawHandler === null) return false;
    return this.drawHandler(resource, position, tint);
  }

  beginRenderTarget(resource: ContextResource): boolean {
    if (!this.isReady || !this.owns(resource) || this.renderTargetHandler === null) return false;
    return this.renderTargetHandler(resource, 'begin');
  }

  endRenderTarget(resource: ContextResource): boolean {
    if (!this.isReady || this.renderTargetHandler === null) return false;
    return this.renderTargetHandler(resource, 'end');
  }

  dispose(): void {
    if (this.isDisposed) return;

    this.disposeResources();
    this.isReady = false;
    this.isDisposed = true;
    this.drawHandler = null;
    this.renderTargetHandler = null;
    if (activeContext === this) activeContext = null;
  }
}
