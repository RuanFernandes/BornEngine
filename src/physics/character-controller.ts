import type { GameContext, ContextResource } from '../core/context';
import type { Quat, Vec3 } from '../core/types';
import * as native from './internal';
import { forgetNativeHandle, getNativeHandle, registerNativeHandle } from './handles';
import type { Collider } from './collider';
import type { PhysicsWorld } from './physics-world';
import type { PhysicsBody } from './rigid-body';

export const GroundState = native.GroundState;

export interface CharacterControllerOptions {
  up?: Vec3;
  maxSlopeAngleRad?: number;
  characterPadding?: number;
  penetrationRecoverySpeed?: number;
  predictiveContactDistance?: number;
  maxStrength?: number;
  mass?: number;
  objectLayer?: number;
  position?: Vec3;
  rotation?: Quat;
}

/** Kinematic, slope-aware character controller owned by a PhysicsWorld. */
export class CharacterController implements ContextResource {
  readonly context: GameContext;
  readonly world: PhysicsWorld;
  readonly error: string | null;
  private colliderValue: Collider;
  private disposed = false;

  constructor(world: PhysicsWorld, collider: Collider, options: CharacterControllerOptions = {}) {
    this.world = world;
    this.context = world.context;
    this.colliderValue = collider;
    const valid = world.isReady && collider.world === world && collider.isLoaded;
    const handle = valid ? native.createCharacter(getNativeHandle(world), getNativeHandle(collider), options) : 0;
    this.error = valid ? (handle === 0 ? 'Unable to create character controller.' : null) :
      'Character controller requires a loaded collider from the same PhysicsWorld.';
    if (handle !== 0) {
      registerNativeHandle(this, handle);
      world._registerCharacter(this);
      this.context.register(this);
    }
  }

  get isLoaded(): boolean { return !this.disposed && this.world.isReady && getNativeHandle(this) !== 0; }
  get position(): Vec3 | null { return this.isLoaded ? native.getCharacterPosition(getNativeHandle(this)) : null; }
  get rotation(): Quat | null { return this.isLoaded ? native.getCharacterRotation(getNativeHandle(this)) : null; }
  get linearVelocity(): Vec3 | null { return this.isLoaded ? native.getCharacterLinearVelocity(getNativeHandle(this)) : null; }
  get groundState(): number { return this.isLoaded ? native.getCharacterGroundState(getNativeHandle(this)) : native.GroundState.IN_AIR; }
  get isGrounded(): boolean { return this.isLoaded && native.isCharacterGrounded(getNativeHandle(this)); }
  get groundNormal(): Vec3 | null { return this.isLoaded ? native.getCharacterGroundNormal(getNativeHandle(this)) : null; }
  get groundPosition(): Vec3 | null { return this.isLoaded ? native.getCharacterGroundPosition(getNativeHandle(this)) : null; }
  get groundBody(): PhysicsBody | null {
    return this.isLoaded ? this.world._bodyForNative(native.getCharacterGroundBody(getNativeHandle(this))) : null;
  }

  update(deltaTime: number, gravity?: Vec3): boolean {
    if (!this.isLoaded) return false;
    native.updateCharacter(getNativeHandle(this), deltaTime, gravity || this.world.gravity);
    return true;
  }
  setPosition(value: Vec3): boolean { if (!this.isLoaded) return false; native.setCharacterPosition(getNativeHandle(this), value); return true; }
  setRotation(value: Quat): boolean { if (!this.isLoaded) return false; native.setCharacterRotation(getNativeHandle(this), value); return true; }
  setLinearVelocity(value: Vec3): boolean { if (!this.isLoaded) return false; native.setCharacterLinearVelocity(getNativeHandle(this), value); return true; }
  setCollider(value: Collider): boolean {
    if (!this.isLoaded || value.world !== this.world || !value.isLoaded) return false;
    native.setCharacterShape(getNativeHandle(this), getNativeHandle(value));
    this.colliderValue = value;
    return true;
  }
  get collider(): Collider { return this.colliderValue; }

  dispose(): void {
    if (this.disposed) return;
    const handle = getNativeHandle(this);
    if (handle !== 0) native.destroyCharacter(handle);
    forgetNativeHandle(this);
    this.disposed = true;
    this.world._unregisterCharacter(this);
    this.context.unregister(this);
  }
}
