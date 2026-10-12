import type { GameObject } from './game-object';
import type { PhysicsWorld } from '../physics';
import type { GameContext } from '../core/context';
import type { Renderer } from '../core/renderer';

/** Constructor type of a GameComponent subclass, used to look components up by class. */
export type GameComponentType<T extends GameComponent> = new (...args: any[]) => T;

/** Base class for behavior attached to a GameObject; override the lifecycle hooks to add game logic. */
export class GameComponent {
  /** Type-only: the options `@GameComponent<T>(options)` accepts for this class. Subclasses redeclare it. */
  declare readonly __options: object;
  /** When false, the component is skipped by update, fixedUpdate and render, but stays attached. */
  enabled = true;
  /** Sort key for render(); components with a lower value draw first, ties keep attachment order. */
  renderOrder = 0;
  private owner: GameObject | null = null;
  private wasDestroyed = false;
  private isDestroying = false;
  private destroyCallbackStarted = false;
  private wasAwake = false;
  private wasStarted = false;

  /** The owning GameObject, or null before the component is added and after it is destroyed. */
  get gameObject(): GameObject | null {
    return this.owner;
  }

  /** True when the component is attached, enabled, not destroyed and its owner is active in the hierarchy. */
  get isActiveAndEnabled(): boolean {
    return this.owner !== null && this.enabled && !this.destroyed && this.owner.activeInHierarchy;
  }

  /** True once destruction has started or finished; a destroyed component cannot be reattached. */
  get destroyed(): boolean {
    return this.wasDestroyed || this.isDestroying;
  }

  /** Override to initialize the component. Called once when its object enters a scene, or when the component is added to an object that is already awake. */
  onAwake(): void {}

  /** Override for setup that needs the scene fully built. Called once, just before the first update() while the component is active and enabled. */
  onStart(): void {}

  /**
   * Override for per-frame logic. Runs every frame while the component is active and enabled.
   * @param _dt Time elapsed since the previous frame.
   */
  update(_dt: number): void {}

  /**
   * Override for fixed-timestep logic such as physics-driven code. Runs while the component is active and enabled.
   * @param _dt Length of the fixed timestep.
   */
  fixedUpdate(_dt: number): void {}

  /** Override to draw with the renderer. Runs while the component is active and enabled, ordered by renderOrder. */
  render(_renderer: Renderer): void {}

  /** Override to release resources. Called once when the component is removed or its owner is destroyed. */
  onDestroy(): void {}

  /** @internal Synchronizes adapter state after a scene phase. */
  _syncRuntimeAfterPhase(): void {}

  /** @internal Pushes adapter state before a caller-owned physics step. */
  _syncPhysicsBeforeStep(_world: PhysicsWorld, _fixedDt: number): void {}

  /** @internal Pulls adapter state after a caller-owned physics step. */
  _syncPhysicsAfterStep(_world: PhysicsWorld): void {}

  /** @internal Rejects adapters bound to a different Game runtime. */
  _canAttachTo(_context: GameContext): boolean {
    return true;
  }

  /** @internal Assigns the single owning GameObject. */
  _setGameObject(owner: GameObject): boolean {
    if (this.owner !== null || this.destroyed) return false;
    this.owner = owner;
    return true;
  }

  /** @internal Starts the component's exactly-once destruction path. */
  _beginDestroy(): boolean {
    if (this.wasDestroyed || this.isDestroying) return false;
    this.isDestroying = true;
    return true;
  }

  /** @internal Ensures the component destruction callback runs only once. */
  _beginDestroyCallback(): boolean {
    if (this.destroyCallbackStarted) return false;
    this.destroyCallbackStarted = true;
    return true;
  }

  /** @internal Completes destruction after onDestroy returns. */
  _finishDestroy(): void {
    this.wasDestroyed = true;
    this.isDestroying = false;
    this.owner = null;
  }

  /** @internal Marks awake once per component lifetime. */
  _markAwake(): boolean {
    if (this.wasAwake) return false;
    this.wasAwake = true;
    return true;
  }

  /** @internal Marks start once per component lifetime. */
  _markStarted(): boolean {
    if (this.wasStarted) return false;
    this.wasStarted = true;
    return true;
  }
}
