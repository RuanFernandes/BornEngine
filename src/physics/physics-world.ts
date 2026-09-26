import { getGameContext } from '../core/context';
import type { GameContext, ContextResource } from '../core/context';
import type { Game } from '../core/game';
import type { Quat, Vec3 } from '../core/types';
import * as native from './internal';
import { forgetNativeHandle, getNativeHandle, registerNativeHandle } from './handles';
import type { Collider } from './collider';
import { Joint } from './joint';
import type { JointKind, JointOptions } from './joint';
import { CharacterController } from './character-controller';
import type { CharacterControllerOptions } from './character-controller';
import { PhysicsBody, RigidBody } from './rigid-body';
import type { RigidBodyOptions } from './rigid-body';
import { SoftBody } from './soft-body';
import { Vehicle } from './vehicle';
import type { VehicleOptions } from './vehicle';

export { MotionType, ContactEvent, Layer, MAX_OBJECT_LAYERS, ALL_LAYERS_MASK } from './internal';
export type { WorldConfig, BodyConfig, SoftBodyConfig } from './internal';

export interface PhysicsStepHooks {
  syncPhysicsBeforeStep(world: PhysicsWorld, fixedDt: number): void;
  syncPhysicsAfterStep(world: PhysicsWorld): void;
}

export interface PhysicsWorldOptions extends native.WorldConfig {
  sceneManager?: PhysicsStepHooks;
}

export interface PhysicsRayHit {
  body: PhysicsBody;
  point: Vec3;
  normal: Vec3;
  fraction: number;
  subShapeId: number;
}

export interface PhysicsContact {
  event: number;
  bodyA: PhysicsBody | null;
  bodyB: PhysicsBody | null;
  pointA: Vec3;
  pointB: Vec3;
  normal: Vec3;
  penetrationDepth: number;
  combinedFriction: number;
  combinedRestitution: number;
}

/** One isolated physics world with owned collider, body, and constraint objects. */
export class PhysicsWorld implements ContextResource {
  readonly context: GameContext;
  readonly error: string | null;
  private colliders: Collider[] = [];
  private bodies: PhysicsBody[] = [];
  private joints: Joint[] = [];
  private characters: CharacterController[] = [];
  private vehicles: Vehicle[] = [];
  private sceneManager: PhysicsStepHooks | null;
  private disposed = false;

  constructor(owner: Game, options: PhysicsWorldOptions = {}) {
    this.context = getGameContext(owner);
    this.sceneManager = options.sceneManager || owner.scenes || null;
    let handle = 0;
    if (this.context.isReady && !this.context.isDisposed) {
      handle = native.createWorld({
        gravity: options.gravity,
        maxBodies: options.maxBodies,
        numThreads: options.numThreads,
      });
    }
    this.error = handle !== 0 ? null : 'The Game must be ready to create a PhysicsWorld.';
    if (handle !== 0) {
      registerNativeHandle(this, handle);
      this.context.register(this);
    }
  }

  get isReady(): boolean {
    return !this.disposed && this.context.isReady && !this.context.isDisposed && getNativeHandle(this) !== 0;
  }
  get isDisposed(): boolean { return this.disposed; }
  get gravity(): Vec3 { return this.isReady ? native.getGravity(getNativeHandle(this)) : { x: 0, y: -9.81, z: 0 }; }
  get bodyCount(): number { return this.isReady ? native.bodyCount(getNativeHandle(this)) : 0; }
  get activeBodyCount(): number { return this.isReady ? native.activeBodyCount(getNativeHandle(this)) : 0; }
  get stepAlpha(): number { return this.isReady ? native.getStepAlpha(getNativeHandle(this)) : 1; }

  setSceneManager(manager: PhysicsStepHooks | null): void { this.sceneManager = manager; }
  setGravity(gravity: Vec3): boolean { if (!this.isReady) return false; native.setGravity(getNativeHandle(this), gravity); return true; }
  optimizeBroadphase(): boolean { if (!this.isReady) return false; native.optimizeBroadphase(getNativeHandle(this)); return true; }
  setFixedTimestep(hz: number, maxSteps = 4): boolean { if (!this.isReady) return false; native.setFixedTimestep(getNativeHandle(this), hz, maxSteps); return true; }
  setInterpolation(enabled: boolean): boolean { if (!this.isReady) return false; native.setInterpolation(getNativeHandle(this), enabled); return true; }
  setLayerCollides(a: number, b: number, collides: boolean): boolean {
    if (!this.isReady) return false;
    native.setLayerCollides(getNativeHandle(this), a, b, collides);
    return true;
  }
  getLayerCollides(a: number, b: number): boolean {
    return this.isReady && native.getLayerCollides(getNativeHandle(this), a, b);
  }

