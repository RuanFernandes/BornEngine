---
title: TypeScript API
description: Overview of the BornEngine TypeScript API, with the ownership rules, import paths, and a link to every module.
section: API
order: 30
---

The BornEngine API is a set of TypeScript classes. Every program starts with one `Game`. The `Game` opens the window and gives you services as properties: `game.renderer` draws, `game.input` reads devices, `game.audio` plays sound, `game.scenes` runs scenes, and `game.assets` loads files. This page shows how the pieces fit together and links to the reference page of every module.

```ts
import { Colors, Game, Key } from '@bornengine/engine';

class Hello extends Game {
  constructor() {
    super({ window: { title: 'Hello', width: 640, height: 360 } });
  }

  protected override loop(_deltaTime: number): void {
    if (this.input.isKeyPressed(Key.ESCAPE)) this.stop();
  }

  protected override render(): void {
    this.renderer.clear(Colors.DARKBLUE);
    this.renderer.drawText('Hello, BornEngine', { x: 24, y: 24 }, 32, Colors.WHITE);
  }
}

new Hello().run();
```

The class overrides two hooks. `loop(deltaTime)` runs every frame and reads `this.input`. `render()` runs after it and draws with `this.renderer`. [Core](../api/core/) explains the full frame lifecycle.

## How the API is organized

- **One `Game` per process.** The `Game` owns the window and every service. A second `Game` created while the first is active fails with the error `Only one BornEngine Game may be active at a time.`
- **Resources have an owner.** You create textures, fonts, sounds, music, and models through `game.assets` or `scene.assets`, not with `new`. `game.assets` keeps them until the game shuts down. `scene.assets` releases them when the scene unloads. See [Assets](../api/assets/).
- **Some systems take the `Game` directly.** A `Scene` is created with `new Scene(options)`. Context-bound systems such as `PhysicsWorld` and `ColyseusClient` also receive the `Game` in their constructors.
- **Value types stand alone.** `Vector2D`, `Vec3`, `Matrix4`, `Quat`, and `Colors` only store numbers. They need no `Game` and have nothing to release. See [Math](../api/math/).
- **Internal members are not public API.** Names that start with an underscore, such as `_create`, are internal and can change without notice.

## Import from the root or a subpath

Most games import everything from the package root. Import from a subpath when you want the module boundary to be visible in a library or in a feature package:

```ts
import { Colors, Game } from '@bornengine/engine/core';
import { Collision } from '@bornengine/engine/shapes';
import type { Rect } from '@bornengine/engine/shapes';

const BUTTON: Rect = { x: 40, y: 40, width: 120, height: 40 };

class Menu extends Game {
  protected override render(): void {
    this.renderer.clear(Colors.BLACK);
    const hovered = Collision.checkPointRectangle(this.input.getMousePosition(), BUTTON);
    this.renderer.drawRectangle(BUTTON, hovered ? Colors.GOLD : Colors.GRAY);
  }
}
```

The root package re-exports the classes you use most from the modules below, so `import { Game } from '@bornengine/engine'` and `import { Game } from '@bornengine/engine/core'` give you the same class. Some names exist only on a subpath, such as everything in `@bornengine/engine/annotations` and the extra helpers in `@bornengine/engine/world2d/editor`.

## Module map

### Runtime and rendering

| Module | Import path | What you find there |
| --- | --- | --- |
| [Core](../api/core/) | `@bornengine/engine/core` | `Game`, `Window`, `Renderer`, `Colors`, `Key`, `MouseButton`, and shared types such as `Camera2D` and `Rect`. |
| [Game objects](../api/game/) | `@bornengine/engine/game` | `GameObject`, `GameComponent`, `Scene`, `SceneManager`, `Transform`, and adapter components. |
| [Annotations](../api/game/) | `@bornengine/engine/annotations` | The `Asset` and `GameComponent` field decorators. This `GameComponent` is a decorator function, not the component base class from `game`. |
| [2D camera](../api/camera2d/) | `@bornengine/engine/camera2d` | `CameraRig2D`, `Viewport2D`, and `ParallaxLayer2D`. |
| [Input](../api/input/) | `@bornengine/engine/input` | `InputSystem` and `InputActionMap`. |
| [Shapes](../api/shapes/) | `@bornengine/engine/shapes` | Shape drawing on the renderer and 2D collision helpers. |
| [Textures](../api/textures/) | `@bornengine/engine/textures` | `Texture`, `RenderTexture`, and `ImageData`. |
| [Assets](../api/assets/) | `@bornengine/engine/assets` | `AssetManager`, `SceneAssetManager`, and `AssetGroup`. |
| [Text](../api/text/) | `@bornengine/engine/text` | `Font`, plus text drawing and measuring on the renderer. |
| [Math](../api/math/) | `@bornengine/engine/math` | `Vector2D`, `Vec3`, `Vec4`, `Quat`, `Matrix4`, `Mathf`, and `Collision`. |

