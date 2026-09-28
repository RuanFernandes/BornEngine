import { Colors } from '../core/colors';
import type { GameContext } from '../core/context';
import type { Color, Rect, Vec2 } from '../core/types';
import type { Renderer } from '../core/renderer';
import { GameComponent } from '../game/game-component';
import type { SpriteFrame } from './sprite-sheet';

export interface SpriteRendererOptions {
  /** Untrimmed frame size in world units. Defaults to the frame's original atlas size. */
  size?: Vec2;
  /** Normalized pivot in the untrimmed frame. */
  pivot?: Vec2;
  tint?: Color;
  flipX?: boolean;
  flipY?: boolean;
  visible?: boolean;
  renderOrder?: number;
}

function copyVec2(value: Vec2): Vec2 {
  return { x: value.x, y: value.y };
}

function copyColor(value: Color): Color {
  return { r: value.r, g: value.g, b: value.b, a: value.a };
}

function isFiniteNumber(value: number): boolean {
  return value === value && value !== Infinity && value !== -Infinity;
}

function validSize(value: Vec2): boolean {
  return value !== null && value !== undefined &&
    isFiniteNumber(value.x) && isFiniteNumber(value.y) && value.x >= 0 && value.y >= 0;
}

function validColor(value: Color): boolean {
  return value !== null && value !== undefined &&
    isFiniteNumber(value.r) && isFiniteNumber(value.g) &&
    isFiniteNumber(value.b) && isFiniteNumber(value.a);
}

function rotationZDegrees(rotation: { x: number; y: number; z: number; w: number }): number {
  const sin = 2 * (rotation.w * rotation.z + rotation.x * rotation.y);
  const cos = 1 - 2 * (rotation.y * rotation.y + rotation.z * rotation.z);
  return Math.atan2(sin, cos) * 180 / Math.PI;
}

/** Draws a SpriteSheet frame from its GameObject transform during scene rendering. */
export class SpriteRenderer extends GameComponent {
  size: Vec2;
  pivot: Vec2;
  tint: Color;
  flipX: boolean;
  flipY: boolean;
  visible: boolean;
  error: string | null = null;

  private currentFrame: SpriteFrame | null = null;

  constructor(frame: SpriteFrame, options: SpriteRendererOptions = {}) {
    super();
    const settings: SpriteRendererOptions = options === null || options === undefined
      ? {}
      : options;
    this.size = { x: 0, y: 0 };
    this.pivot = { x: 0.5, y: 0.5 };
    this.tint = copyColor(Colors.WHITE);
    this.flipX = settings.flipX === undefined ? false : settings.flipX;
    this.flipY = settings.flipY === undefined ? false : settings.flipY;
    this.visible = settings.visible === undefined ? true : settings.visible;

    if (frame === null || frame === undefined) {
      this.error = 'SpriteRenderer requires a frame from a valid SpriteSheet.';
    } else {
      this.setFrame(frame);
    }
    if (settings.size !== undefined) this.setSize(settings.size);
    if (settings.pivot !== undefined) this.setPivot(settings.pivot);
    if (settings.tint !== undefined) {
      if (validColor(settings.tint)) this.tint = copyColor(settings.tint);
      else this.error = 'SpriteRenderer tint must be finite.';
    }
    if (settings.renderOrder !== undefined) {
      if (isFiniteNumber(settings.renderOrder)) this.renderOrder = settings.renderOrder;
      else this.error = 'SpriteRenderer renderOrder must be finite.';
    }
  }

  get frame(): SpriteFrame | null { return this.currentFrame; }

