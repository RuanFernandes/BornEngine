---
title: Organize assets and worlds
description: Keep stable asset paths, load models and textures once, and instantiate schema-v2 worlds with ownership callbacks.
section: Guides
order: 73
---

Treat `assets/` as the portable boundary between source and runtime packaging. A world stores relative references such as `models/tree.glb` and `textures/grass.png`; the game resolves those references through its own cache.

## Setup

Use a layout that mirrors the references written into world JSON:

```text
assets/
├── audio/
├── models/
├── textures/
├── shaders/
└── worlds/
    ├── main.world.json
    └── prefabs/small-house.prefab.json
```

Load long-lived textures and models once. Check texture handles when a missing file should produce a visible error, and unload resources with the same owner that loaded them.

```ts
import { loadModel } from '@bornengine/engine/models';
import { loadTexture, setTextureFilter } from '@bornengine/engine/textures';

const playerModel = loadModel('assets/models/player.glb');
const playerTexture = loadTexture('assets/textures/player.png');
setTextureFilter(playerTexture, 0);

if (playerModel.handle === 0 || playerTexture.handle === 0) {
  throw new Error('player assets are missing');
}
```

## Game loop

World loading is intentionally split from frame work. `loadWorld()` parses, migrates, and validates schema v2; `instantiateWorld()` creates scene nodes. The render loop must call `applyWorldEnvironment()` every frame because the renderer clears lighting at frame start.

```ts
import { runGame } from '@bornengine/engine/core';
import {
  applyWorldEnvironment,
  createPrefabRegistry,
  instantiateWorld,
  loadPrefab,
  loadWorld,
  registerPrefab,
} from '@bornengine/engine/world';

const world = loadWorld('assets/worlds/main.world.json');
const prefabs = createPrefabRegistry();
registerPrefab(prefabs, loadPrefab('assets/worlds/prefabs/small-house.prefab.json'));
const models = new Map<string, number>();
const spawned = instantiateWorld(world, {
  getModelHandle: (ref) => models.get(ref) ?? 0,
  prefabRegistry: prefabs,
  onEntitySpawned: (id, node) => console.log('entity', id, 'node', node),
});

runGame((dt) => {
  applyWorldEnvironment(world);
  updateSpawnedEntities(spawned.entityHandles, dt);
});

function updateSpawnedEntities(handles: Map<string, number>, dt: number) {
  console.log('update', handles.size, dt);
}
```

The context's `getModelHandle()` is the bridge between world references and your asset cache. Return `0` for an unavailable model; the loader records a warning and continues with the rest of the world. Prefab entities expand into a root group and child scene nodes, so keep the returned `entityHandles` map as the ownership index.

## Complete example

This example resolves model references lazily, instantiates the world, and tears down handles owned by the level. The model cache uses the world reference as its key, which prevents duplicate loads when several entities share one asset.

```ts
import { runGame } from '@bornengine/engine/core';
import { loadModel, unloadModel } from '@bornengine/engine/models';
import { destroySceneNode } from '@bornengine/engine/scene';
import {
  applyWorldEnvironment,
  createPrefabRegistry,
  instantiateWorld,
  loadPrefab,
  loadWorld,
  registerPrefab,
} from '@bornengine/engine/world';

const cache = new Map<string, { handle: number; release: () => void }>();
const world = loadWorld('assets/worlds/main.world.json');
const registry = createPrefabRegistry();
registerPrefab(registry, loadPrefab('assets/worlds/prefabs/small-house.prefab.json'));

const result = instantiateWorld(world, {
  getModelHandle: (ref) => {
    let entry = cache.get(ref);
    if (!entry) {
      const model = loadModel(`assets/${ref}`);
      entry = { handle: model.handle, release: () => unloadModel(model) };
      cache.set(ref, entry);
    }
    return entry.handle;
  },
  prefabRegistry: registry,
});

runGame(() => {
  applyWorldEnvironment(world);
});

export function unloadLevel() {
  for (const node of result.entityHandles.values()) destroySceneNode(node);
  if (result.terrainHandle !== 0) destroySceneNode(result.terrainHandle);
  for (const node of result.waterHandles) destroySceneNode(node);
  for (const node of result.riverHandles) destroySceneNode(node);
  for (const entry of cache.values()) entry.release();
  cache.clear();
}
```

## Next steps

- Read [World](../../api/world/) for schema fields, migrations, terrain, water, and environment ownership.
- Add `metadata`, entity `tags`, and `userData` instead of inventing unknown top-level fields.
- Use the [assets guide](../assets/) for platform packaging details and Web/WASM URL behavior.
- Add a validation step to CI with `bornengine doctor` and the project build before publishing a level.
