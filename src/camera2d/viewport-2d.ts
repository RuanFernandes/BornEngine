import type { Camera2D, Rect, Vector2DLike } from '../core/types';
import { Vector2D } from '../math/vector2d';

/**
 * How the logical area is scaled to the screen: `fit` letterboxes uniformly, `integer` uses a whole-number scale when
 * it can, `stretch` fills the screen.
 */
export type ViewportScalingMode2D = 'fit' | 'integer' | 'stretch';

/** Options for `Viewport2D`. */
export interface Viewport2DOptions {
  /** Width in logical world-screen units before camera zoom. */
  width: number;
  /** Height in logical world-screen units before camera zoom. */
  height: number;
  /** Scaling mode. Defaults to `fit`. */
  mode?: ViewportScalingMode2D;
}

/** Mapping from logical coordinates to screen pixels for one screen size. */
export interface ViewportTransform2D {
  /** Screen width in pixels. */
  readonly screenWidth: number;
  /** Screen height in pixels. */
  readonly screenHeight: number;
  /** Logical width. */
  readonly logicalWidth: number;
  /** Logical height. */
  readonly logicalHeight: number;
  /** Screen pixels per logical unit horizontally. */
  readonly scaleX: number;
  /** Screen pixels per logical unit vertically. */
  readonly scaleY: number;
  /** Left edge of the logical area on screen, in pixels. */
  readonly offsetX: number;
  /** Top edge of the logical area on screen, in pixels. */
  readonly offsetY: number;
  /** Width of the logical area on screen, in pixels. */
  readonly contentWidth: number;
  /** Height of the logical area on screen, in pixels. */
  readonly contentHeight: number;
}

function isFiniteNumber(value: number): boolean {
  return value === value && value !== Infinity && value !== -Infinity;
}

function isPositive(value: number): boolean {
  return isFiniteNumber(value) && value > 0;
}

function validPoint(value: Vector2DLike): boolean {
  return value !== null && value !== undefined && isFiniteNumber(value.x) && isFiniteNumber(value.y);
}

function validCamera(camera: Camera2D): boolean {
  return (
    camera !== null &&
    camera !== undefined &&
    validPoint(camera.offset) &&
    validPoint(camera.target) &&
    isFiniteNumber(camera.rotation) &&
    isFiniteNumber(camera.zoom) &&
    camera.zoom > 0
  );
}

function screenToWorld(position: Vector2DLike, camera: Camera2D): Vector2D | null {
  if (!validPoint(position) || !validCamera(camera)) return null;
  const radians = (camera.rotation * Math.PI) / 180;
  const cosine = Math.cos(radians);
  const sine = Math.sin(radians);
  const dx = (position.x - camera.offset.x) / camera.zoom;
  const dy = (position.y - camera.offset.y) / camera.zoom;
  const result = new Vector2D(cosine * dx + sine * dy + camera.target.x, -sine * dx + cosine * dy + camera.target.y);
  return validPoint(result) ? result : null;
}

function worldToScreen(position: Vector2DLike, camera: Camera2D): Vector2D | null {
  if (!validPoint(position) || !validCamera(camera)) return null;
  const radians = (camera.rotation * Math.PI) / 180;
  const cosine = Math.cos(radians);
  const sine = Math.sin(radians);
  const dx = position.x - camera.target.x;
  const dy = position.y - camera.target.y;
  const result = new Vector2D(
    (cosine * dx - sine * dy) * camera.zoom + camera.offset.x,
    (sine * dx + cosine * dy) * camera.zoom + camera.offset.y,
  );
  return validPoint(result) ? result : null;
}

/** A resize-safe logical-to-screen mapping shared by scene rendering and input. */
export class Viewport2D {
  /** Width in logical units. */
  readonly logicalWidth: number;
  /** Height in logical units. */
  readonly logicalHeight: number;
  /** Scaling mode. */
  readonly mode: ViewportScalingMode2D;
  /** Message describing why the options were rejected, or null. */
  readonly error: string | null;

  /** Creates a viewport. Invalid options are reported through `error`, not thrown. */
  constructor(options: Viewport2DOptions) {
    const settings = options === null || options === undefined ? ({} as Viewport2DOptions) : options;
    this.logicalWidth = settings.width;
    this.logicalHeight = settings.height;
    this.mode = settings.mode === undefined ? 'fit' : settings.mode;

    let error: string | null = null;
    if (!isPositive(this.logicalWidth) || !isPositive(this.logicalHeight)) {
      error = 'Viewport2D logical dimensions must be positive finite numbers.';
    } else if (this.mode !== 'fit' && this.mode !== 'integer' && this.mode !== 'stretch') {
      error = 'Viewport2D mode must be fit, integer, or stretch.';
    }
    this.error = error;
  }

