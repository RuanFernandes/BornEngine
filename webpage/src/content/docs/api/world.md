---
title: World data
description: Load, validate, instantiate, and dispose versioned world documents.
section: API / World
order: 43
---

World JSON remains a serializable document format. `WorldData` owns load, validation, migration, and save operations; `WorldInstance` owns runtime nodes created for one Game.

## Schema

The schema uses plain interfaces such as `WorldDocument`, `EntityData`, and `EnvironmentData`. Data values are portable and may be edited or serialized without creating a Game.

```ts
import { WorldData } from '@bornengine/engine';
const document = WorldData.create('level-01', 'First level');
const result = document.validate();
if (!result.ok) console.error(result.errors);
```

Use `WorldData.serialize(document.document)` for a JSON representation or static helpers for pure-data transforms.

## Loading and instantiation

```ts
import { Game, Model, WorldData } from '@bornengine/engine';
const game = new Game();
const worldData = new WorldData('assets/worlds/main.world.json');
if (!worldData.load()) {
  console.error(worldData.error || 'World load failed');
} else {
  const models = new Map<string, Model>();
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
  if (!instance.isLoaded) console.error(instance.error);
}
```

Resolve all model assets through the owning Game. Check `instance.error` and `instance.warnings`; call `instance.dispose()` when removing the level.

## Environment and ownership

Call `instance.applyLighting()` when the active world should supply lighting and environment settings. Its nodes and models must share the Game context. Disposing the WorldInstance releases loader-created nodes but leaves caller-owned cached Model resources under the caller's ownership.
