---
title: Physics guide
description: Build a stable Jolt simulation with reusable shapes, fixed stepping, and explicit rendering sync.
section: Guides
order: 60
---

Create one world, reuse shapes, create bodies with an explicit motion type, optimize the broadphase after initial setup, and step it from the game loop:

```ts
import * as physics from '@bornengine/engine/physics';

const world = physics.createWorld({ gravity: { x: 0, y: -9.81, z: 0 } });
const groundShape = physics.boxShape({ x: 50, y: 0.5, z: 50 });
const ground = physics.createBody(world, groundShape, {
  motionType: physics.MotionType.STATIC,
  position: { x: 0, y: -0.5, z: 0 },
  objectLayer: physics.Layer.NON_MOVING,
});

physics.optimizeBroadphase(world);
physics.step(world, dt);
```

`step()` uses a fixed internal timestep with an accumulator and returns interpolation alpha. Use `setInterpolation(world, true)` for smoothed body transforms or manually blend with `getStepAlpha()`. `stepVariable()` exists when your game owns the accumulator.

## Larger systems

Characters use `createCharacter` and `updateCharacter`; soft bodies use vertex positions and inverse masses; vehicles expose chassis and wheel transforms. Native and Web/WASM share the TypeScript surface, but capability gaps are documented in the API source and should be tested on the target you ship.
