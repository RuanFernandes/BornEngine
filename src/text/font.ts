import type { Game } from '../core/game';
import { GameContext, ContextResource, getGameContext } from '../core/context';
import * as operations from './internal';
import { Vector2D } from '../math/vector2d';
import type { Renderer } from '../core/renderer';
import type { Color, Vector2DLike } from '../core/types';

/** Font resource owned by a Game or Scene asset scope. Draw it through the owning Renderer. */
export class Font implements ContextResource {
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
    readonly path: string,
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

  get isLoaded(): boolean {
    return this.context.isReady && !this.context.isDisposed && !this.disposed && this.handleValue !== 0;
  }
  get isDisposed(): boolean {
    return this.disposed;
  }

  measureText(text: string, size = this.size, spacing = 0): Vector2D {
    if (!this.isLoaded) return Vector2D.zero();
    return Vector2D.from(operations.measureTextEx(this.toNativeFont(), text, size, spacing));
  }

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

  dispose(): void {
    if (this.disposed) return;
    if (this.handleValue !== 0) operations.unloadFont(this.toNativeFont());
    this.handleValue = 0;
    this.disposed = true;
    this.context.unregister(this);
  }
}
