import type { Vec2 } from '../core/types';
import { GameComponent } from '../game/game-component';
import type { GameContext } from '../core/context';
import type { PhysicsBody2D } from './physics-body-2d';
import type { PhysicsWorld2D } from './physics-world-2d';

export interface CharacterBody2DOptions {
  width: number;
  height: number;
}

function finite(value: number): boolean {
  return value === value && value !== Infinity && value !== -Infinity;
}

function validVec(value: Vec2): boolean {
  return value !== null && value !== undefined && finite(value.x) && finite(value.y);
}

function copyVec(value: Vec2): Vec2 { return { x: value.x, y: value.y }; }

/** Axis-separated arcade character movement backed by a kinematic PhysicsBody2D. */
export class CharacterBody2D extends GameComponent {
  readonly world: PhysicsWorld2D;
  readonly width: number;
  readonly height: number;
  readonly error: string | null;

  private body: PhysicsBody2D | null = null;
  private velocityValue: Vec2 = { x: 0, y: 0 };
  private contactNormalsValue: Vec2[] = [];
  private onFloorValue = false;
  private onWallValue = false;
  private onCeilingValue = false;

  constructor(world: PhysicsWorld2D, options: CharacterBody2DOptions) {
    super();
    this.world = world;
    const settings: CharacterBody2DOptions = options === null || options === undefined
      ? { width: 0, height: 0 } : options;
    this.width = settings.width;
    this.height = settings.height;

    if (world === null || world === undefined || !world.isReady) {
      this.error = 'CharacterBody2D requires a ready PhysicsWorld2D.';
      this.enabled = false;
      return;
    }
    if (!finite(this.width) || !finite(this.height) || this.width <= 0 || this.height <= 0) {
      this.error = 'CharacterBody2D width and height must be finite and positive.';
      this.enabled = false;
      return;
    }
    this.body = world.createBody({
      type: 'kinematic',
      shape: { type: 'box', width: this.width, height: this.height },
      position: { x: 0, y: 0 },
    });
    this.error = this.body.error;
    if (this.error !== null) this.enabled = false;
  }

  get isReady(): boolean { return this.error === null && this.body !== null && !this.body.isDisposed && this.world.isReady; }
  get position(): Vec2 {
    const owner = this.gameObject;
    if (owner !== null) {
      const value = owner.transform.worldPosition;
      return { x: value.x, y: value.y };
    }
    if (this.body !== null) return this.body.position;
    return { x: 0, y: 0 };
  }
  get velocity(): Vec2 { return copyVec(this.velocityValue); }
  get isOnFloor(): boolean { return this.onFloorValue; }
  get isOnWall(): boolean { return this.onWallValue; }
  get isOnCeiling(): boolean { return this.onCeilingValue; }
  get contactNormals(): ReadonlyArray<Readonly<Vec2>> {
    const result: Vec2[] = [];
    for (let index = 0; index < this.contactNormalsValue.length; index++) {
      result.push(copyVec(this.contactNormalsValue[index]));
    }
    return result;
  }

  /** Moves by velocity times dt, resolving X then Y against filtered non-sensor bodies. */
  moveAndSlide(velocity: Vec2, dt: number): boolean {
    const owner = this.gameObject;
    if (!this.isReady || !validVec(velocity) || !finite(dt) || dt < 0 || owner === null ||
        owner.scene === null || !this.isActiveAndEnabled || this.body === null) return false;
    const delta = { x: velocity.x * dt, y: velocity.y * dt };
    if (!validVec(delta)) return false;
    const start = owner.transform.worldPosition;
    if (!this.body.setPosition({ x: start.x, y: start.y })) return false;
    const result = this.world._moveKinematicBox(this.body, this.width, this.height, delta);
    if (result === null) return false;
    if (!owner.transform.setWorldPosition({ x: result.position.x, y: result.position.y, z: start.z })) {
      this.body.setPosition({ x: start.x, y: start.y });
      return false;
    }

    const resolvedVelocity = copyVec(velocity);
    this.contactNormalsValue = [];
    this.onFloorValue = false;
    this.onWallValue = false;
    this.onCeilingValue = false;
    for (let index = 0; index < result.normals.length; index++) {
      const normal = result.normals[index];
      if (normal.x !== 0) {
        resolvedVelocity.x = 0;
        this.onWallValue = true;
      }
      if (normal.y !== 0) resolvedVelocity.y = 0;
      if (normal.y < 0) this.onFloorValue = true;
      else if (normal.y > 0) this.onCeilingValue = true;
      this.contactNormalsValue.push(copyVec(normal));
    }
    this.velocityValue = resolvedVelocity;
    return true;
  }

  _canAttachTo(context: GameContext): boolean {
    return this.isReady && this.world.context === context;
  }

  onDestroy(): void {
    if (this.body !== null) this.body.dispose();
  }
}
