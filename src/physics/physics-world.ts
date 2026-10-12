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

/** Callbacks that sync scene objects with the physics world around each step. */
export interface PhysicsStepHooks {
  /** Called before each step to push scene transforms into the world. */
  syncPhysicsBeforeStep(world: PhysicsWorld, fixedDt: number): void;
  /** Called after each step to pull simulated poses back into the scene. */
  syncPhysicsAfterStep(world: PhysicsWorld): void;
}

/** World settings such as gravity and body limits, plus an optional scene step hook. */
export interface PhysicsWorldOptions extends native.WorldConfig {
  /** Step hooks to use instead of the game scene manager. */
  sceneManager?: PhysicsStepHooks;
}

/** Result of a ray cast. */
export interface PhysicsRayHit {
  /** Body that was hit. */
  body: PhysicsBody;
  /** World-space hit point. */
  point: Vec3;
  /** Surface normal at the hit point. */
  normal: Vec3;
  /** Hit position along the ray as a fraction of the maximum distance. */
  fraction: number;
  /** Identifier of the sub-shape that was hit. */
  subShapeId: number;
}

/** Contact event between two bodies, returned by `PhysicsWorld.popContacts`. */
export interface PhysicsContact {
  /** `ContactEvent` value: added, persisted, or removed. */
  event: number;
  /** First body in the contact, or null if it is no longer known. */
  bodyA: PhysicsBody | null;
  /** Second body in the contact, or null if it is no longer known. */
  bodyB: PhysicsBody | null;
  /** Contact point on the first body. */
  pointA: Vec3;
  /** Contact point on the second body. */
  pointB: Vec3;
  /** Contact normal. */
  normal: Vec3;
  /** How far the bodies overlap. */
  penetrationDepth: number;
  /** Friction coefficient used for the pair. */
  combinedFriction: number;
  /** Restitution used for the pair. */
  combinedRestitution: number;
}

/** One isolated physics world with owned collider, body, and constraint objects. */
export class PhysicsWorld implements ContextResource {
  /** Game context that owns this world. */
  readonly context: GameContext;
  /** Creation error message, or null if the world was created. */
  readonly error: string | null;
  private colliders: Collider[] = [];
  private bodies: PhysicsBody[] = [];
  private joints: Joint[] = [];
  private characters: CharacterController[] = [];
  private vehicles: Vehicle[] = [];
  private sceneManager: PhysicsStepHooks | null;
  private disposed = false;

