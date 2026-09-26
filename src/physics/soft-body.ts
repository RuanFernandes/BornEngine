import * as native from './internal';
import { getNativeHandle } from './handles';
import { PhysicsBody } from './rigid-body';
import type { SoftBodyConfig } from './internal';
import type { PhysicsWorld } from './physics-world';
import type { Vec3 } from '../core/types';

/** Simulated cloth, rope, or deformable mesh. */
export class SoftBody extends PhysicsBody {
  constructor(world: PhysicsWorld, options: SoftBodyConfig) {
    const valid = world.isReady && options.vertices.length >= 3 &&
      options.inverseMasses.length === options.vertices.length &&
      options.indices.length >= 3 && options.indices.length % 3 === 0;
    const handle = valid ? native.createSoftBody(getNativeHandle(world), options) : 0;
    super(world, null, handle, native.MotionType.DYNAMIC,
      valid ? null : 'Soft body data must have vertices, matching inverse masses, and triangle indices.');
  }

  get vertexCount(): number { return this.isLoaded ? native.softBodyVertexCount(getNativeHandle(this)) : 0; }
  getVertex(index: number): Vec3 | null {
    if (!this.isLoaded || index < 0 || index >= this.vertexCount) return null;
    return native.getSoftBodyVertex(getNativeHandle(this), index);
  }
  setVertex(index: number, position: Vec3): boolean {
    if (!this.isLoaded || index < 0 || index >= this.vertexCount) return false;
    native.setSoftBodyVertex(getNativeHandle(this), index, position);
    return true;
  }
  setVertexInverseMass(index: number, inverseMass: number): boolean {
    if (!this.isLoaded || index < 0 || index >= this.vertexCount) return false;
    native.setSoftBodyVertexInvMass(getNativeHandle(this), index, inverseMass);
    return true;
  }
}
