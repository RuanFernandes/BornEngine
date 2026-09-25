---
title: Math
description: Use vectors, matrices, quaternions, easing, and intersection helpers with plain data.
section: API / Math
order: 38
---

Math values are plain objects or number arrays. They can move between gameplay, scene, physics, and world serialization without wrapper classes.

## Vectors

Use the constructors when you want the shape to be obvious, then compose values with the module's pure helpers. Normalization returns a zero vector for a zero-length input.

```ts
import {
  vec2, vec2Add, vec2Normalize,
  vec3, vec3Add, vec3Cross, vec3Dot, vec3Normalize,
} from '@bornengine/engine/math';

const input = vec2(1, -0.25);
const direction2D = vec2Normalize(input);
const player = vec3(2, 1, 4);
const forward = vec3Normalize(vec3(0, 0, -1));
const target = vec3Add(player, forward);
const right = vec3Cross(forward, vec3(0, 1, 0));
const alignment = vec3Dot(forward, right);
const nextInput = vec2Add(direction2D, vec2(0.1, 0));
console.log({ target, right, alignment, nextInput });
```

| Family | Constructors and common operations |
| --- | --- |
| `Vec2` | `vec2`, `vec2Add`, `vec2Sub`, `vec2Scale`, `vec2Length`, `vec2Normalize`, `vec2Dot`, `vec2Distance`, `vec2Lerp` |
| `Vec3` | `vec3`, `vec3Add`, `vec3Sub`, `vec3Scale`, `vec3Length`, `vec3Normalize`, `vec3Dot`, `vec3Cross`, `vec3Distance`, `vec3Lerp` |
| `Vec4` | `vec4`, `vec4Add`, `vec4Scale`, `vec4Length`, `vec4Normalize` |
| Scalars | `lerp`, `clamp`, `remap`, `randomFloat`, `randomInt`, easing functions |

`vec3Cross(a, b)` produces a vector perpendicular to both inputs. Use `vec3Dot` for alignment and projection tests, and keep the result of `vec3Normalize` when it will be reused for movement or lighting.

## Transforms

Matrices are column-major `number[]` values with 16 entries. The transform helpers return new matrices, so compose them in a named order and pass the final matrix to a model or scene node.

```ts
import {
  mat4Identity, mat4LookAt, mat4Multiply,
  mat4Perspective, mat4RotateY, mat4Scale, mat4Translate,
  vec3,
} from '@bornengine/engine/math';

const model = mat4Identity();
const world = mat4Translate(model, vec3(0, 0, -4));
const rotated = mat4RotateY(world, Math.PI * 0.25);
const scaled = mat4Scale(rotated, vec3(1.5, 1.5, 1.5));
const view = mat4LookAt(vec3(0, 2, 6), vec3(0, 1, 0), vec3(0, 1, 0));
const projection = mat4Perspective(Math.PI / 3, 16 / 9, 0.1, 1000);
const viewProjection = mat4Multiply(projection, view);
console.log({ scaled, viewProjection });
```

`mat4RotateX/Y/Z` take radians. `mat4Perspective` takes field-of-view radians, aspect ratio, near, and far. Use `mat4Ortho` for UI-like 3D layouts and `mat4Invert` when converting from screen or camera space.

Quaternions are useful for interpolation without Euler gimbal issues:

```ts
import { quatFromEuler, quatSlerp, quatToMat4 } from '@bornengine/engine/math';

const start = quatFromEuler(0, 0, 0);
const end = quatFromEuler(0, Math.PI, 0);
const rotation = quatToMat4(quatSlerp(start, end, 0.35));
```

## Intersections

Create rays in world space and test them against boxes, spheres, triangles, or model mesh data. Boolean helpers are cheaper when you only need visibility; `RayHit` helpers include distance, point, and normal.

```ts
import {
  rayIntersectsBox, rayIntersectsSphere,
  rayIntersectsTriangle, vec3,
} from '@bornengine/engine/math';

const ray = {
  position: vec3(0, 2, 6),
  direction: vec3(0, 0, -1),
};
const bounds = { min: vec3(-1, 0, -5), max: vec3(1, 2, -3) };
const hitBox = rayIntersectsBox(ray, bounds);
const hitSphere = rayIntersectsSphere(ray, vec3(0, 1, -4), 1);
const hitTriangle = rayIntersectsTriangle(
  ray,
  vec3(-1, 0, -4),
  vec3(1, 0, -4),
  vec3(0, 2, -4),
);

if (hitTriangle.hit) console.log(hitTriangle.distance, hitTriangle.point, hitTriangle.normal);
```

| Function | Result |
| --- | --- |
| `rayIntersectsBox` | Boolean ray/AABB test. |
| `rayIntersectsSphere` | Boolean ray/sphere discriminant test. |
| `rayIntersectsTriangle` | `RayHit` from the Möller–Trumbore test. |
| `getRayCollisionBox` | `RayHit` with the first box face. |
| `getRayCollisionMesh` | `RayHit` against stored model mesh data. |
| `checkCollisionSpheres` / `checkCollisionBoxes` | Plain boolean volume tests. |
| `extractFrustumPlanes` / `isBoxInFrustum` | Build culling planes and test a `BoundingBox`. |

Use normalized directions when distances should be expressed in world units. A zero direction is not a useful ray and should be rejected by the caller before intersection tests.