### 2D content and gameplay

| Module | Import path | What you find there |
| --- | --- | --- |
| [Sprites and animation](../api/sprites/) | `@bornengine/engine/sprites` | `SpriteSheet`, `SpriteRenderer`, `SpriteAnimation`, `SpriteAnimator`, `ParticleEmitter2D`, and animation templates. |
| [Physics 2D](../api/physics2d/) | `@bornengine/engine/physics2d` | `PhysicsWorld2D`, `PhysicsBody2D`, and `CharacterBody2D`. |
| [Tilemaps](../api/tilemap/) | `@bornengine/engine/tilemap` | `Tilemap` and its tile and collision data. |
| [World2D](../api/world2d/) | `@bornengine/engine/world2d` | Versioned 2D world documents: validation, serialization, a component registry, and `World2DLoader`. `@bornengine/engine/world2d/editor` exposes the pure editing APIs. |
| [2D pathfinding](../api/pathfinding2d/) | `@bornengine/engine/pathfinding2d` | `AStarGrid2D` and its grid types. |
| [Procedural generation](../api/procedural/) | `@bornengine/engine/procedural` | `SeededRandom` and `Noise2D`. |
| [Audio](../api/audio/) | `@bornengine/engine/audio` | `AudioSystem`, `Sound`, `Music`, `SoundManager`, `AudioListener2D`, and `AudioEmitter2D`. |
| [Database and migrations](../api/storage/) | `@bornengine/engine/storage` | `GameDatabase`, typed SQLite schemas, queries, transactions, and migrations. |
| [Mobile](../api/mobile/) | `@bornengine/engine/mobile` | `TouchControls`, `VirtualJoystick`, and `VirtualButton`. |

### User interface and debugging

| Module | Import path | What you find there |
| --- | --- | --- |
| [UI](../api/ui/) | `@bornengine/engine/ui` | `Ui`, the immediate-mode interface. |
| [GUI controls](../api/gui/) | `@bornengine/engine/gui` | `GUIManager`, the retained controls such as `GuiButton`, and profiles and events. |
| [Debug UI](../api/debug-ui/) | `@bornengine/engine/debug-ui` | `DebugUi` and the optional inspector. |

### 3D and networking

| Module | Import path | What you find there |
| --- | --- | --- |
| [Models](../api/models/) | `@bornengine/engine/models` | `Model`, `Mesh`, `Material`, and the 3D `Animation`. |
| [Scene](../api/scene/) | `@bornengine/engine/scene` | `SceneGraph` and `SceneNode`, the retained 3D scene. |
| [Physics](../api/physics/) | `@bornengine/engine/physics` | `PhysicsWorld`, colliders, rigid bodies, joints, and vehicles. |
| [World](../api/world/) | `@bornengine/engine/world` | `WorldData`, `WorldInstance`, and `PrefabLibrary`. |
| [VFX](../api/vfx/) | `@bornengine/engine/vfx` | The 3D `ParticleSystem`, `DecalSystem`, and `SceneVfx`. |
| [Colyseus](../api/colyseus/) | `@bornengine/engine/colyseus` | `ColyseusClient` and `Room` for multiplayer. |

## Lifetime and failures

The engine reports most failures as values instead of exceptions:

- Check `game.isReady` and `game.error` after you construct a `Game`. [Core](../api/core/) explains how a runtime error reaches `game.error`.
- Resources that load from files, such as textures, fonts, and sounds, have `isLoaded` and `error`. Factories return `null` when they cannot create a resource at all, for example for an empty path.
- Call `dispose()` on a resource when it leaves gameplay early. Calling `game.dispose()` or stopping the game releases whatever the game still owns.

## Next steps

- [API shape](../concepts/api-shape/) explains the class-first design behind these modules.
- [Your first player](../getting-started/first-player/) builds a game with a scene, an object, and a camera.
- [2D game](../guides/2d-game/) puts several modules together in one level.
