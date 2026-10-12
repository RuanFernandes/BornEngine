import type { GameContext, ContextResource } from '../core/context';
import { GameComponent } from '../game/game-component';
import type { Quat, Vec3 } from '../core/types';
import * as native from './internal';
import { forgetNativeHandle, getNativeHandle, registerNativeHandle } from './handles';
import type { Collider } from './collider';
import type { PhysicsWorld } from './physics-world';
import type { PhysicsBody } from './rigid-body';

export const GroundState = native.GroundState;

/** Tuning and starting pose for a character controller. */
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

/** Character options plus the owning world and collider, used by the `CharacterController` constructor. */
export type CharacterControllerComponentOptions = CharacterControllerOptions & {
  world: PhysicsWorld;
  collider: Collider;
};

/** Kinematic, slope-aware character controller owned by a PhysicsWorld. */
export class CharacterController extends GameComponent implements ContextResource {
  declare readonly __options: CharacterControllerComponentOptions;

  /** Game context that owns this controller. */
  readonly context: GameContext;
  /** World that owns this controller. */
  readonly world: PhysicsWorld;
  /** Creation error message, or null if the controller was created. */
  readonly error: string | null;
  private colliderValue: Collider;
  private disposed = false;

  /**
   * Creates a character controller in a world; prefer `PhysicsWorld.createCharacter`.
   * Check `error` if the collider is not loaded by the same world.
   */
  constructor(options: CharacterControllerComponentOptions) {
    super();
    const world = options.world;
    const collider = options.collider;
    this.world = world;
    this.context = world.context;
    this.colliderValue = collider;
    const valid = world.isReady && collider.world === world && collider.isLoaded;
    const handle = valid ? native.createCharacter(getNativeHandle(world), getNativeHandle(collider), options) : 0;
    this.error = valid
      ? handle === 0
        ? 'Unable to create character controller.'
        : null
      : 'Character controller requires a loaded collider from the same PhysicsWorld.';
    if (handle !== 0) {
      registerNativeHandle(this, handle);
      world._registerCharacter(this);
      this.context.register(this);
    }
  }

  /** True while the controller exists in a ready world and has not been disposed. */
  get isLoaded(): boolean {
    return !this.disposed && this.world.isReady && getNativeHandle(this) !== 0;
  }
  /** Current character position, or null when not loaded. */
  get position(): Vec3 | null {
    return this.isLoaded ? native.getCharacterPosition(getNativeHandle(this)) : null;
  }
  /** Current character rotation, or null when not loaded. */
  get rotation(): Quat | null {
    return this.isLoaded ? native.getCharacterRotation(getNativeHandle(this)) : null;
  }
  /** Current character velocity, or null when not loaded. */
  get linearVelocity(): Vec3 | null {
    return this.isLoaded ? native.getCharacterLinearVelocity(getNativeHandle(this)) : null;
  }
  /** Current `GroundState` value; reports in-air when not loaded. */
  get groundState(): number {
    return this.isLoaded ? native.getCharacterGroundState(getNativeHandle(this)) : native.GroundState.IN_AIR;
  }
  /** True when the character is standing on supporting ground. */
  get isGrounded(): boolean {
    return this.isLoaded && native.isCharacterGrounded(getNativeHandle(this));
  }
  /** Surface normal of the ground under the character, or null when not loaded. */
  get groundNormal(): Vec3 | null {
    return this.isLoaded ? native.getCharacterGroundNormal(getNativeHandle(this)) : null;
  }
  /** Contact point on the ground under the character, or null when not loaded. */
  get groundPosition(): Vec3 | null {
    return this.isLoaded ? native.getCharacterGroundPosition(getNativeHandle(this)) : null;
  }
  /** Body the character is standing on, or null if none is known or the controller is not loaded. */
  get groundBody(): PhysicsBody | null {
    return this.isLoaded ? this.world._bodyForNative(native.getCharacterGroundBody(getNativeHandle(this))) : null;
  }

  /**
   * Advances the character by one step and copies its pose to the owning game object transform.
   * @param gravity Gravity to apply; defaults to the world gravity.
   * @returns False if the controller is not loaded.
   */
  update(deltaTime: number, gravity?: Vec3): boolean {
    if (!this.isLoaded) return false;
    native.updateCharacter(getNativeHandle(this), deltaTime, gravity || this.world.gravity);
    const owner = this.gameObject;
    if (owner !== null) {
      const position = native.getCharacterPosition(getNativeHandle(this));
      owner.transform.setWorldPosition(position);
      const rotation = native.getCharacterRotation(getNativeHandle(this));
      owner.transform.setWorldRotation(rotation);
    }
    return true;
  }
  /** Teleports the character; returns false if the controller is not loaded. */
  setPosition(value: Vec3): boolean {
    if (!this.isLoaded) return false;
    native.setCharacterPosition(getNativeHandle(this), value);
    return true;
  }
  /** Sets the character rotation; returns false if the controller is not loaded. */
  setRotation(value: Quat): boolean {
    if (!this.isLoaded) return false;
    native.setCharacterRotation(getNativeHandle(this), value);
    return true;
  }
  /** Sets the character velocity; returns false if the controller is not loaded. */
  setLinearVelocity(value: Vec3): boolean {
    if (!this.isLoaded) return false;
    native.setCharacterLinearVelocity(getNativeHandle(this), value);
    return true;
  }
  /** Replaces the character shape with a collider from the same world; returns false if either is not loaded. */
  setCollider(value: Collider): boolean {
    if (!this.isLoaded || value.world !== this.world || !value.isLoaded) return false;
    native.setCharacterShape(getNativeHandle(this), getNativeHandle(value));
    this.colliderValue = value;
    return true;
  }
  /** Collider currently used as the character shape. */
  get collider(): Collider {
    return this.colliderValue;
  }

  /** Disposes the controller when its game object is destroyed. */
  onDestroy(): void {
    this.dispose();
  }

  /** Destroys the controller and releases its native resources. Safe to call more than once. */
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
