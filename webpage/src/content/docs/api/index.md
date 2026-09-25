---
title: TypeScript API
description: Explore BornEngine's direct TypeScript modules and optional class-based GameObject runtime.
section: API
order: 30
---

BornEngine pairs a direct function-and-handle API with an optional class-based runtime for gameplay objects. Use the engine modules for explicit control of windows, drawing, assets, and simulation; use `GameObject`, components, transforms, and scenes when that model fits your game.

## Choose an import boundary

Use the root package while prototyping or when a game touches several subsystems:

```ts
import { clearBackground, drawRect, initWindow, runGame, Colors } from '@bornengine/engine';

initWindow(1280, 720, 'Field test');
runGame(() => {
  clearBackground(Colors.SKYBLUE);
  drawRect(40, 40, 120, 80, Colors.WHITE);
});
```

Use a subpath when a package, editor tool, or game feature should make its dependency boundary obvious:

```ts
import { beginDrawing, endDrawing, windowShouldClose } from '@bornengine/engine/core';
import { drawCircle } from '@bornengine/engine/shapes';
import { loadTexture, unloadTexture } from '@bornengine/engine/textures';

// Subpaths expose the same engine surface without importing unrelated modules.
```

Public examples in this reference import from `@bornengine/engine`, either from the package root or a module subpath. Older repository experiments may use the historical `bloom` name; do not copy that import into a new project.

## Module map

| Module | Import path | Use it for |
| --- | --- | --- |
| Game | `@bornengine/engine/game` | Subclassable gameplay objects, components, transforms, scenes, and adapters |
| Core | `@bornengine/engine/core` | Windows, frame timing, input, cameras, files, profiling |
| Shapes | `@bornengine/engine/shapes` | Immediate 2D primitives and collision helpers |
| Textures | `@bornengine/engine/textures` | Images, sprites, filtering, render targets |
| Text | `@bornengine/engine/text` | Fonts, text drawing, measurement |
| Audio | `@bornengine/engine/audio` | Sounds, music, buses, spatial playback |
| Models | `@bornengine/engine/models` | Models, materials, animation, instancing |
| Math | `@bornengine/engine/math` | Vectors, matrices, quaternions, intersections |
| Scene | `@bornengine/engine/scene` | Retained nodes, geometry, lights, picking |
| Physics | `@bornengine/engine/physics` | Worlds, bodies, queries, constraints |
| VFX | `@bornengine/engine/vfx` | Particles and decals |
| World | `@bornengine/engine/world` | Versioned world data and prefab instantiation |
| Mobile | `@bornengine/engine/mobile` | Virtual joysticks, buttons, touch claims |

## How the API fits together

The usual dependency direction is:

1. Core owns the window and the frame boundary.
2. Math provides values shared by scene, physics, models, and gameplay code.
3. Assets are loaded through textures, text, audio, and models.
4. Shapes or the scene graph submit visuals inside the active drawing mode.
5. Physics and VFX update before rendering, then their handles are released during teardown.

The Game module is an optional gameplay layer over those engine modules. Extend `GameObject` for entities such as players or NPCs, attach `GameComponent` subclasses for reusable behavior, and use adapters to connect existing renderer, physics, and audio resources. The native modules remain available directly, and the Game module does not replace the renderer scene graph or serialized `WorldData` format.

Resources are not garbage-collected engine objects. A `Texture`, `Font`, `Sound`, `Music`, `Model`, render texture, physics world, or scene node that owns native state must be unloaded or destroyed using its module's cleanup function. Keep asset paths relative to the project and place them under `assets/` so native and Web/WASM packaging resolve the same files.

## Coordinate and color conventions

- 2D positions use pixels in the current render surface; the origin is the top-left in the default 2D mode.
- `Color` is `{ r, g, b, a }` with channels from `0` to `255`.
- Angles passed to the 2D camera are degrees; math rotation helpers use radians because they call JavaScript trigonometry.
- 3D values use right-handed `Vec3` data and explicit `Camera3D` records.
- Handles are numbers wrapped in small interfaces. Do not pass a `Texture` where a raw image or render-texture handle is expected.

## Where to go next

- Start with [Core](core/) for the frame and input contract.
- Read the [Game API](game/) to build class-based gameplay objects and scenes.
- Read [Textures](textures/) and [Text](text/) before building a HUD.
- Combine the modules in the [2D game recipe](../guides/2d-game/) or [3D scene recipe](../guides/3d-scene/).
