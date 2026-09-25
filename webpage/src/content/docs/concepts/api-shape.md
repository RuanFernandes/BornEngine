---
title: API shape
description: Learn how BornEngine combines a direct function API with an optional class-based gameplay runtime.
section: Concepts
order: 11
---

BornEngine's native-facing modules use free functions, plain data, and explicit resource handles. This keeps the renderer and other engine boundaries easy to call from Perry-compiled TypeScript. The engine also provides an optional class-based runtime for gameplay objects; use either style, or combine them.

```ts
import { loadTexture, drawTexture, unloadTexture, Colors } from '@bornengine/engine';

const player = loadTexture('assets/player.png');
drawTexture(player, 100, 200, Colors.WHITE);
unloadTexture(player);
```

There is no `new Texture()` or `player.draw()` requirement in the native-facing API. Resource values carry handles and dimensions; functions cross the Perry/native boundary directly. That keeps resource ownership explicit and the native API small.

For gameplay, import `GameObject`, `GameComponent`, and `GameScene` from `@bornengine/engine/game`. Extend `GameObject` for game-specific entities, then use components and scene lifecycle callbacks to organize behavior. The runtime stays in TypeScript and adapts existing renderer, physics, and audio handles.

```ts
import { GameObject, GameScene } from '@bornengine/engine/game';

class Player extends GameObject {
  constructor() {
    super({ name: 'Player' });
  }

  update(dt: number): void {
    this.transform.position.x += dt * 5;
  }
}

const scene = new GameScene();
scene.add(new Player());
```

## Tradeoffs

You still unload engine resources explicitly. The optional gameplay runtime supplies a base class, component model, transform hierarchy, and lifecycle callbacks where those features are useful. It does not replace direct functions for resource creation and rendering, or choose subclasses when loading a serialized world.

## Module map

The root package re-exports common functions. Subpath imports keep larger projects explicit:

- `@bornengine/engine/core` — windows, input, timing, and types.
- `@bornengine/engine/shapes` — 2D drawing and collision helpers.
- `@bornengine/engine/models` — models, materials, lighting, and animation.
- `@bornengine/engine/physics` — Jolt-backed bodies, shapes, queries, and constraints.
- `@bornengine/engine/world` — versioned world files and instantiation.
- `@bornengine/engine/game` — runtime gameplay objects, components, scenes, and native-handle adapters.

See the [Game API guide](../../api/game/) for object lifecycle, component behavior, transforms, and physics synchronization.
