import type { GameContext } from '../core/context';
import type { Color, Vector2DLike } from '../core/types';
import type { Renderer } from '../core/renderer';
import { GameComponent } from '../game/game-component';
import * as spriteOperations from './internal';
import type { SpriteFrame } from './sprite-sheet';
import type { Texture } from '../textures/texture';

export interface ParticleRange {
  readonly min: number;
  readonly max: number;
}

export type ParticleEmitterShape =
  | { readonly type: 'point' }
  | { readonly type: 'circle'; readonly radius: number }
  | { readonly type: 'box'; readonly width: number; readonly height: number }
  | { readonly type: 'cone'; readonly angle: number };

export interface ParticleBurstOptions {
  /** Spawn offset in the emitter's local coordinates. */
  readonly position?: Vector2DLike;
  /** Emission direction in the emitter's local coordinates. */
  readonly direction?: Vector2DLike;
}

export interface ParticleEmitter2DOptions {
  /** Preallocated particle slots. Defaults to 256. */
  readonly capacity?: number;
  /** Frames sampled by particles, or cycled at frameRate. All frames share one atlas. */
  readonly frames: readonly SpriteFrame[];
  /** Continuous particles per second while play() is active. */
  readonly emissionRate?: number;
  readonly shape?: ParticleEmitterShape;
  readonly lifetime?: ParticleRange;
  readonly speed?: ParticleRange;
  /** Width in world units; frame aspect ratio determines height. */
  readonly startSize?: ParticleRange;
  readonly endSize?: ParticleRange;
  readonly acceleration?: Vector2DLike;
  /** Velocity damping coefficient per second. */
  readonly drag?: number;
  readonly startColor?: Color;
  readonly endColor?: Color;
  /** Spin in degrees per second. */
  readonly spin?: ParticleRange;
  /** Local-space direction used by continuous emission. Defaults to up. */
  readonly direction?: Vector2DLike;
  /** Local particles follow the emitter; world particles keep their spawn transform. */
  readonly space?: 'local' | 'world';
  /** Atlas frames per second for each particle. Zero picks one frame at spawn. */
  readonly frameRate?: number;
}

const MAX_PARTICLE_CAPACITY = 100_000;
const MAX_PARTICLE_FRAMES = 1_024;

function isFiniteNumber(value: number): boolean {
  return value === value && value !== Infinity && value !== -Infinity;
}

function isArray(value: any): boolean {
  return Array.isArray(value);
}

function validRange(value: ParticleRange, allowZero: boolean): boolean {
  return (
    value !== null &&
    value !== undefined &&
    isFiniteNumber(value.min) &&
    isFiniteNumber(value.max) &&
    (allowZero ? value.min >= 0 : value.min > 0) &&
    value.max >= value.min
  );
}

function validOrderedRange(value: ParticleRange): boolean {
  return (
    value !== null &&
    value !== undefined &&
    isFiniteNumber(value.min) &&
    isFiniteNumber(value.max) &&
    value.max >= value.min
  );
}

function validVector(value: Vector2DLike): boolean {
  return value !== null && value !== undefined && isFiniteNumber(value.x) && isFiniteNumber(value.y);
}

function validColor(value: Color): boolean {
  return (
    value !== null &&
    value !== undefined &&
    isFiniteNumber(value.r) &&
    isFiniteNumber(value.g) &&
    isFiniteNumber(value.b) &&
    isFiniteNumber(value.a) &&
    value.r >= 0 &&
    value.r <= 255 &&
    value.g >= 0 &&
    value.g <= 255 &&
    value.b >= 0 &&
    value.b <= 255 &&
    value.a >= 0 &&
    value.a <= 255
  );
}

function validTransform(position: Vector2DLike, scale: Vector2DLike, rotation: number): boolean {
  return validVector(position) && validVector(scale) && isFiniteNumber(rotation);
}

function rotationZRadians(rotation: { x: number; y: number; z: number; w: number }): number {
  const sin = 2 * (rotation.w * rotation.z + rotation.x * rotation.y);
  const cos = 1 - 2 * (rotation.y * rotation.y + rotation.z * rotation.z);
  return Math.atan2(sin, cos);
}

/** Native-pool 2D particles rendered automatically with their owning scene. */
export class ParticleEmitter2D extends GameComponent {
  readonly capacity: number;
  error: string | null = null;

  private textureValue: Texture | null = null;
  private frameValues: SpriteFrame[] = [];
  private handleValue = 0;
  private disposed = false;
  private initialDirection: Vector2DLike = { x: 0, y: -1 };

