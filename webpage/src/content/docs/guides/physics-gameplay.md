---
title: Add physics gameplay
description: Pair the fixed physics accumulator with scene transforms, queries, and explicit resource ownership.
section: Guides
order: 72
---

BornEngine's physics `step()` already owns a fixed-rate accumulator. The gameplay layer should feed it one clamped frame delta, read the resulting transforms, and copy those transforms into render objects. This keeps gameplay stable when display refresh and physics rates differ.

## Setup

Create a world once, reuse collision shapes, and give every body an explicit motion type. A scene node is only the visual representation; it does not replace the physics body.

```ts
import { getDeltaTime, runGame } from '@bornengine/engine/core';
import { createSceneNode, setSceneNodeTrs } from '@bornengine/engine/scene';
import * as physics from '@bornengine/engine/physics';

const world = physics.createWorld({ maxBodies: 2048 });
physics.setFixedTimestep(world, 60, 4);
physics.setInterpolation(world, true);

const shape = physics.sphereShape(0.5);
const body = physics.createBody(world, shape, {
  motionType: physics.MotionType.DYNAMIC,
  position: { x: 0, y: 3, z: -4 },
  restitution: 0.2,
});
const visual = createSceneNode();

runGame(() => {
  const dt = Math.min(getDeltaTime(), 0.25);
  physics.step(world, dt);
  const p = physics.getBodyPosition(body);
  setSceneNodeTrs(visual, p.x, p.y, p.z, 0, 1);
});
```

Use `setLayerCollides()` for your layer matrix before spawning gameplay objects. Add sensors, CCD, forces, and impulses only where the mechanic needs them; keeping body configuration explicit makes a level easier to debug.

## Game loop

A normal frame has a clear order: read input, apply forces or kinematic targets, step physics once, drain contacts and queries, synchronize scene nodes, then render. Do not step physics from multiple systems.

```ts
function updateGameplay(dt: number, moveX: number) {
  physics.addForce(body, { x: moveX * 30, y: 0, z: 0 });
  physics.step(world, Math.min(dt, 0.25));

  const position = physics.getBodyPosition(body);
  setSceneNodeTrs(visual, position.x, position.y, position.z, 0, 1);

  for (const contact of physics.popContacts()) {
    if (contact.event === physics.ContactEvent.ADDED) {
      console.log('new contact', contact.bodyA, contact.bodyB);
    }
  }
  physics.clearContacts(world);
}
```

Use `raycast()` or `overlapSphere()` after the step for gameplay decisions. Use `moveKinematic()` for doors and platforms; direct teleports are better reserved for respawns and editor operations.

## Complete example

This compact scene has a static floor, a dynamic ball, a render node, and a cleanup path. Add a model or primitive draw in the render section to make the visual match the body.

```ts
import {
  beginDrawing, clearBackground, endDrawing, getDeltaTime,
  initWindow, runGame,
} from '@bornengine/engine/core';
import { createSceneNode, destroySceneNode, setSceneNodeTrs } from '@bornengine/engine/scene';
import * as physics from '@bornengine/engine/physics';

initWindow(960, 540, 'Physics Playground');
const world = physics.createWorld({ gravity: { x: 0, y: -9.81, z: 0 } });
const floorShape = physics.boxShape({ x: 12, y: 0.5, z: 12 });
const ballShape = physics.sphereShape(0.5);
const floor = physics.createBody(world, floorShape, {
  motionType: physics.MotionType.STATIC,
  position: { x: 0, y: -0.5, z: 0 },
  objectLayer: physics.Layer.NON_MOVING,
});
const ball = physics.createBody(world, ballShape, {
  motionType: physics.MotionType.DYNAMIC,
  position: { x: 0, y: 4, z: 0 },
  objectLayer: physics.Layer.MOVING,
});
const ballVisual = createSceneNode();

runGame(() => {
  physics.step(world, Math.min(getDeltaTime(), 0.25));
  const p = physics.getBodyPosition(ball);
  setSceneNodeTrs(ballVisual, p.x, p.y, p.z, 0, 1);

  beginDrawing();
  clearBackground({ r: 10, g: 14, b: 20, a: 255 });
  // Draw the floor and ball here, after syncing their scene transforms.
  endDrawing();
});

export function shutdown() {
  destroySceneNode(ballVisual);
  physics.destroyBody(ball);
  physics.destroyBody(floor);
  physics.releaseShape(ballShape);
  physics.releaseShape(floorShape);
  physics.destroyWorld(world);
}
```

## Next steps

- Add a `createCharacter()` controller for grounded movement and slopes.
- Use `popContacts()` for damage, pickup, and trigger events.
- Read the [physics API](../../api/physics/) for constraints, soft bodies, and vehicles.
- Profile body counts and broadphase setup before increasing world capacity.
