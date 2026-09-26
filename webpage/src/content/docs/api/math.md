---
title: Math
description: Use value classes for vectors, rotations, matrices, easing, and collision queries.
section: API / Math
order: 39
---

Math objects carry values only. They have no Game owner or native resource lifetime, so create and reuse them freely.

## Vectors

```ts
import { Vec2, Vec3 } from '@bornengine/engine';
const start = new Vec3(0, 1, 0);
const velocity = new Vec3(4, 0, -2);
const next = start.add(velocity.scale(0.016));
const direction = next.normalized();
const screen = new Vec2(640, 360);
```

Vector methods return new values for arithmetic operations. Use plain structural `{ x, y, z }` values when that better fits serialization or an API boundary.

## Transforms

`Quat` represents rotation, while `Matrix4` provides composition and view/projection helpers. Angles in user-facing APIs are degrees unless a specific method states otherwise.

```ts
import { Matrix4, Quat, Vec3 } from '@bornengine/engine';
const rotation = Quat.fromEuler(0, 45, 0);
const modelMatrix = rotation.toMatrix().translated(new Vec3(2, 0, -4));
const view = Matrix4.lookAt(new Vec3(0, 2, 5), new Vec3(0, 0, 0), new Vec3(0, 1, 0));
const combined = view.multiply(modelMatrix);
const anotherCombination = Matrix4.multiplyMatrices(view, modelMatrix);
```

Use `matrix.multiply(other)` when composing from an existing matrix, or `Matrix4.multiplyMatrices(a, b)` when calling the operation without a receiver.

## Intersections

Collision helpers are static because they operate on values rather than owned runtime state.

```ts
import { Collision } from '@bornengine/engine';
const hit = Collision.checkSpheres({ x: 0, y: 0, z: 0 }, 1, { x: 1, y: 0, z: 0 }, 1);
const visible = Collision.isBoxInFrustum(bounds, frustumPlanes);
```

`Collision` includes 2D rectangles/circles, rays, triangles, bounds, and frustum checks. See the shapes and physics pages for renderer or simulation-owned collision objects.