  constructor(options: ParticleEmitter2DOptions) {
    super();
    const settings: ParticleEmitter2DOptions = options === null || options === undefined ? { frames: [] } : options;
    const requestedCapacity = settings.capacity === undefined ? 256 : settings.capacity;
    this.capacity =
      isFiniteNumber(requestedCapacity) && Math.floor(requestedCapacity) === requestedCapacity ? requestedCapacity : 0;

    if (this.capacity < 1 || this.capacity > MAX_PARTICLE_CAPACITY) {
      this.error = 'ParticleEmitter2D capacity must be an integer from 1 to 100000.';
      return;
    }
    if (!isArray(settings.frames) || settings.frames.length === 0 || settings.frames.length > MAX_PARTICLE_FRAMES) {
      this.error = 'ParticleEmitter2D requires 1 to 1024 SpriteSheet frames.';
      return;
    }

    const firstFrame = settings.frames[0];
    if (
      firstFrame === null ||
      firstFrame === undefined ||
      firstFrame.sheet === null ||
      firstFrame.sheet === undefined ||
      firstFrame.sheet.error !== null ||
      firstFrame.sheet.texture === null ||
      !firstFrame.sheet.texture.isLoaded
    ) {
      this.error = 'ParticleEmitter2D frames must belong to a loaded SpriteSheet.';
      return;
    }
    this.textureValue = firstFrame.sheet.texture;
    for (let index = 0; index < settings.frames.length; index++) {
      const frame = settings.frames[index];
      if (
        frame === null ||
        frame === undefined ||
        frame.sheet !== firstFrame.sheet ||
        frame.sheet.texture !== this.textureValue
      ) {
        this.error = 'ParticleEmitter2D frames must come from the same SpriteSheet.';
        this.textureValue = null;
        return;
      }
      this.frameValues.push(frame);
    }

    const values = this.configurationValues(settings);
    if (values === null) return;
    this.initialDirection =
      settings.direction === undefined ? { x: 0, y: -1 } : { x: settings.direction.x, y: settings.direction.y };
    this.handleValue = this.textureValue._createParticleEmitter2D(this.capacity);
    if (this.handleValue === 0) {
      this.error = 'ParticleEmitter2D could not allocate its native pool.';
      return;
    }
    if (!spriteOperations.configureParticleEmitter2D(this.handleValue, values)) {
      spriteOperations.destroyParticleEmitter2D(this.handleValue);
      this.handleValue = 0;
      this.textureValue = null;
      this.error = 'ParticleEmitter2D configuration was rejected by the native runtime.';
    }
  }

  get liveCount(): number {
    return this.isLoaded ? spriteOperations.particleEmitter2DLiveCount(this.handleValue) : 0;
  }

  get isLoaded(): boolean {
    return !this.disposed && this.handleValue !== 0 && this.textureValue !== null && this.textureValue.isLoaded;
  }

  /** Begins continuous emission. Existing particles continue when stop() is called. */
  play(): boolean {
    if (!this.isLoaded) return false;
    spriteOperations.playParticleEmitter2D(this.handleValue);
    this.error = null;
    return true;
  }

  stop(): boolean {
    if (!this.isLoaded) return false;
    spriteOperations.stopParticleEmitter2D(this.handleValue);
    this.error = null;
    return true;
  }

  emitBurst(count: number, options: ParticleBurstOptions = {}): boolean {
    if (!this.isLoaded || !isFiniteNumber(count) || count <= 0 || Math.floor(count) !== count) {
      this.error = 'ParticleEmitter2D burst count must be a positive integer.';
      return false;
    }
    const settings: ParticleBurstOptions = options === null || options === undefined ? {} : options;
    const position = settings.position === undefined ? { x: 0, y: 0 } : settings.position;
    const direction = settings.direction === undefined ? this.initialDirection : settings.direction;
    if (!validVector(position) || !validVector(direction)) {
      this.error = 'ParticleEmitter2D burst position and direction must be finite.';
      return false;
    }
    const transform = this.readTransform();
    if (transform === null) return false;
    spriteOperations.emitParticleBurst2D(
      this.handleValue,
      Math.min(Math.floor(count), this.capacity),
      position,
      direction,
      transform,
    );
    this.error = null;
    return true;
  }

  /** @internal Receives the restricted particle command from ScriptComponent. */
  _receiveScriptParticleBurst(count: number, directionX: number, directionY: number): void {
    this.emitBurst(count, { direction: { x: directionX, y: directionY } });
  }

  clear(): boolean {
    if (!this.isLoaded) return false;
    spriteOperations.clearParticleEmitter2D(this.handleValue);
    this.error = null;
    return true;
  }

  dispose(): void {
    if (this.disposed) return;
    if (this.handleValue !== 0) spriteOperations.destroyParticleEmitter2D(this.handleValue);
    this.handleValue = 0;
    this.disposed = true;
    this.frameValues = [];
    this.textureValue = null;
  }

  onDestroy(): void {
    this.dispose();
  }

  update(deltaTime: number): void {
    if (!this.isLoaded || !this.isActiveAndEnabled || !isFiniteNumber(deltaTime) || deltaTime < 0) return;
    const transform = this.readTransform();
    if (transform === null) return;
    spriteOperations.updateParticleEmitter2D(this.handleValue, deltaTime, transform);
  }

  render(_renderer: Renderer): void {
    if (!this.isLoaded || !this.isActiveAndEnabled || this.liveCount === 0) return;
    const transform = this.readTransform();
    if (transform === null) return;
    spriteOperations.drawParticleEmitter2D(this.handleValue, transform);
  }

