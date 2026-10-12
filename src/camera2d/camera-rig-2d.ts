import type { Camera2D, Rect, Vector2DLike } from '../core/types';
import { Vector2D } from '../math/vector2d';
import { GameComponent } from '../game/game-component';
import type { GameObject } from '../game/game-object';
import type { Viewport2D } from './viewport-2d';
import type { Scene } from '../game/scene';

/** Options for `CameraRig2D`. Every field is optional. */
export interface CameraRig2DOptions {
  /** Object to follow. Omit it to follow the owning GameObject; null follows nothing. */
  target?: GameObject | null;
  /** World offset added to the followed position. */
  targetOffset?: Vector2DLike;
  /** Initial world point the camera looks at. */
  cameraTarget?: Vector2DLike;
  /** Screen point that the camera target is drawn at. Defaults to the center of the view. */
  offset?: Vector2DLike;
  /** Camera rotation in degrees. */
  rotation?: number;
  /** Initial zoom, clamped to `minZoom` and `maxZoom`. Defaults to 1. */
  zoom?: number;
  /** Follow smoothing time in seconds. 0 snaps to the target. */
  smoothing?: number;
  /** Rectangle, relative to the camera target, inside which the followed object moves without moving the camera. */
  deadZone?: Rect;
  /** World rectangle that the visible area is kept inside. */
  bounds?: Rect;
  /** Visible area in world units at zoom 1, used for centering and bounds. Defaults to the scene viewport size. */
  viewSize?: Vector2DLike;
  /** Lowest allowed zoom. Defaults to 0.01. */
  minZoom?: number;
  /** Highest allowed zoom. Defaults to 100. */
  maxZoom?: number;
}

/** Options for `CameraRig2D.shake`. */
export interface CameraShake2DOptions {
  /** Maximum shake offset per axis in world units. Defaults to (1, 1). */
  amplitude?: Vector2DLike;
  /** Shake length in seconds. Must be positive. */
  duration: number;
  /** Seed of the generated shake pattern. Defaults to 1. */
  seed?: number;
  /** At least two offset samples interpolated over the duration. They replace the generated shake pattern. */
  envelope?: readonly Vector2DLike[];
}

/** Detached camera state snapshot with Vector2D values for runtime math. */
export interface Camera2DSnapshot {
  /** Screen point that the target is drawn at. */
  readonly offset: Readonly<Vector2D>;
  /** World point the camera looks at. */
  readonly target: Readonly<Vector2D>;
  /** Rotation in degrees. */
  readonly rotation: number;
  /** Zoom factor. */
  readonly zoom: number;
}

interface ShakeState {
  elapsed: number;
  duration: number;
  amplitude: Vector2DLike;
  seed: number;
  envelope: Vector2DLike[] | null;
}

function finite(value: number): boolean {
  return value === value && value !== Infinity && value !== -Infinity;
}

function point(value: Vector2DLike | undefined | null): value is Vector2DLike {
  return value !== undefined && value !== null && finite(value.x) && finite(value.y);
}

function rect(value: Rect | undefined): value is Rect {
  return (
    value !== undefined &&
    finite(value.x) &&
    finite(value.y) &&
    finite(value.width) &&
    finite(value.height) &&
    value.width >= 0 &&
    value.height >= 0
  );
}

function copyPoint(value: Vector2DLike): Vector2D {
  return new Vector2D(value.x, value.y);
}
function copyRect(value: Rect): Rect {
  return { x: value.x, y: value.y, width: value.width, height: value.height };
}
function clamp(value: number, low: number, high: number): number {
  return Math.max(low, Math.min(high, value));
}

function validTarget(value: GameObject | null | undefined): value is GameObject | null {
  if (value === null || value === undefined) return true;
  if (typeof value !== 'object' || typeof value.destroyed !== 'boolean' || value.destroyed) return false;
  const transform: any = value.transform;
  if (transform === null || transform === undefined || typeof transform !== 'object') return false;
  const world: any = transform.worldPosition;
  return world !== null && world !== undefined && finite(world.x) && finite(world.y);
}

/**
 * Owns a mutable camera configuration and updates it from a scene target.
 * Without a `target` option it follows its own game object. Without an `offset`
 * option it centers the target in the view. Attached to a scene that has no
 * camera yet, it binds itself as the scene camera.
 */
