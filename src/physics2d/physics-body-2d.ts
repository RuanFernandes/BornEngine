import type { GameContext } from '../core/context';
import type { Vector2DLike } from '../core/types';
import { Vector2D } from '../math/vector2d';
import { GameComponent } from '../game/game-component';
import type { GameObject } from '../game/game-object';
import type { PhysicsWorld2D } from './physics-world-2d';

export type PhysicsBodyType2D = 'static' | 'dynamic' | 'kinematic';

export type PhysicsShape2D =
  | { type: 'box'; width: number; height: number }
  | { type: 'circle'; radius: number }
  | { type: 'segment'; start: Vector2DLike; end: Vector2DLike }
  | { type: 'convex'; vertices: ReadonlyArray<Vector2DLike> };

export interface OneWaySurface2D {
  /** Unit outward normal; bodies must approach from this side. */
  normal: Vector2DLike;
  /** Allowed prior-side overlap in world units. */
  tolerance?: number;
}

export interface PhysicsBody2DOptions {
  type?: PhysicsBodyType2D;
  shape: PhysicsShape2D;
  /** Initial world position for standalone bodies; an attached GameObject transform takes precedence. */
  position?: Vector2DLike;
  velocity?: Vector2DLike;
  mass?: number;
  gravityScale?: number;
  friction?: number;
  restitution?: number;
  isSensor?: boolean;
  layer?: number;
  mask?: number;
  oneWay?: OneWaySurface2D;
  /** Enables swept collision against static bodies. */
  ccd?: boolean;
  /** Minimum travel per fixed step that activates CCD, in world units. */
  ccdThreshold?: number;
}

export type PhysicsContactPhase2D = 'enter' | 'stay' | 'exit';

/** Pair-oriented contact record returned by PhysicsWorld2D.popContacts(). */
export interface PhysicsContact2D {
  readonly phase: PhysicsContactPhase2D;
  /** Stable pair ordering: the body created first is bodyA. */
  readonly bodyA: PhysicsBody2D;
  readonly bodyB: PhysicsBody2D;
  /** Unit vector pointing from bodyA toward bodyB. */
  readonly normal: Readonly<Vector2D>;
  readonly point: Readonly<Vector2D>;
  readonly penetration: number;
  readonly isTrigger: boolean;
}

/** Contact view oriented from the receiving body toward the other body. */
export interface PhysicsBodyContact2D {
  readonly phase: PhysicsContactPhase2D;
  readonly self: PhysicsBody2D;
  readonly other: PhysicsBody2D;
  readonly normal: Readonly<Vector2D>;
  readonly point: Readonly<Vector2D>;
  readonly penetration: number;
  readonly isTrigger: boolean;
}

function finite(value: number): boolean {
  return typeof value === 'number' && value === value && value !== Infinity && value !== -Infinity;
}

function copyVec(value: Vector2DLike): Vector2D {
  return Vector2D.from(value);
}

function validVec(value: Vector2DLike | undefined): value is Vector2DLike {
  return value !== undefined && value !== null && finite(value.x) && finite(value.y);
}

function validBits(value: number): boolean {
  return finite(value) && value >= 0 && value <= 0x7fffffff && Math.floor(value) === value;
}

function turn(a: Vector2DLike, b: Vector2DLike, c: Vector2DLike): number {
  return (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x);
}

function edgesCross(a: Vector2DLike, b: Vector2DLike, c: Vector2DLike, d: Vector2DLike): boolean {
  const first = turn(a, b, c),
    second = turn(a, b, d);
  const third = turn(c, d, a),
    fourth = turn(c, d, b);
  return first * second < 0 && third * fourth < 0;
}

let nextBodyId = 1;

/** A 2D rigid body component owned and stepped by one PhysicsWorld2D. */
export class PhysicsBody2D extends GameComponent {
  readonly id: number;
  readonly world: PhysicsWorld2D;
  readonly type: PhysicsBodyType2D;
  private shapeValue: PhysicsShape2D;
  readonly error: string | null;

  private positionValue: Vector2DLike;
  private velocityValue: Vector2DLike;
  private massValue: number;
  private gravityScaleValue: number;
  private frictionValue: number;
  private restitutionValue: number;
  private sensorValue: boolean;
  private layerValue: number;
  private maskValue: number;
  private oneWayValue: OneWaySurface2D | null;
  private ccdValue: boolean;
  private ccdThresholdValue: number;
  private forceValue: Vector2DLike = { x: 0, y: 0 };
  private disposed = false;
  private hasWrittenTransform = false;
  private lastWrittenX = 0;
  private lastWrittenY = 0;

