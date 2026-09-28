import type { GameContext } from '../core/context';
import type { Vec2 } from '../core/types';
import { GameComponent } from '../game/game-component';
import type { GameObject } from '../game/game-object';
import type { PhysicsWorld2D } from './physics-world-2d';

export type PhysicsBodyType2D = 'static' | 'dynamic' | 'kinematic';

export type PhysicsShape2D =
  | { type: 'box'; width: number; height: number }
  | { type: 'circle'; radius: number };

export interface PhysicsBody2DOptions {
  type?: PhysicsBodyType2D;
  shape: PhysicsShape2D;
  /** Initial world position for standalone bodies; an attached GameObject transform takes precedence. */
  position?: Vec2;
  velocity?: Vec2;
  mass?: number;
  gravityScale?: number;
  friction?: number;
  restitution?: number;
  isSensor?: boolean;
  layer?: number;
  mask?: number;
}

export type PhysicsContactPhase2D = 'enter' | 'stay' | 'exit';

/** Pair-oriented contact record returned by PhysicsWorld2D.popContacts(). */
export interface PhysicsContact2D {
  readonly phase: PhysicsContactPhase2D;
  /** Stable pair ordering: the body created first is bodyA. */
  readonly bodyA: PhysicsBody2D;
  readonly bodyB: PhysicsBody2D;
  /** Unit vector pointing from bodyA toward bodyB. */
  readonly normal: Readonly<Vec2>;
  readonly point: Readonly<Vec2>;
  readonly penetration: number;
  readonly isTrigger: boolean;
}

/** Contact view oriented from the receiving body toward the other body. */
export interface PhysicsBodyContact2D {
  readonly phase: PhysicsContactPhase2D;
  readonly self: PhysicsBody2D;
  readonly other: PhysicsBody2D;
  readonly normal: Readonly<Vec2>;
  readonly point: Readonly<Vec2>;
  readonly penetration: number;
  readonly isTrigger: boolean;
}

function finite(value: number): boolean {
  return value === value && value !== Infinity && value !== -Infinity;
}

function copyVec(value: Vec2): Vec2 {
  return { x: value.x, y: value.y };
}

function validVec(value: Vec2 | undefined): boolean {
  return value !== undefined && value !== null && finite(value.x) && finite(value.y);
}

function validBits(value: number): boolean {
  return finite(value) && value >= 0 && value <= 0x7fffffff && Math.floor(value) === value;
}

let nextBodyId = 1;

/** A 2D rigid body component owned and stepped by one PhysicsWorld2D. */
export class PhysicsBody2D extends GameComponent {
  readonly id: number;
  readonly world: PhysicsWorld2D;
  readonly type: PhysicsBodyType2D;
  readonly shape: PhysicsShape2D;
  readonly error: string | null;

  private positionValue: Vec2;
  private velocityValue: Vec2;
  private massValue: number;
  private gravityScaleValue: number;
  private frictionValue: number;
  private restitutionValue: number;
  private sensorValue: boolean;
  private layerValue: number;
  private maskValue: number;
  private forceValue: Vec2 = { x: 0, y: 0 };
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

    const settings: PhysicsBody2DOptions = options === null || options === undefined
      ? { shape: { type: 'box', width: 0, height: 0 } }
      : options;
    this.type = settings.type === undefined ? 'dynamic' : settings.type;
    this.shape = this.copyShape(settings.shape);
    this.positionValue = validVec(settings.position) ? copyVec(settings.position) : { x: 0, y: 0 };
    this.velocityValue = validVec(settings.velocity) ? copyVec(settings.velocity) : { x: 0, y: 0 };
    this.massValue = settings.mass === undefined ? 1 : settings.mass;
    this.gravityScaleValue = settings.gravityScale === undefined ? 1 : settings.gravityScale;
    this.frictionValue = settings.friction === undefined ? 0.2 : settings.friction;
    this.restitutionValue = settings.restitution === undefined ? 0 : settings.restitution;
    this.sensorValue = settings.isSensor === undefined ? false : settings.isSensor;
    this.layerValue = settings.layer === undefined ? 1 : settings.layer;
    this.maskValue = settings.mask === undefined ? 0x7fffffff : settings.mask;

