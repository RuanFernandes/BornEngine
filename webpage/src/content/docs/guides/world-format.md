---
title: World format
description: Author versioned world and prefab JSON that the editor and runtime can round-trip safely.
section: Guides
order: 62
---

A level is a `*.world.json`; a reusable composite is a `*.prefab.json`. Both use pretty-printed JSON and the current `schemaVersion: 2`.

| Block | Purpose |
| --- | --- |
| `environment` | Sky, sun, ambient, fog, and shadows |
| `terrain` | Heightmap and splat layers; nullable |
| `entities` | Model/prefab references, transform, tint, tags, and user data |
| `lights` | Point-light position, color, intensity, and range |
| `water` / `rivers` | Water volumes and Catmull–Rom river splines |
| `metadata` | String-to-string game-owned data |

Load the document with `WorldData`, then create its runtime nodes through `WorldData.instantiate(game, options)` or read `worldData.document` and build your own game-specific representation. Use `entity.userData` and `world.metadata` for game-specific values; unknown fields are warned about and can be dropped by the schema-explicit saver.

`WorldData.load()` migrates older versions automatically. Files with a newer version fail validation instead of being silently misread. `WorldInstance.applyLighting()` must run every frame because lighting is cleared at frame start. Dispose the `WorldInstance` when replacing the active level.

```ts
import { Game, Model, WorldData } from '@bornengine/engine';

const game = new Game();
const models = new Map<string, Model>();
const worldData = new WorldData('assets/worlds/main.world.json');
if (!worldData.load()) {
  console.error(worldData.error || 'World load failed');
} else {
  const instance = worldData.instantiate(game, {
    getModel(path) {
      let model = models.get(path);
      if (model === undefined) {
        model = new Model(game, path);
        models.set(path, model);
      }
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
