import type { GameContext, ContextResource } from '../core/context';
import type { Quat, Vec3 } from '../core/types';
import * as native from './internal';
import { forgetNativeHandle, getNativeHandle, registerNativeHandle } from './handles';
import type { Collider } from './collider';
import type { PhysicsWorld } from './physics-world';

/** Position and rotation pair. */
export interface PhysicsTransform {
  position: Vec3;
  rotation: Quat;
}

/** Shared base for rigid and soft physics bodies. Native body handles stay private. */
export abstract class PhysicsBody implements ContextResource {
  /** World that owns this body. */
  readonly world: PhysicsWorld;
  /** Game context that owns this body. */
  readonly context: GameContext;
  /** Creation error message, or null if the body was created. */
  readonly error: string | null;
  protected colliderValue: Collider | null;
  protected motionTypeValue: number;
  private disposed = false;

  protected constructor(
    world: PhysicsWorld,
    collider: Collider | null,
    handle: number,
    motionType: number,
    error: string | null = null,
  ) {
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

  /** Collider shaping this body, or null for bodies without one such as soft bodies. */
  get collider(): Collider | null {
    return this.colliderValue;
  }
  /** Current `MotionType` value (static, kinematic, or dynamic). */
  get motionType(): number {
    return this.motionTypeValue;
  }
  /** True while the body exists in a ready world and has not been disposed. */
  get isLoaded(): boolean {
    const handle = getNativeHandle(this);
    return !this.disposed && this.world.isReady && handle !== 0 && native.isBodyValid(handle);
  }
  /** True once the body has been disposed. */
  get isDisposed(): boolean {
    return this.disposed;
  }
  /** True when the body is awake and being simulated; false when asleep or not loaded. */
  get isActive(): boolean {
    return this.isLoaded && native.isBodyActive(getNativeHandle(this));
  }

  /** World position, or null when not loaded. */
  get position(): Vec3 | null {
    return this.isLoaded ? native.getBodyPosition(getNativeHandle(this)) : null;
  }
  /** World rotation, or null when not loaded. */
  get rotation(): Quat | null {
    return this.isLoaded ? native.getBodyRotation(getNativeHandle(this)) : null;
  }
  /** World position and rotation, or null when not loaded. */
  get transform(): PhysicsTransform | null {
    return this.isLoaded ? native.getBodyTransform(getNativeHandle(this)) : null;
  }
  /** Linear velocity, or null when not loaded. */
  get linearVelocity(): Vec3 | null {
    return this.isLoaded ? native.getLinearVelocity(getNativeHandle(this)) : null;
  }
  /** Angular velocity, or null when not loaded. */
  get angularVelocity(): Vec3 | null {
    return this.isLoaded ? native.getAngularVelocity(getNativeHandle(this)) : null;
  }
  /** Body mass, or 0 when not loaded. */
  get mass(): number {
    return this.isLoaded ? native.getBodyMass(getNativeHandle(this)) : 0;
  }
  /** Friction coefficient, or 0 when not loaded. */
  get friction(): number {
    return this.isLoaded ? native.getBodyFriction(getNativeHandle(this)) : 0;
  }
  /** Restitution (bounciness), or 0 when not loaded. */
  get restitution(): number {
    return this.isLoaded ? native.getBodyRestitution(getNativeHandle(this)) : 0;
  }
  /** Collision layer index, or 0 when not loaded. */
  get objectLayer(): number {
    return this.isLoaded ? native.getBodyObjectLayer(getNativeHandle(this)) : 0;
  }

  /** Wakes the body so it is simulated; returns false if the body is not loaded. */
  activate(): boolean {
    if (!this.isLoaded) return false;
    native.activateBody(getNativeHandle(this));
    return true;
  }
  /** Puts the body to sleep; returns false if the body is not loaded. */
  deactivate(): boolean {
    if (!this.isLoaded) return false;
    native.deactivateBody(getNativeHandle(this));
    return true;
  }
  /**
   * Teleports the body; returns false if the body is not loaded.
   * @param activate Wake the body after moving it.
   */
  setPosition(value: Vec3, activate = true): boolean {
    if (!this.isLoaded) return false;
    native.setBodyPosition(getNativeHandle(this), value, activate);
    return true;
  }
  /**
   * Sets the body rotation; returns false if the body is not loaded.
   * @param activate Wake the body after rotating it.
   */
  setRotation(value: Quat, activate = true): boolean {
    if (!this.isLoaded) return false;
    native.setBodyRotation(getNativeHandle(this), value, activate);
    return true;
  }
  /**
   * Sets position and rotation together; returns false if the body is not loaded.
   * @param activate Wake the body after moving it.
   */
  setTransform(value: PhysicsTransform, activate = true): boolean {
    if (!this.isLoaded) return false;
    native.setBodyTransform(getNativeHandle(this), value, activate);
    return true;
  }
  /**
   * Moves a kinematic body toward a target pose over a time step so it carries other bodies.
   * Returns false if the body is not loaded or not kinematic.
   */
  moveKinematic(target: PhysicsTransform, deltaTime: number): boolean {
    if (!this.isLoaded || this.motionTypeValue !== native.MotionType.KINEMATIC) return false;
    native.moveKinematic(getNativeHandle(this), target, deltaTime);
    return true;
  }
  /** Velocity of the body at a world-space point, or null when not loaded. */
  getPointVelocity(point: Vec3): Vec3 | null {
    return this.isLoaded ? native.getPointVelocity(getNativeHandle(this), point) : null;
  }
  /** Sets the linear velocity; returns false if the body is not loaded. */
  setLinearVelocity(value: Vec3): boolean {
    if (!this.isLoaded) return false;
    native.setLinearVelocity(getNativeHandle(this), value);
    return true;
  }
  /** Sets the angular velocity; returns false if the body is not loaded. */
  setAngularVelocity(value: Vec3): boolean {
    if (!this.isLoaded) return false;
    native.setAngularVelocity(getNativeHandle(this), value);
    return true;
  }
  /** Applies a force at the center of mass for the next step; returns false if the body is not loaded. */
  addForce(value: Vec3): boolean {
    if (!this.isLoaded) return false;
    native.addForce(getNativeHandle(this), value);
    return true;
  }
  /** Applies an instant change of momentum at the center of mass; returns false if the body is not loaded. */
  addImpulse(value: Vec3): boolean {
    if (!this.isLoaded) return false;
    native.addImpulse(getNativeHandle(this), value);
    return true;
  }
  /** Applies a torque for the next step; returns false if the body is not loaded. */
  addTorque(value: Vec3): boolean {
    if (!this.isLoaded) return false;
    native.addTorque(getNativeHandle(this), value);
    return true;
  }
  /** Applies an instant angular impulse; returns false if the body is not loaded. */
  addAngularImpulse(value: Vec3): boolean {
    if (!this.isLoaded) return false;
    native.addAngularImpulse(getNativeHandle(this), value);
    return true;
  }
  /** Applies a force at a world-space point; returns false if the body is not loaded. */
  addForceAt(value: Vec3, worldPoint: Vec3): boolean {
    if (!this.isLoaded) return false;
    native.addForceAt(getNativeHandle(this), value, worldPoint);
    return true;
  }
  /** Applies an impulse at a world-space point; returns false if the body is not loaded. */
  addImpulseAt(value: Vec3, worldPoint: Vec3): boolean {
    if (!this.isLoaded) return false;
    native.addImpulseAt(getNativeHandle(this), value, worldPoint);
    return true;
  }

  /** Sets the friction coefficient; returns false if the body is not loaded. */
  setFriction(value: number): boolean {
    if (!this.isLoaded) return false;
    native.setFriction(getNativeHandle(this), value);
    return true;
  }
  /** Sets the restitution (bounciness); returns false if the body is not loaded. */
  setRestitution(value: number): boolean {
    if (!this.isLoaded) return false;
    native.setRestitution(getNativeHandle(this), value);
    return true;
  }
  /** Sets how quickly linear velocity decays; returns false if the body is not loaded. */
  setLinearDamping(value: number): boolean {
    if (!this.isLoaded) return false;
    native.setLinearDamping(getNativeHandle(this), value);
    return true;
  }
  /** Sets how quickly angular velocity decays; returns false if the body is not loaded. */
  setAngularDamping(value: number): boolean {
    if (!this.isLoaded) return false;
    native.setAngularDamping(getNativeHandle(this), value);
    return true;
  }
  /** Sets the multiplier applied to world gravity for this body; returns false if the body is not loaded. */
  setGravityFactor(value: number): boolean {
    if (!this.isLoaded) return false;
    native.setGravityFactor(getNativeHandle(this), value);
    return true;
  }
  /** Enables or disables continuous collision detection for fast-moving bodies; returns false if the body is not loaded. */
  setCcd(enabled: boolean): boolean {
    if (!this.isLoaded) return false;
    native.setBodyCcd(getNativeHandle(this), enabled);
    return true;
  }
  /**
   * Changes the body between static, kinematic, and dynamic; returns false if the body is not loaded.
   * @param activate Wake the body after the change.
   */
  setMotionType(value: number, activate = true): boolean {
    if (!this.isLoaded) return false;
    native.setMotionType(getNativeHandle(this), value, activate);
    this.motionTypeValue = value;
    return true;
  }
  /** Moves the body to another collision layer; returns false if the body is not loaded. */
  setObjectLayer(value: number): boolean {
    if (!this.isLoaded) return false;
    native.setObjectLayer(getNativeHandle(this), value);
    return true;
  }
  /** Makes the body a sensor that reports contacts without colliding physically; returns false if the body is not loaded. */
  setSensor(enabled: boolean): boolean {
    if (!this.isLoaded) return false;
    native.setIsSensor(getNativeHandle(this), enabled);
    return true;
  }
  /** Allows or prevents the body from going to sleep; returns false if the body is not loaded. */
  setAllowSleeping(enabled: boolean): boolean {
    if (!this.isLoaded) return false;
    native.setAllowSleeping(getNativeHandle(this), enabled);
    return true;
  }
  /** Locks rotation around the axes passed as true; returns false if the body is not loaded. */
  lockRotationAxes(x: boolean, y: boolean, z: boolean): boolean {
    if (!this.isLoaded) return false;
    native.lockRotationAxes(getNativeHandle(this), x, y, z);
    return true;
  }
  /** Locks movement along the axes passed as true; returns false if the body is not loaded. */
  lockTranslationAxes(x: boolean, y: boolean, z: boolean): boolean {
    if (!this.isLoaded) return false;
    native.lockTranslationAxes(getNativeHandle(this), x, y, z);
    return true;
  }
  /** Stores a number on the body for your own use; returns false if the body is not loaded. */
  setUserData(value: number): boolean {
    if (!this.isLoaded) return false;
    native.setBodyUserData(getNativeHandle(this), value);
    return true;
  }
  /** Number stored with `setUserData`, or 0 when not loaded. */
  get userData(): number {
    return this.isLoaded ? native.getBodyUserData(getNativeHandle(this)) : 0;
  }

  /**
   * Replaces the body shape with a collider from the same world; returns false if either is not loaded.
   * @param updateMass Recompute mass properties from the new shape.
   * @param activate Wake the body after the change.
   */
  setCollider(collider: Collider, updateMass = true, activate = true): boolean {
    if (!this.isLoaded || collider.world !== this.world || !collider.isLoaded) return false;
    native.setBodyShape(getNativeHandle(this), getNativeHandle(collider), updateMass, activate);
    this.colliderValue = collider;
    return true;
  }

  _belongsToContext(context: GameContext): boolean {
    return this.context === context;
  }

  /** @internal Vehicle destruction also releases its native chassis body. */
  _invalidateFromOwner(): void {
    if (this.disposed) return;
    forgetNativeHandle(this);
    this.disposed = true;
    this.world._unregisterBody(this);
    this.context.unregister(this);
  }

  /** Destroys the body and releases its native resources. Safe to call more than once. */
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

/** Initial motion type, pose, velocity, and material settings for a rigid body. */
export interface RigidBodyOptions extends Omit<native.BodyConfig, 'motionType'> {
  motionType?: number;
}

/** Physics body bound to a collider and one PhysicsWorld. */
export class RigidBody extends PhysicsBody {
  /**
   * Creates a rigid body from a collider of the same world; prefer `PhysicsWorld.createBody`.
   * Motion type defaults to dynamic. Check `error` if the collider is not loaded by the same world.
   */
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
    const handle = valid ? native.createBody(getNativeHandle(world), getNativeHandle(collider), config) : 0;
    super(
      world,
      valid ? collider : null,
      handle,
      config.motionType,
      valid ? null : 'RigidBody requires a loaded collider from the same PhysicsWorld.',
    );
  }
}