  onCollisionEnter: ((contact: PhysicsBodyContact2D) => void) | null = null;
  onCollisionStay: ((contact: PhysicsBodyContact2D) => void) | null = null;
  onCollisionExit: ((contact: PhysicsBodyContact2D) => void) | null = null;
  onTriggerEnter: ((contact: PhysicsBodyContact2D) => void) | null = null;
  onTriggerStay: ((contact: PhysicsBodyContact2D) => void) | null = null;
  onTriggerExit: ((contact: PhysicsBodyContact2D) => void) | null = null;

  constructor(world: PhysicsWorld2D, options: PhysicsBody2DOptions) {
    super();
    this.id = nextBodyId++;
    this.world = world;

    const settings: PhysicsBody2DOptions =
      options === null || options === undefined ? { shape: { type: 'box', width: 0, height: 0 } } : options;
    this.type = settings.type === undefined ? 'dynamic' : settings.type;
    this.shapeValue = this.copyShape(settings.shape);
    this.positionValue = validVec(settings.position) ? copyVec(settings.position) : { x: 0, y: 0 };
    this.velocityValue = validVec(settings.velocity) ? copyVec(settings.velocity) : { x: 0, y: 0 };
    this.massValue = settings.mass === undefined ? 1 : settings.mass;
    this.gravityScaleValue = settings.gravityScale === undefined ? 1 : settings.gravityScale;
    this.frictionValue = settings.friction === undefined ? 0.2 : settings.friction;
    this.restitutionValue = settings.restitution === undefined ? 0 : settings.restitution;
    this.sensorValue = settings.isSensor === undefined ? false : settings.isSensor;
    this.layerValue = settings.layer === undefined ? 1 : settings.layer;
    this.maskValue = settings.mask === undefined ? 0x7fffffff : settings.mask;
    this.oneWayValue =
      settings.oneWay === undefined
        ? null
        : {
            normal:
              settings.oneWay === null || settings.oneWay.normal === undefined
                ? { x: NaN, y: NaN }
                : { x: settings.oneWay.normal.x, y: settings.oneWay.normal.y },
            tolerance:
              settings.oneWay === null ? NaN : settings.oneWay.tolerance === undefined ? 0 : settings.oneWay.tolerance,
          };
    this.ccdValue = settings.ccd === true;
    this.ccdThresholdValue = settings.ccdThreshold === undefined ? 0 : settings.ccdThreshold;

    const error = this.validate(settings);
    this.error = error;
    if (error === null && world._registerBody(this)) this.enabled = true;
    else this.enabled = false;
  }

  get isDisposed(): boolean {
    return this.disposed;
  }
  get position(): Vector2D {
    return Vector2D.from(this.positionValue);
  }
  get velocity(): Vector2D {
    return Vector2D.from(this.velocityValue);
  }
  get mass(): number {
    return this.massValue;
  }
  get gravityScale(): number {
    return this.gravityScaleValue;
  }
  get friction(): number {
    return this.frictionValue;
  }
  get restitution(): number {
    return this.restitutionValue;
  }
  get isSensor(): boolean {
    return this.sensorValue;
  }
  get layer(): number {
    return this.layerValue;
  }
  get mask(): number {
    return this.maskValue;
  }
  get shape(): PhysicsShape2D {
    return this.copyShape(this.shapeValue);
  }
  get oneWay(): OneWaySurface2D | null {
    return this.oneWayValue === null
      ? null
      : { normal: copyVec(this.oneWayValue.normal), tolerance: this.oneWayValue.tolerance };
  }
  get ccd(): boolean {
    return this.ccdValue;
  }
  get ccdThreshold(): number {
    return this.ccdThresholdValue;
  }

  setPosition(value: Vector2DLike): boolean {
    if (this.disposed || !validVec(value)) return false;
    this.positionValue = copyVec(value);
    this.hasWrittenTransform = false;
    this.writeOwnerPosition();
    this.world._bodyMoved(this);
    return true;
  }

