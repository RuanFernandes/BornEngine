import type { Game } from '../core/game';
import { GameContext, ContextDrawable, getGameContext } from '../core/context';
import { Colors } from '../core/colors';
import * as operations from './internal';
import type { ImageData } from './image-data';
import type { RenderTexture } from './render-texture';
import type { Color, Rect, Vector2DLike } from '../core/types';
import * as spriteOperations from '../sprites/internal';
import { isTextureSourceRegionInBounds } from './texture-region';

type TextureSource = string | ImageData | RenderTexture;

/** A texture resource owned by a Game or Scene asset scope. Its native handle stays private. */
export class Texture implements ContextDrawable {
  readonly resourceKind = 'texture';
  readonly width: number;
  readonly height: number;
  readonly error: string | null;
  private handleValue = 0;
  private disposed = false;
  private ownsHandle = true;
  private renderTextureSource: RenderTexture | null = null;
  private readonly context: GameContext;

  /** @internal Resource construction is routed through an asset scope. */
  static _create(game: Game, source: TextureSource): Texture { return new Texture(game, source); }

  private constructor(private readonly game: Game, source: TextureSource) {
    this.context = getGameContext(game);
    const context = this.context;
    let loaded: { handle: number; width: number; height: number } | null = null;
    let sourceName = '';

    if (!context.isReady || context.isDisposed) {
      this.width = 0;
      this.height = 0;
      this.error = 'The Game must be ready before loading a texture.';
      return;
    }

    if (typeof source === 'string') {
      sourceName = source;
      loaded = operations.loadTexture(source);
    } else if (source.resourceKind === 'image-data') {
      if (!context.owns(source) || !source.isLoaded) {
        this.width = 0;
        this.height = 0;
        this.error = 'ImageData must be loaded by the same Game.';
        return;
      }
      loaded = operations.loadTextureFromImage((source as any).handleValue);
      sourceName = source.path;
    } else if (source.resourceKind === 'render-texture') {
      if (!context.owns(source) || !source.isLoaded) {
        this.width = 0;
        this.height = 0;
        this.error = 'RenderTexture must be loaded by the same Game.';
        return;
      }
      loaded = operations.getRenderTextureTexture((source as any).handleValue);
      this.ownsHandle = false;
      this.renderTextureSource = source;
      sourceName = 'render texture';
    } else {
      this.width = 0;
      this.height = 0;
      this.error = 'Unsupported texture source.';
      return;
    }

    this.handleValue = loaded.handle;
    this.width = loaded.width;
    this.height = loaded.height;
    this.error = this.handleValue === 0 ? 'Unable to load texture: ' + sourceName : null;
    if (!context.register(this) && this.handleValue !== 0 && this.ownsHandle) {
      operations.unloadTexture(loaded);
      this.handleValue = 0;
    }
  }

  get isLoaded(): boolean {
    return this.context.isReady && !this.context.isDisposed && !this.disposed && this.handleValue !== 0 &&
      (this.renderTextureSource === null || this.renderTextureSource.isLoaded);
  }
  get isDisposed(): boolean { return this.disposed; }

  /** @internal True when both loaded textures belong to the same Game context. */
  _belongsToSameGame(other: Texture): boolean {
    return other instanceof Texture && this.isLoaded && other.isLoaded && this.context === other.context;
  }

  /** @internal Checks whether this loaded texture is owned by the supplied Game context. */
  _canAttachTo(context: GameContext): boolean {
    return this.isLoaded && context.owns(this);
  }

  /** @internal Creates a 2D particle pool without exposing this Texture's native handle. */
  _createParticleEmitter2D(capacity: number): number {
    if (!this.isLoaded) return 0;
    return spriteOperations.createParticleEmitter2D(capacity, this.handleValue);
  }

  draw(position: Vector2DLike, tint: Color = Colors.WHITE): boolean {
    if (!this.isLoaded) return false;
    return this.context.draw(this, position, tint);
  }

  /**
   * Draws a texture region into a destination rectangle without exposing its native handle.
   * The destination is the unrotated top-left rectangle; origin is a local pivot measured from that corner.
   */
  drawRegion(source: Rect, destination: Rect, origin: Vector2DLike, rotation: number, tint: Color): boolean {
    if (!this.isLoaded || !this.context.owns(this) ||
        source === null || source === undefined || destination === null || destination === undefined ||
        origin === null || origin === undefined || tint === null || tint === undefined ||
        !isFiniteNumber(source.x) || !isFiniteNumber(source.y) ||
        !isFiniteNumber(source.width) || !isFiniteNumber(source.height) ||
        !isTextureSourceRegionInBounds(source, this.width, this.height) ||
        !isFiniteNumber(destination.x) || !isFiniteNumber(destination.y) ||
        !isFiniteNumber(destination.width) || !isFiniteNumber(destination.height) ||
        destination.width <= 0 || destination.height <= 0 ||
        !isFiniteNumber(origin.x) || !isFiniteNumber(origin.y) || !isFiniteNumber(rotation) ||
        !isFiniteNumber(tint.r) || !isFiniteNumber(tint.g) ||
        !isFiniteNumber(tint.b) || !isFiniteNumber(tint.a)) return false;

    operations.drawTextureProRaw(
      this.handleValue,
      source.x, source.y, source.width, source.height,
      destination.x, destination.y, destination.width, destination.height,
      origin.x, origin.y, rotation,
      tint.r, tint.g, tint.b, tint.a,
    );
    return true;
  }

  setFilter(mode: number): boolean {
    if (!this.isLoaded || !this.ownsHandle) return false;
    operations.setTextureFilter(this.toNativeTexture(), mode);
    return true;
  }

  generateMipmaps(): boolean {
    if (!this.isLoaded || !this.ownsHandle) return false;
    operations.genTextureMipmaps(this.toNativeTexture());
    return true;
  }

  /** @internal Renderer entry point; does not expose the native handle. */
  drawNative(position: Vector2DLike, tint: Color): boolean {
    if (!this.isLoaded || !this.context.owns(this)) return false;
    operations.drawTexture(this.toNativeTexture(), position.x, position.y, tint);
    return true;
  }

  private toNativeTexture(): { handle: number; width: number; height: number } {
    return { handle: this.handleValue, width: this.width, height: this.height };
  }

  dispose(): void {
    if (this.disposed) return;
    if (this.ownsHandle && this.handleValue !== 0) operations.unloadTexture(this.toNativeTexture());
    this.handleValue = 0;
    this.disposed = true;
    this.context.unregister(this);
  }
}

function isFiniteNumber(value: number): boolean {
  return value === value && value !== Infinity && value !== -Infinity;
}