export class CameraRig2D extends GameComponent {
  /** Message describing why the options were rejected, or null. A rig with an error does not move the camera. */
  readonly error: string | null;
  /** Object the camera follows, or null. Assign to change it. */
  target: GameObject | null;
  /** Follow smoothing time in seconds. */
  readonly smoothing: number;
  /** Dead zone rectangle relative to the camera target, or null. */
  readonly deadZone: Rect | null;
  /** World rectangle the visible area is kept inside, or null. */
  readonly bounds: Rect | null;
  /** Explicit view size in world units, or null to use the scene viewport. */
  readonly viewSize: Vector2D | null;
  /** Lowest allowed zoom. */
  readonly minZoom: number;
  /** Highest allowed zoom. */
  readonly maxZoom: number;

  private cameraValue: Camera2D;
  private targetOffsetValue: Vector2DLike;
  private shakeState: ShakeState | null = null;
  private shakeOffsetValue: Vector2DLike = { x: 0, y: 0 };
  private baseTargetValue: Vector2DLike;
  private followsOwner: boolean;
  private offsetFromView: boolean;

  /** Creates a rig. Invalid options are reported through `error`, not thrown. */
  constructor(options: CameraRig2DOptions = {}) {
    super();
    const settings = options === null || options === undefined ? {} : options;
    this.target = settings.target === undefined ? null : settings.target;
    this.followsOwner = settings.target === undefined;
    this.offsetFromView = settings.offset === undefined;
    this.smoothing = settings.smoothing === undefined ? 0 : settings.smoothing;
    this.minZoom = settings.minZoom === undefined ? 0.01 : settings.minZoom;
    this.maxZoom = settings.maxZoom === undefined ? 100 : settings.maxZoom;
    this.deadZone =
      settings.deadZone === undefined ? null : rect(settings.deadZone) ? copyRect(settings.deadZone) : null;
    this.bounds = settings.bounds === undefined ? null : rect(settings.bounds) ? copyRect(settings.bounds) : null;
    this.viewSize =
      settings.viewSize === undefined
        ? null
        : point(settings.viewSize) && settings.viewSize.x > 0 && settings.viewSize.y > 0
          ? copyPoint(settings.viewSize)
          : null;
    this.targetOffsetValue =
      settings.targetOffset === undefined
        ? { x: 0, y: 0 }
        : point(settings.targetOffset)
          ? copyPoint(settings.targetOffset)
          : { x: 0, y: 0 };

    let error: string | null = null;
    if (!finite(this.smoothing) || this.smoothing < 0) error = 'CameraRig2D smoothing must be finite and non-negative.';
    else if (!finite(this.minZoom) || this.minZoom <= 0 || !finite(this.maxZoom) || this.maxZoom < this.minZoom) {
      error = 'CameraRig2D zoom limits must be positive and ordered.';
    } else if (settings.offset !== undefined && !point(settings.offset)) error = 'CameraRig2D offset must be finite.';
    else if (settings.cameraTarget !== undefined && !point(settings.cameraTarget))
      error = 'CameraRig2D cameraTarget must be finite.';
    else if (settings.targetOffset !== undefined && !point(settings.targetOffset))
      error = 'CameraRig2D targetOffset must be finite.';
    else if (settings.rotation !== undefined && !finite(settings.rotation))
      error = 'CameraRig2D rotation must be finite.';
    else if (settings.zoom !== undefined && (!finite(settings.zoom) || settings.zoom <= 0))
      error = 'CameraRig2D zoom must be positive and finite.';
    else if (settings.deadZone !== undefined && !rect(settings.deadZone))
      error = 'CameraRig2D deadZone must be finite and non-negative.';
    else if (settings.bounds !== undefined && !rect(settings.bounds))
      error = 'CameraRig2D bounds must be finite and non-negative.';
    else if (
      settings.viewSize !== undefined &&
      (!point(settings.viewSize) || settings.viewSize.x <= 0 || settings.viewSize.y <= 0)
    ) {
      error = 'CameraRig2D viewSize must be positive and finite.';
    } else if (!validTarget(this.target)) error = 'CameraRig2D target must be a live GameObject.';
    this.error = error;

    const initialTarget =
      settings.cameraTarget !== undefined && point(settings.cameraTarget)
        ? copyPoint(settings.cameraTarget)
        : { x: 0, y: 0 };
    const initialOffset =
      settings.offset !== undefined && point(settings.offset) ? copyPoint(settings.offset) : { x: 0, y: 0 };
    const requestedZoom = settings.zoom === undefined ? 1 : settings.zoom;
    const initialZoom =
      error === null && finite(requestedZoom) && requestedZoom > 0
        ? clamp(requestedZoom, this.minZoom, this.maxZoom)
        : 1;
    this.baseTargetValue = copyPoint(initialTarget);
    this.cameraValue = {
      offset: initialOffset,
      target: copyPoint(initialTarget),
      rotation: settings.rotation !== undefined && finite(settings.rotation) ? settings.rotation : 0,
      zoom: initialZoom,
    };
  }

