---
title: API shape
description: Understand Game ownership, class-based services, and resource lifecycle.
section: Concepts
order: 11
---

BornEngine uses a class-first TypeScript API. Create one `Game` for a runtime, then reach services through that owner: `game.renderer`, `game.input`, `game.audio`, `game.scenes`, and `game.sceneGraph`. Resource constructors receive the same game so they can validate ownership and release native state safely.

```ts
import { Colors, Game, Texture } from '@bornengine/engine';

const game = new Game({ window: { title: 'Sprite demo' } });
const player = new Texture(game, 'assets/player.png');

if (!player.isLoaded) {
  console.error(player.error);
} else {
  game.run({
    update(deltaTime) {
      // Move the player by deltaTime.
    },
    render() {
      game.renderer.clear(Colors.BLACK);
      player.draw({ x: 100, y: 120 });
    },
    onStop: () => game.dispose(),
  });
}
```

## Ownership

A `Game` is the root owner for one engine context. Today the native runtime is process-global, so only one active `Game` can run at a time. Services and resources created for another game are rejected instead of silently crossing runtime boundaries.

## Classes and values

Stateful engine objects use classes: `Texture`, `Sound`, `Model`, `PhysicsWorld`, `SceneNode`, and `ColyseusClient` keep context and lifecycle alongside their operations. Value-only data such as `Vec3`, colors, rectangles, and camera descriptions stays plain or uses small math classes. This makes ownership visible without forcing value data into runtime objects.

## Public imports

Import from `@bornengine/engine` for the common application surface, or use documented subpaths such as `@bornengine/engine/physics` and `@bornengine/engine/colyseus`. Those barrels expose the supported TypeScript API. Native operation declarations and numeric handle registries are internal implementation details.

See the [Game API](../../api/game/) for gameplay lifecycle and [core API](../../api/core/) for the frame owner.
