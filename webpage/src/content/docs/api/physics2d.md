---
title: Physics 2D
description: Simulate 2D bodies with a fixed-step world and scene components.
section: API / Physics
order: 41
---

`PhysicsWorld2D` is a small fixed-step solver for arcade and platform gameplay. It uses 2D coordinates in pixels and seconds, with positive Y pointing down by default.

## Fixed-step world

Create the world after its Game is ready, then advance it explicitly from the active scene's `update()` method. Let the Scene own the world so unloading that Scene cleans up its bodies.

```ts
import { Game, Scene, PhysicsWorld2D } from '@bornengine/engine';

class Level extends Scene {
  readonly physics: PhysicsWorld2D | null;

  constructor(game: Game) {
    super(game, { name: 'Level' });
    this.physics = this.own(new PhysicsWorld2D(game, {
      gravity: { x: 0, y: 900 },
      fixedTimeStep: 1 / 60,
      maxSubSteps: 5,
    }));
  }

  override update(deltaTime: number): void {
    super.update(deltaTime);
    if (this.physics !== null) this.physics.step(deltaTime);
  }
}
```

`step(deltaTime)` accumulates time, runs no more than `maxSubSteps` and returns the number of steps executed. Extra time is dropped after the frame budget is reached and added to `droppedTime`.

## Bodies and scene components

`createBody(options)` returns a `PhysicsBody2D`, which can be attached to a `GameObject` like any other `GameComponent`. Dynamic bodies integrate gravity and velocity; static bodies do not move; kinematic bodies move from their assigned velocity without gravity.

```ts
import { GameObject } from '@bornengine/engine';

const player = new GameObject({ name: 'Player', position: { x: 80, y: 40, z: 0 } });
const body = physics.createBody({
  type: 'dynamic',
  shape: { type: 'box', width: 24, height: 32 },
  friction: 0.4,
  restitution: 0,
});
player.addComponent(body);
```

Bodies attached to active and enabled GameObjects synchronize their 2D position with the owner's world transform and preserve Z depth. That transform sets the body's initial position when simulation starts, so it takes precedence over `options.position` for an attached body. A body may also stay standalone: it uses `options.position` and continues simulating whenever its owning world steps, without writing its position to a GameObject. Supported shapes are axis-aligned boxes and circles.

## Collision events and queries

Bodies expose collision and trigger enter/stay/exit callbacks. Sensor contacts report overlap without resolving penetration. The world also offers `raycast`, `overlapPoint`, `overlapCircle`, `overlapBox`, and `popContacts()`.

```ts
body.onCollisionEnter = (contact) => {
  console.log(contact.other.gameObject?.name, contact.normal);
};

const hit = physics.raycast({ x: 0, y: 40 }, { x: 1, y: 0 }, 500);
if (hit !== null) console.log(hit.body, hit.point, hit.distance);
```

Queries can filter by `layerMask` and choose whether to include sensors. Layer and mask values are bitfields. `popContacts()` drains the queued pair-oriented event records.

## Solver limits

This solver targets simple 2D arcade games. It currently supports axis-aligned box and circle shapes, basic friction/restitution, sensors, filters, and fixed-step integration. It does not provide joints, continuous collision detection, polygon shapes, or rotational body dynamics. GameObject rotation and scale do not change a body's collider geometry. Use the 3D [Physics API](../physics/) for the Jolt-backed 3D system.

For an example with bodies, atlas tiles, and Scene ownership, see the [2D physics and tilemaps guide](../../guides/physics2d-tilemap/).
