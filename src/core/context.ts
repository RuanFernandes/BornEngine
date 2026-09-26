/** Internal owner for one BornEngine runtime and its context-bound resources. */
export interface ContextResource {
  dispose(): void;
}

export interface ContextFrameService extends ContextResource {
  updateFrame(deltaTime: number): void;
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
  private frameServices: ContextFrameService[] = [];
  private services = new Map<object, unknown>();
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

  static createFailed(message: string): GameContext {
    const context = new GameContext();
    context.markFailed(message);
    return context;
  }

  /** @internal True only for the context that currently owns native state. */
  isActiveOwner(): boolean {
    return activeContext === this && !this.isDisposed;
  }

  markReady(): void {
    if (this.isActiveOwner()) {
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

  getOrCreateService<T>(key: object, create: () => T): T {
    const current = this.services.get(key);
    if (current !== undefined) return current as T;
    const service = create();
    this.services.set(key, service);
    return service;
  }

  removeService(key: object, service: unknown): void {
    if (this.services.get(key) === service) this.services.delete(key);
  }

  registerFrameService(service: ContextFrameService): boolean {
    if (!this.register(service)) return false;
    if (this.frameServices.indexOf(service) < 0) this.frameServices.push(service);
    return true;
  }

  unregisterFrameService(service: ContextFrameService): void {
    const index = this.frameServices.lastIndexOf(service);
    if (index >= 0) this.frameServices.splice(index, 1);
    this.unregister(service);
  }

  updateFrameServices(deltaTime: number): void {
    if (!this.isReady || this.isDisposed) return;
    const services = this.frameServices.slice();
    for (const service of services) {
      if (this.owns(service)) service.updateFrame(deltaTime);
    }
  }

  unregister(resource: ContextResource): void {
    const index = this.resources.lastIndexOf(resource);
    if (index >= 0) this.resources.splice(index, 1);
    const serviceIndex = this.frameServices.indexOf(resource as ContextFrameService);
    if (serviceIndex >= 0) this.frameServices.splice(serviceIndex, 1);
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
    this.frameServices.length = 0;
    this.services.clear();
    this.drawHandler = null;
    this.renderTargetHandler = null;
    if (activeContext === this) activeContext = null;
  }
}