  /** Camera record snapshot; mutating it never changes the rig. */
  get camera(): Camera2DSnapshot {
    return {
      offset: copyPoint(this.cameraValue.offset),
      target: copyPoint(this.cameraValue.target),
      rotation: this.cameraValue.rotation,
      zoom: this.cameraValue.zoom,
    };
  }

  /** World offset added to the followed position, as a copy. */
  get targetOffset(): Vector2D {
    return copyPoint(this.targetOffsetValue);
  }

  /** Changes the followed object. Null stops following. Returns false for a destroyed object. */
  setTarget(target: GameObject | null): boolean {
    if (target === undefined || !validTarget(target)) return false;
    this.target = target;
    if (target === null) this.followsOwner = false;
    return true;
  }

  /** Sets the zoom, clamped to `minZoom` and `maxZoom`. Returns false for a non-positive or non-finite value. */
  setZoom(zoom: number): boolean {
    if (this.error !== null || !finite(zoom) || zoom <= 0) return false;
    this.cameraValue.zoom = clamp(zoom, this.minZoom, this.maxZoom);
    return true;
  }

  /** Sets the screen point that the target is drawn at and stops centering it in the view. */
  setOffset(offset: Vector2DLike): boolean {
    if (this.error !== null || !point(offset)) return false;
    this.cameraValue.offset = copyPoint(offset);
    this.offsetFromView = false;
    return true;
  }

  /** Makes this rig the scene camera when the scene does not have one yet. */
  override onAwake(): void {
    const scene = this.gameObject?.scene as Scene | null | undefined;
    if (scene === null || scene === undefined || typeof scene.bindCameraRig2D !== 'function') return;
    if (scene.camera2D === null) scene.bindCameraRig2D(this);
  }

  /**
   * Moves the camera toward the target, applying smoothing, dead zone, bounds and shake. Called each frame by the
   * scene.
   */
  update(dt: number): void {
    if (this.error !== null || !finite(dt) || dt < 0) return;
    if (this.offsetFromView) this.syncOffsetToView();
    const target = this.target ?? (this.followsOwner ? this.gameObject : null);
    if (target !== null && target !== undefined && validTarget(target)) {
      const world = target.transform.worldPosition;
      if (!finite(world.x) || !finite(world.y)) return;
      const targetPosition = { x: world.x + this.targetOffsetValue.x, y: world.y + this.targetOffsetValue.y };
      const desired =
        this.deadZone === null
          ? { x: targetPosition.x, y: targetPosition.y }
          : { x: this.baseTargetValue.x, y: this.baseTargetValue.y };
      if (this.deadZone !== null) {
        const left = this.baseTargetValue.x + this.deadZone.x;
        const right = left + this.deadZone.width;
        const top = this.baseTargetValue.y + this.deadZone.y;
        const bottom = top + this.deadZone.height;
        if (targetPosition.x < left) desired.x = targetPosition.x - this.deadZone.x;
        else if (targetPosition.x > right) desired.x = targetPosition.x - this.deadZone.x - this.deadZone.width;
        if (targetPosition.y < top) desired.y = targetPosition.y - this.deadZone.y;
        else if (targetPosition.y > bottom) desired.y = targetPosition.y - this.deadZone.y - this.deadZone.height;
      }
      const alpha = this.smoothing > 0 ? 1 - Math.exp(-dt / this.smoothing) : 1;
      this.baseTargetValue.x += (desired.x - this.baseTargetValue.x) * alpha;
      this.baseTargetValue.y += (desired.y - this.baseTargetValue.y) * alpha;
    }

    this.applyBounds();
    this.updateShake(dt);
    this.cameraValue.target = {
      x: this.baseTargetValue.x + this.shakeOffsetValue.x,
      y: this.baseTargetValue.y + this.shakeOffsetValue.y,
    };
  }

