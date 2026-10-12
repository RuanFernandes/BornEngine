import type { GameContext } from '../../core/context';
import { MotionType } from '../../physics';
import type { PhysicsBody, PhysicsWorld } from '../../physics';
import { GameComponent } from '../game-component';
import type { GameObject } from '../game-object';

/** Motion type of a physics body: STATIC, KINEMATIC or DYNAMIC. */
export type RigidBodyMotionType = (typeof MotionType)[keyof typeof MotionType];

/** Options for a RigidBodyComponent. */
export interface RigidBodyComponentOptions {
  /** 'owned' disposes the body when the component is destroyed; 'borrowed' (default) leaves it to the caller. */
  ownership?: 'borrowed' | 'owned';
}

/** Synchronizes a game-object transform with one physics body around PhysicsWorld.step(). */
export class RigidBodyComponent extends GameComponent {
  /** The physics body kept in sync with the owner. */
  readonly body: PhysicsBody;
  /** Whether the component disposes the body on destroy. */
  readonly ownership: 'borrowed' | 'owned';

  /** Creates a component for the given body. The owner's transform drives static and kinematic bodies; dynamic bodies drive the owner's transform. */
  constructor(body: PhysicsBody, options: RigidBodyComponentOptions = {}) {
    super();
    this.body = body;
    this.ownership = options.ownership || 'borrowed';
  }

  /** Motion type of the body. */
  get motionType(): RigidBodyMotionType {
    return this.body.motionType as RigidBodyMotionType;
  }

  _canAttachTo(context: GameContext): boolean {
    return this.body._belongsToContext(context);
  }

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
    if (this.destroyed || this.body.world !== world || this.motionType !== MotionType.DYNAMIC || !this.body.isLoaded)
      return;
    const owner: GameObject | null = this.gameObject;
    if (owner === null || owner.destroyed) return;
    const pose = this.body.transform;
    if (pose === null || !owner.transform.setWorldPosition(pose.position)) return;
    owner.transform.setWorldRotation(pose.rotation);
  }

  /** Disposes the body when ownership is 'owned'. */
  onDestroy(): void {
    if (this.ownership === 'owned') this.body.dispose();
  }
}
