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
import { Game, Model, Texture } from '@bornengine/engine';
const game = new Game();
const models = new Map<string, Model>();
const textures = new Map<string, Texture>();

function getModel(path: string): Model {
  let value = models.get(path);
  if (value === undefined) { value = new Model(game, path); models.set(path, value); }
  return value;
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
    game.run({
      update() {},
      render() { instance.applyLighting(); },
      onStop() {
        instance.dispose();
        game.dispose();
      },
    });
  } else {
    console.error(instance.error);
  }
}
```

## Complete example

```ts
import { Game, Model, WorldData } from '@bornengine/engine';

const game = new Game({ window: { title: 'World viewer' } });
const models = new Map<string, Model>();
const worldData = new WorldData('assets/worlds/main.world.json');
if (!game.isReady) console.error(game.error || 'Engine startup failed');
if (!worldData.load()) {
  console.error(worldData.error || 'World load failed');
} else {
  const instance = worldData.instantiate(game, {
    getModel(path) {
      let model = models.get(path);
      if (model === undefined) { model = new Model(game, path); models.set(path, model); }
      return model.isLoaded ? model : null;
    },
  });
  if (!instance.isLoaded) {
    console.error(instance.error);
  } else {
    game.run({
      update() {},
      render() { instance.applyLighting(); },
      onStop() {
        instance.dispose();
        game.dispose();
      },
    });
  }
}
```

Call `applyLighting()` when this world is active because frame rendering resets some environment state. Dispose a WorldInstance when replacing a level; cached models remain owned by the Game.

## Next steps

Use `PrefabLibrary` to validate and organize reusable prefab documents. See the [world format](../world-format/) and [World API](../../api/world/).
