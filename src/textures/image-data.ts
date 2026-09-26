import type { Game } from '../core/game';
import { GameContext, getGameContext } from '../core/context';
import * as operations from './internal';
import type { Rect } from '../core/types';
import { Texture } from './texture';

/** CPU-side image data that can be transformed before creating a GPU texture. */
export class ImageData {
  readonly resourceKind = 'image-data';
  readonly error: string | null;
  private handleValue = 0;
  private disposed = false;
  private readonly context: GameContext;

  constructor(private readonly game: Game, readonly path: string) {
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

  get isLoaded(): boolean { return this.context.isReady && !this.context.isDisposed && !this.disposed && this.handleValue !== 0; }
  get isDisposed(): boolean { return this.disposed; }

  resize(width: number, height: number): boolean {
    if (!this.isLoaded || width <= 0 || height <= 0) return false;
    operations.imageResize(this.handleValue, width, height);
    return true;
  }

  crop(bounds: Rect): boolean {
    if (!this.isLoaded || bounds.width <= 0 || bounds.height <= 0) return false;
    operations.imageCrop(this.handleValue, bounds.x, bounds.y, bounds.width, bounds.height);
    return true;
  }

  flipHorizontal(): boolean { if (!this.isLoaded) return false; operations.imageFlipH(this.handleValue); return true; }
  flipVertical(): boolean { if (!this.isLoaded) return false; operations.imageFlipV(this.handleValue); return true; }
  createTexture(): Texture { return new Texture(this.game, this); }

  dispose(): void {
    if (this.disposed) return;
    // The current native ABI has no image-data release operation.
    this.handleValue = 0;
    this.disposed = true;
    this.context.unregister(this);
  }
}