  /** True when the options were accepted. */
  get isValid(): boolean {
    return this.error === null;
  }

  /** Returns an immutable-by-copy mapping for the current renderer size. */
  getTransform(screenWidth: number, screenHeight: number): ViewportTransform2D | null {
    if (!isPositive(screenWidth) || !isPositive(screenHeight)) return null;

    if (!this.isValid) {
      return {
        screenWidth,
        screenHeight,
        logicalWidth: screenWidth,
        logicalHeight: screenHeight,
        scaleX: 1,
        scaleY: 1,
        offsetX: 0,
        offsetY: 0,
        contentWidth: screenWidth,
        contentHeight: screenHeight,
      };
    }

    let scaleX: number;
    let scaleY: number;
    let offsetX = 0;
    let offsetY = 0;
    if (this.mode === 'stretch') {
      scaleX = screenWidth / this.logicalWidth;
      scaleY = screenHeight / this.logicalHeight;
    } else {
      const fitScale = Math.min(screenWidth / this.logicalWidth, screenHeight / this.logicalHeight);
      const scale = this.mode === 'integer' && fitScale >= 1 ? Math.floor(fitScale) : fitScale;
      scaleX = scale;
      scaleY = scale;
      offsetX = (screenWidth - this.logicalWidth * scaleX) * 0.5;
      offsetY = (screenHeight - this.logicalHeight * scaleY) * 0.5;
    }

    const contentWidth = this.logicalWidth * scaleX;
    const contentHeight = this.logicalHeight * scaleY;
    if (
      !isPositive(scaleX) ||
      !isPositive(scaleY) ||
      !isFiniteNumber(contentWidth) ||
      !isFiniteNumber(contentHeight) ||
      !isFiniteNumber(offsetX) ||
      !isFiniteNumber(offsetY)
    )
      return null;

    return {
      screenWidth,
      screenHeight,
      logicalWidth: this.logicalWidth,
      logicalHeight: this.logicalHeight,
      scaleX,
      scaleY,
      offsetX,
      offsetY,
      contentWidth,
      contentHeight,
    };
  }

  /** Converts a screen pixel to logical coordinates. Returns null outside the letterboxed area or for invalid input. */
  screenToLogical(position: Vector2DLike, screenWidth: number, screenHeight: number): Vector2D | null {
    if (!validPoint(position)) return null;
    const transform = this.getTransform(screenWidth, screenHeight);
    if (transform === null) return null;
    if (
      position.x < transform.offsetX ||
      position.y < transform.offsetY ||
      position.x >= transform.offsetX + transform.contentWidth ||
      position.y >= transform.offsetY + transform.contentHeight
    )
      return null;
    const logical = new Vector2D(
      (position.x - transform.offsetX) / transform.scaleX,
      (position.y - transform.offsetY) / transform.scaleY,
    );
    return validPoint(logical) ? logical : null;
  }

  /** Converts logical coordinates to a screen pixel. Returns null for invalid input. */
  logicalToScreen(position: Vector2DLike, screenWidth: number, screenHeight: number): Vector2D | null {
    if (!validPoint(position)) return null;
    const transform = this.getTransform(screenWidth, screenHeight);
    if (transform === null) return null;
    const screen = new Vector2D(
      position.x * transform.scaleX + transform.offsetX,
      position.y * transform.scaleY + transform.offsetY,
    );
    return validPoint(screen) ? screen : null;
  }

  /**
   * Converts a screen pixel to world coordinates through the viewport and camera. Returns null outside the letterboxed
   * area or for invalid input.
   */
  screenToWorld(position: Vector2DLike, camera: Camera2D, screenWidth: number, screenHeight: number): Vector2D | null {
    const logical = this.screenToLogical(position, screenWidth, screenHeight);
    return logical === null ? null : screenToWorld(logical, camera);
  }

  /** Converts world coordinates to a screen pixel through the camera and viewport. Returns null for invalid input. */
  worldToScreen(position: Vector2DLike, camera: Camera2D, screenWidth: number, screenHeight: number): Vector2D | null {
    const logical = worldToScreen(position, camera);
    return logical === null ? null : this.logicalToScreen(logical, screenWidth, screenHeight);
  }

  /** @internal Maps letterbox content into the renderer's camera pass. */
  _renderTransform(screenWidth: number, screenHeight: number): ViewportTransform2D | null {
    return this.getTransform(screenWidth, screenHeight);
  }

  /** @internal The renderer needs the exact clipped logical rectangle. */
  _clipRect(transform: ViewportTransform2D): Rect {
    return {
      x: transform.offsetX,
      y: transform.offsetY,
      width: transform.contentWidth,
      height: transform.contentHeight,
    };
  }
}
