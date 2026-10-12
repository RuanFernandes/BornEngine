import type { GameContext, ContextResource } from '../core/context';
import { GameComponent } from '../game/game-component';
import type { Vec3 } from '../core/types';
import * as native from './internal';
import { forgetNativeHandle, getNativeHandle, registerNativeHandle } from './handles';
import type { PhysicsWorld } from './physics-world';
import type { PhysicsBody } from './rigid-body';

/** Constraint type: `fixed`, `point`, `hinge`, `slider`, or `distance`. */
export type JointKind = 'fixed' | 'point' | 'hinge' | 'slider' | 'distance';

/** Bodies, anchors, and limits that describe a joint. */
export interface JointOptions {
  /** First body to constrain. */
  bodyA: PhysicsBody;
  /** Second body; when omitted the joint attaches `bodyA` to the world. */
  bodyB?: PhysicsBody;
  /** Anchor point on `bodyA`. */
  anchorA: Vec3;
  /** Anchor point on `bodyB`. */
  anchorB: Vec3;
  /** Hinge or slider axis. Defaults to Y for hinges and X for sliders. */
  axis?: Vec3;
  /** Lower limit: angle for hinges, distance for sliders and distance joints. */
  min?: number;
  /** Upper limit: angle for hinges, distance for sliders and distance joints. */
  max?: number;
  /** When true, anchors are interpreted in world space instead of body-local space. */
  worldSpace?: boolean;
}

/** Joint options plus the owning world and joint kind, used by the `Joint` constructor. */
export type JointComponentOptions = JointOptions & { world: PhysicsWorld; kind: JointKind };

/** Constraint joining two bodies in one PhysicsWorld. */
export class Joint extends GameComponent implements ContextResource {
  /** World that owns this joint. */
  readonly world: PhysicsWorld;
  /** Game context that owns this joint. */
  readonly context: GameContext;
  /** Creation error message, or null if the joint was created. */
  readonly error: string | null;
  private disposed = false;

  /**
   * Creates a joint between bodies of the same world; prefer `PhysicsWorld.createJoint`.
   * Check `error` if the bodies are not loaded by the same world.
   */
  constructor(options: JointComponentOptions) {
    super();
    const world = options.world;
    const kind = options.kind;
    this.world = world;
    this.context = world.context;
    const valid =
      world.isReady &&
      options.bodyA.world === world &&
      options.bodyA.isLoaded &&
      (options.bodyB === undefined || (options.bodyB.world === world && options.bodyB.isLoaded));
    let handle = 0;
    if (valid) {
      const anchors: native.ConstraintAnchors = {
        bodyA: getNativeHandle(options.bodyA),
        bodyB: options.bodyB === undefined ? native.INVALID_HANDLE : getNativeHandle(options.bodyB),
        anchorA: options.anchorA,
        anchorB: options.anchorB,
        worldSpace: options.worldSpace,
      };
      if (kind === 'fixed') handle = native.fixedConstraint(anchors);
      else if (kind === 'point') handle = native.pointConstraint(anchors);
      else if (kind === 'hinge')
        handle = native.hingeConstraint(anchors, options.axis || { x: 0, y: 1, z: 0 }, options.min, options.max);
      else if (kind === 'slider')
        handle = native.sliderConstraint(anchors, options.axis || { x: 1, y: 0, z: 0 }, options.min, options.max);
      else handle = native.distanceConstraint(anchors, options.min || 0, options.max || 0);
    }
    this.error = valid
      ? handle === 0
        ? 'Unable to create joint.'
        : null
      : 'Joint bodies must be loaded by the same PhysicsWorld.';
    if (handle !== 0) {
      registerNativeHandle(this, handle);
      world._registerJoint(this);
      this.context.register(this);
    }
  }

  /** True while the joint exists in a ready world and has not been disposed. */
  get isLoaded(): boolean {
    return !this.disposed && this.world.isReady && getNativeHandle(this) !== 0;
  }
  /** Enables or disables the constraint; returns false if the joint is not loaded. */
  setEnabled(enabled: boolean): boolean {
    if (!this.isLoaded) return false;
    native.setConstraintEnabled(getNativeHandle(this), enabled);
    return true;
  }

  /** Disposes the joint when its game object is destroyed. */
  onDestroy(): void {
    this.dispose();
  }

  /** Destroys the joint and releases its native resources. Safe to call more than once. */
  dispose(): void {
    if (this.disposed) return;
    const handle = getNativeHandle(this);
    if (handle !== 0) native.destroyConstraint(handle);
    forgetNativeHandle(this);
    this.disposed = true;
    this.world._unregisterJoint(this);
    this.context.unregister(this);
  }
}
