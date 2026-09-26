import type { Game } from '../core/game';
import { GameContext, ContextDrawable, getGameContext } from '../core/context';
import { Colors } from '../core/colors';
import * as operations from './internal';
import type { ImageData } from './image-data';
import type { RenderTexture } from './render-texture';
import type { Color, Vec2 } from '../core/types';

type TextureSource = string | ImageData | RenderTexture;

/** A game-owned texture. Its native handle is kept private to the engine. */
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

  constructor(private readonly game: Game, source: TextureSource) {
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

  draw(position: Vec2, tint: Color = Colors.WHITE): boolean {
    if (!this.isLoaded) return false;
    return this.context.draw(this, position, tint);
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
  drawNative(position: Vec2, tint: Color): boolean {
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