  /** @internal Keeps every atlas frame with the Game that owns its Texture. */
  _canAttachTo(context: GameContext): boolean {
    if (!this.isLoaded || this.frameValues.length === 0) return false;
    for (let index = 0; index < this.frameValues.length; index++) {
      if (!this.frameValues[index].sheet._canAttachTo(context)) return false;
    }
    return true;
  }

  private readTransform(): spriteOperations.ParticleTransformData | null {
    const owner = this.gameObject;
    if (owner === null)
      return {
        position: { x: 0, y: 0 },
        rotation: 0,
        scale: { x: 1, y: 1 },
      };
    const transform = owner.transform;
    const position = transform.worldPosition;
    const scale = transform.worldScale;
    const rotation = rotationZRadians(transform.worldRotation);
    if (!validTransform(position, scale, rotation)) {
      this.error = 'ParticleEmitter2D transform must be finite.';
      return null;
    }
    return { position, rotation, scale };
  }

  private configurationValues(settings: ParticleEmitter2DOptions): number[] | null {
    const rate = settings.emissionRate === undefined ? 0 : settings.emissionRate;
    const shape = settings.shape === undefined ? { type: 'point' as const } : settings.shape;
    const lifetime = settings.lifetime === undefined ? { min: 1, max: 1 } : settings.lifetime;
    const speed = settings.speed === undefined ? { min: 0, max: 0 } : settings.speed;
    const startSize = settings.startSize === undefined ? { min: 8, max: 8 } : settings.startSize;
    const endSize = settings.endSize === undefined ? startSize : settings.endSize;
    const acceleration = settings.acceleration === undefined ? { x: 0, y: 0 } : settings.acceleration;
    const drag = settings.drag === undefined ? 0 : settings.drag;
    const startColor = settings.startColor === undefined ? { r: 255, g: 255, b: 255, a: 255 } : settings.startColor;
    const endColor = settings.endColor === undefined ? { r: 255, g: 255, b: 255, a: 0 } : settings.endColor;
    const spin = settings.spin === undefined ? { min: 0, max: 0 } : settings.spin;
    const direction = settings.direction === undefined ? { x: 0, y: -1 } : settings.direction;
    const space = settings.space === undefined ? 'local' : settings.space;
    const frameRate = settings.frameRate === undefined ? 0 : settings.frameRate;

    if (
      !isFiniteNumber(rate) ||
      rate < 0 ||
      !validRange(lifetime, false) ||
      !validRange(speed, true) ||
      !validRange(startSize, true) ||
      !validRange(endSize, true) ||
      !validVector(acceleration) ||
      !isFiniteNumber(drag) ||
      drag < 0 ||
      !validColor(startColor) ||
      !validColor(endColor) ||
      !validOrderedRange(spin) ||
      !validVector(direction) ||
      (space !== 'local' && space !== 'world') ||
      !isFiniteNumber(frameRate) ||
      frameRate < 0
    ) {
      this.error = 'ParticleEmitter2D configuration contains an invalid range or value.';
      return null;
    }
    if (
      shape === null ||
      shape === undefined ||
      (shape.type !== 'point' && shape.type !== 'circle' && shape.type !== 'box' && shape.type !== 'cone')
    ) {
      this.error = 'ParticleEmitter2D shape must be point, circle, box, or cone.';
      return null;
    }
    let shapeKind = 0;
    let shapeWidth = 0;
    let shapeHeight = 0;
    let angle = 0;
    if (shape.type === 'circle') {
      if (!isFiniteNumber(shape.radius) || shape.radius < 0) {
        this.error = 'ParticleEmitter2D circle radius must be finite and non-negative.';
        return null;
      }
      shapeKind = 1;
      shapeWidth = shape.radius;
    } else if (shape.type === 'box') {
      if (!isFiniteNumber(shape.width) || !isFiniteNumber(shape.height) || shape.width < 0 || shape.height < 0) {
        this.error = 'ParticleEmitter2D box dimensions must be finite and non-negative.';
        return null;
      }
      shapeKind = 2;
      shapeWidth = shape.width;
      shapeHeight = shape.height;
    } else if (shape.type === 'cone') {
      if (!isFiniteNumber(shape.angle) || shape.angle < 0 || shape.angle > 360) {
        this.error = 'ParticleEmitter2D cone angle must be between 0 and 360 degrees.';
        return null;
      }
      shapeKind = 3;
      angle = shape.angle;
    }

    const values: number[] = [
      rate,
      shapeKind,
      shapeWidth,
      shapeHeight,
      angle,
      lifetime.min,
      lifetime.max,
      speed.min,
      speed.max,
      startSize.min,
      startSize.max,
      endSize.min,
      endSize.max,
      acceleration.x,
      acceleration.y,
      drag,
      startColor.r,
      startColor.g,
      startColor.b,
      startColor.a,
      endColor.r,
      endColor.g,
      endColor.b,
      endColor.a,
      spin.min,
      spin.max,
      direction.x,
      direction.y,
      space === 'local' ? 0 : 1,
      frameRate,
      this.frameValues.length,
    ];
    for (let index = 0; index < this.frameValues.length; index++) {
      const source = this.frameValues[index].source;
      values.push(source.x, source.y, source.width, source.height);
    }
    this.error = null;
    return values;
  }
}