  setVelocity(value: Vector2DLike): boolean {
    if (this.disposed || !validVec(value)) return false;
    this.velocityValue = copyVec(value);
    return true;
  }

  setMass(value: number): boolean {
    if (this.disposed || this.type !== 'dynamic' || !finite(value) || value <= 0) return false;
    this.massValue = value;
    return true;
  }

  setGravityScale(value: number): boolean {
    if (this.disposed || !finite(value)) return false;
    this.gravityScaleValue = value;
    return true;
  }

  setFriction(value: number): boolean {
    if (this.disposed || !finite(value) || value < 0) return false;
    this.frictionValue = value;
    return true;
  }

  setRestitution(value: number): boolean {
    if (this.disposed || !finite(value) || value < 0 || value > 1) return false;
    this.restitutionValue = value;
    return true;
  }

  setSensor(value: boolean): boolean {
    if (this.disposed) return false;
    this.sensorValue = value;
    return true;
  }

  setCollisionFilter(layer: number, mask: number): boolean {
    if (this.disposed || !validBits(layer) || layer === 0 || !validBits(mask)) return false;
    this.layerValue = layer;
    this.maskValue = mask;
    return true;
  }

  applyForce(force: Vector2DLike): boolean {
    if (this.disposed || this.type !== 'dynamic' || !validVec(force)) return false;
    this.forceValue.x += force.x;
    this.forceValue.y += force.y;
    return true;
  }

  applyImpulse(impulse: Vector2DLike): boolean {
    if (this.disposed || this.type !== 'dynamic' || !validVec(impulse)) return false;
    this.velocityValue.x += impulse.x / this.massValue;
    this.velocityValue.y += impulse.y / this.massValue;
    return true;
  }

  _canAttachTo(context: GameContext): boolean {
    return !this.disposed && this.error === null && this.world.context === context && this.world.isReady;
  }

  /** @internal Samples the attached GameObject transform before simulation. */
  _syncFromTransform(): boolean {
    if (this.disposed) return false;
    const owner: GameObject | null = this.gameObject;
    if (owner === null) return true;
    if (!this.isActiveAndEnabled || owner.scene === null) return false;
    const worldPosition = owner.transform.worldPosition;
    if (
      this.type !== 'dynamic' ||
      !this.hasWrittenTransform ||
      worldPosition.x !== this.lastWrittenX ||
      worldPosition.y !== this.lastWrittenY
    ) {
      this.positionValue = { x: worldPosition.x, y: worldPosition.y };
    }
    return true;
  }

  /** @internal Integrates a dynamic body once. */
  _integrate(dt: number, gravity: Vector2DLike): void {
    if (this.disposed || this.type !== 'dynamic') return;
    this.velocityValue.x += (gravity.x * this.gravityScaleValue + this.forceValue.x / this.massValue) * dt;
    this.velocityValue.y += (gravity.y * this.gravityScaleValue + this.forceValue.y / this.massValue) * dt;
    this.positionValue.x += this.velocityValue.x * dt;
    this.positionValue.y += this.velocityValue.y * dt;
    this.forceValue.x = 0;
    this.forceValue.y = 0;
  }

  /** @internal Collision solver hooks; inverse mass is zero for immovable bodies. */
  _inverseMass(): number {
    return !this.disposed && this.type === 'dynamic' ? 1 / this.massValue : 0;
  }
  _moveBy(x: number, y: number): void {
    this.positionValue.x += x;
    this.positionValue.y += y;
  }
  _addVelocity(x: number, y: number): void {
    this.velocityValue.x += x;
    this.velocityValue.y += y;
  }
  _clearForce(): void {
    this.forceValue.x = 0;
    this.forceValue.y = 0;
  }
  _setPositionInternal(value: Vector2DLike): void {
    this.positionValue = copyVec(value);
  }
  _setVelocityInternal(value: Vector2DLike): void {
    this.velocityValue = copyVec(value);
  }
  _isUsable(): boolean {
    return !this.disposed && this.error === null && this.enabled;
  }

  /** @internal Writes dynamic simulation position back without changing Z. */
  _syncToTransform(): void {
    if (this.disposed || this.type !== 'dynamic') return;
    const owner: GameObject | null = this.gameObject;
    if (owner === null || owner.scene === null || !this.isActiveAndEnabled) return;
    const current = owner.transform.worldPosition;
    owner.transform.setWorldPosition({ x: this.positionValue.x, y: this.positionValue.y, z: current.z });
    this.lastWrittenX = this.positionValue.x;
    this.lastWrittenY = this.positionValue.y;
    this.hasWrittenTransform = true;
  }

