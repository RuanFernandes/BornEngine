---
title: Physics guide
description: Build a stable Jolt simulation with reusable shapes, fixed stepping, and explicit rendering sync.
section: Guides
order: 60
---

Create one game-owned world, reuse colliders, create bodies with an explicit motion type, optimize the broadphase after initial setup, and step it from the game loop:

```ts
import { BoxCollider, Game, MotionType, PhysicsWorld } from '@bornengine/engine';

const game = new Game();
const world = new PhysicsWorld(game, { gravity: { x: 0, y: -9.81, z: 0 } });
const groundShape = new BoxCollider(world, { x: 50, y: 0.5, z: 50 });
const ground = world.createBody(groundShape, {
  motionType: MotionType.STATIC,
  position: { x: 0, y: -0.5, z: 0 },
});

world.optimizeBroadphase();
game.run({
  update(deltaTime) { world.step(deltaTime); },
  render() {},
  onStop: () => game.dispose(),
});
```

`PhysicsWorld.step()` uses a fixed internal timestep with an accumulator and returns interpolation alpha. Use `world.setInterpolation(true)` for smoothed body transforms or read `world.stepAlpha` to blend your own values. `stepVariable()` exists when your game owns the accumulator.

## Larger systems

Characters use `world.createCharacter()` and their controller instance, soft bodies use `world.createSoftBody()` with vertex positions and inverse masses, and vehicles expose chassis and wheel transforms through `world.createVehicle()`. Native and Web/WASM share the class surface; check target-specific limitations before relying on a feature.
