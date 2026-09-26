import type { GameContext, ContextResource } from '../core/context';
import type { Quat, Vec3 } from '../core/types';
import * as native from './internal';
import { forgetNativeHandle, getNativeHandle, registerNativeHandle } from './handles';
import type { Collider } from './collider';
import type { PhysicsWorld } from './physics-world';
import { PhysicsBody } from './rigid-body';
import type { PhysicsTransform } from './rigid-body';

export type VehicleOptions = Omit<native.VehicleConfig, 'chassisShape'> & { chassisShape: Collider };

class VehicleChassis extends PhysicsBody {
  constructor(world: PhysicsWorld, collider: Collider, handle: number, private readonly vehicle: Vehicle) {
    super(world, collider, handle, native.MotionType.DYNAMIC);
  }

  dispose(): void { this.vehicle.dispose(); }
}

/** Four-wheel vehicle constraint and its engine-owned chassis body. */
export class Vehicle implements ContextResource {
  readonly world: PhysicsWorld;
  readonly context: GameContext;
  readonly error: string | null;
  readonly chassis: PhysicsBody | null;
  private disposed = false;

  constructor(world: PhysicsWorld, options: VehicleOptions) {
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
    this.error = valid ? (handle === 0 ? 'Unable to create vehicle.' : null) :
      'Vehicle chassis collider must be loaded by the same PhysicsWorld.';
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

  get isLoaded(): boolean { return !this.disposed && this.world.isReady && getNativeHandle(this) !== 0; }
  setInput(forward: number, steering: number, brake = 0, handbrake = 0): boolean {
    if (!this.isLoaded) return false;
    native.setVehicleInput(getNativeHandle(this), forward, steering, brake, handbrake);
    return true;
  }
  get engineRpm(): number { return this.isLoaded ? native.getVehicleEngineRPM(getNativeHandle(this)) : 0; }
  getWheelAngularVelocity(index: number): number {
    return this.isLoaded ? native.getWheelAngularVelocity(getNativeHandle(this), index) : 0;
  }
  getWheelTransform(index: number): PhysicsTransform | null {
    return this.isLoaded && index >= 0 && index < 4 ? native.getWheelTransform(getNativeHandle(this), index) : null;
  }
  get position(): Vec3 | null { return this.chassis ? this.chassis.position : null; }
  get rotation(): Quat | null { return this.chassis ? this.chassis.rotation : null; }

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