  _emitContact(contact: PhysicsBodyContact2D): void {
    if (this.disposed || !this.enabled) return;
    const owner: GameObject | null = this.gameObject;
    if (owner !== null && (!this.isActiveAndEnabled || owner.scene === null)) return;
    let callback: ((value: PhysicsBodyContact2D) => void) | null = null;
    if (contact.isTrigger) {
      if (contact.phase === 'enter') callback = this.onTriggerEnter;
      else if (contact.phase === 'stay') callback = this.onTriggerStay;
      else callback = this.onTriggerExit;
    } else {
      if (contact.phase === 'enter') callback = this.onCollisionEnter;
      else if (contact.phase === 'stay') callback = this.onCollisionStay;
      else callback = this.onCollisionExit;
    }
    if (callback !== null) callback(contact);
  }

  /** @internal Removes the body when its GameObject destroys this component. */
  onDestroy(): void {
    this.dispose();
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.enabled = false;
    this._clearForce();
    this.world._unregisterBody(this);
  }

  /** @internal Called when the owning world is disposed. */
  _disposeFromWorld(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.enabled = false;
    this._clearForce();
  }

  private copyShape(value: PhysicsShape2D): PhysicsShape2D {
    if (value === null || value === undefined) return { type: 'box', width: 0, height: 0 };
    if (value.type === 'circle') return { type: 'circle', radius: value.radius };
    if (value.type === 'segment')
      return {
        type: 'segment',
        start:
          value.start === null || value.start === undefined
            ? { x: NaN, y: NaN }
            : { x: value.start.x, y: value.start.y },
        end: value.end === null || value.end === undefined ? { x: NaN, y: NaN } : { x: value.end.x, y: value.end.y },
      };
    if (value.type === 'convex') {
      const vertices: Vector2DLike[] = [];
      if (value.vertices !== null && value.vertices !== undefined) {
        for (let index = 0; index < value.vertices.length; index++) {
          const point = value.vertices[index];
          vertices.push(point === null || point === undefined ? { x: NaN, y: NaN } : { x: point.x, y: point.y });
        }
      }
      return { type: 'convex', vertices };
    }
    return { type: 'box', width: value.width, height: value.height };
  }

