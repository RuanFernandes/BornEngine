import type { Camera2D, Rect, Vec2 } from '../core/types';

export type ViewportScalingMode2D = 'fit' | 'integer' | 'stretch';

export interface Viewport2DOptions {
  /** Width in logical world-screen units before camera zoom. */
  width: number;
  /** Height in logical world-screen units before camera zoom. */
  height: number;
  mode?: ViewportScalingMode2D;
}

export interface ViewportTransform2D {
  readonly screenWidth: number;
  readonly screenHeight: number;
  readonly logicalWidth: number;
  readonly logicalHeight: number;
  readonly scaleX: number;
  readonly scaleY: number;
  readonly offsetX: number;
  readonly offsetY: number;
  readonly contentWidth: number;
  readonly contentHeight: number;
}

function isFiniteNumber(value: number): boolean {
  return value === value && value !== Infinity && value !== -Infinity;
}

function isPositive(value: number): boolean {
  return isFiniteNumber(value) && value > 0;
}

function validPoint(value: Vec2): boolean {
  return value !== null && value !== undefined &&
    isFiniteNumber(value.x) && isFiniteNumber(value.y);
}

function validCamera(camera: Camera2D): boolean {
  return camera !== null && camera !== undefined &&
    validPoint(camera.offset) && validPoint(camera.target) &&
    isFiniteNumber(camera.rotation) && isFiniteNumber(camera.zoom) && camera.zoom > 0;
}

function screenToWorld(position: Vec2, camera: Camera2D): Vec2 | null {
  if (!validPoint(position) || !validCamera(camera)) return null;
  const radians = camera.rotation * Math.PI / 180;
  const cosine = Math.cos(radians);
  const sine = Math.sin(radians);
  const dx = (position.x - camera.offset.x) / camera.zoom;
  const dy = (position.y - camera.offset.y) / camera.zoom;
  const result = {
    x: cosine * dx + sine * dy + camera.target.x,
    y: -sine * dx + cosine * dy + camera.target.y,
  };
  return validPoint(result) ? result : null;
}

function worldToScreen(position: Vec2, camera: Camera2D): Vec2 | null {
  if (!validPoint(position) || !validCamera(camera)) return null;
  const radians = camera.rotation * Math.PI / 180;
  const cosine = Math.cos(radians);
  const sine = Math.sin(radians);
  const dx = position.x - camera.target.x;
  const dy = position.y - camera.target.y;
  const result = {
    x: (cosine * dx - sine * dy) * camera.zoom + camera.offset.x,
    y: (sine * dx + cosine * dy) * camera.zoom + camera.offset.y,
  };
  return validPoint(result) ? result : null;
}

/** A resize-safe logical-to-screen mapping shared by scene rendering and input. */
export class Viewport2D {
  readonly logicalWidth: number;
  readonly logicalHeight: number;
  readonly mode: ViewportScalingMode2D;
  readonly error: string | null;

  constructor(options: Viewport2DOptions) {
    const settings = options === null || options === undefined ? {} as Viewport2DOptions : options;
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

  get isValid(): boolean { return this.error === null; }

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
      const scale = this.mode === 'integer' && fitScale >= 1
        ? Math.floor(fitScale)
        : fitScale;
      scaleX = scale;
      scaleY = scale;
      offsetX = (screenWidth - this.logicalWidth * scaleX) * 0.5;
      offsetY = (screenHeight - this.logicalHeight * scaleY) * 0.5;
    }

    const contentWidth = this.logicalWidth * scaleX;
    const contentHeight = this.logicalHeight * scaleY;
    if (!isPositive(scaleX) || !isPositive(scaleY) ||
        !isFiniteNumber(contentWidth) || !isFiniteNumber(contentHeight) ||
        !isFiniteNumber(offsetX) || !isFiniteNumber(offsetY)) return null;

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

  screenToLogical(position: Vec2, screenWidth: number, screenHeight: number): Vec2 | null {
    if (!validPoint(position)) return null;
    const transform = this.getTransform(screenWidth, screenHeight);
    if (transform === null) return null;
    if (position.x < transform.offsetX || position.y < transform.offsetY ||
        position.x >= transform.offsetX + transform.contentWidth ||
        position.y >= transform.offsetY + transform.contentHeight) return null;
    const logical = {
      x: (position.x - transform.offsetX) / transform.scaleX,
      y: (position.y - transform.offsetY) / transform.scaleY,
    };
    return validPoint(logical) ? logical : null;
  }

  logicalToScreen(position: Vec2, screenWidth: number, screenHeight: number): Vec2 | null {
    if (!validPoint(position)) return null;
    const transform = this.getTransform(screenWidth, screenHeight);
    if (transform === null) return null;
    const screen = {
      x: position.x * transform.scaleX + transform.offsetX,
      y: position.y * transform.scaleY + transform.offsetY,
    };
    return validPoint(screen) ? screen : null;
  }

  screenToWorld(
    position: Vec2,
    camera: Camera2D,
    screenWidth: number,
    screenHeight: number,
  ): Vec2 | null {
    const logical = this.screenToLogical(position, screenWidth, screenHeight);
    return logical === null ? null : screenToWorld(logical, camera);
  }

  worldToScreen(
    position: Vec2,
    camera: Camera2D,
    screenWidth: number,
    screenHeight: number,
  ): Vec2 | null {
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
