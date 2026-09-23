---
title: TypeScript API
description: Explore BornEngine's function-first modules for windows, drawing, assets, simulation, and platform input.
section: API
order: 30
---

The root import is the fastest way to prototype:

```ts
import { initWindow, runGame, clearBackground, drawRect, Colors } from '@bornengine/engine';
```

Subpath imports are available when you want a narrow dependency boundary, such as `@bornengine/engine/physics` or `@bornengine/engine/world`. The API uses plain interfaces and numeric handles rather than classes, so ownership and frame order remain visible in TypeScript.

## Module map

| Module | Import path | Focus |
| --- | --- | --- |
| Core | `@bornengine/engine/core` | Window, loop, input, timing, platform |
| Shapes | `@bornengine/engine/shapes` | 2D drawing and collisions |
| Textures | `@bornengine/engine/textures` | Images, textures, render targets |
| Text | `@bornengine/engine/text` | Fonts and text measurement |
| Audio | `@bornengine/engine/audio` | Sounds, music, buses, spatial audio |
| Models | `@bornengine/engine/models` | 3D models, materials, animation |
| Math | `@bornengine/engine/math` | Vectors, matrices, quaternions, intersections |
| Scene | `@bornengine/engine/scene` | Retained nodes, lights, picking |
| Physics | `@bornengine/engine/physics` | Jolt-backed bodies, queries, constraints |
| VFX | `@bornengine/engine/vfx` | Particles and decals |
| World | `@bornengine/engine/world` | Versioned world files and instantiation |
| Mobile | `@bornengine/engine/mobile` | Virtual joysticks and touch buttons |

Start with [core](core/) and the [game loop](../concepts/game-loop/) before reaching for a larger module.
