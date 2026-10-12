import type { Game } from '../core/game';
import { GameContext, ContextResource, getGameContext } from '../core/context';
import * as operations from './internal';
import type { Renderer } from '../core/renderer';
import type { BoundingBox, Color, Mat4, Vec3 } from '../core/types';

type ModelData = { handle: number; meshCount: number; materialCount: number; transform: Mat4 };

/** A 3D model loaded from a supported asset file and owned by an asset scope. */
export class Model implements ContextResource {
  /** Load failure message, or null when the model loaded. */
  readonly error: string | null;
  /** Number of meshes in the model; 0 if it failed to load. */
  readonly meshCount: number;
  /** Number of materials in the model; 0 if it failed to load. */
  readonly materialCount: number;
  /** The model's 4x4 transform matrix, column-major. */
  readonly transform: Mat4;
  private handleValue = 0;
  private disposed = false;
  private readonly context: GameContext;

  /** @internal Resource construction is routed through an asset scope. */
  static _create(game: Game, path: string): Model {
    return new Model(game, path);
  }

  private constructor(
    game: Game,
    readonly path: string,
  ) {
    this.context = getGameContext(game);
    const context = this.context;
    if (!context.isReady || context.isDisposed) {
      this.error = 'The Game must be ready before loading a model.';
      this.meshCount = 0;
      this.materialCount = 0;
      this.transform = identityTransform();
      return;
    }
    const data = operations.loadModel(path);
    this.handleValue = data.handle;
    this.meshCount = data.meshCount;
    this.materialCount = data.materialCount;
    this.transform = data.transform.slice();
    this.error = this.handleValue === 0 ? 'Unable to load model: ' + path : null;
    context.register(this);
  }

  /** True while the model is usable: loaded, not disposed, and its Game is ready. */
  get isLoaded(): boolean {
    return this.context.isReady && !this.context.isDisposed && !this.disposed && this.handleValue !== 0;
  }
  /** True once the model has been disposed. */
  get isDisposed(): boolean {
    return this.disposed;
  }

  /** Draws the model through `renderer` at `position`, optionally tinted and rotated around the Y axis. */
  draw(renderer: Renderer, position: Vec3, scale = 1, tint?: Color, rotationY?: number): boolean {
    return renderer.drawModel(this, position, scale, tint, rotationY);
  }

  /** Returns the model bounding box, or null if not loaded. */
  getBounds(): BoundingBox | null {
    return this.isLoaded ? operations.getModelBounds(this.toNativeModel()) : null;
  }

  /** Sets the foliage wind strength applied to this model. Returns false if not loaded. */
  setFoliageWind(amount: number): boolean {
    if (!this.isLoaded) return false;
    operations.setModelFoliageWind(this.toNativeModel(), amount);
    return true;
  }

  /** @internal Renderer entry point; does not expose the native handle. */
  drawNative(position: Vec3, scale: number, tint: Color, rotationY?: number): boolean {
    if (!this.isLoaded || !this.context.owns(this)) return false;
    if (rotationY === undefined) operations.drawModel(this.toNativeModel(), position, scale, tint);
    else operations.drawModelRotated(this.toNativeModel(), position, scale, rotationY, tint);
    return true;
  }

  /** @internal Renderer entry point. */
  drawTransformNative(transform: Mat4, tint: Color): boolean {
    if (!this.isLoaded || !this.context.owns(this) || transform.length !== 16) return false;
    operations.drawModelTransform(this.toNativeModel(), transform, tint);
    return true;
  }

  private toNativeModel(): ModelData {
    return {
      handle: this.handleValue,
      meshCount: this.meshCount,
      materialCount: this.materialCount,
      transform: this.transform,
    };
  }

  /** Unloads the model. Safe to call repeatedly. */
  dispose(): void {
    if (this.disposed) return;
    if (this.handleValue !== 0) operations.unloadModel(this.toNativeModel());
    this.handleValue = 0;
    this.disposed = true;
    this.context.unregister(this);
  }
}

/** Standalone indexed mesh data owned by one Game. */
export class Mesh implements ContextResource {
  /** Creation failure message, or null when the mesh was created. */
  readonly error: string | null;
  private handleValue = 0;
  private meshCount = 0;
  private materialCount = 0;
  private transform = identityTransform();
  private disposed = false;
  private readonly context: GameContext;

  /** @internal Resource construction is routed through an asset scope. */
  static _create(game: Game, vertices: number[], indices: number[]): Mesh {
    return new Mesh(game, vertices, indices);
  }

  private constructor(game: Game, vertices: number[], indices: number[]) {
    this.context = getGameContext(game);
    const context = this.context;
    if (!context.isReady || context.isDisposed || vertices.length === 0 || indices.length === 0) {
      this.error = 'A ready Game and non-empty mesh buffers are required.';
      return;
    }
    const data = operations.createMesh(vertices, indices);
    this.handleValue = data.handle;
    this.meshCount = data.meshCount;
    this.materialCount = data.materialCount;
    this.transform = data.transform.slice();
    this.error = this.handleValue === 0 ? 'Unable to create mesh.' : null;
    context.register(this);
  }

  /** True while the mesh is usable: created, not disposed, and its Game is ready. */
  get isLoaded(): boolean {
    return this.context.isReady && !this.context.isDisposed && !this.disposed && this.handleValue !== 0;
  }
  /** True once the mesh has been disposed. */
  get isDisposed(): boolean {
    return this.disposed;
  }

  /** Draws the mesh through `renderer` at `position`, optionally tinted and rotated around the Y axis. */
  draw(renderer: Renderer, position: Vec3, scale = 1, tint?: Color, rotationY?: number): boolean {
    return renderer.drawModel(this, position, scale, tint, rotationY);
  }

  /** @internal Renderer entry point; does not expose the native handle. */
  drawNative(position: Vec3, scale: number, tint: Color, rotationY?: number): boolean {
    if (!this.isLoaded || !this.context.owns(this)) return false;
    const data = this.toNativeModel();
    if (rotationY === undefined) operations.drawModel(data, position, scale, tint);
    else operations.drawModelRotated(data, position, scale, rotationY, tint);
    return true;
  }

  /** @internal Renderer entry point. */
  drawTransformNative(transform: Mat4, tint: Color): boolean {
    if (!this.isLoaded || !this.context.owns(this) || transform.length !== 16) return false;
    operations.drawModelTransform(this.toNativeModel(), transform, tint);
    return true;
  }

  private toNativeModel(): ModelData {
    return {
      handle: this.handleValue,
      meshCount: this.meshCount,
      materialCount: this.materialCount,
      transform: this.transform,
    };
  }

  /** Unloads the mesh. Safe to call repeatedly. */
  dispose(): void {
    if (this.disposed) return;
    if (this.handleValue !== 0) operations.unloadModel(this.toNativeModel());
    this.handleValue = 0;
    this.disposed = true;
    this.context.unregister(this);
  }
}

function identityTransform(): Mat4 {
  return [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
}
