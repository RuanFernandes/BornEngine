import type { GameContext } from '../../core/context';
import { MotionType } from '../../physics';
import type { PhysicsBody, PhysicsWorld } from '../../physics';
import { GameComponent } from '../game-component';
import type { GameObject } from '../game-object';

export type RigidBodyMotionType = typeof MotionType[keyof typeof MotionType];

export interface RigidBodyComponentOptions {
  ownership?: 'borrowed' | 'owned';
}

/** Synchronizes a game-object transform with one physics body around PhysicsWorld.step(). */
export class RigidBodyComponent extends GameComponent {
  readonly body: PhysicsBody;
  readonly ownership: 'borrowed' | 'owned';

  constructor(body: PhysicsBody, options: RigidBodyComponentOptions = {}) {
    super();
    this.body = body;
    this.ownership = options.ownership || 'borrowed';
  }

  get motionType(): RigidBodyMotionType { return this.body.motionType as RigidBodyMotionType; }

  _canAttachTo(context: GameContext): boolean { return this.body._belongsToContext(context); }

  _syncPhysicsBeforeStep(world: PhysicsWorld, fixedDt: number): void {
    if (this.destroyed || this.body.world !== world || !this.body.isLoaded) return;
    const owner: GameObject | null = this.gameObject;
    if (owner === null || owner.destroyed) return;
    const pose = {
      position: owner.transform.worldPosition,
      rotation: owner.transform.worldRotation,
    };
    if (this.motionType === MotionType.STATIC) {
      this.body.setTransform(pose);
    } else if (this.motionType === MotionType.KINEMATIC) {
      this.body.moveKinematic(pose, fixedDt);
    }
  }

  _syncPhysicsAfterStep(world: PhysicsWorld): void {
    if (this.destroyed || this.body.world !== world ||
        this.motionType !== MotionType.DYNAMIC || !this.body.isLoaded) return;
    const owner: GameObject | null = this.gameObject;
    if (owner === null || owner.destroyed) return;
    const pose = this.body.transform;
    if (pose === null || !owner.transform.setWorldPosition(pose.position)) return;
    owner.transform.setWorldRotation(pose.rotation);
  }

  onDestroy(): void {
    if (this.ownership === 'owned') this.body.dispose();
  }
}
