import type { GameContext, ContextResource } from '../core/context';
import type { Vec3 } from '../core/types';
import * as native from './internal';
import { forgetNativeHandle, getNativeHandle, registerNativeHandle } from './handles';
import type { PhysicsWorld } from './physics-world';
import type { PhysicsBody } from './rigid-body';

export type JointKind = 'fixed' | 'point' | 'hinge' | 'slider' | 'distance';

export interface JointOptions {
  bodyA: PhysicsBody;
  bodyB?: PhysicsBody;
  anchorA: Vec3;
  anchorB: Vec3;
  axis?: Vec3;
  min?: number;
  max?: number;
  worldSpace?: boolean;
}

/** Constraint joining two bodies in one PhysicsWorld. */
export class Joint implements ContextResource {
  readonly world: PhysicsWorld;
  readonly context: GameContext;
  readonly error: string | null;
  private disposed = false;

  constructor(world: PhysicsWorld, kind: JointKind, options: JointOptions) {
    this.world = world;
    this.context = world.context;
    const valid = world.isReady && options.bodyA.world === world && options.bodyA.isLoaded &&
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
      else if (kind === 'hinge') handle = native.hingeConstraint(anchors, options.axis || { x: 0, y: 1, z: 0 }, options.min, options.max);
      else if (kind === 'slider') handle = native.sliderConstraint(anchors, options.axis || { x: 1, y: 0, z: 0 }, options.min, options.max);
      else handle = native.distanceConstraint(anchors, options.min || 0, options.max || 0);
    }
    this.error = valid ? (handle === 0 ? 'Unable to create joint.' : null) :
      'Joint bodies must be loaded by the same PhysicsWorld.';
    if (handle !== 0) {
      registerNativeHandle(this, handle);
      world._registerJoint(this);
      this.context.register(this);
    }
  }

  get isLoaded(): boolean { return !this.disposed && this.world.isReady && getNativeHandle(this) !== 0; }
  setEnabled(enabled: boolean): boolean {
    if (!this.isLoaded) return false;
    native.setConstraintEnabled(getNativeHandle(this), enabled);
    return true;
  }

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