  /** Changes the frame without changing the renderer's size or pivot. */
  setFrame(frame: SpriteFrame | null): boolean {
    if (frame === undefined) {
      this.error = 'SpriteRenderer frame cannot be undefined.';
      return false;
    }
    if (frame === null) {
      this.currentFrame = null;
      this.error = null;
      return true;
    }
    if (frame.sheet === null || frame.sheet === undefined || frame.sheet.error !== null ||
        frame.sheet.texture === null || !frame.sheet.texture.isLoaded) {
      this.error = frame.sheet === null || frame.sheet === undefined
        ? 'SpriteRenderer requires a frame from a valid SpriteSheet.'
        : frame.sheet.error || 'SpriteRenderer texture is not loaded.';
      return false;
    }
    const owner = this.gameObject;
    if (owner !== null && owner.scene !== null && !frame.sheet._canAttachTo(owner.scene.context)) {
      this.error = 'Sprite frame texture belongs to a different Game.';
      return false;
    }

    const isInitialFrame = this.currentFrame === null;
    this.currentFrame = frame;
    this.error = null;
    if (isInitialFrame) {
      this.size = copyVec2(frame.originalSize);
      this.pivot = copyVec2(frame.pivot);
    }
    return true;
  }

  setSize(size: Vec2): boolean {
    if (!validSize(size)) {
      this.error = 'SpriteRenderer size must be finite and non-negative.';
      return false;
    }
    this.size = copyVec2(size);
    if (this.error === 'SpriteRenderer size must be finite and non-negative.') this.error = null;
    return true;
  }

  setPivot(pivot: Vec2): boolean {
    if (pivot === null || pivot === undefined ||
        !isFiniteNumber(pivot.x) || !isFiniteNumber(pivot.y)) {
      this.error = 'SpriteRenderer pivot must be finite.';
      return false;
    }
    this.pivot = copyVec2(pivot);
    if (this.error === 'SpriteRenderer pivot must be finite.') this.error = null;
    return true;
  }

  /** @internal Rejects a renderer whose frame is owned by another Game. */
  _canAttachTo(context: GameContext): boolean {
    return this.error === null && this.currentFrame !== null &&
      this.currentFrame.sheet._canAttachTo(context);
  }

  render(_renderer: Renderer): void {
    const frame = this.currentFrame;
    const owner = this.gameObject;
    if (!this.visible || this.error !== null || frame === null || owner === null ||
        owner.scene === null || !this.isActiveAndEnabled ||
        !frame.sheet._canAttachTo(owner.scene.context) ||
        !validSize(this.size) || this.size.x === 0 || this.size.y === 0 ||
        !isFiniteNumber(this.pivot.x) || !isFiniteNumber(this.pivot.y) || !validColor(this.tint)) return;

    const originalSize = frame.originalSize;
    if (originalSize.x <= 0 || originalSize.y <= 0) return;
    const transform = owner.transform;
    const worldPosition = transform.worldPosition;
    const worldScale = transform.worldScale;
    const worldRotation = transform.worldRotation;
    const scaleX = Math.abs(worldScale.x) * this.size.x / originalSize.x;
    const scaleY = Math.abs(worldScale.y) * this.size.y / originalSize.y;
    if (!isFiniteNumber(scaleX) || !isFiniteNumber(scaleY) || scaleX === 0 || scaleY === 0) return;

    const flipX = this.flipX !== (worldScale.x < 0);
    const flipY = this.flipY !== (worldScale.y < 0);
    const source: Rect = {
      x: frame.source.x,
      y: frame.source.y,
      width: flipX ? -frame.source.width : frame.source.width,
      height: flipY ? -frame.source.height : frame.source.height,
    };
    const destination: Rect = {
      x: worldPosition.x,
      y: worldPosition.y,
      width: frame.source.width * scaleX,
      height: frame.source.height * scaleY,
    };
    const trimOffset = frame.trim === null ? { x: 0, y: 0 } : frame.trim.offset;
    const origin: Vec2 = {
      x: this.pivot.x * this.size.x * Math.abs(worldScale.x) - trimOffset.x * scaleX,
      y: this.pivot.y * this.size.y * Math.abs(worldScale.y) - trimOffset.y * scaleY,
    };
    frame.sheet.texture.drawRegion(source, destination, origin, rotationZDegrees(worldRotation), this.tint);
  }
}
