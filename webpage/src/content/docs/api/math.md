---
title: Math
description: Use value classes for vectors, rotations, matrices, easing, and collision queries.
section: API
order: 39
---

The math module holds small value types: `Vector2D`, `Vec3`, `Vec4`, `Quat`, and `Matrix4`. It also holds two static helper classes, `Mathf` for scalar math and `Collision` for overlap tests. A **value type** only stores numbers. It has no `Game` owner and no native resource, so you can create and discard these objects freely, with or without a running game.

Import them from `@bornengine/engine`, or from `@bornengine/engine/math`.

## Vectors

`Vector2D` is the class for 2D positions, directions, and sizes. `Vec3` and `Vec4` are the 3D and 4D versions.

```ts
import { Vec3, Vector2D } from '@bornengine/engine';
import type { Vector2DLike } from '@bornengine/engine';

const position = new Vector2D(100, 80);
const target = new Vector2D(160, 120);

const step = Vector2D.moveTowards(position, target, 12);
const direction = target.subtract(position).normalized;
const distance = position.distanceTo(target);
const inside = Vector2D.clamp(step, Vector2D.zero(), new Vector2D(800, 450));
const saved: Vector2DLike = { x: inside.x, y: inside.y };

const velocity = new Vec3(4, 0, -2);
const nextPosition = new Vec3(0, 1, 0).add(velocity.scale(0.016));
const heading = nextPosition.normalized();

console.log(direction, distance, saved, heading);
```

How these classes behave:

- `Vector2D` has public, mutable `x` and `y` fields. `set(x, y)` and `copy(other)` change the vector and return it. Every other operation returns a new vector, so `a.add(b)` leaves `a` unchanged.
- Engine methods that take a 2D point accept `Vector2DLike`, which is any object with `x` and `y`. You can pass a `Vector2D` or an object literal such as `{ x: 10, y: 20 }`.
- `Vector2D` offers instance methods such as `add`, `subtract`, `multiply`, `divide`, `scale`, `distanceTo`, `rotatedBy`, `clamped`, `clampedMagnitude`, and `equalsApprox`. It also offers static helpers such as `dot`, `cross`, `distance`, `lerp`, `moveTowards`, `reflect`, `project`, `perpendicular`, `angle`, and `signedAngle`.
- `normalized` is a property on `Vector2D` but a method on `Vec3` and `Vec4`. A vector with length zero normalizes to a zero vector.
- `Vector2D.lerp` clamps its amount to the range 0 to 1. Use `Vector2D.lerpUnclamped` to extrapolate. `Vec3.lerp` does not clamp.
- `Vector2D.moveTowards(current, target, maxDistanceDelta)` moves at most `maxDistanceDelta` and never overshoots the target.
- `divide` treats a zero divisor component as zero instead of producing `Infinity`.
- `Vec3` has `add`, `subtract`, `scale`, `dot`, `cross`, `distanceTo`, `lerp`, `length`, and `lengthSquared`. `Vec4` has `add`, `scale`, `length`, and `normalized()`.

### Angles and directions

Angle units differ between methods, so check each one:

- `Vector2D.angle` and `Vector2D.signedAngle` return degrees.
- `Vector2D.rotate` and `rotatedBy` take radians.
- `Quat.fromEuler`, `Matrix4.rotatedX`, `rotatedY`, `rotatedZ`, and `Matrix4.perspective` take radians.
- `Camera2D.rotation`, the perspective `Camera3D.fovy`, and the `rotation` arguments of `drawPolygon` and `Texture.drawRegion` are in degrees.

In 2D drawing, y grows downward. `Vector2D.up()` is the vector `(0, 1)`, so on screen it points down. Use `new Vector2D(0, -1)` for a direction that points up the screen.

## Transforms

`Quat` stores a rotation. `Matrix4` stores a full transform and offers composition, view, and projection helpers. A `Matrix4` holds 16 numbers in column-major order, which means the numbers are stored one column after another. `toArray()` returns a copy, and the constructor accepts an array of exactly 16 numbers.

```ts
import { Collision, Matrix4, Quat, Vec3 } from '@bornengine/engine';
import type { BoundingBox } from '@bornengine/engine';

const spin = Quat.slerp(Quat.identity(), Quat.fromEuler(0, 0, Math.PI / 2), 0.5);

const model = Matrix4.identity()
  .translated(new Vec3(2, 0, -4))
  .rotatedY(Math.PI / 4)
  .multiply(spin.toMatrix());
const view = Matrix4.lookAt(new Vec3(0, 2, 5), new Vec3(0, 0, 0), new Vec3(0, 1, 0));
const projection = Matrix4.perspective(Math.PI / 3, 16 / 9, 0.1, 100);
const viewProjection = projection.multiply(view);
const modelViewProjection = viewProjection.multiply(model);

const frustum = Collision.extractFrustumPlanes(viewProjection.toArray());
const crate: BoundingBox = { min: { x: -1, y: -1, z: -1 }, max: { x: 1, y: 1, z: 1 } };
console.log(Collision.isBoxInFrustum(crate, frustum), modelViewProjection.toArray().length);
```

