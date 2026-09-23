---
title: Math
description: Use vectors, matrices, quaternions, easing, and intersection helpers with plain data.
section: API / Math
order: 37
---

Import from `@bornengine/engine/math`:

```ts
import { vec3, vec3Add, vec3Normalize, mat4LookAt, clamp } from '@bornengine/engine/math';

const forward = vec3Normalize(vec3(0, 0, -1));
const target = vec3Add(vec3(2, 1, 4), forward);
const height = clamp(playerY, 0, 10);
```

The module includes `vec2`/`vec3`/`vec4` construction and arithmetic, `lerp`, `clamp`, `remap`, random helpers, easing functions, matrix composition, perspective/orthographic projections, look-at matrices, quaternions, frustum extraction, and ray intersection helpers.

Math values are plain interfaces or number arrays. That keeps them easy to serialize into a world file or pass to scene and physics code without wrapper objects.
