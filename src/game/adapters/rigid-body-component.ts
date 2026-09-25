import { GameComponent } from '../game-component';
import type { GameObject } from '../game-object';
import {
  destroyBody,
  getBodyTransform,
  isBodyValid,
  MotionType,
  moveKinematic,
  setBodyTransform,
} from '../../physics';
import type { BodyHandle, WorldHandle } from '../../physics';

export type RigidBodyMotionType = typeof MotionType[keyof typeof MotionType];

export interface RigidBodyComponentOptions {
  motionType: RigidBodyMotionType;
  ownership?: 'borrowed' | 'owned';
}

/** Wraps an existing physics body; the world and shape remain externally owned. */
export class RigidBodyComponent extends GameComponent {
  readonly world: WorldHandle;
  readonly body: BodyHandle;
  readonly motionType: RigidBodyMotionType;
  readonly ownership: 'borrowed' | 'owned';

  constructor(
    world: WorldHandle,
    body: BodyHandle,
    options: RigidBodyComponentOptions,
  ) {
    super();
    this.world = world;
    this.body = body;
    this.motionType = options.motionType;
    this.ownership = options.ownership || 'borrowed';
  }

  _syncPhysicsBeforeStep(world: number, fixedDt: number): void {
    if (this.destroyed || this.world !== world || !isBodyValid(this.body)) return;
    const owner: GameObject | null = this.gameObject;
    if (owner === null || owner.destroyed) return;
    const pose = {
      position: owner.transform.worldPosition,
      rotation: owner.transform.worldRotation,
    };
    if (this.motionType === MotionType.STATIC) {
      setBodyTransform(this.body, pose);
    } else if (this.motionType === MotionType.KINEMATIC) {
      moveKinematic(this.body, pose, fixedDt);
    }
  }

  _syncPhysicsAfterStep(world: number): void {
    if (this.destroyed || this.world !== world ||
        this.motionType !== MotionType.DYNAMIC || !isBodyValid(this.body)) return;
    const owner: GameObject | null = this.gameObject;
    if (owner === null || owner.destroyed) return;
    const pose = getBodyTransform(this.body);
    if (!owner.transform.setWorldPosition(pose.position)) return;
    owner.transform.setWorldRotation(pose.rotation);
  }

  onDestroy(): void {
    if (this.ownership === 'owned' && isBodyValid(this.body)) {
      destroyBody(this.body);
    }
  }
}
