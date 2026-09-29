---
title: TypeScript API
description: Explore the class-first BornEngine API, ownership model, and public module map.
section: API
order: 30
---

BornEngine applications start with one **Game** instance. The Game owns the native runtime and exposes services for rendering, input, audio, scenes, UI, mobile controls, and networking. Stateful resources receive that Game in their constructor and keep native identity private.

```ts
import { Colors, Game } from '@bornengine/engine';

class FieldTest extends Game {
  constructor() {
    super({ window: { title: 'Field test', width: 1280, height: 720 } });
  }

  protected override loop(deltaTime: number): void {
    this.scenes.update(deltaTime);
  }

  protected override render(): void {
    this.renderer.clear(Colors.SKYBLUE);
    super.render();
  }
}

new FieldTest().run();
```

## Import from the root or a subpath

The package root is convenient for game code. Import from a subpath when you want the module boundary to be visible in a library or feature package:

```ts
import { Game } from '@bornengine/engine/core';
import { PhysicsWorld, SphereCollider } from '@bornengine/engine/physics';

const game = new Game();
const physics = new PhysicsWorld(game);
const ballShape = new SphereCollider(physics, 0.5);
```

Both paths expose the same supported classes and types. Internal FFI functions and numeric resource handles are not package exports.

## Module map

| Module | Import path | Owned API |
| --- | --- | --- |
| Core | `@bornengine/engine/core` | `Game`, `Window`, `Renderer`, platform values |
| 2D camera | `@bornengine/engine/camera2d` | `CameraRig2D`, `Viewport2D`, `ParallaxLayer2D` |
| Input | `@bornengine/engine/input` | `InputSystem`, `InputActionMap`, serializable action data |
| Shapes | `@bornengine/engine/shapes` | Renderer drawing and pure collision helpers |
| Textures | `@bornengine/engine/textures` | `Texture`, `RenderTexture`, `ImageData` |
| Assets | `@bornengine/engine/assets` | `AssetManager`, texture cache, `AssetGroup` preload batches |
| Sprites | `@bornengine/engine/sprites` | `SpriteSheet`, `SpriteRenderer`, `SpriteAnimation`, `SpriteAnimator`, `ParticleEmitter2D` |
| Text | `@bornengine/engine/text` | `Font` |
| Audio | `@bornengine/engine/audio` | `AudioSystem`, `Sound`, `Music`, `SoundManager`, `AudioListener2D`, `AudioEmitter2D` |
| Storage | `@bornengine/engine/storage` | `createGameStorage`, versioned JSON saves and settings |
| Models | `@bornengine/engine/models` | `Model`, `Mesh`, `Material`, `Animation` |
| Scene | `@bornengine/engine/scene` | `SceneGraph`, `SceneNode` |
| Game | `@bornengine/engine/game` | `GameObject`, components, scenes, adapters |
| Physics | `@bornengine/engine/physics` | `PhysicsWorld`, colliders, bodies, joints |
| Physics 2D | `@bornengine/engine/physics2d` | `PhysicsWorld2D`, `PhysicsBody2D` |
| Tilemaps | `@bornengine/engine/tilemap` | `Tilemap` and tile collision data |
| World | `@bornengine/engine/world` | `WorldData`, `WorldInstance`, prefab library |
| World2D | `@bornengine/engine/world2d` | Versioned 2D world validation, serialization, component registry, and loader |
| VFX | `@bornengine/engine/vfx` | `ParticleSystem`, `DecalSystem` |
| Mobile | `@bornengine/engine/mobile` | `TouchControls`, joystick and button objects |
| UI | `@bornengine/engine/ui` | `Ui` |
| Debug UI | `@bornengine/engine/debug-ui` | `DebugUi`, `Game` inspector options |
| Colyseus | `@bornengine/engine/colyseus` | `ColyseusClient`, `Room` |

## Lifetime and failures

The current native runtime is process-global, so one Game may be active at a time. Check `game.isReady` and `game.error` after construction. Check `isLoaded` and `error` on resources that can fail to load. Call `dispose()` when an individual resource leaves gameplay; `game.dispose()` releases resources still owned by that game.