    const error = this.validate(settings);
    this.error = error;
    if (error === null && world._registerBody(this)) this.enabled = true;
    else this.enabled = false;
  }

  get isDisposed(): boolean { return this.disposed; }
  get position(): Vec2 { return copyVec(this.positionValue); }
  get velocity(): Vec2 { return copyVec(this.velocityValue); }
  get mass(): number { return this.massValue; }
  get gravityScale(): number { return this.gravityScaleValue; }
  get friction(): number { return this.frictionValue; }
  get restitution(): number { return this.restitutionValue; }
  get isSensor(): boolean { return this.sensorValue; }
  get layer(): number { return this.layerValue; }
  get mask(): number { return this.maskValue; }

  setPosition(value: Vec2): boolean {
    if (this.disposed || !validVec(value)) return false;
    this.positionValue = copyVec(value);
    this.hasWrittenTransform = false;
    this.writeOwnerPosition();
    return true;
  }

  setVelocity(value: Vec2): boolean {
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

  applyForce(force: Vec2): boolean {
    if (this.disposed || this.type !== 'dynamic' || !validVec(force)) return false;
    this.forceValue.x += force.x;
    this.forceValue.y += force.y;
    return true;
  }

  applyImpulse(impulse: Vec2): boolean {
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
    if (this.type !== 'dynamic' || !this.hasWrittenTransform ||
        worldPosition.x !== this.lastWrittenX || worldPosition.y !== this.lastWrittenY) {
      this.positionValue = { x: worldPosition.x, y: worldPosition.y };
    }
    return true;
  }

  /** @internal Integrates a dynamic body once. */
  _integrate(dt: number, gravity: Vec2): void {
    if (this.disposed || this.type !== 'dynamic') return;
    this.velocityValue.x += (gravity.x * this.gravityScaleValue + this.forceValue.x / this.massValue) * dt;
    this.velocityValue.y += (gravity.y * this.gravityScaleValue + this.forceValue.y / this.massValue) * dt;
    this.positionValue.x += this.velocityValue.x * dt;
    this.positionValue.y += this.velocityValue.y * dt;
    this.forceValue.x = 0;
    this.forceValue.y = 0;
  }

  /** @internal Collision solver hooks; inverse mass is zero for immovable bodies. */
  _inverseMass(): number { return !this.disposed && this.type === 'dynamic' ? 1 / this.massValue : 0; }
  _moveBy(x: number, y: number): void { this.positionValue.x += x; this.positionValue.y += y; }
  _addVelocity(x: number, y: number): void { this.velocityValue.x += x; this.velocityValue.y += y; }
  _clearForce(): void { this.forceValue.x = 0; this.forceValue.y = 0; }
  _setPositionInternal(value: Vec2): void { this.positionValue = copyVec(value); }
  _setVelocityInternal(value: Vec2): void { this.velocityValue = copyVec(value); }
  _isUsable(): boolean { return !this.disposed && this.error === null && this.enabled; }

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
  onDestroy(): void { this.dispose(); }

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
    return { type: 'box', width: value.width, height: value.height };
  }

  private validate(options: PhysicsBody2DOptions): string | null {
    if (!this.world.isReady) return this.world.error || 'PhysicsWorld2D is not ready.';
    if (this.type !== 'static' && this.type !== 'dynamic' && this.type !== 'kinematic') {
      return 'PhysicsBody2D type must be static, dynamic, or kinematic.';
    }
    if (options.shape === null || options.shape === undefined ||
        (options.shape.type !== 'box' && options.shape.type !== 'circle')) {
      return 'PhysicsBody2D requires a box or circle shape.';
    }
    if (this.shape.type === 'box' && (!finite(this.shape.width) || !finite(this.shape.height) ||
        this.shape.width <= 0 || this.shape.height <= 0)) {
      return 'PhysicsBody2D box dimensions must be finite and positive.';
    }
    if (this.shape.type === 'circle' && (!finite(this.shape.radius) || this.shape.radius <= 0)) {
      return 'PhysicsBody2D circle radius must be finite and positive.';
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
    if (!finite(this.gravityScaleValue) || !finite(this.frictionValue) || this.frictionValue < 0 ||
        !finite(this.restitutionValue) || this.restitutionValue < 0 || this.restitutionValue > 1) {
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
