---
title: API shape
description: Understand Game ownership, class-based services, and resource lifecycle.
section: Concepts
order: 11
---

BornEngine uses a class-first TypeScript API. Extend `Game` to keep startup, simulation, and rendering with the services they use. The runtime exposes `renderer`, `input`, `audio`, `scenes`, and `sceneGraph` on the same instance. Create shared resources through `game.assets`; create scene-lifetime resources through `scene.assets` and effects through `scene.vfx`.

```ts
import { Colors, Game, Texture } from '@bornengine/engine';

class SpriteGame extends Game {
  private player: Texture | null = null;

  constructor() {
    super({ window: { title: 'Sprite demo' } });
  }

  protected override onStart(): void {
    this.player = this.assets.loadTexture('assets/player.png');
  }

  protected override loop(deltaTime: number): void {
    // Move the player by deltaTime, measured in seconds.
  }

  protected override render(): void {
    this.renderer.clear(Colors.BLACK);
    if (this.player !== null && this.player.isLoaded) this.player.draw({ x: 100, y: 120 });
  }
}

new SpriteGame().run();
```

`run()` calls `onStart` once, then `loop(deltaTime)` and `render()` for each frame. When the game stops, `onStop()` runs before the runtime disposes its owned resources. An embedded host with its own frame scheduler can drive `runFrame(deltaTime, callbacks)`.

## Ownership

A `Game` is the root owner for one engine context. Today the native runtime is process-global, so only one active `Game` can run at a time. Services and resources created for another game are rejected instead of silently crossing runtime boundaries. Game asset scopes live until shutdown; Scene scopes release their resources on unload.

## Classes and values

Stateful engine objects use classes: `Texture`, `Sound`, `Model`, `PhysicsWorld`, `SceneNode`, and `ColyseusClient` keep context and lifecycle alongside their operations. Value-only data such as `Vec3`, colors, rectangles, and camera descriptions stays plain or uses small math classes. This makes ownership visible without forcing value data into runtime objects.

## Public imports

Import from `@bornengine/engine` for the common application surface, or use documented subpaths such as `@bornengine/engine/physics` and `@bornengine/engine/colyseus`. Those barrels expose the supported TypeScript API. Native operation declarations and numeric handle registries are internal implementation details.

See the [Game API](../../api/game/) for gameplay lifecycle and [core API](../../api/core/) for the frame owner.
