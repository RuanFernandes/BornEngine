import type { GameContext, ContextResource } from '../core/context';
import type { Quat, Vec3 } from '../core/types';
import * as native from './internal';
import { forgetNativeHandle, getNativeHandle, registerNativeHandle } from './handles';
import type { Collider } from './collider';
import type { PhysicsWorld } from './physics-world';

export interface PhysicsTransform { position: Vec3; rotation: Quat; }

/** Shared base for rigid and soft physics bodies. Native body handles stay private. */
export abstract class PhysicsBody implements ContextResource {
  readonly world: PhysicsWorld;
  readonly context: GameContext;
  readonly error: string | null;
  protected colliderValue: Collider | null;
  protected motionTypeValue: number;
  private disposed = false;

  protected constructor(world: PhysicsWorld, collider: Collider | null, handle: number,
    motionType: number, error: string | null = null) {
    this.world = world;
    this.context = world.context;
    this.colliderValue = collider;
    this.motionTypeValue = motionType;
    this.error = error === null && handle === 0 ? 'Unable to create physics body.' : error;
    if (handle !== 0 && world.isReady) {
      registerNativeHandle(this, handle);
      world._registerBody(this);
      this.context.register(this);
    }
  }

  get collider(): Collider | null { return this.colliderValue; }
  get motionType(): number { return this.motionTypeValue; }
  get isLoaded(): boolean {
    const handle = getNativeHandle(this);
    return !this.disposed && this.world.isReady && handle !== 0 && native.isBodyValid(handle);
  }
  get isDisposed(): boolean { return this.disposed; }
  get isActive(): boolean { return this.isLoaded && native.isBodyActive(getNativeHandle(this)); }

  get position(): Vec3 | null { return this.isLoaded ? native.getBodyPosition(getNativeHandle(this)) : null; }
  get rotation(): Quat | null { return this.isLoaded ? native.getBodyRotation(getNativeHandle(this)) : null; }
  get transform(): PhysicsTransform | null { return this.isLoaded ? native.getBodyTransform(getNativeHandle(this)) : null; }
  get linearVelocity(): Vec3 | null { return this.isLoaded ? native.getLinearVelocity(getNativeHandle(this)) : null; }
  get angularVelocity(): Vec3 | null { return this.isLoaded ? native.getAngularVelocity(getNativeHandle(this)) : null; }
  get mass(): number { return this.isLoaded ? native.getBodyMass(getNativeHandle(this)) : 0; }
  get friction(): number { return this.isLoaded ? native.getBodyFriction(getNativeHandle(this)) : 0; }
  get restitution(): number { return this.isLoaded ? native.getBodyRestitution(getNativeHandle(this)) : 0; }
  get objectLayer(): number { return this.isLoaded ? native.getBodyObjectLayer(getNativeHandle(this)) : 0; }

  activate(): boolean { if (!this.isLoaded) return false; native.activateBody(getNativeHandle(this)); return true; }
  deactivate(): boolean { if (!this.isLoaded) return false; native.deactivateBody(getNativeHandle(this)); return true; }
  setPosition(value: Vec3, activate = true): boolean { if (!this.isLoaded) return false; native.setBodyPosition(getNativeHandle(this), value, activate); return true; }
  setRotation(value: Quat, activate = true): boolean { if (!this.isLoaded) return false; native.setBodyRotation(getNativeHandle(this), value, activate); return true; }
  setTransform(value: PhysicsTransform, activate = true): boolean { if (!this.isLoaded) return false; native.setBodyTransform(getNativeHandle(this), value, activate); return true; }
  moveKinematic(target: PhysicsTransform, deltaTime: number): boolean {
    if (!this.isLoaded || this.motionTypeValue !== native.MotionType.KINEMATIC) return false;
    native.moveKinematic(getNativeHandle(this), target, deltaTime);
    return true;
  }
  getPointVelocity(point: Vec3): Vec3 | null { return this.isLoaded ? native.getPointVelocity(getNativeHandle(this), point) : null; }
  setLinearVelocity(value: Vec3): boolean { if (!this.isLoaded) return false; native.setLinearVelocity(getNativeHandle(this), value); return true; }
  setAngularVelocity(value: Vec3): boolean { if (!this.isLoaded) return false; native.setAngularVelocity(getNativeHandle(this), value); return true; }
  addForce(value: Vec3): boolean { if (!this.isLoaded) return false; native.addForce(getNativeHandle(this), value); return true; }
  addImpulse(value: Vec3): boolean { if (!this.isLoaded) return false; native.addImpulse(getNativeHandle(this), value); return true; }
  addTorque(value: Vec3): boolean { if (!this.isLoaded) return false; native.addTorque(getNativeHandle(this), value); return true; }
  addAngularImpulse(value: Vec3): boolean { if (!this.isLoaded) return false; native.addAngularImpulse(getNativeHandle(this), value); return true; }
  addForceAt(value: Vec3, worldPoint: Vec3): boolean { if (!this.isLoaded) return false; native.addForceAt(getNativeHandle(this), value, worldPoint); return true; }
  addImpulseAt(value: Vec3, worldPoint: Vec3): boolean { if (!this.isLoaded) return false; native.addImpulseAt(getNativeHandle(this), value, worldPoint); return true; }

