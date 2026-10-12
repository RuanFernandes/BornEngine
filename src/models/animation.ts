import type { Game } from '../core/game';
import { GameContext, ContextResource, getGameContext } from '../core/context';
import * as operations from './internal';
import type { Vec3 } from '../core/types';

/** Runtime animation controller for a skinned model asset. */
export class Animation implements ContextResource {
  /** Load failure message, or null when the animation loaded. */
  readonly error: string | null;
  private handleValue = 0;
  private disposed = false;
  private readonly context: GameContext;

  /** @internal Resource construction is routed through an asset scope. */
  static _create(game: Game, path: string): Animation {
    return new Animation(game, path);
  }

  private constructor(
    game: Game,
    readonly path: string,
  ) {
    this.context = getGameContext(game);
    const context = this.context;
    if (!context.isReady || context.isDisposed) {
      this.error = 'The Game must be ready before loading an animation.';
      return;
    }
    const sourceHandle = operations.loadModelAnimation(path);
    this.handleValue = sourceHandle === 0 ? 0 : operations.instantiateAnimation(sourceHandle);
    this.error = this.handleValue === 0 ? 'Unable to load animation: ' + path : null;
    context.register(this);
  }

  /** True while the animation is usable: loaded, not disposed, and its Game is ready. */
  get isLoaded(): boolean {
    return this.context.isReady && !this.context.isDisposed && !this.disposed && this.handleValue !== 0;
  }
  /** True once the animation has been disposed. */
  get isDisposed(): boolean {
    return this.disposed;
  }

  /**
   * Transitions the base track to `clip` over `fade` seconds. Requesting the clip that is already playing is a no-op, so it is safe to call every frame.
   * Returns false if not loaded.
   */
  play(clip: number, fade = 0.15, speed = 1, looping = true): boolean {
    if (!this.isLoaded) return false;
    operations.animPlay(this.handleValue, clip, fade, speed, looping);
    return true;
  }

  /**
   * Drives the joints below `maskRoot` (a joint index from `findJoint`) from a second clip at `weight`. Pass clip -1 to turn the layer off.
   * Returns false if not loaded.
   */
  setLayer(clip: number, weight: number, maskRoot: number, speed = 1, looping = false): boolean {
    if (!this.isLoaded) return false;
    operations.animSetLayer(this.handleValue, clip, weight, maskRoot, speed, looping);
    return true;
  }

  /**
   * Enables or disables authored root motion (off by default). When on, the pose no longer carries root translation and you must apply `getRootMotionDelta` yourself.
   * Returns false if not loaded.
   */
  setRootMotion(enabled: boolean): boolean {
    if (!this.isLoaded) return false;
    operations.animSetRootMotion(this.handleValue, enabled);
    return true;
  }

  /**
   * Advances the animation clocks by `deltaTime` and uploads the blended pose. Call once per model per frame with the same `position`, `scale` and `rotationY` used to draw it.
   * Returns false if not loaded.
   */
  update(deltaTime: number, position: Vec3, scale = 1, rotationY = 0): boolean {
    if (!this.isLoaded) return false;
    operations.animUpdate(this.handleValue, deltaTime, scale, position.x, position.y, position.z, rotationY);
    return true;
  }

  /** True once a non-looping clip has run past its end. */
  isFinished(): boolean {
    return this.isLoaded && operations.animFinished(this.handleValue);
  }
  /** Returns the duration of `clip`, or 0 if not loaded. */
  getClipDuration(clip: number): number {
    return this.isLoaded ? operations.animClipDuration(this.handleValue, clip) : 0;
  }
  /**
   * Returns the root-motion translation applied by the last `update` along `axis` (0 = x, 1 = y, 2 = z), in model space.
   */
  getRootMotionDelta(axis: 0 | 1 | 2): number {
    return this.isLoaded ? operations.animRootDelta(this.handleValue, axis) : 0;
  }

  /** Returns the index of the joint called `name`, or -1 if not found or not loaded. */
  findJoint(name: string): number {
    return this.isLoaded ? operations.findJoint(this.handleValue, name) : -1;
  }

  /**
   * Returns one component (0..15, column-major; translation is 12, 13, 14) of a joint transform in model space, or 0 if not loaded.
   * Apply the scale, position and yaw passed to `update` to place it in the world.
   */
  getJointWorldTransformComponent(joint: number, component: number): number {
    return this.isLoaded ? operations.jointWorld(this.handleValue, joint, component) : 0;
  }

  /** Releases the animation controller. Safe to call repeatedly. */
  dispose(): void {
    if (this.disposed) return;
    // The current native ABI has no animation-instance release operation.
    this.handleValue = 0;
    this.disposed = true;
    this.context.unregister(this);
  }
}
