import type { Game } from '../core/game';
import { GameContext, ContextResource, getGameContext } from '../core/context';
import * as operations from './internal';
import type { Vec3 } from '../core/types';

/** Runtime animation controller for a skinned model asset. */
export class Animation implements ContextResource {
  readonly error: string | null;
  private handleValue = 0;
  private disposed = false;
  private readonly context: GameContext;

  constructor(game: Game, readonly path: string) {
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

  get isLoaded(): boolean { return this.context.isReady && !this.context.isDisposed && !this.disposed && this.handleValue !== 0; }
  get isDisposed(): boolean { return this.disposed; }

  play(clip: number, fade = 0.15, speed = 1, looping = true): boolean {
    if (!this.isLoaded) return false;
    operations.animPlay(this.handleValue, clip, fade, speed, looping);
    return true;
  }

  setLayer(clip: number, weight: number, maskRoot: number, speed = 1, looping = false): boolean {
    if (!this.isLoaded) return false;
    operations.animSetLayer(this.handleValue, clip, weight, maskRoot, speed, looping);
    return true;
  }

  setRootMotion(enabled: boolean): boolean {
    if (!this.isLoaded) return false;
    operations.animSetRootMotion(this.handleValue, enabled);
    return true;
  }

  update(deltaTime: number, position: Vec3, scale = 1, rotationY = 0): boolean {
    if (!this.isLoaded) return false;
    operations.animUpdate(this.handleValue, deltaTime, scale, position.x, position.y, position.z, rotationY);
    return true;
  }

  isFinished(): boolean { return this.isLoaded && operations.animFinished(this.handleValue); }
  getClipDuration(clip: number): number { return this.isLoaded ? operations.animClipDuration(this.handleValue, clip) : 0; }
  getRootMotionDelta(axis: 0 | 1 | 2): number { return this.isLoaded ? operations.animRootDelta(this.handleValue, axis) : 0; }

  findJoint(name: string): number { return this.isLoaded ? operations.findJoint(this.handleValue, name) : -1; }

  getJointWorldTransformComponent(joint: number, component: number): number {
    return this.isLoaded ? operations.jointWorld(this.handleValue, joint, component) : 0;
  }

  dispose(): void {
    if (this.disposed) return;
    // The current native ABI has no animation-instance release operation.
    this.handleValue = 0;
    this.disposed = true;
    this.context.unregister(this);
  }
}