  /** Steps the fixed-timestep simulation and synchronizes attached scene bodies around it. */
  step(deltaTime: number, collisionSteps = 1): number {
    if (!this.isReady || deltaTime < 0) return 0;
    if (this.sceneManager !== null) this.sceneManager.syncPhysicsBeforeStep(this, deltaTime);
    const alpha = native.step(getNativeHandle(this), deltaTime, collisionSteps);
    if (this.sceneManager !== null) this.sceneManager.syncPhysicsAfterStep(this);
    return alpha;
  }

  /** Runs one variable-sized solver step; fixed-step simulation remains preferred. */
  stepVariable(deltaTime: number, collisionSteps = 1): boolean {
    if (!this.isReady || deltaTime < 0) return false;
    if (this.sceneManager !== null) this.sceneManager.syncPhysicsBeforeStep(this, deltaTime);
    native.stepVariable(getNativeHandle(this), deltaTime, collisionSteps);
    if (this.sceneManager !== null) this.sceneManager.syncPhysicsAfterStep(this);
    return true;
  }

  raycast(origin: Vec3, direction: Vec3, maxDistance: number, layerMask = native.ALL_LAYERS_MASK): PhysicsRayHit | null {
    if (!this.isReady) return null;
    const hit = native.raycast(getNativeHandle(this), origin, direction, maxDistance, layerMask);
    if (hit === null) return null;
    const body = this._bodyForNative(hit.body);
    return body === null ? null : {
      body, point: hit.point, normal: hit.normal, fraction: hit.fraction, subShapeId: hit.subShapeId,
    };
  }

  raycastAll(origin: Vec3, direction: Vec3, maxDistance: number, maxHits = 16,
    layerMask = native.ALL_LAYERS_MASK): PhysicsRayHit[] {
    if (!this.isReady) return [];
    const nativeHits = native.raycastAll(getNativeHandle(this), origin, direction, maxDistance, maxHits, layerMask);
    const hits: PhysicsRayHit[] = [];
    for (let index = 0; index < nativeHits.length; index++) {
      const hit = nativeHits[index];
      const body = this._bodyForNative(hit.body);
      if (body !== null) hits.push({
        body, point: hit.point, normal: hit.normal, fraction: hit.fraction, subShapeId: hit.subShapeId,
      });
    }
    return hits;
  }

  overlapSphere(center: Vec3, radius: number, maxResults = 16, layerMask = native.ALL_LAYERS_MASK): PhysicsBody[] {
    if (!this.isReady) return [];
    return this._mapBodies(native.overlapSphere(getNativeHandle(this), center, radius, maxResults, layerMask));
  }
  overlapPoint(point: Vec3, maxResults = 16, layerMask = native.ALL_LAYERS_MASK): PhysicsBody[] {
    if (!this.isReady) return [];
    return this._mapBodies(native.overlapPoint(getNativeHandle(this), point, maxResults, layerMask));
  }
  overlapBox(transform: { position: Vec3; rotation: Quat }, halfExtents: Vec3,
    maxResults = 16, layerMask = native.ALL_LAYERS_MASK): PhysicsBody[] {
    if (!this.isReady) return [];
    return this._mapBodies(native.overlapBox(getNativeHandle(this), transform, halfExtents, maxResults, layerMask));
  }

  get contactCount(): number { return this.isReady ? native.contactCount() : 0; }
  popContacts(): PhysicsContact[] {
    if (!this.isReady) return [];
    const contacts = native.popContacts();
    const out: PhysicsContact[] = [];
    for (let index = 0; index < contacts.length; index++) {
      const contact = contacts[index];
      out.push({
        event: contact.event,
        bodyA: this._bodyForNative(contact.bodyA),
        bodyB: this._bodyForNative(contact.bodyB),
        pointA: contact.pointA,
        pointB: contact.pointB,
        normal: contact.normal,
        penetrationDepth: contact.penetrationDepth,
        combinedFriction: contact.combinedFriction,
        combinedRestitution: contact.combinedRestitution,
      });
    }
    return out;
  }
  clearContacts(): boolean { if (!this.isReady) return false; native.clearContacts(getNativeHandle(this)); return true; }

