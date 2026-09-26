import { GameContext, ContextDrawable } from '../core/context';
import * as operations from './internal';
import { Colors } from '../core/colors';
import type { Color, Vec2 } from '../core/types';
import { Texture } from './texture';

/** Game-owned offscreen target. Rendering into it is controlled by Renderer. */
export class RenderTexture implements ContextDrawable {
  readonly resourceKind = 'render-texture';
  readonly error: string | null;
  private handleValue = 0;
  private disposed = false;
  private textureValue: Texture | null = null;

  constructor(private readonly context: GameContext, readonly width: number, readonly height: number) {
    if (!context.isReady || context.isDisposed || width <= 0 || height <= 0) {
      this.error = 'A ready Game and positive render target dimensions are required.';
      return;
    }
    this.handleValue = operations.loadRenderTexture(width, height);
    this.error = this.handleValue === 0 ? 'Unable to create render texture.' : null;
    context.register(this);
  }

  get isLoaded(): boolean { return this.context.isReady && !this.context.isDisposed && !this.disposed && this.handleValue !== 0; }
  get isDisposed(): boolean { return this.disposed; }

  get texture(): Texture {
    if (this.textureValue === null) this.textureValue = new Texture(this.context, this);
    return this.textureValue;
  }

  begin(): boolean { return this.isLoaded && this.context.beginRenderTarget(this); }
  end(): boolean { return this.isLoaded && this.context.endRenderTarget(this); }
  draw(position: Vec2, tint: Color = Colors.WHITE): boolean {
    if (!this.isLoaded) return false;
    return this.context.draw(this, position, tint);
  }

  /** @internal Renderer entry point; does not expose the native handle. */
  drawNative(position: Vec2, tint: Color): boolean {
    if (!this.isLoaded || !this.context.owns(this)) return false;
    const texture = operations.getRenderTextureTexture(this.handleValue);
    if (texture.handle === 0) return false;
    operations.drawTexture(texture, position.x, position.y, tint);
    return true;
  }

  /** @internal Renderer entry point. */
  beginNative(): boolean {
    if (!this.isLoaded) return false;
    operations.beginTextureMode(this.handleValue);
    return true;
  }

  /** @internal Renderer entry point. */
  endNative(): boolean {
    if (!this.isLoaded) return false;
    operations.endTextureMode();
    return true;
  }

  dispose(): void {
    if (this.disposed) return;
    this.context.endRenderTarget(this);
    if (this.handleValue !== 0) operations.unloadRenderTexture(this.handleValue);
    this.handleValue = 0;
    this.disposed = true;
    this.context.unregister(this);
  }
}
