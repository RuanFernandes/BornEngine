import type { Game } from '../core/game';
import { GameContext, ContextResource, getGameContext } from '../core/context';
import * as operations from './internal';
import { Vector2D } from '../math/vector2d';
import type { Renderer } from '../core/renderer';
import type { Color, Vector2DLike } from '../core/types';

/** Font resource owned by a Game or Scene asset scope. Draw it through the owning Renderer. */
export class Font implements ContextResource {
  /** Reason the font could not be loaded, or null. */
  readonly error: string | null;
  private handleValue = 0;
  private disposed = false;
  private readonly context: GameContext;

  /** @internal Resource construction is routed through an asset scope. */
  static _create(game: Game, path: string, size: number): Font {
    return new Font(game, path, size);
  }

  private constructor(
    game: Game,
    /** Path the font was loaded from. */
    readonly path: string,
    /** Size the font was loaded at. Also the default size for `measureText`. */
    readonly size: number,
  ) {
    this.context = getGameContext(game);
    const context = this.context;
    if (!context.isReady || context.isDisposed || size <= 0) {
      this.error = 'A ready Game and positive font size are required.';
      return;
    }
    this.handleValue = operations.loadFont(path, size).handle;
    this.error = this.handleValue === 0 ? 'Unable to load font: ' + path : null;
    context.register(this);
  }

  /** True while the font is loaded and its Game is ready. */
  get isLoaded(): boolean {
    return this.context.isReady && !this.context.isDisposed && !this.disposed && this.handleValue !== 0;
  }
  /** True once the font has been disposed. */
  get isDisposed(): boolean {
    return this.disposed;
  }

  /**
   * Measures `text` and returns its width and height. Returns a zero vector when the font is not loaded.
   * `size` defaults to the font's own size.
   */
  measureText(text: string, size = this.size, spacing = 0): Vector2D {
    if (!this.isLoaded) return Vector2D.zero();
    return Vector2D.from(operations.measureTextEx(this.toNativeFont(), text, size, spacing));
  }

  /** Draws `text` through `renderer`. Returns false when the text could not be drawn. */
  draw(renderer: Renderer, text: string, position: Vector2DLike, size: number, color: Color, spacing = 0): boolean {
    return renderer.drawText(text, position, size, color, this, spacing);
  }

  /** @internal Renderer entry point; does not expose the native handle. */
  drawNative(text: string, position: Vector2DLike, size: number, spacing: number, color: Color): boolean {
    if (!this.isLoaded || !this.context.owns(this)) return false;
    operations.drawTextEx(this.toNativeFont(), text, position, size, spacing, color);
    return true;
  }

  private toNativeFont(): { handle: number; size: number } {
    return { handle: this.handleValue, size: this.size };
  }

  /** Releases the font. Safe to call more than once. */
  dispose(): void {
    if (this.disposed) return;
    if (this.handleValue !== 0) operations.unloadFont(this.toNativeFont());
    this.handleValue = 0;
    this.disposed = true;
    this.context.unregister(this);
  }
}
