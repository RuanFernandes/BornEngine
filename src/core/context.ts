import type { Game } from './game';

/** Internal owner for one BornEngine runtime and its context-bound resources. */
export interface ContextResource {
  dispose(): void;
}

/** Resource that receives a per-frame update while its context is ready. */
export interface ContextFrameService extends ContextResource {
  updateFrame(deltaTime: number): void;
}

/** Resource that can be drawn at a position with a tint through its context. */
export interface ContextDrawable extends ContextResource {
  isLoaded: boolean;
  drawNative(position: { x: number; y: number }, tint: { r: number; g: number; b: number; a: number }): boolean;
}

/** Draws a context-owned drawable and returns whether it was drawn. */
export type ContextDrawHandler = (
  resource: ContextDrawable,
  position: { x: number; y: number },
  tint: { r: number; g: number; b: number; a: number },
) => boolean;
/** Begins or ends rendering into a context-owned render target and returns whether the action succeeded. */
export type ContextRenderTargetHandler = (resource: ContextResource, action: 'begin' | 'end') => boolean;

let nextContextId = 1;
let activeContext: GameContext | null = null;
const gameContexts = new WeakMap<object, GameContext>();

/** @internal Associates a Game with its implementation context. */
export function bindGameContext(game: object, context: GameContext): void {
  gameContexts.set(game, context);
}

/** @internal Resolves a Game's implementation context without exposing it publicly. */
export function getGameContext(game: object): GameContext {
  const context = gameContexts.get(game);
  if (context === undefined) throw new Error('Game context is not initialized.');
  return context;
}

export const CONTEXT_ALREADY_ACTIVE_ERROR = 'Only one BornEngine Game may be active at a time.';
export const NO_ACTIVE_GAME_ERROR =
  'No BornEngine Game is active. Create a Game before creating scenes or objects that use it.';

let activeGame: Game | null = null;

/** @internal Records the Game that owns the active context. */
export function bindActiveGame(game: Game): void {
  activeGame = game;
}

/** @internal Returns the active Game. Throws when no Game is running. */
export function getActiveGame(): Game {
  if (activeGame === null || !getGameContext(activeGame).isActiveOwner()) throw new Error(NO_ACTIVE_GAME_ERROR);
  return activeGame;
}

/** Tracks the readiness, error state, and owned resources of one BornEngine runtime. Only one context can be active at a time. */
export class GameContext {
  /** Unique numeric id of this context. */
  readonly id: number;
  /** True once startup succeeded and until the context fails or is disposed. */
  isReady = false;
  /** True after the context has been disposed. */
  isDisposed = false;
  /** Message of the recorded failure, or null when there is none. */
  error: string | null = null;

  private resources: ContextResource[] = [];
  private frameServices: ContextFrameService[] = [];
  private services = new Map<object, unknown>();
  private drawHandler: ContextDrawHandler | null = null;
  private renderTargetHandler: ContextRenderTargetHandler | null = null;

  private constructor() {
    this.id = nextContextId++;
  }

  /** Creates the context that owns native state, or returns null while another context is still active. */
  static create(): GameContext | null {
    if (activeContext !== null && !activeContext.isDisposed) return null;

    const context = new GameContext();
    activeContext = context;
    return context;
  }

  /** Creates a context that is already marked as failed with the given message. */
  static createFailed(message: string): GameContext {
    const context = new GameContext();
    context.markFailed(message);
    return context;
  }

  /** @internal True only for the context that currently owns native state. */
  isActiveOwner(): boolean {
    return activeContext === this && !this.isDisposed;
  }

  /** Marks the context ready and clears its error. Has no effect unless this is the active context. */
  markReady(): void {
    if (this.isActiveOwner()) {
      this.error = null;
      this.isReady = true;
    }
  }

  /** Marks the context as not ready and records the error message. */
  markFailed(message: string): void {
    this.isReady = false;
    this.error = message;
  }

  /** Returns whether the resource is registered with this context and the context is not disposed. */
  owns(resource: ContextResource): boolean {
    return !this.isDisposed && this.resources.indexOf(resource) >= 0;
  }