  createBody(collider: Collider, options: RigidBodyOptions = {}): RigidBody {
    return new RigidBody(this, collider, options);
  }
  createJoint(kind: JointKind, options: JointOptions): Joint { return new Joint(this, kind, options); }
  createCharacter(collider: Collider, options: CharacterControllerOptions = {}): CharacterController {
    return new CharacterController(this, collider, options);
  }
  createSoftBody(options: native.SoftBodyConfig): SoftBody { return new SoftBody(this, options); }
  createVehicle(options: VehicleOptions): Vehicle { return new Vehicle(this, options); }

  /** @internal */ _registerCollider(value: Collider): void { if (this.colliders.indexOf(value) < 0) this.colliders.push(value); }
  /** @internal */ _unregisterCollider(value: Collider): void { this._remove(this.colliders, value); }
  /** @internal */ _registerBody(value: PhysicsBody): void { if (this.bodies.indexOf(value) < 0) this.bodies.push(value); }
  /** @internal */ _unregisterBody(value: PhysicsBody): void { this._remove(this.bodies, value); }
  /** @internal */ _registerJoint(value: Joint): void { if (this.joints.indexOf(value) < 0) this.joints.push(value); }
  /** @internal */ _unregisterJoint(value: Joint): void { this._remove(this.joints, value); }
  /** @internal */ _registerCharacter(value: CharacterController): void { if (this.characters.indexOf(value) < 0) this.characters.push(value); }
  /** @internal */ _unregisterCharacter(value: CharacterController): void { this._remove(this.characters, value); }
  /** @internal */ _registerVehicle(value: Vehicle): void { if (this.vehicles.indexOf(value) < 0) this.vehicles.push(value); }
  /** @internal */ _unregisterVehicle(value: Vehicle): void { this._remove(this.vehicles, value); }

  /** @internal */ _disposeBodiesUsing(collider: Collider): void {
    const vehicles = this.vehicles.slice();
    for (let index = vehicles.length - 1; index >= 0; index--) {
      if (vehicles[index].chassis !== null && vehicles[index].chassis.collider === collider) {
        vehicles[index].dispose();
      }
    }
    const characters = this.characters.slice();
    for (let index = characters.length - 1; index >= 0; index--) {
      if (characters[index].collider === collider) characters[index].dispose();
    }
    const pending = this.bodies.slice();
    for (let index = pending.length - 1; index >= 0; index--) {
      if (pending[index].collider === collider) pending[index].dispose();
    }
  }

  /** @internal */ _bodyForNative(handle: number): PhysicsBody | null {
    for (let index = 0; index < this.bodies.length; index++) {
      const body = this.bodies[index];
      if (body.isLoaded && getNativeHandle(body) === handle) return body;
    }
    return null;
  }

  private _mapBodies(handles: number[]): PhysicsBody[] {
    if (!this.isReady) return [];
    const out: PhysicsBody[] = [];
    for (let index = 0; index < handles.length; index++) {
      const body = this._bodyForNative(handles[index]);
      if (body !== null) out.push(body);
    }
    return out;
  }

  private _remove<T>(values: T[], value: T): void {
    const index = values.lastIndexOf(value);
    if (index >= 0) values.splice(index, 1);
  }

  _belongsToContext(context: GameContext): boolean { return this.context === context; }

  dispose(): void {
    if (this.disposed) return;
    const vehicles = this.vehicles.slice();
    for (let index = vehicles.length - 1; index >= 0; index--) vehicles[index].dispose();
    const joints = this.joints.slice();
    for (let index = joints.length - 1; index >= 0; index--) joints[index].dispose();
    const characters = this.characters.slice();
    for (let index = characters.length - 1; index >= 0; index--) characters[index].dispose();
    const bodies = this.bodies.slice();
    for (let index = bodies.length - 1; index >= 0; index--) bodies[index].dispose();
    const colliders = this.colliders.slice();
    for (let index = colliders.length - 1; index >= 0; index--) colliders[index].dispose();
    const handle = getNativeHandle(this);
    if (handle !== 0) native.destroyWorld(handle);
    forgetNativeHandle(this);
    this.disposed = true;
    this.sceneManager = null;
    this.context.unregister(this);
  }
}