  private validate(options: PhysicsBody2DOptions): string | null {
    if (!this.world.isReady) return this.world.error || 'PhysicsWorld2D is not ready.';
    if (this.type !== 'static' && this.type !== 'dynamic' && this.type !== 'kinematic') {
      return 'PhysicsBody2D type must be static, dynamic, or kinematic.';
    }
    if (
      options.shape === null ||
      options.shape === undefined ||
      (options.shape.type !== 'box' &&
        options.shape.type !== 'circle' &&
        options.shape.type !== 'segment' &&
        options.shape.type !== 'convex')
    ) {
      return 'PhysicsBody2D requires a supported collision shape.';
    }
    if (
      this.shape.type === 'box' &&
      (!finite(this.shape.width) || !finite(this.shape.height) || this.shape.width <= 0 || this.shape.height <= 0)
    ) {
      return 'PhysicsBody2D box dimensions must be finite and positive.';
    }
    if (this.shape.type === 'circle' && (!finite(this.shape.radius) || this.shape.radius <= 0)) {
      return 'PhysicsBody2D circle radius must be finite and positive.';
    }
    if (this.shapeValue.type === 'segment') {
      const shape = this.shapeValue;
      const length = Math.hypot(shape.end.x - shape.start.x, shape.end.y - shape.start.y);
      if (
        this.type !== 'static' ||
        !validVec(shape.start) ||
        !validVec(shape.end) ||
        !finite(length) ||
        length <= 0.0000001
      ) {
        return 'PhysicsBody2D segment requires distinct finite endpoints and a static body.';
      }
    }
    if (this.shapeValue.type === 'convex') {
      const vertices = this.shapeValue.vertices;
      if (this.type !== 'static' || vertices.length < 3)
        return 'PhysicsBody2D convex shape requires at least three vertices and a static body.';
      let winding = 0;
      let area = 0;
      for (let index = 0; index < vertices.length; index++) {
        const a = vertices[index];
        const b = vertices[(index + 1) % vertices.length];
        const c = vertices[(index + 2) % vertices.length];
        if (!validVec(a) || !validVec(b) || !validVec(c)) return 'PhysicsBody2D convex vertices must be finite.';
        const cross = (b.x - a.x) * (c.y - b.y) - (b.y - a.y) * (c.x - b.x);
        const edgeLength = Math.hypot(b.x - a.x, b.y - a.y);
        if (
          !finite(edgeLength) ||
          !finite(cross) ||
          edgeLength <= 0.0000001 ||
          Math.abs(cross) <= 0.0000001 ||
          (winding !== 0 && cross * winding < 0)
        )
          return 'PhysicsBody2D convex vertices must form a nondegenerate convex polygon.';
        winding = cross;
        area += a.x * b.y - a.y * b.x;
      }
      if (!finite(area) || Math.abs(area) <= 0.0000001) return 'PhysicsBody2D convex area must be finite and nonzero.';
      for (let edge = 0; edge < vertices.length; edge++) {
        const a = vertices[edge],
          b = vertices[(edge + 1) % vertices.length];
        for (let point = 0; point < vertices.length; point++) {
          if (point === edge || point === (edge + 1) % vertices.length) continue;
          const side = turn(a, b, vertices[point]) * winding;
          if (!finite(side) || side < 0 || Math.abs(side) <= 0.0000001) {
            return 'PhysicsBody2D convex vertices must lie consistently inside every edge.';
          }
        }
      }
      for (let first = 0; first < vertices.length; first++) {
        for (let second = first + 2; second < vertices.length; second++) {
          if (first === 0 && second === vertices.length - 1) continue;
          if (
            edgesCross(
              vertices[first],
              vertices[(first + 1) % vertices.length],
              vertices[second],
              vertices[(second + 1) % vertices.length],
            )
          ) {
            return 'PhysicsBody2D convex edges must not intersect.';
          }
        }
      }
    }
    if (this.oneWayValue !== null) {
      const normal = this.oneWayValue.normal;
      const length = Math.hypot(normal.x, normal.y);
      if (
        this.type !== 'static' ||
        !validVec(normal) ||
        !finite(length) ||
        length <= 0.0000001 ||
        !finite(this.oneWayValue.tolerance!) ||
        this.oneWayValue.tolerance! < 0
      ) {
        return 'PhysicsBody2D one-way surface requires a static body, finite nonzero normal, and nonnegative tolerance.';
      }
      this.oneWayValue.normal = { x: normal.x / length, y: normal.y / length };
    }
    if (
      (options.ccd !== undefined && typeof options.ccd !== 'boolean') ||
      !finite(this.ccdThresholdValue) ||
      this.ccdThresholdValue < 0
    ) {
      return 'PhysicsBody2D CCD settings are invalid.';
    }
    if (options.position !== undefined && !validVec(options.position)) {
      return 'PhysicsBody2D position must be finite.';
    }
    if (options.velocity !== undefined && !validVec(options.velocity)) {
      return 'PhysicsBody2D velocity must be finite.';
    }
    if (this.type === 'dynamic' && (!finite(this.massValue) || this.massValue <= 0)) {
      return 'Dynamic PhysicsBody2D mass must be finite and positive.';
    }
    if (
      !finite(this.gravityScaleValue) ||
      !finite(this.frictionValue) ||
      this.frictionValue < 0 ||
      !finite(this.restitutionValue) ||
      this.restitutionValue < 0 ||
      this.restitutionValue > 1
    ) {
      return 'PhysicsBody2D material settings are invalid.';
    }
    if (!validBits(this.layerValue) || this.layerValue === 0 || !validBits(this.maskValue)) {
      return 'PhysicsBody2D layer and mask must be non-negative 31-bit masks; layer cannot be zero.';
    }
    return null;
  }

  private writeOwnerPosition(): void {
    const owner: GameObject | null = this.gameObject;
    if (owner === null || owner.scene === null) return;
    const current = owner.transform.worldPosition;
    owner.transform.setWorldPosition({ x: this.positionValue.x, y: this.positionValue.y, z: current.z });
    this.lastWrittenX = this.positionValue.x;
    this.lastWrittenY = this.positionValue.y;
    this.hasWrittenTransform = true;
  }
}
