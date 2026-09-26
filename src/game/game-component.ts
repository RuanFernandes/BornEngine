import type { GameObject } from './game-object';
import type { PhysicsWorld } from '../physics';
import type { GameContext } from '../core/context';

export type GameComponentType<T extends GameComponent> =
  new (...args: any[]) => T;

export class GameComponent {
  enabled = true;
  private owner: GameObject | null = null;
  private wasDestroyed = false;
  private isDestroying = false;
  private destroyCallbackStarted = false;
  private wasAwake = false;
  private wasStarted = false;

  get gameObject(): GameObject | null {
    return this.owner;
  }

  get isActiveAndEnabled(): boolean {
    return this.owner !== null && this.enabled && !this.destroyed &&
      this.owner.activeInHierarchy;
  }

  get destroyed(): boolean {
    return this.wasDestroyed || this.isDestroying;
  }

  onAwake(): void {}

  onStart(): void {}

  update(_dt: number): void {}

  fixedUpdate(_dt: number): void {}

  onDestroy(): void {}

  /** @internal Synchronizes adapter state after a scene phase. */
  _syncRuntimeAfterPhase(): void {}

  /** @internal Pushes adapter state before a caller-owned physics step. */
  _syncPhysicsBeforeStep(_world: PhysicsWorld, _fixedDt: number): void {}

  /** @internal Pulls adapter state after a caller-owned physics step. */
  _syncPhysicsAfterStep(_world: PhysicsWorld): void {}

  /** @internal Rejects adapters bound to a different Game runtime. */
  _canAttachTo(_context: GameContext): boolean { return true; }

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
