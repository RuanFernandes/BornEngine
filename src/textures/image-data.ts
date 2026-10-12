import type { Game } from '../core/game';
import { GameContext, getGameContext } from '../core/context';
import * as operations from './internal';
import type { Rect } from '../core/types';

/** CPU-side image data that can be transformed before creating a GPU texture. */
export class ImageData {
  /** Discriminator identifying this resource as image data. */
  readonly resourceKind = 'image-data';
  /** Load failure message, or null when the image loaded. */
  readonly error: string | null;
  private handleValue = 0;
  private disposed = false;
  private readonly context: GameContext;

  /** @internal Resource construction is routed through an asset scope. */
  static _create(game: Game, path: string): ImageData {
    return new ImageData(game, path);
  }

  private constructor(
    game: Game,
    readonly path: string,
  ) {
    this.context = getGameContext(game);
    const context = this.context;
    if (!context.isReady || context.isDisposed) {
      this.error = 'The Game must be ready before loading image data.';
      return;
    }
    this.handleValue = operations.loadImage(path);
    this.error = this.handleValue === 0 ? 'Unable to load image data: ' + path : null;
    context.register(this);
  }

  /** True while the image data is usable: loaded, not disposed, and its Game is ready. */
  get isLoaded(): boolean {
    return this.context.isReady && !this.context.isDisposed && !this.disposed && this.handleValue !== 0;
  }
  /** True once the image data has been disposed. */
  get isDisposed(): boolean {
    return this.disposed;
  }

  /** Resizes the image to the given pixel size. Returns false if not loaded or a dimension is not positive. */
  resize(width: number, height: number): boolean {
    if (!this.isLoaded || width <= 0 || height <= 0) return false;
    operations.imageResize(this.handleValue, width, height);
    return true;
  }

  /** Crops the image to `bounds`. Returns false if not loaded or the bounds have no positive area. */
  crop(bounds: Rect): boolean {
    if (!this.isLoaded || bounds.width <= 0 || bounds.height <= 0) return false;
    operations.imageCrop(this.handleValue, bounds.x, bounds.y, bounds.width, bounds.height);
    return true;
  }

  /** Mirrors the image left to right. Returns false if not loaded. */
  flipHorizontal(): boolean {
    if (!this.isLoaded) return false;
    operations.imageFlipH(this.handleValue);
    return true;
  }
  /** Mirrors the image top to bottom. Returns false if not loaded. */
  flipVertical(): boolean {
    if (!this.isLoaded) return false;
    operations.imageFlipV(this.handleValue);
    return true;
  }
  /** Releases the image data. Safe to call repeatedly. */
  dispose(): void {
    if (this.disposed) return;
    // The current native ABI has no image-data release operation.
    this.handleValue = 0;
    this.disposed = true;
    this.context.unregister(this);
  }
}
