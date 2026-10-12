import type { GameContext, ContextResource } from '../core/context';
import * as native from './internal';
import { forgetNativeHandle, getNativeHandle, registerNativeHandle } from './handles';
import type { PhysicsWorld } from './physics-world';
import type { Quat, Vec3 } from '../core/types';

/** Position and rotation pair. */
export interface PhysicsTransform {
  position: Vec3;
  rotation: Quat;
}

/** Reusable, context-owned collision geometry. */
export abstract class Collider implements ContextResource {
  /** Game context that owns this collider. */
  readonly context: GameContext;
  /** World that owns this collider. */
  readonly world: PhysicsWorld;
  /** Creation error message, or null if the collider was created. */
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

  /** True while the collider exists in a ready world and has not been disposed. */
  get isLoaded(): boolean {
    return !this.disposed && this.world.isReady && getNativeHandle(this) !== 0;
  }
  /** True once the collider has been disposed. */
  get isDisposed(): boolean {
    return this.disposed;
  }

  /** Axis-aligned bounds (min and max corners) of the shape, or null when not loaded. */
  get bounds(): { min: Vec3; max: Vec3 } | null {
    const handle = getNativeHandle(this);
    return this.isLoaded ? native.shapeBounds(handle) : null;
  }

  /** Volume of the shape, or 0 when not loaded. */
  get volume(): number {
    return this.isLoaded ? native.shapeVolume(getNativeHandle(this)) : 0;
  }

  /** Creates a new collider that applies a scale to this one. */
  scaled(scale: Vec3): ScaledCollider {
    return new ScaledCollider(this.world, this, scale);
  }
  /** Creates a new collider that shifts the center of mass of this one by an offset. */
  offsetCenterOfMass(offset: Vec3): OffsetCollider {
    return new OffsetCollider(this.world, this, offset);
  }

  /** @internal Registers source-shape lifetime dependencies. */
  _setSources(sources: Collider[]): void {
    for (let index = 0; index < sources.length; index++) {
      const source = sources[index];
      if (source === this || source.world !== this.world || !source.isLoaded) continue;
      this.sources.push(source);
      source.dependents.push(this);
    }
  }

  /** Releases the collider along with colliders built from it and bodies that use it. Safe to call more than once. */
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

/** Box collision shape. */
export class BoxCollider extends Collider {
  /** Creates a box from its half extents. */
  constructor(world: PhysicsWorld, halfExtents: Vec3, convexRadius = 0.05) {
    super(
      world,
      world.isReady ? native.boxShape(halfExtents, convexRadius) : 0,
      world.isReady ? null : 'PhysicsWorld must be ready before creating a collider.',
    );
  }
}

/** Sphere collision shape. */
export class SphereCollider extends Collider {
  /** Creates a sphere from its radius. */
  constructor(world: PhysicsWorld, radius: number) {
    super(
      world,
      world.isReady ? native.sphereShape(radius) : 0,
      world.isReady ? null : 'PhysicsWorld must be ready before creating a collider.',
    );
  }
}

/** Capsule collision shape. */
export class CapsuleCollider extends Collider {
  /** Creates a capsule from the half height of its cylindrical section and its radius. */
  constructor(world: PhysicsWorld, halfHeight: number, radius: number) {
    super(
      world,
      world.isReady ? native.capsuleShape(halfHeight, radius) : 0,
      world.isReady ? null : 'PhysicsWorld must be ready before creating a collider.',
    );
  }
}

/** Cylinder collision shape. */
export class CylinderCollider extends Collider {
  /** Creates a cylinder from its half height and radius. */
  constructor(world: PhysicsWorld, halfHeight: number, radius: number, convexRadius = 0.05) {
    super(
      world,
      world.isReady ? native.cylinderShape(halfHeight, radius, convexRadius) : 0,
      world.isReady ? null : 'PhysicsWorld must be ready before creating a collider.',
    );
  }
}

/** Convex collision shape built from a point cloud. */
export class ConvexHullCollider extends Collider {
  /** Creates a convex hull around the given points. */
  constructor(world: PhysicsWorld, points: Vec3[], convexRadius = 0.05) {
    super(
      world,
      world.isReady ? native.convexHullShape(points, convexRadius) : 0,
      world.isReady ? null : 'PhysicsWorld must be ready before creating a collider.',
    );
  }
}

/** Triangle mesh collision shape. */
export class MeshCollider extends Collider {
  /** Creates a mesh from vertex positions and triangle indices. */
  constructor(world: PhysicsWorld, vertices: Vec3[], indices: number[]) {
    super(
      world,
      world.isReady ? native.meshShape(vertices, indices) : 0,
      world.isReady ? null : 'PhysicsWorld must be ready before creating a collider.',
    );
  }
}

/** Terrain collision shape built from height samples. */
export class HeightfieldCollider extends Collider {
  /** Creates a heightfield from height samples, placed with an offset and scale. */
  constructor(world: PhysicsWorld, samples: number[], sampleCount: number, offset: Vec3, scale: Vec3, blockSize = 4) {
    super(
      world,
      world.isReady ? native.heightfieldShape(samples, sampleCount, offset, scale, blockSize) : 0,
      world.isReady ? null : 'PhysicsWorld must be ready before creating a collider.',
    );
  }
}

/** Child shape and its local transform within a compound collider. */
export interface CompoundColliderChild {
  collider: Collider;
  local: PhysicsTransform;
}

/** Collision shape made of several child colliders. */
export class CompoundCollider extends Collider {
  /**
   * Creates a compound shape from children that are all loaded by the same world.
   * Check `error` if a child is invalid.
   */
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

/** Collider that applies a scale to another collider. */
export class ScaledCollider extends Collider {
  /** Creates a scaled version of a collider from the same world. */
  constructor(world: PhysicsWorld, base: Collider, scale: Vec3) {
    const valid = world.isReady && base.world === world && base.isLoaded;
    super(
      world,
      valid ? native.scaledShape(getNativeHandle(base), scale) : 0,
      valid ? null : 'Scaled collider source must be loaded by the same PhysicsWorld.',
    );
    if (valid && this.isLoaded) this._setSources([base]);
  }
}

/** Collider that shifts the center of mass of another collider. */
export class OffsetCollider extends Collider {
  /** Creates a version of a collider from the same world with its center of mass offset. */
  constructor(world: PhysicsWorld, base: Collider, offset: Vec3) {
    const valid = world.isReady && base.world === world && base.isLoaded;
    super(
      world,
      valid ? native.offsetCenterOfMassShape(getNativeHandle(base), offset) : 0,
      valid ? null : 'Offset collider source must be loaded by the same PhysicsWorld.',
    );
    if (valid && this.isLoaded) this._setSources([base]);
  }
}
