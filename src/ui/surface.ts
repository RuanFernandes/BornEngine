import type { ContextReference, ContextResource, GameContext } from '../core/context';
import { resolveContext } from '../core/context';
import type { Texture } from '../core/types';
import { createUiApi } from './api';
import { UiBackend, type UiBackendId } from './opcodes';
import type { UiApi } from './types';

/** Shared command facade used by the two game-owned UI backends. */
export class UiSurface implements ContextResource {
  readonly context: GameContext;
  private disposed = false;

  constructor(owner: ContextReference, backend: UiBackendId) {
    this.context = resolveContext(owner);
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
  constructor(owner: ContextReference) { super(owner, UiBackend.Egui); }
}

export interface Ui extends UiApi {}
export type { UiApi, UiId, UiResponse, UiColor } from './types';
export { UiBackend, UiOpcode } from './opcodes';
