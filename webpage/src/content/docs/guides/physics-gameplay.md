---
title: Add physics gameplay
description: Step an owned physics world and synchronize bodies with gameplay objects.
section: Guides
order: 72
---

Physics uses a fixed-step accumulator. Feed it one clamped frame delta and keep body ownership tied to its PhysicsWorld.

## Setup

Create the world once, reuse collider instances, and choose a motion type for each body.

```ts
import { BoxCollider, Game, MotionType, PhysicsWorld, SphereCollider } from '@bornengine/engine';

const game = new Game({ window: { title: 'Physics sample' } });
const world = new PhysicsWorld(game, { gravity: { x: 0, y: -9.81, z: 0 } });
world.setFixedTimestep(60, 4);
world.setInterpolation(true);

const floorShape = new BoxCollider(world, { x: 20, y: 0.25, z: 20 });
const floor = world.createBody(floorShape, {
  motionType: MotionType.STATIC, position: { x: 0, y: -0.25, z: 0 },
});
const ballShape = new SphereCollider(world, 0.5);
const ball = world.createBody(ballShape, {
  motionType: MotionType.DYNAMIC, position: { x: 0, y: 3, z: -4 }, restitution: 0.2,
});
```

## Game loop

Read input and apply forces before stepping. Query body properties and contacts after the step.

```ts
game.run({
  update(deltaTime) {
    if (moveX !== 0) ball.addForce({ x: moveX * 30, y: 0, z: 0 });
    world.step(Math.min(deltaTime, 0.25));
    const position = ball.position;
    if (position !== null) console.log('ball position', position);
    for (const contact of world.popContacts()) {
      if (contact.bodyA === ball || contact.bodyB === ball) console.log('ball contact', contact.event);
    }
  },
  render() { game.renderer.clear(Colors.BLACK); },
  onStop: () => game.dispose(),
});
```

Static and kinematic bodies synchronize from gameplay transforms before the step; dynamic bodies synchronize back after it when using `game.scenes` with physics adapters.

## Complete example

```ts
import { BoxCollider, Colors, Game, MotionType, PhysicsWorld, SphereCollider } from '@bornengine/engine';

const game = new Game({ window: { title: 'Physics sample' } });
const world = new PhysicsWorld(game);
const floorShape = new BoxCollider(world, { x: 20, y: 0.25, z: 20 });
world.createBody(floorShape, { motionType: MotionType.STATIC, position: { x: 0, y: -0.25, z: 0 } });
const ballShape = new SphereCollider(world, 0.5);
const ball = world.createBody(ballShape, { motionType: MotionType.DYNAMIC, position: { x: 0, y: 3, z: 0 } });

game.run({
  update(deltaTime) { world.step(Math.min(deltaTime, 0.25)); },
  render() {
    game.renderer.clear(Colors.BLACK);
    game.renderer.drawText('Bodies: ' + world.bodyCount, { x: 24, y: 24 }, 20, Colors.WHITE);
  },
  onStop: () => game.dispose(),
});
```

## Next steps

Add collision layers, sensors, CCD, and ray queries only where gameplay needs them. See the [Physics API](../../api/physics/) and [game object components](../../api/game/).
