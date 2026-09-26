import type { Game } from '../core/game';
import { GameContext, ContextResource, getGameContext } from '../core/context';
import * as nativeCore from '../core/internal';
import * as operations from './internal';
import type { Renderer } from '../core/renderer';
import type { Model, Mesh } from './model';
import type { Color, Vec3 } from '../core/types';

export type MaterialKind = 'opaque' | 'refractive' | 'transparent' | 'additive' | 'cutout';

/** Compiled, game-owned GPU material. */
export class Material implements ContextResource {
  readonly error: string | null;
  private handleValue = 0;
  private disposed = false;
  private readonly context: GameContext;

  constructor(game: Game, readonly source: string, readonly kind: MaterialKind = 'opaque') {
    this.context = getGameContext(game);
    const context = this.context;
    if (!context.isReady || context.isDisposed || source.length === 0) {
      this.error = 'A ready Game and non-empty material source are required.';
      return;
    }

    if (kind === 'refractive') this.handleValue = operations.compileRefractiveMaterial(source);
    else if (kind === 'transparent') this.handleValue = operations.compileTransparentMaterial(source);
    else if (kind === 'additive') this.handleValue = operations.compileAdditiveMaterial(source);
    else if (kind === 'cutout') this.handleValue = operations.compileMaterialCutout(source);
    else this.handleValue = operations.compileMaterial(source);

    this.error = this.handleValue === 0 ? 'Unable to compile material.' : null;
    context.register(this);
  }

  get isLoaded(): boolean { return this.context.isReady && !this.context.isDisposed && !this.disposed && this.handleValue !== 0; }
  get isDisposed(): boolean { return this.disposed; }

  setParameters(values: number[]): boolean {
    if (!this.isLoaded) return false;
    nativeCore.setMaterialParams(this.handleValue, values);
    return true;
  }

  setShadingModel(model: number): boolean {
    if (!this.isLoaded) return false;
    operations.setMaterialShadingModel(this.handleValue, model);
    return true;
  }

  setProbeVisible(visible: boolean): boolean {
    if (!this.isLoaded) return false;
    operations.setMaterialProbeVisible(this.handleValue, visible);
    return true;
  }

  setFoliage(transmission: Color, amount: number, wrapFactor: number): boolean {
    if (!this.isLoaded) return false;
    operations.setMaterialFoliage(this.handleValue, transmission.r / 255, transmission.g / 255,
      transmission.b / 255, amount, wrapFactor);
    return true;
  }

  draw(renderer: Renderer, model: Model | Mesh, position: Vec3, scale = 1, tint?: Color, meshIndex?: number): boolean {
    return renderer.drawMaterial(this, model, position, scale, tint, meshIndex);
  }

  /** @internal Renderer entry point; native identifiers remain private. */
  drawNative(model: Model | Mesh, position: Vec3, scale: number, tint: Color, meshIndex?: number): boolean {
    if (!this.isLoaded || !this.context.owns(this) || !this.context.owns(model) || !model.isLoaded) return false;
    const modelData = (model as any).toNativeModel();
    if (meshIndex === undefined) operations.drawModelWithMaterial(this.handleValue, modelData, position, scale, tint);
    else operations.drawMeshWithMaterial(this.handleValue, modelData, position, scale, tint, meshIndex);
    return true;
  }

  dispose(): void {
    if (this.disposed) return;
    // The current native ABI has no material release operation.
    this.handleValue = 0;
    this.disposed = true;
    this.context.unregister(this);
  }
}