  /** Starts a camera shake, replacing any active one. Returns false for invalid options. */
  shake(options: CameraShake2DOptions): boolean {
    if (
      this.error !== null ||
      options === null ||
      options === undefined ||
      !finite(options.duration) ||
      options.duration <= 0
    )
      return false;
    const amplitude = options.amplitude === undefined ? { x: 1, y: 1 } : options.amplitude;
    if (!point(amplitude) || (options.seed !== undefined && !finite(options.seed))) return false;
    let envelope: Vector2DLike[] | null = null;
    if (options.envelope !== undefined) {
      if (options.envelope.length < 2) return false;
      envelope = [];
      for (let index = 0; index < options.envelope.length; index++) {
        const sample = options.envelope[index];
        if (sample === undefined || sample === null) return false;
        const sampleX = sample.x;
        const sampleY = sample.y;
        if (!finite(sampleX) || !finite(sampleY)) return false;
        envelope.push({ x: sampleX, y: sampleY });
      }
    }
    this.shakeState = {
      elapsed: 0,
      duration: options.duration,
      amplitude: copyPoint(amplitude),
      seed: options.seed === undefined ? 1 : Math.floor(options.seed),
      envelope,
    };
    this.shakeOffsetValue = { x: 0, y: 0 };
    return true;
  }

  /** Stops the active shake and puts the camera back on its unshaken position. */
  stopShake(): void {
    this.shakeState = null;
    this.shakeOffsetValue = { x: 0, y: 0 };
    this.cameraValue.target = copyPoint(this.baseTargetValue);
  }

  private updateShake(dt: number): void {
    const state = this.shakeState;
    if (state === null) {
      this.shakeOffsetValue = { x: 0, y: 0 };
      return;
    }
    state.elapsed = Math.min(state.duration, state.elapsed + dt);
    if (state.elapsed >= state.duration) {
      this.shakeState = null;
      this.shakeOffsetValue = { x: 0, y: 0 };
      return;
    }
    const progress = state.elapsed / state.duration;
    if (state.envelope !== null) {
      const scaled = progress * (state.envelope.length - 1);
      const index = Math.min(state.envelope.length - 2, Math.floor(scaled));
      const blend = scaled - index;
      const first = state.envelope[index];
      const second = state.envelope[index + 1];
      this.shakeOffsetValue = {
        x: first.x + (second.x - first.x) * blend,
        y: first.y + (second.y - first.y) * blend,
      };
      return;
    }
    const seed = state.seed || 1;
    const phaseX = (seed * 12.9898) % (Math.PI * 2);
    const phaseY = (seed * 78.233 + 1.2345) % (Math.PI * 2);
    const envelope = 1 - progress;
    const frequency = 2 * Math.PI * 17;
    this.shakeOffsetValue = {
      x: Math.sin(state.elapsed * frequency + phaseX) * state.amplitude.x * envelope,
      y: Math.sin(state.elapsed * frequency * 1.37 + phaseY) * state.amplitude.y * envelope,
    };
  }

  private applyBounds(): void {
    if (this.bounds === null) return;
    const size = this.getViewSize();
    const halfWidth = size.x / (2 * this.cameraValue.zoom);
    const halfHeight = size.y / (2 * this.cameraValue.zoom);
    const left = this.bounds.x;
    const right = left + this.bounds.width;
    const top = this.bounds.y;
    const bottom = top + this.bounds.height;
    const minX = left + halfWidth;
    const maxX = right - halfWidth;
    const minY = top + halfHeight;
    const maxY = bottom - halfHeight;
    this.baseTargetValue.x = minX > maxX ? (left + right) * 0.5 : clamp(this.baseTargetValue.x, minX, maxX);
    this.baseTargetValue.y = minY > maxY ? (top + bottom) * 0.5 : clamp(this.baseTargetValue.y, minY, maxY);
  }

  private syncOffsetToView(): void {
    const size = this.getViewSize();
    this.cameraValue.offset = { x: size.x / 2, y: size.y / 2 };
  }

  private getViewSize(): Vector2D {
    if (this.viewSize !== null) return copyPoint(this.viewSize);
    const owner = this.gameObject;
    const scene = owner === null ? null : (owner.scene as any);
    const viewport = scene === null ? null : (scene.viewport2D as Viewport2D | null);
    if (viewport !== null && viewport !== undefined && viewport.isValid) {
      return new Vector2D(viewport.logicalWidth, viewport.logicalHeight);
    }
    return new Vector2D(Math.max(0, this.cameraValue.offset.x * 2), Math.max(0, this.cameraValue.offset.y * 2));
  }
}
