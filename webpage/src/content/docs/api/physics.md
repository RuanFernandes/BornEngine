---
title: Physics
description: Simulate owned colliders and bodies in a fixed-step Jolt physics world.
section: API / Physics
order: 40
---

Physics uses meters, seconds, and kilograms in a right-handed, Y-up world. Each PhysicsWorld owns its colliders, bodies, joints, characters, and vehicles.

## World stepping

```ts
import { Game, PhysicsWorld } from '@bornengine/engine';
const game = new Game();
const world = new PhysicsWorld(game, { gravity: { x: 0, y: -9.81, z: 0 } });
world.setFixedTimestep(60, 4);
world.setInterpolation(true);

game.run({
  update(deltaTime) { world.step(Math.min(deltaTime, 0.25)); },
  render() {},
  onStop: () => game.dispose(),
});
```

`step()` advances its fixed-rate accumulator and returns interpolation alpha. When created with a Game that owns scenes, it synchronizes attached physics adapters before and after the step.

## Shapes and bodies

Construct a collider with its world, then ask that world to create a body. Shapes can be shared by bodies in the same world.

```ts
import { BoxCollider, MotionType, SphereCollider } from '@bornengine/engine';
const floorShape = new BoxCollider(world, { x: 20, y: 0.25, z: 20 });
const floor = world.createBody(floorShape, {
  motionType: MotionType.STATIC,
  position: { x: 0, y: -0.25, z: 0 },
});
const sphereShape = new SphereCollider(world, 0.5);
const ball = world.createBody(sphereShape, {
  motionType: MotionType.DYNAMIC,
  position: { x: 0, y: 4, z: 0 },
});
ball.addImpulse({ x: 0, y: 3, z: 0 });
```

Other collider classes include capsule, cylinder, convex hull, mesh, heightfield, compound, scaled, and offset colliders.

## Queries and constraints

Ray and overlap queries return body instances. Use `popContacts()` to drain contact events after stepping, and `createJoint()` to connect compatible bodies.

```ts
const hit = world.raycast({ x: 0, y: 6, z: 0 }, { x: 0, y: -1, z: 0 }, 10);
if (hit !== null) console.log(hit.body, hit.point, hit.normal);
for (const contact of world.popContacts()) console.log(contact.event, contact.bodyA, contact.bodyB);
world.clearContacts();
```

`raycastAll`, `overlapSphere`, `overlapPoint`, and `overlapBox` provide bounded alternatives. `stepVariable()` is available for applications that manage their own accumulator.

## Characters

Create slope-aware character controllers from a collider in the same world. Update the controller once per simulation frame and inspect its grounding state and velocity.

```ts
const capsule = new CapsuleCollider(world, 0.5, 0.35);
const character = world.createCharacter(capsule, { position: { x: 0, y: 2, z: 0 } });
character.update(deltaTime);
if (character.isGrounded) character.setLinearVelocity({ x: moveX, y: 0, z: 0 });
```
