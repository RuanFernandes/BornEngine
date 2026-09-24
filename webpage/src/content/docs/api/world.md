---
title: World
description: Load, validate, migrate, instantiate, and save versioned .world.json and .prefab.json files.
section: API / World
order: 41
---

The world module separates authored JSON from runtime scene handles. `loadWorld()` is pure apart from file I/O and validation; `instantiateWorld()` turns entities, prefabs, terrain, water, and rivers into scene nodes using a model resolver supplied by the game.

## Schema

The current `WORLD_SCHEMA_VERSION` is `2`. A world document stores plain JSON arrays so it remains diffable and portable: vectors are `[x, y, z]`, colors are normalized arrays, rotations are XYZ Euler radians, and matrices are column-major number arrays. The top-level fields are `schemaVersion`, `name`, `id`, `bounds`, `environment`, `terrain`, `entities`, `lights`, `water`, `rivers`, and `metadata`.

```json
{
  "schemaVersion": 2,
  "name": "Training yard",
  "id": "training_yard",
  "bounds": { "min": [-50, -10, -50], "max": [50, 30, 50] },
  "environment": {
    "skyColor": [0.53, 0.81, 0.92],
    "ambientColor": [1, 1, 1],
    "ambientIntensity": 0.35,
    "sunDirection": [-0.5, -1, -0.3],
    "sunColor": [1, 0.95, 0.85],
    "sunIntensity": 1,
    "fogStart": 40,
    "fogEnd": 120,
    "fogColor": [0.7, 0.8, 0.9],
    "shadowsEnabled": true
  },
  "terrain": null,
  "entities": [],
  "lights": [],
  "water": [],
  "rivers": [],
  "metadata": { "gameId": "training" }
}
```

Entities reference exactly one `modelRef` or `prefabRef`. Their transform contains `position`, `rotation`, and `scale`; `tags`, `tint`, and `userData` are the intended extension points. Schema v2 promotes point lights to the top-level `lights` array. `validateWorld()` reports duplicate ids, missing arrays, malformed transforms, unsupported versions, and invalid references before instantiation.

## Loading and instantiation

`loadWorld()` parses, migrates older files, validates the result, and throws a descriptive error for missing, invalid, or structurally unsafe data. `instantiateWorld()` takes an `InstantiateContext`: the game decides how model paths map to loaded handles, whether prefab files are registered, and where ownership callbacks update gameplay state.

```ts
import { runGame } from '@bornengine/engine/core';
import { loadModel } from '@bornengine/engine/models';
import {
  applyWorldEnvironment,
  createPrefabRegistry,
  instantiateWorld,
  loadPrefab,
  loadWorld,
  registerPrefab,
} from '@bornengine/engine/world';

const world = loadWorld('assets/worlds/training-yard.world.json');
const modelHandles = new Map<string, number>();
const prefabs = createPrefabRegistry();
registerPrefab(prefabs, loadPrefab('assets/worlds/prefabs/small-house.prefab.json'));

const result = instantiateWorld(world, {
  getModelHandle: (modelRef) => {
    let handle = modelHandles.get(modelRef);
    if (handle === undefined) {
      handle = loadModel(`assets/${modelRef}`).handle;
      modelHandles.set(modelRef, handle);
    }
    return handle;
  },
  prefabRegistry: prefabs,
  onEntitySpawned: (entityId, node) => console.log('spawned', entityId, node),
  onTerrainSpawned: (node) => console.log('terrain node', node),
});

for (const warning of result.warnings) console.warn(warning);

runGame((dt) => {
  applyWorldEnvironment(world);
  updateGameEntities(result.entityHandles, dt);
});

function updateGameEntities(handles: Map<string, number>, dt: number) {
  console.log('entities', handles.size, 'dt', dt);
}
```

The result contains entity-to-node handles, an optional terrain handle, water and river handle arrays, and non-fatal warnings. `loadPrefab()` applies the same validation/migration policy to a prefab; `expandPrefab()` recursively flattens nested children, inherits tags and tint, and reports cycles or missing references instead of silently spawning partial content.

## Environment and ownership

`instantiateWorld()` applies the sun and shadow switch once so the first frame is correct. The renderer clears its lighting block at the beginning of every frame, so call `applyWorldEnvironment(world)` on every frame. It reapplies ambient light, the sun, point lights, and fog; `applyWorldLights()` is available when a game needs to submit only the point-light portion.

```ts
import {
  applyWorldEnvironment,
  applyWorldLights,
  saveWorld,
  validateWorld,
} from '@bornengine/engine/world';

const check = validateWorld(world);
if (!check.ok) throw new Error(check.errors.join('\n'));

function beforeRender() {
  applyWorldEnvironment(world);
  // Use this separately only when another system owns the rest of the environment.
  // applyWorldLights(world);
}

function saveEditedWorld(path: string) {
  const saved = saveWorld(path, world);
  if (!saved.ok) console.error(saved.errors);
}
```

World loading preserves unknown fields in memory but reports them because the schema-explicit saver drops fields it does not know. Put game-specific values in `metadata`, entity `userData`, or `tags`. When unloading a level, destroy the scene handles returned by instantiation, release the loaded model handles owned by the level cache, and clear any prefab registry entries that will not be reused.

The [world format guide](../../guides/world-format/) covers authoring conventions, terrain heightmaps, water volumes, river splines, and migration strategy in more detail.

For a runtime-owned model cache and level teardown, see the [assets and worlds recipe](../../guides/assets-and-worlds/).
