---
title: World format
description: Author versioned world and prefab JSON that the editor and runtime can round-trip safely.
section: Guides
order: 62
---

A 3D level is a `*.world.json`; a reusable composite is a `*.prefab.json`. Both use pretty-printed JSON and the current `schemaVersion: 2`. Tilemaps and 2D object layers use the separate, versioned `*.world2d.json` contract described below.

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

## 2D worlds

A World2D document starts with `format: "bornengine.world2d"` and `version: 2`. The 3D `WorldData` schema remains independent. Version 1 maps are still readable and are upgraded when saved; opening a map does not rewrite it. A map saved as version 2 requires an engine release with World2D v2 storage support.

The first entry in `tilesets` is the main image source; later entries are extra atlases or single-tile images. Sources can be mixed in one layer when their tile dimensions match the layer grid. Cells are stored row-major as numeric codes, and the format selects the smallest supported Dense, RLE, Sparse, Bits, or bounded LZ representation per layer. The normalized runtime model still uses stable source IDs, zero-based local tile IDs, and explicit flip flags.

Use `validateWorld2D` to collect JSON Pointer diagnostics and `serializeWorld2D` to produce compact version-2 JSON. Its `readable` mode writes formatted metadata and numeric Dense tile data. The VS Code editor uses fast serialization while editing, upgrades old maps on save, and offers **Optimize World2D Map** for maximum-effort compaction. Normal saves wait briefly for a matching background result and use a valid fast result if maximum compaction is not ready. See the [World2D API](../../api/world2d/) for the storage contract, codec shapes, and loader example.

```ts
import { serializeWorld2D, validateWorld2D } from '@bornengine/engine/world2d';

const validation = validateWorld2D(world2dDocument);
if (!validation.ok) {
  console.error(validation.diagnostics);
} else {
  const saved = serializeWorld2D(world2dDocument, { mode: 'compact', effort: 'max' });
  if (saved.ok) writeProjectFile('maps/level.world2d.json', saved.json);
}
```

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

const game = new ExampleGame();
const worldData = new WorldData('assets/worlds/main.world.json');
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
