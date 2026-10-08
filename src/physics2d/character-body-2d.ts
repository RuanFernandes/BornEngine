import type { Vector2DLike } from '../core/types';
import { Vector2D } from '../math/vector2d';
import { GameComponent } from '../game/game-component';
import type { GameContext } from '../core/context';
import type { PhysicsBody2D } from './physics-body-2d';
import type { PhysicsWorld2D } from './physics-world-2d';

export interface CharacterBody2DOptions {
  width: number;
  height: number;
}

function finite(value: number): boolean {
  return typeof value === 'number' && value === value && value !== Infinity && value !== -Infinity;
}

function validVec(value: Vector2DLike): boolean {
  return value !== null && value !== undefined && finite(value.x) && finite(value.y);
}

function copyVec(value: Vector2DLike): Vector2D { return Vector2D.from(value); }

/** Arcade character movement backed by a kinematic PhysicsBody2D. */
export class CharacterBody2D extends GameComponent {
  readonly world: PhysicsWorld2D;
  readonly width: number;
  readonly height: number;
  readonly error: string | null;

  private body: PhysicsBody2D | null = null;
  private velocityValue: Vector2DLike = { x: 0, y: 0 };
  private contactNormalsValue: Vector2DLike[] = [];
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
  get position(): Vector2D {
    const owner = this.gameObject;
    if (owner !== null) {
      const value = owner.transform.worldPosition;
      return new Vector2D(value.x, value.y);
    }
    if (this.body !== null) return this.body.position;
    return Vector2D.zero();
  }
  get velocity(): Vector2D { return Vector2D.from(this.velocityValue); }
  get isOnFloor(): boolean { return this.onFloorValue; }
  get isOnWall(): boolean { return this.onWallValue; }
  get isOnCeiling(): boolean { return this.onCeilingValue; }
  get contactNormals(): ReadonlyArray<Readonly<Vector2D>> {
    const result: Vector2D[] = [];
    for (let index = 0; index < this.contactNormalsValue.length; index++) {
      result.push(copyVec(this.contactNormalsValue[index]));
    }
    return result;
  }

  /** Moves by velocity times dt and slides along filtered non-sensor surfaces. */
  moveAndSlide(velocity: Vector2DLike, dt: number): boolean {
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
      const toward = resolvedVelocity.x * normal.x + resolvedVelocity.y * normal.y;
      if (toward < 0) {
        resolvedVelocity.x -= toward * normal.x;
        resolvedVelocity.y -= toward * normal.y;
      }
      // biome-ignore lint/suspicious/noApproximativeNumericConstant: 0.70710678 is a truncated 45-degree normal threshold; Math.SQRT1_2 would change the cutoff
      if (normal.y < -0.70710678) this.onFloorValue = true;
      // biome-ignore lint/suspicious/noApproximativeNumericConstant: 0.70710678 is a truncated 45-degree normal threshold; Math.SQRT1_2 would change the cutoff
      else if (normal.y > 0.70710678) this.onCeilingValue = true;
      // biome-ignore lint/suspicious/noApproximativeNumericConstant: 0.70710678 is a truncated 45-degree normal threshold; Math.SQRT1_2 would change the cutoff
      if (Math.abs(normal.x) > 0.70710678) this.onWallValue = true;
      this.contactNormalsValue.push(copyVec(normal));
    }
    if (result.exhausted) { resolvedVelocity.x = 0; resolvedVelocity.y = 0; }
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
