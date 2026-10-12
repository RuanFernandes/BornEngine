import { getGameContext } from '../core/context';
import type { ContextResource, GameContext } from '../core/context';
import type { Game } from '../core/game';
import type { Texture } from '../textures';
import { createUiApi } from './api';
import { UiBackend, type UiBackendId } from './opcodes';
import type { UiApi } from './types';

/** Shared command facade used by the two game-owned UI backends. */
export class UiSurface implements ContextResource {
  /** Game context that owns this surface. */
  readonly context: GameContext;
  private disposed = false;

  /** Creates a UI surface on `owner` for the given backend. */
  constructor(owner: Game, backend: UiBackendId) {
    this.context = getGameContext(owner);
    const api = createUiApi(
      backend,
      () => this.isReady,
      (texture: Texture) => this.context.owns(texture) && texture.isLoaded,
      (texture: Texture) => (texture as any).handleValue as number,
    );
    Object.assign(this, api);
    this.context.register(this);
  }

  /** True while the surface and its Game are ready and not disposed. */
  get isReady(): boolean {
    return !this.disposed && this.context.isReady && !this.context.isDisposed;
  }

  /** Releases the surface. Safe to call more than once. */
  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.context.unregister(this);
  }
}

/** Immediate-mode UI for in-game interfaces, drawn with the egui backend. Widget methods come from `UiApi`. */
export class Ui extends UiSurface {
  /** Creates the UI for `owner`. */
  constructor(owner: Game) {
    super(owner, UiBackend.Egui);
  }
}

/** Widget and painting methods of `Ui`. */
export interface Ui extends UiApi {}
export type { UiApi, UiId, UiResponse, UiColor } from './types';
export { UiBackend, UiOpcode } from './opcodes';
