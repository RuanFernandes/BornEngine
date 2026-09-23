---
title: API shape
description: Learn why BornEngine uses free functions and plain-data interfaces instead of a class hierarchy.
section: Concepts
order: 11
---

BornEngine's public TypeScript API is a flat collection of functions operating on plain data. The design is inspired by raylib's approachable surface, but BornEngine is an independent implementation: Perry compiles TypeScript to native code and the engine renders through wgpu.

```ts
import { loadTexture, drawTexture, unloadTexture, Colors } from '@bornengine/engine';

const player = loadTexture('assets/player.png');
drawTexture(player, 100, 200, Colors.WHITE);
unloadTexture(player);
```

There is no `new Texture()` or `player.draw()` requirement. Resource values carry handles and dimensions; functions cross the Perry/native boundary directly. That keeps the API small, makes ownership explicit, and avoids a hidden receiver or lifecycle hierarchy.

## Tradeoffs

You unload engine resources explicitly. You also choose your own dispatch strategy for game entities instead of inheriting from a base class. The trade is deliberate: a small surface, portable FFI calls, and data that is easy to inspect.

## Module map

The root package re-exports common functions. Subpath imports keep larger projects explicit:

- `@bornengine/engine/core` — windows, input, timing, and types.
- `@bornengine/engine/shapes` — 2D drawing and collision helpers.
- `@bornengine/engine/models` — models, materials, lighting, and animation.
- `@bornengine/engine/physics` — Jolt-backed bodies, shapes, queries, and constraints.
- `@bornengine/engine/world` — versioned world files and instantiation.

The repository keeps the longer rationale in its API design notes; this page focuses on the decisions you feel in game code.
