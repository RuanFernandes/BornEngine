import type { GameContext, ContextResource } from '../core/context';
import { GameComponent } from '../game/game-component';
import type { Quat, Vec3 } from '../core/types';
import * as native from './internal';
import { forgetNativeHandle, getNativeHandle, registerNativeHandle } from './handles';
import type { Collider } from './collider';
import type { PhysicsWorld } from './physics-world';
import { PhysicsBody } from './rigid-body';
import type { PhysicsTransform } from './rigid-body';

/** Chassis collider, wheel layout, suspension, and engine settings for a vehicle. */
export type VehicleOptions = Omit<native.VehicleConfig, 'chassisShape'> & { chassisShape: Collider };
/** Vehicle options plus the owning world, used by the `Vehicle` constructor. */
export type VehicleComponentOptions = VehicleOptions & { world: PhysicsWorld };

class VehicleChassis extends PhysicsBody {
  constructor(
    world: PhysicsWorld,
    collider: Collider,
    handle: number,
    private readonly vehicle: Vehicle,
  ) {
    super(world, collider, handle, native.MotionType.DYNAMIC);
  }

  dispose(): void {
    this.vehicle.dispose();
  }
}

/** Four-wheel vehicle constraint and its engine-owned chassis body. */
export class Vehicle extends GameComponent implements ContextResource {
  declare readonly __options: VehicleComponentOptions;

  /** World that owns this vehicle. */
  readonly world: PhysicsWorld;
  /** Game context that owns this vehicle. */
  readonly context: GameContext;
  /** Creation error message, or null if the vehicle was created. */
  readonly error: string | null;
  /** Body representing the vehicle chassis, or null if creation failed. */
  readonly chassis: PhysicsBody | null;
  private disposed = false;

  /**
   * Creates a vehicle in a world; prefer `PhysicsWorld.createVehicle`.
   * Check `error` if the chassis collider is not loaded by the same world.
   */
  constructor(options: VehicleComponentOptions) {
    super();
    const world = options.world;
    this.world = world;
    this.context = world.context;
    const shape = options.chassisShape;
    const valid = world.isReady && shape.world === world && shape.isLoaded;
    const nativeOptions: native.VehicleConfig = {
      chassisShape: valid ? getNativeHandle(shape) : native.INVALID_HANDLE,
      position: options.position,
      rotation: options.rotation,
      up: options.up,
      forward: options.forward,
      wheelPositions: options.wheelPositions,
      wheelRadius: options.wheelRadius,
      wheelWidth: options.wheelWidth,
      suspensionMinLength: options.suspensionMinLength,
      suspensionMaxLength: options.suspensionMaxLength,
      maxSteerAngleRad: options.maxSteerAngleRad,
      maxBrakeTorque: options.maxBrakeTorque,
      maxHandbrakeTorque: options.maxHandbrakeTorque,
      engineMaxTorque: options.engineMaxTorque,
      maxPitchRollAngleRad: options.maxPitchRollAngleRad,
      objectLayer: options.objectLayer,
    };
    const handle = valid ? native.createVehicle(getNativeHandle(world), nativeOptions) : 0;
    this.error = valid
      ? handle === 0
        ? 'Unable to create vehicle.'
        : null
      : 'Vehicle chassis collider must be loaded by the same PhysicsWorld.';
    if (handle !== 0) {
      registerNativeHandle(this, handle);
      const chassisHandle = native.getVehicleChassis(handle);
      this.chassis = chassisHandle === 0 ? null : new VehicleChassis(world, shape, chassisHandle, this);
      world._registerVehicle(this);
      this.context.register(this);
    } else {
      this.chassis = null;
    }
  }

  /** True while the vehicle exists in a ready world and has not been disposed. */
  get isLoaded(): boolean {
    return !this.disposed && this.world.isReady && getNativeHandle(this) !== 0;
  }
  /**
   * Sets driving input; returns false if the vehicle is not loaded.
   * @param forward Throttle, positive to drive forward.
   * @param steering Steering input.
   * @param brake Brake amount.
   * @param handbrake Handbrake amount.
   */
  setInput(forward: number, steering: number, brake = 0, handbrake = 0): boolean {
    if (!this.isLoaded) return false;
    native.setVehicleInput(getNativeHandle(this), forward, steering, brake, handbrake);
    return true;
  }
  /** Current engine speed in revolutions per minute, or 0 when not loaded. */
  get engineRpm(): number {
    return this.isLoaded ? native.getVehicleEngineRPM(getNativeHandle(this)) : 0;
  }
  /** Angular velocity of a wheel, or 0 when the vehicle is not loaded. */
  getWheelAngularVelocity(index: number): number {
    return this.isLoaded ? native.getWheelAngularVelocity(getNativeHandle(this), index) : 0;
  }
  /** World transform of a wheel (index 0 to 3), or null if the index is invalid or the vehicle is not loaded. */
  getWheelTransform(index: number): PhysicsTransform | null {
    return this.isLoaded && index >= 0 && index < 4 ? native.getWheelTransform(getNativeHandle(this), index) : null;
  }
  /** World position of the chassis, or null if there is no chassis. */
  get position(): Vec3 | null {
    return this.chassis ? this.chassis.position : null;
  }
  /** World rotation of the chassis, or null if there is no chassis. */
  get rotation(): Quat | null {
    return this.chassis ? this.chassis.rotation : null;
  }

  /** Copies the chassis position and rotation to the owning game object transform. */
  update(_deltaTime: number): void {
    const owner = this.gameObject;
    if (owner === null || !this.isLoaded || this.chassis === null) return;
    const position = this.chassis.position;
    if (position !== null) owner.transform.setWorldPosition(position);
    const rotation = this.chassis.rotation;
    if (rotation !== null) owner.transform.setWorldRotation(rotation);
  }

  /** Disposes the vehicle when its game object is destroyed. */
  onDestroy(): void {
    this.dispose();
  }

  /** Destroys the vehicle and its chassis body. Safe to call more than once. */
  dispose(): void {
    if (this.disposed) return;
    const handle = getNativeHandle(this);
    if (handle !== 0) native.destroyVehicle(handle);
    if (this.chassis !== null) this.chassis._invalidateFromOwner();
    forgetNativeHandle(this);
    this.disposed = true;
    this.world._unregisterVehicle(this);
    this.context.unregister(this);
  }
}