  /** Registers a resource to be disposed with this context. Returns false if the context is not ready or is disposed. */
  register(resource: ContextResource): boolean {
    if (!this.isReady || this.isDisposed) return false;
    if (this.resources.indexOf(resource) >= 0) return true;
    this.resources.push(resource);
    return true;
  }

  /** Returns the service stored under `key`, creating and storing it with `create` on first use. */
  getOrCreateService<T>(key: object, create: () => T): T {
    const current = this.services.get(key);
    if (current !== undefined) return current as T;
    const service = create();
    this.services.set(key, service);
    return service;
  }

  /** Removes the service stored under `key` if it is the given instance. */
  removeService(key: object, service: unknown): void {
    if (this.services.get(key) === service) this.services.delete(key);
  }

  /** Registers a resource that receives per-frame updates. Returns false if it cannot be registered. */
  registerFrameService(service: ContextFrameService): boolean {
    if (!this.register(service)) return false;
    if (this.frameServices.indexOf(service) < 0) this.frameServices.push(service);
    return true;
  }

  /** Stops per-frame updates for the service and unregisters it. */
  unregisterFrameService(service: ContextFrameService): void {
    const index = this.frameServices.lastIndexOf(service);
    if (index >= 0) this.frameServices.splice(index, 1);
    this.unregister(service);
  }

  /** Calls `updateFrame` on every registered frame service this context still owns. */
  updateFrameServices(deltaTime: number): void {
    if (!this.isReady || this.isDisposed) return;
    const services = this.frameServices.slice();
    for (const service of services) {
      if (this.owns(service)) service.updateFrame(deltaTime);
    }
  }

  /** Removes a resource and any frame service registration it has. */
  unregister(resource: ContextResource): void {
    const index = this.resources.lastIndexOf(resource);
    if (index >= 0) this.resources.splice(index, 1);
    const serviceIndex = this.frameServices.indexOf(resource as ContextFrameService);
    if (serviceIndex >= 0) this.frameServices.splice(serviceIndex, 1);
  }

  /** Disposes all registered resources in reverse registration order. The first disposal error is recorded in `error`. */
  disposeResources(): void {
    const pending = this.resources.slice();
    this.resources.length = 0;

    for (let index = pending.length - 1; index >= 0; index--) {
      try {
        pending[index].dispose();
      } catch (error) {
        if (this.error === null)
          this.error =
            typeof error === 'object' && error !== null && error instanceof Error ? error.message : String(error);
      }
    }
  }

  /** Sets the handler used by `draw`, or clears it with null. */
  setDrawHandler(handler: ContextDrawHandler | null): void {
    this.drawHandler = handler;
  }
  /** Sets the handler used by `beginRenderTarget` and `endRenderTarget`, or clears it with null. */
  setRenderTargetHandler(handler: ContextRenderTargetHandler | null): void {
    this.renderTargetHandler = handler;
  }

  /** Draws a loaded resource owned by this context. Returns false if it cannot be drawn. */
  draw(
    resource: ContextDrawable,
    position: { x: number; y: number },
    tint: { r: number; g: number; b: number; a: number },
  ): boolean {
    if (!this.isReady || !this.owns(resource) || !resource.isLoaded || this.drawHandler === null) return false;
    return this.drawHandler(resource, position, tint);
  }

  /** Starts rendering into a render target owned by this context. Returns false if that is not possible. */
  beginRenderTarget(resource: ContextResource): boolean {
    if (!this.isReady || !this.owns(resource) || this.renderTargetHandler === null) return false;
    return this.renderTargetHandler(resource, 'begin');
  }

  /** Stops rendering into the render target. Returns false if no handler is set or the context is not ready. */
  endRenderTarget(resource: ContextResource): boolean {
    if (!this.isReady || this.renderTargetHandler === null) return false;
    return this.renderTargetHandler(resource, 'end');
  }

  /** Disposes all resources and services and releases the active-context slot. Safe to call more than once. */
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
