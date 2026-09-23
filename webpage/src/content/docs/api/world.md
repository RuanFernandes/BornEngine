---
title: World
description: Load, validate, migrate, instantiate, and save versioned .world.json and .prefab.json files.
section: API / World
order: 41
---

Import from `@bornengine/engine/world`:

```ts
import { loadWorld, instantiateWorld, applyWorldEnvironment } from '@bornengine/engine/world';

const world = loadWorld('assets/worlds/level1.world.json');
const result = instantiateWorld(world, {
  getModelHandle: (ref) => myModelCache(ref),
  prefabRegistry: myPrefabs,
});

runGame((dt) => {
  applyWorldEnvironment(world);
  // update result-owned game state and render
});
```

The current schema version is 2. `loadWorld` reads, parses, migrates, and validates. `instantiateWorld` expands prefabs, spawns terrain, entities, water, and river ribbons, and rejects prefab cycles. The environment must be applied every frame because the renderer clears its lighting block in `begin_frame`.

World data is intentionally JSON-friendly. Store game-specific strings in `entity.userData` or `world.metadata`; unknown fields are reported and may be dropped by the schema-explicit saver. Read the [world format guide](../guides/world-format/) before designing an editor-facing level format.
