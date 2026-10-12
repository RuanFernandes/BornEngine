import * as native from './internal';
import { getNativeHandle } from './handles';
import { PhysicsBody } from './rigid-body';
import type { SoftBodyConfig } from './internal';
import type { PhysicsWorld } from './physics-world';
import type { Vec3 } from '../core/types';

/** Simulated cloth, rope, or deformable mesh. */
export class SoftBody extends PhysicsBody {
  /**
   * Creates a soft body in the world from vertex positions, per-vertex inverse masses, and triangle indices.
   * Check `error` if the data is invalid or the world is not ready.
   * @param options Soft body mesh and simulation settings.
   */
  constructor(world: PhysicsWorld, options: SoftBodyConfig) {
    const valid =
      world.isReady &&
      options.vertices.length >= 3 &&
      options.inverseMasses.length === options.vertices.length &&
      options.indices.length >= 3 &&
      options.indices.length % 3 === 0;
    const handle = valid ? native.createSoftBody(getNativeHandle(world), options) : 0;
    super(
      world,
      null,
      handle,
      native.MotionType.DYNAMIC,
      valid ? null : 'Soft body data must have vertices, matching inverse masses, and triangle indices.',
    );
  }

  /** Number of simulated vertices, or 0 when the body is not loaded. */
  get vertexCount(): number {
    return this.isLoaded ? native.softBodyVertexCount(getNativeHandle(this)) : 0;
  }
  /** Returns the current position of a vertex, or null if the index is out of range or the body is not loaded. */
  getVertex(index: number): Vec3 | null {
    if (!this.isLoaded || index < 0 || index >= this.vertexCount) return null;
    return native.getSoftBodyVertex(getNativeHandle(this), index);
  }
  /** Moves a vertex to a new position; returns false if the index is out of range or the body is not loaded. */
  setVertex(index: number, position: Vec3): boolean {
    if (!this.isLoaded || index < 0 || index >= this.vertexCount) return false;
    native.setSoftBodyVertex(getNativeHandle(this), index, position);
    return true;
  }
  /** Sets the inverse mass of a vertex; returns false if the index is out of range or the body is not loaded. */
  setVertexInverseMass(index: number, inverseMass: number): boolean {
    if (!this.isLoaded || index < 0 || index >= this.vertexCount) return false;
    native.setSoftBodyVertexInvMass(getNativeHandle(this), index, inverseMass);
    return true;
  }
}
