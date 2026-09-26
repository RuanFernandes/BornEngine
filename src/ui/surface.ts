import { getGameContext } from '../core/context';
import type { ContextResource, GameContext } from '../core/context';
import type { Game } from '../core/game';
import type { Texture } from '../core/types';
import { createUiApi } from './api';
import { UiBackend, type UiBackendId } from './opcodes';
import type { UiApi } from './types';

/** Shared command facade used by the two game-owned UI backends. */
export class UiSurface implements ContextResource {
  readonly context: GameContext;
  private disposed = false;

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

  get isReady(): boolean { return !this.disposed && this.context.isReady && !this.context.isDisposed; }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.context.unregister(this);
  }
}

export class Ui extends UiSurface {
  constructor(owner: Game) { super(owner, UiBackend.Egui); }
}

export interface Ui extends UiApi {}
export type { UiApi, UiId, UiResponse, UiColor } from './types';
export { UiBackend, UiOpcode } from './opcodes';
