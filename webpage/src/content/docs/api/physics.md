---
title: Physics
description: Use the Jolt-backed physics API for bodies, shapes, queries, constraints, characters, soft bodies, and vehicles.
section: API / Physics
order: 39
---

Import from `@bornengine/engine/physics`:

```ts
import * as physics from '@bornengine/engine/physics';

const world = physics.createWorld({ gravity: { x: 0, y: -9.81, z: 0 } });
const shape = physics.sphereShape(0.5);
const ball = physics.createBody(world, shape, {
  motionType: physics.MotionType.DYNAMIC,
  position: { x: 0, y: 4, z: 0 },
});

physics.step(world, dt);
const position = physics.getBodyPosition(ball);
```

Shapes are reusable geometry; bodies hold motion state and reference a shape. The coordinate system is right-handed, Y-up, and uses meters, seconds, and kilograms. Rotations are quaternions and angular velocities are radians per second.

The API includes box, sphere, capsule, cylinder, convex hull, mesh, heightfield, scaled, offset-COM, and compound shapes; dynamic, kinematic, and static bodies; forces and impulses; raycasts and overlaps; fixed, point, hinge, slider, and distance constraints; and polled contact events.

Higher-level helpers include `createCharacter`/`updateCharacter`, soft bodies, and four-wheel vehicles. Physics is backed by Jolt on native and JoltPhysics.js on Web/WASM. The [physics guide](../../guides/physics/) covers stepping and the larger systems.