How the matrix methods compose:

- `translated`, `scaled`, `rotatedX`, `rotatedY`, and `rotatedZ` multiply the matrix by a new transform on the right and return a new matrix. In the example, the object is moved to `(2, 0, -4)` and then turned in place around its own origin.
- `a.multiply(b)` computes `a × b`, so `b` is applied to a point first. `Matrix4.multiplyMatrices(a, b)` does the same without a receiver, and accepts plain 16-number arrays.
- `view`, `projection`, and `model` are three separate steps. Multiply them as `projection × view × model` to get a combined matrix.
- `Matrix4.lookAt(eye, center, up)` builds a view matrix. `Matrix4.orthographic(left, right, bottom, top, near, far)` builds an orthographic projection.
- `inverted()` returns the identity matrix when the matrix cannot be inverted (its determinant is close to zero). It does not throw.
- `Collision.extractFrustumPlanes` takes a combined projection and view matrix as a 16-number array. `Collision.isBoxInFrustum` then tells you whether a bounding box is at least partly inside the view volume.

`Quat` has `identity()`, `fromEuler(pitch, yaw, roll)`, `slerp(a, b, amount)`, `normalized()`, `multiply(other)`, and `toMatrix()`. A new `Quat` is the identity rotation. `fromEuler` takes its three angles in the order pitch, yaw, roll. In the current implementation, roll turns about the X axis, pitch about the Y axis, and yaw about the Z axis. Test the rotation you need before relying on a particular axis.

## Intersections

`Collision` is a class of static functions that test shapes against each other. The functions only read their arguments, so they need no `Game`.

```ts
import { Collision } from '@bornengine/engine';
import type { BoundingBox, Ray } from '@bornengine/engine';

const crate: BoundingBox = { min: { x: -1, y: 0, z: -1 }, max: { x: 1, y: 2, z: 1 } };
const shot: Ray = { position: { x: 0, y: 1, z: 10 }, direction: { x: 0, y: 0, z: -1 } };

const touching = Collision.checkSpheres({ x: 0, y: 0, z: 0 }, 1, { x: 1.5, y: 0, z: 0 }, 1);
const hit = Collision.getRayCollisionBox(shot, crate);
if (touching && hit.hit) {
  console.log(`Ray hit the crate at distance ${hit.distance}`, hit.point, hit.normal);
}
```

What the 3D functions return:

- `checkSpheres` and `checkBoxes` return a boolean. Spheres that touch exactly count as colliding.
- `getRayCollisionBox(ray, box)` returns a `RayHit` with `hit`, `distance`, `point`, and `normal`. It reports no hit when the box is behind the ray or when the ray starts inside the box.
- `rayIntersectsTriangle(ray, a, b, c)` also returns a `RayHit`. It only counts hits in front of the ray origin.
- `rayIntersectsBox` and `rayIntersectsSphere` return a boolean for the whole line through the ray. They also report `true` for a shape that is behind the ray origin. When direction matters, use `getRayCollisionBox` or `rayIntersectsTriangle`.

`Collision` also holds the 2D rectangle, circle, and point tests. [Shapes](../shapes/) describes them, including how touching edges are treated.

## Scalars and easing

`Mathf` has scalar helpers: `lerp`, `clamp`, `remap`, `randomFloat`, and `randomInt`. `randomInt(min, max)` includes both ends. `lerp` and `remap` do not clamp their result, so use `clamp` when you need a limit.

The easing functions take a progress value from 0 to 1 and return the eased progress: `easeInQuad`, `easeOutQuad`, `easeInOutQuad`, `easeInCubic`, `easeOutCubic`, `easeInOutCubic`, `easeInElastic`, `easeOutElastic`, and `easeBounce`. The elastic functions overshoot the range 0 to 1 while they run.

```ts
import { Mathf } from '@bornengine/engine';

function fadeAlpha(elapsed: number, duration: number): number {
  const progress = Mathf.clamp(elapsed / duration, 0, 1);
  return Math.round(Mathf.lerp(0, 255, Mathf.easeOutCubic(progress)));
}

console.log(fadeAlpha(0.3, 1.2), Mathf.randomInt(1, 6));
```

A known defect in Perry, the compiler that turns your TypeScript into a native program, can make `Mathf.easeInOutQuad` return a constant value in native builds. Use `Mathf.easeInOutCubic` instead until it is fixed.

## Next steps

- [Shapes](../shapes/) covers 2D drawing and the 2D collision tests.
- [2D camera and viewport](../camera2d/) uses `Vector2D` for camera targets and offsets.
- [Game objects](../game/) shows `Transform`, which stores position, rotation, and scale for each object.
- [Physics 2D](../physics2d/) simulates bodies that move and collide for you.
