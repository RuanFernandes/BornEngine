---
title: Physics 2D
description: Simulate arcade and platform movement with fixed steps, static surfaces, and optional CCD.
section: API / Physics
order: 41
---

`PhysicsWorld2D` is a deterministic arcade solver for 2D games. Positions use `Vector2D`-compatible pixel coordinates and seconds; positive Y points down by default. Collider geometry stays axis-aligned and is not changed by a GameObject's rotation or scale.

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

`step(deltaTime)` accumulates elapsed time and runs up to `maxSubSteps` fixed updates (default: 5). Time beyond that frame budget is dropped and counted in `droppedTime`. Call the world once per game update, after choosing where gameplay movement belongs in the update order.

The world uses a deterministic uniform-grid broadphase for collision candidates and spatial queries. Contact records are ordered by body creation ID. `lastCandidatePairCount`, `lastNarrowphaseTestCount`, and `lastQueryCandidateCount` expose operation counts for profiling and repeatable fixtures.

## Bodies and supported shapes

`createBody(options)` returns a `PhysicsBody2D`, which can be attached to a `GameObject` like another `GameComponent`. Dynamic bodies respond to gravity and contacts; static bodies define immovable geometry; kinematic bodies move from the velocity supplied by gameplay without gravity.

Dynamic simulation supports axis-aligned `box` and `circle` shapes. Static bodies can also use a finite `segment` or a nondegenerate convex polygon described by `convex` vertices. Segments and convex polygons are static surfaces only; dynamic polygon pairs, joints, rotational body dynamics, and rotated/scaled collider geometry are outside this solver.

```ts
const ramp = physics.createBody({
  type: 'static',
  shape: { type: 'segment', start: { x: -80, y: 32 }, end: { x: 80, y: -32 } },
});
const rockFace = physics.createBody({
  type: 'static',
  shape: { type: 'convex', vertices: [
    { x: 0, y: 0 }, { x: 48, y: 0 }, { x: 36, y: 32 }, { x: 8, y: 28 },
  ] },
});
```

Bodies attached to active and enabled GameObjects synchronize their 2D position with the owner's world transform and preserve Z depth. That transform supplies the body's initial position and takes precedence over `options.position`. A standalone body uses `options.position` and simulates whenever its world steps without writing to a GameObject.

## One-way surfaces

Set `oneWay` on a static body to accept contact only from its permitted side. Supply an outward normal pointing toward the side that may land on or hit the surface. The normal is normalized by the body; `tolerance` is an optional nonnegative distance in world units and defaults to zero.

```ts
physics.createBody({
  type: 'static',
  shape: { type: 'segment', start: { x: -80, y: 0 }, end: { x: 80, y: 0 } },
  oneWay: { normal: { x: 0, y: -1 }, tolerance: 0.01 },
});
```

With positive Y downward, `{ x: 0, y: -1 }` permits a character above a horizontal platform to land on it. The solver checks the previous support position and approach direction. An object that starts on the blocked side, approaches from below, or uses a reversed normal passes through the surface.

## Character movement

`CharacterBody2D` is an axis-separated kinematic controller for a box. Call `moveAndSlide()` once from a fixed update; it sweeps horizontal motion then vertical motion, applies world layer/mask filters, ignores sensors, and records contact normals. BornEngine does not schedule a fixed-update loop automatically. To run `GameObject.fixedUpdate()` and `GameComponent.fixedUpdate()`, implement an accumulator in your `Game.loop()` and call `this.scenes.updateFixed(fixedDeltaTime)` for every fixed tick. Call `moveAndSlide()` from that fixed-update phase. `PhysicsWorld2D.step(deltaTime)` has its own accumulator for `PhysicsBody2D` simulation; it does not schedule scene fixed-update callbacks.

```ts
const character = new CharacterBody2D(physics, { width: 24, height: 32 });
player.addComponent(character);

character.moveAndSlide({ x: horizontalInput * 220, y: verticalSpeed }, physics.fixedTimeStep);
if (character.isOnFloor) verticalSpeed = 0;
```

Read the resolved `position`, `velocity`, `isOnFloor`, `isOnWall`, `isOnCeiling`, and `contactNormals`. Floor and ceiling classification uses a 45-degree normal threshold; steeper surfaces classify as walls. Results are detached `Vector2D` values. `moveAndSlide()` returns `false` when its component is detached, disabled, invalid, or its world is disposed. It supports box movement against the world's supported surfaces; it is not a full rigid-body character solver.

## Continuous collision detection

CCD is opt-in per dynamic box or circle with `ccd: true`. `ccdThreshold` sets the minimum travel distance in world units that starts a sweep and defaults to zero. Ordinary bodies continue to use discrete fixed-step contacts.

```ts
physics.createBody({
  type: 'dynamic',
  shape: { type: 'circle', radius: 4 },
  velocity: { x: 3600, y: 0 },
  gravityScale: 0,
  ccd: true,
  ccdThreshold: 4,
});
```

Sweeps choose the earliest eligible contact deterministically. A fixed step processes at most eight CCD impacts per body. `CharacterBody2D` resolves at most four slide contacts. At either cap, unresolved travel is discarded, velocity is zeroed, and the body stays at its last safe contact. Subdivide unusually dense/high-speed motion when the game needs more contacts in one interval.

## Collision events and queries

Bodies expose collision and trigger enter/stay/exit callbacks. Sensor contacts report overlap without resolving penetration. The world also offers `raycast`, `overlapPoint`, `overlapCircle`, `overlapBox`, and `popContacts()`.

```ts
body.onCollisionEnter = (contact) => {
  console.log(contact.other.gameObject?.name, contact.normal);
};

const hit = physics.raycast(new Vector2D(0, 40), new Vector2D(1, 0), 500);
if (hit !== null) console.log(hit.body, hit.point, hit.distance);
```

Queries can filter by `layerMask` and choose whether to include sensors. Ray hit points and normals, collision callback vectors, and queued contact vectors are detached `Vector2D` instances. Pair events are ordered by body creation IDs. Layer and mask values are bitfields; `popContacts()` drains queued pair-oriented event records.

For a complete scene with slopes, a one-way bridge, CCD projectile, and tilemap platforms, see the [2D platformer example](https://github.com/RuanFernandes/BornEngine/tree/main/examples/2d-platformer). See the [physics and tilemaps guide](../../guides/physics2d-tilemap/) for map collision setup and update order.
