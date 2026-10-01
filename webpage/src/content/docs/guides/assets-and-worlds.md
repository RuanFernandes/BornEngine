---
title: Organize assets and worlds
description: Load reusable resources once and instantiate validated world data with explicit ownership.
section: Guides
order: 73
---

Treat the project `assets/` directory as the portable boundary between source and runtime packaging. Keep asset paths relative to the project root.

## Setup

```text
assets/
├── audio/
├── models/
├── textures/
└── worlds/
    ├── main.world.json
    └── prefabs/
```

Cache textures and models by path so gameplay objects share resources instead of repeatedly loading them.

```ts
import { Game, WorldInstance } from '@bornengine/engine';
class WorldViewerGame extends Game {
  world: WorldInstance | null = null;

  protected override render(): void {
    if (this.world !== null) this.world.applyLighting();
  }

  protected override onStop(): void {
    if (this.world !== null) this.world.dispose();
  }
}

const game = new WorldViewerGame();
function getModel(path: string) {
  const model = game.assets.loadModel(path);
  return model !== null && model.isLoaded ? model : null;
}
```

## Game loop

Loading and validation happen outside frame work. WorldInstance creates Game-owned renderer nodes and resolves model references with a callback.

```ts
import { WorldData } from '@bornengine/engine';
const worldData = new WorldData('assets/worlds/main.world.json');
if (!worldData.load()) {
  console.error(worldData.error || 'World load failed');
} else {
  const validation = worldData.validate();
  if (!validation.ok) console.error(validation.errors);
  const instance = worldData.instantiate(game, { getModel });
  if (instance.isLoaded) {
    game.world = instance;
    game.run();
  } else {
    console.error(instance.error);
  }
}
```

## Complete example

```ts
import { Game, WorldData, WorldInstance } from '@bornengine/engine';

class ExampleGame extends Game {
  world: WorldInstance | null = null;

  protected override render(): void {
    if (this.world !== null) this.world.applyLighting();
  }

  protected override onStop(): void {
    if (this.world !== null) this.world.dispose();
  }
}

const game = new ExampleGame({ window: { title: 'World viewer' } });
const worldData = new WorldData('assets/worlds/main.world.json');
if (!game.isReady) console.error(game.error || 'Engine startup failed');
if (!worldData.load()) {
  console.error(worldData.error || 'World load failed');
} else {
  const instance = worldData.instantiate(game, {
    getModel(path) {
      const model = game.assets.loadModel(path);
      return model !== null && model.isLoaded ? model : null;
    },
  });
  if (!instance.isLoaded) {
    console.error(instance.error);
  } else {
    game.world = instance;
    game.run();
  }
}
```

Call `applyLighting()` when this world is active because frame rendering resets some environment state. Dispose a WorldInstance when replacing a level; cached models remain owned by the Game.

## Next steps

Use `PrefabLibrary` to validate and organize reusable prefab documents. See the [world format](../world-format/) and [World API](../../api/world/).