  /**
   * Creates a physics world for a game.
   * Check `error` if the game is not ready or the native profile has no 3D physics.
   * @param owner Game that owns the world and, by default, supplies the scene step hooks.
   */
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
    this.error =
      handle !== 0
        ? null
        : 'PhysicsWorld could not be created. Check that the Game is ready and that this native profile includes Jolt physics (native_profile 2.5d or 3d).';
    if (handle !== 0) {
      registerNativeHandle(this, handle);
      this.context.register(this);
    }
  }

  /** True while the world is created and neither it nor its game has been disposed. */
  get isReady(): boolean {
    return !this.disposed && this.context.isReady && !this.context.isDisposed && getNativeHandle(this) !== 0;
  }
  /** True once the world has been disposed. */
  get isDisposed(): boolean {
    return this.disposed;
  }
  /** Current gravity vector. Returns the default (0, -9.81, 0) when the world is not ready. */
  get gravity(): Vec3 {
    return this.isReady ? native.getGravity(getNativeHandle(this)) : { x: 0, y: -9.81, z: 0 };
  }
  /** Number of bodies in the world. */
  get bodyCount(): number {
    return this.isReady ? native.bodyCount(getNativeHandle(this)) : 0;
  }
  /** Number of awake bodies. */
  get activeBodyCount(): number {
    return this.isReady ? native.activeBodyCount(getNativeHandle(this)) : 0;
  }
  /** Interpolation factor between the last two fixed steps, or 1 when not ready. */
  get stepAlpha(): number {
    return this.isReady ? native.getStepAlpha(getNativeHandle(this)) : 1;
  }

  /** Replaces the step hooks used by `step` and `stepVariable`; pass null to detach. */
  setSceneManager(manager: PhysicsStepHooks | null): void {
    this.sceneManager = manager;
  }
  /** Sets world gravity; returns false if the world is not ready. */
  setGravity(gravity: Vec3): boolean {
    if (!this.isReady) return false;
    native.setGravity(getNativeHandle(this), gravity);
    return true;
  }
  /** Rebuilds the broadphase to speed up queries after adding many bodies; returns false if the world is not ready. */
  optimizeBroadphase(): boolean {
    if (!this.isReady) return false;
    native.optimizeBroadphase(getNativeHandle(this));
    return true;
  }
  /** Sets the fixed simulation rate in Hz and the maximum steps per `step` call; returns false if the world is not ready. */
  setFixedTimestep(hz: number, maxSteps = 4): boolean {
    if (!this.isReady) return false;
    native.setFixedTimestep(getNativeHandle(this), hz, maxSteps);
    return true;
  }
  /** Enables or disables interpolation between fixed steps; returns false if the world is not ready. */
  setInterpolation(enabled: boolean): boolean {
    if (!this.isReady) return false;
    native.setInterpolation(getNativeHandle(this), enabled);
    return true;
  }
  /** Sets whether two collision layers collide; returns false if the world is not ready. */
  setLayerCollides(a: number, b: number, collides: boolean): boolean {
    if (!this.isReady) return false;
    native.setLayerCollides(getNativeHandle(this), a, b, collides);
    return true;
  }
  /** True if the two collision layers collide. */
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

  /**
   * Casts a ray and returns the closest hit, or null if nothing is hit.
   * @param maxDistance Maximum ray length.
   * @param layerMask Layers the ray can hit; defaults to all.
   */
  raycast(
    origin: Vec3,
    direction: Vec3,
    maxDistance: number,
    layerMask = native.ALL_LAYERS_MASK,
  ): PhysicsRayHit | null {
    if (!this.isReady) return null;
    const hit = native.raycast(getNativeHandle(this), origin, direction, maxDistance, layerMask);
    if (hit === null) return null;
    const body = this._bodyForNative(hit.body);
    return body === null
      ? null
      : {
          body,
          point: hit.point,
          normal: hit.normal,
          fraction: hit.fraction,
          subShapeId: hit.subShapeId,
        };
  }

  /**
   * Casts a ray and returns every hit, up to `maxHits`.
   * @param maxDistance Maximum ray length.
   * @param layerMask Layers the ray can hit; defaults to all.
   */
  raycastAll(
    origin: Vec3,
    direction: Vec3,
    maxDistance: number,
    maxHits = 16,
    layerMask = native.ALL_LAYERS_MASK,
  ): PhysicsRayHit[] {
    if (!this.isReady) return [];
    const nativeHits = native.raycastAll(getNativeHandle(this), origin, direction, maxDistance, maxHits, layerMask);
    const hits: PhysicsRayHit[] = [];
    for (let index = 0; index < nativeHits.length; index++) {
      const hit = nativeHits[index];
      const body = this._bodyForNative(hit.body);
      if (body !== null)
        hits.push({
          body,
          point: hit.point,
          normal: hit.normal,
          fraction: hit.fraction,
          subShapeId: hit.subShapeId,
        });
    }
    return hits;
  }

  /** Returns bodies overlapping a sphere, up to `maxResults`. */
  overlapSphere(center: Vec3, radius: number, maxResults = 16, layerMask = native.ALL_LAYERS_MASK): PhysicsBody[] {
    if (!this.isReady) return [];
    return this._mapBodies(native.overlapSphere(getNativeHandle(this), center, radius, maxResults, layerMask));
  }
  /** Returns bodies containing a point, up to `maxResults`. */
  overlapPoint(point: Vec3, maxResults = 16, layerMask = native.ALL_LAYERS_MASK): PhysicsBody[] {
    if (!this.isReady) return [];
    return this._mapBodies(native.overlapPoint(getNativeHandle(this), point, maxResults, layerMask));
  }
  /**
   * Returns bodies overlapping an oriented box, up to `maxResults`.
   * @param halfExtents Half size of the box.
   */
  overlapBox(
    transform: { position: Vec3; rotation: Quat },
    halfExtents: Vec3,
    maxResults = 16,
    layerMask = native.ALL_LAYERS_MASK,
  ): PhysicsBody[] {
    if (!this.isReady) return [];
    return this._mapBodies(native.overlapBox(getNativeHandle(this), transform, halfExtents, maxResults, layerMask));
  }

  /** Number of queued contact events. */
  get contactCount(): number {
    return this.isReady ? native.contactCount(getNativeHandle(this)) : 0;
  }
  /** Returns and removes the queued contact events. */
  popContacts(): PhysicsContact[] {
    if (!this.isReady) return [];
    const contacts = native.popContacts(getNativeHandle(this));
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
  /** Discards queued contact events; returns false if the world is not ready. */
  clearContacts(): boolean {
    if (!this.isReady) return false;
    native.clearContacts(getNativeHandle(this));
    return true;
  }

  /** Creates a rigid body in this world from a collider. */
  createBody(collider: Collider, options: RigidBodyOptions = {}): RigidBody {
    return new RigidBody(this, collider, options);
  }
  /** Creates a joint of the given kind between bodies of this world. */
  createJoint(kind: JointKind, options: JointOptions): Joint {
    return new Joint({ ...options, world: this, kind });
  }
  /** Creates a kinematic character controller in this world. */
  createCharacter(collider: Collider, options: CharacterControllerOptions = {}): CharacterController {
    return new CharacterController({ ...options, world: this, collider });
  }
  /** Creates a soft body in this world. */
  createSoftBody(options: native.SoftBodyConfig): SoftBody {
    return new SoftBody(this, options);
  }
  /** Creates a vehicle in this world. */
  createVehicle(options: VehicleOptions): Vehicle {
    return new Vehicle({ ...options, world: this });
  }

  /** @internal */ _registerCollider(value: Collider): void {
    if (this.colliders.indexOf(value) < 0) this.colliders.push(value);
  }
  /** @internal */ _unregisterCollider(value: Collider): void {
    this._remove(this.colliders, value);
  }
  /** @internal */ _registerBody(value: PhysicsBody): void {
    if (this.bodies.indexOf(value) < 0) this.bodies.push(value);
  }
  /** @internal */ _unregisterBody(value: PhysicsBody): void {
    this._remove(this.bodies, value);
  }
  /** @internal */ _registerJoint(value: Joint): void {
    if (this.joints.indexOf(value) < 0) this.joints.push(value);
  }
  /** @internal */ _unregisterJoint(value: Joint): void {
    this._remove(this.joints, value);
  }
  /** @internal */ _registerCharacter(value: CharacterController): void {
    if (this.characters.indexOf(value) < 0) this.characters.push(value);
  }
  /** @internal */ _unregisterCharacter(value: CharacterController): void {
    this._remove(this.characters, value);
  }
  /** @internal */ _registerVehicle(value: Vehicle): void {
    if (this.vehicles.indexOf(value) < 0) this.vehicles.push(value);
  }
  /** @internal */ _unregisterVehicle(value: Vehicle): void {
    this._remove(this.vehicles, value);
  }

  /** @internal */ _disposeBodiesUsing(collider: Collider): void {
    const vehicles = this.vehicles.slice();
    for (let index = vehicles.length - 1; index >= 0; index--) {
      const chassis = vehicles[index].chassis;
      if (chassis !== null && chassis.collider === collider) {
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

  _belongsToContext(context: GameContext): boolean {
    return this.context === context;
  }

  /** Destroys the world and every collider, body, joint, character, and vehicle it owns. Safe to call more than once. */
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
