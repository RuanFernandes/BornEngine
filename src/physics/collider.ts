import type { GameContext, ContextResource } from '../core/context';
import * as native from './internal';
import { forgetNativeHandle, getNativeHandle, registerNativeHandle } from './handles';
import type { PhysicsWorld } from './physics-world';
import type { Quat, Vec3 } from '../core/types';

export interface PhysicsTransform { position: Vec3; rotation: Quat; }

/** Reusable, context-owned collision geometry. */
export abstract class Collider implements ContextResource {
  readonly context: GameContext;
  readonly world: PhysicsWorld;
  readonly error: string | null;
  private disposed = false;
  private sources: Collider[] = [];
  private dependents: Collider[] = [];

  protected constructor(world: PhysicsWorld, handle: number, error: string | null = null) {
    this.world = world;
    this.context = world.context;
    this.error = error === null && handle === 0 ? 'Unable to create collider.' : error;
    if (handle !== 0 && world.isReady) {
      registerNativeHandle(this, handle);
      world._registerCollider(this);
      this.context.register(this);
    }
  }

  get isLoaded(): boolean { return !this.disposed && this.world.isReady && getNativeHandle(this) !== 0; }
  get isDisposed(): boolean { return this.disposed; }

  get bounds(): { min: Vec3; max: Vec3 } | null {
    const handle = getNativeHandle(this);
    return this.isLoaded ? native.shapeBounds(handle) : null;
  }

  get volume(): number { return this.isLoaded ? native.shapeVolume(getNativeHandle(this)) : 0; }

  scaled(scale: Vec3): ScaledCollider { return new ScaledCollider(this.world, this, scale); }
  offsetCenterOfMass(offset: Vec3): OffsetCollider { return new OffsetCollider(this.world, this, offset); }

  /** @internal Registers source-shape lifetime dependencies. */
  _setSources(sources: Collider[]): void {
    for (let index = 0; index < sources.length; index++) {
      const source = sources[index];
      if (source === this || source.world !== this.world || !source.isLoaded) continue;
      this.sources.push(source);
      source.dependents.push(this);
    }
  }

  dispose(): void {
    if (this.disposed) return;
    const dependents = this.dependents.slice();
    for (let index = dependents.length - 1; index >= 0; index--) dependents[index].dispose();
    this.world._disposeBodiesUsing(this);
    const handle = getNativeHandle(this);
    if (handle !== 0) native.releaseShape(handle);
    forgetNativeHandle(this);
    this.disposed = true;
    for (let index = this.sources.length - 1; index >= 0; index--) {
      const dependentsOfSource = this.sources[index].dependents;
      const sourceIndex = dependentsOfSource.lastIndexOf(this);
      if (sourceIndex >= 0) dependentsOfSource.splice(sourceIndex, 1);
    }
    this.sources = [];
    this.dependents = [];
    this.world._unregisterCollider(this);
    this.context.unregister(this);
  }
}

export class BoxCollider extends Collider {
  constructor(world: PhysicsWorld, halfExtents: Vec3, convexRadius = 0.05) {
    super(world, world.isReady ? native.boxShape(halfExtents, convexRadius) : 0,
      world.isReady ? null : 'PhysicsWorld must be ready before creating a collider.');
  }
}

export class SphereCollider extends Collider {
  constructor(world: PhysicsWorld, radius: number) {
    super(world, world.isReady ? native.sphereShape(radius) : 0,
      world.isReady ? null : 'PhysicsWorld must be ready before creating a collider.');
  }
}

export class CapsuleCollider extends Collider {
  constructor(world: PhysicsWorld, halfHeight: number, radius: number) {
    super(world, world.isReady ? native.capsuleShape(halfHeight, radius) : 0,
      world.isReady ? null : 'PhysicsWorld must be ready before creating a collider.');
  }
}

export class CylinderCollider extends Collider {
  constructor(world: PhysicsWorld, halfHeight: number, radius: number, convexRadius = 0.05) {
    super(world, world.isReady ? native.cylinderShape(halfHeight, radius, convexRadius) : 0,
      world.isReady ? null : 'PhysicsWorld must be ready before creating a collider.');
  }
}

export class ConvexHullCollider extends Collider {
  constructor(world: PhysicsWorld, points: Vec3[], convexRadius = 0.05) {
    super(world, world.isReady ? native.convexHullShape(points, convexRadius) : 0,
      world.isReady ? null : 'PhysicsWorld must be ready before creating a collider.');
  }
}

export class MeshCollider extends Collider {
  constructor(world: PhysicsWorld, vertices: Vec3[], indices: number[]) {
    super(world, world.isReady ? native.meshShape(vertices, indices) : 0,
      world.isReady ? null : 'PhysicsWorld must be ready before creating a collider.');
  }
}

export class HeightfieldCollider extends Collider {
  constructor(world: PhysicsWorld, samples: number[], sampleCount: number,
    offset: Vec3, scale: Vec3, blockSize = 4) {
    super(world, world.isReady ? native.heightfieldShape(samples, sampleCount, offset, scale, blockSize) : 0,
      world.isReady ? null : 'PhysicsWorld must be ready before creating a collider.');
  }
}

export interface CompoundColliderChild {
  collider: Collider;
  local: PhysicsTransform;
}

export class CompoundCollider extends Collider {
  constructor(world: PhysicsWorld, children: CompoundColliderChild[]) {
    const valid = world.isReady && children.length > 0;
    let handle = 0;
    let error: string | null = null;
    const sources: Collider[] = [];
    if (valid) {
      const nativeChildren: Array<{ shape: number; local: native.Transform }> = [];
      for (let index = 0; index < children.length; index++) {
        const child = children[index];
        if (child.collider.world !== world || !child.collider.isLoaded) {
          error = 'Compound collider children must be loaded by the same PhysicsWorld.';
          break;
        }
        nativeChildren.push({
          shape: getNativeHandle(child.collider),
          local: child.local,
        });
        sources.push(child.collider);
      }
      if (error === null) handle = native.compoundShape(nativeChildren);
    }
    super(world, handle, error || (world.isReady ? null : 'PhysicsWorld must be ready before creating a collider.'));
    if (this.isLoaded) this._setSources(sources);
  }
}

export class ScaledCollider extends Collider {
  constructor(world: PhysicsWorld, base: Collider, scale: Vec3) {
    const valid = world.isReady && base.world === world && base.isLoaded;
    super(world, valid ? native.scaledShape(getNativeHandle(base), scale) : 0,
      valid ? null : 'Scaled collider source must be loaded by the same PhysicsWorld.');
    if (valid && this.isLoaded) this._setSources([base]);
  }
}

export class OffsetCollider extends Collider {
  constructor(world: PhysicsWorld, base: Collider, offset: Vec3) {
    const valid = world.isReady && base.world === world && base.isLoaded;
    super(world, valid ? native.offsetCenterOfMassShape(getNativeHandle(base), offset) : 0,
      valid ? null : 'Offset collider source must be loaded by the same PhysicsWorld.');
    if (valid && this.isLoaded) this._setSources([base]);
  }
}