  setFriction(value: number): boolean { if (!this.isLoaded) return false; native.setFriction(getNativeHandle(this), value); return true; }
  setRestitution(value: number): boolean { if (!this.isLoaded) return false; native.setRestitution(getNativeHandle(this), value); return true; }
  setLinearDamping(value: number): boolean { if (!this.isLoaded) return false; native.setLinearDamping(getNativeHandle(this), value); return true; }
  setAngularDamping(value: number): boolean { if (!this.isLoaded) return false; native.setAngularDamping(getNativeHandle(this), value); return true; }
  setGravityFactor(value: number): boolean { if (!this.isLoaded) return false; native.setGravityFactor(getNativeHandle(this), value); return true; }
  setCcd(enabled: boolean): boolean { if (!this.isLoaded) return false; native.setBodyCcd(getNativeHandle(this), enabled); return true; }
  setMotionType(value: number, activate = true): boolean {
    if (!this.isLoaded) return false;
    native.setMotionType(getNativeHandle(this), value, activate);
    this.motionTypeValue = value;
    return true;
  }
  setObjectLayer(value: number): boolean { if (!this.isLoaded) return false; native.setObjectLayer(getNativeHandle(this), value); return true; }
  setSensor(enabled: boolean): boolean { if (!this.isLoaded) return false; native.setIsSensor(getNativeHandle(this), enabled); return true; }
  setAllowSleeping(enabled: boolean): boolean { if (!this.isLoaded) return false; native.setAllowSleeping(getNativeHandle(this), enabled); return true; }
  lockRotationAxes(x: boolean, y: boolean, z: boolean): boolean { if (!this.isLoaded) return false; native.lockRotationAxes(getNativeHandle(this), x, y, z); return true; }
  lockTranslationAxes(x: boolean, y: boolean, z: boolean): boolean { if (!this.isLoaded) return false; native.lockTranslationAxes(getNativeHandle(this), x, y, z); return true; }
  setUserData(value: number): boolean { if (!this.isLoaded) return false; native.setBodyUserData(getNativeHandle(this), value); return true; }
  get userData(): number { return this.isLoaded ? native.getBodyUserData(getNativeHandle(this)) : 0; }

  setCollider(collider: Collider, updateMass = true, activate = true): boolean {
    if (!this.isLoaded || collider.world !== this.world || !collider.isLoaded) return false;
    native.setBodyShape(getNativeHandle(this), getNativeHandle(collider), updateMass, activate);
    this.colliderValue = collider;
    return true;
  }

  _belongsToContext(context: GameContext): boolean { return this.context === context; }

  /** @internal Vehicle destruction also releases its native chassis body. */
  _invalidateFromOwner(): void {
    if (this.disposed) return;
    forgetNativeHandle(this);
    this.disposed = true;
    this.world._unregisterBody(this);
    this.context.unregister(this);
  }

  dispose(): void {
    if (this.disposed) return;
    const handle = getNativeHandle(this);
    if (handle !== 0) native.destroyBody(handle);
    forgetNativeHandle(this);
    this.disposed = true;
    this.world._unregisterBody(this);
    this.context.unregister(this);
  }
}

export interface RigidBodyOptions extends Omit<native.BodyConfig, 'motionType'> {
  motionType?: number;
}

/** Physics body bound to a collider and one PhysicsWorld. */
export class RigidBody extends PhysicsBody {
  constructor(world: PhysicsWorld, collider: Collider, options: RigidBodyOptions = {}) {
    const valid = world.isReady && collider.world === world && collider.isLoaded;
    const config: native.BodyConfig = {
      motionType: options.motionType === undefined ? native.MotionType.DYNAMIC : options.motionType,
      position: options.position,
      rotation: options.rotation,
      objectLayer: options.objectLayer,
      linearVelocity: options.linearVelocity,
      angularVelocity: options.angularVelocity,
      friction: options.friction,
      restitution: options.restitution,
      linearDamping: options.linearDamping,
      angularDamping: options.angularDamping,
      gravityFactor: options.gravityFactor,
      useCcd: options.useCcd,
      isSensor: options.isSensor,
      allowSleeping: options.allowSleeping,
      userData: options.userData,
    };
    const handle = valid
      ? native.createBody(getNativeHandle(world), getNativeHandle(collider), config)
      : 0;
    super(world, valid ? collider : null, handle,
      config.motionType,
      valid ? null : 'RigidBody requires a loaded collider from the same PhysicsWorld.');
  }
}
