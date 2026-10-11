---
title: World data
description: Load, validate, instantiate, save, and dispose versioned 3D world documents.
section: API
order: 43
---

A **world file** stores a 3D level as plain JSON: where the models stand, how the scene is lit, and the terrain, water, and lights. By convention the file name ends in `.world.json`. Three classes work with it:

- `WorldData` holds one document. It loads, validates, migrates, saves, and instantiates it.
- `WorldInstance` holds the scene nodes that one `Game` created from a document. It is what you dispose when the level goes away.
- `PrefabLibrary` holds reusable groups of models, stored as `.prefab.json` files, that a world can place.

2D maps use a different format. See [World2D API](../world2d/).

## Schema

A document is a `WorldDocument`. Its `schemaVersion` is 2, which is the value of `WORLD_SCHEMA_VERSION`. The values are plain JSON so that a file round-trips without loss: vectors are arrays such as `[x, y, z]`, colors are numbers from 0 to 1, and rotations are Euler angles in radians, one angle for each axis. The runtime scene API uses 0 to 255 for colors and converts for you.

```json
{
  "schemaVersion": 2,
  "name": "First level",
  "id": "level-01",
  "bounds": { "min": [-50, -10, -50], "max": [50, 50, 50] },
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
  "entities": [
    {
      "id": "ent_0001",
      "name": "tree_oak",
      "modelRef": "models/tree_oak.glb",
      "prefabRef": null,
      "transform": { "position": [4, 0, -6], "rotation": [0, 1.57, 0], "scale": [1, 1, 1] },
      "tint": null,
      "tags": ["climbable"],
      "userData": { "kind": "decoration" }
    }
  ],
  "lights": [
    { "id": "light_0001", "name": "Lantern", "kind": "point", "position": [0, 3, 0], "color": [1, 0.85, 0.55], "intensity": 2, "range": 12 }
  ],
  "water": [],
  "rivers": [],
  "metadata": {}
}
```

The top-level fields:

| Field | Meaning |
| --- | --- |
| `schemaVersion`, `name`, `id` | The version, a display name, and a stable id. `name` and `id` must not be empty. |
| `bounds` | An axis-aligned box `{ min, max }` around the level. |
| `environment` | Sky, ambient light, sun, fog, and the shadow switch. |
| `terrain` | A heightmap, or `null`. |
| `entities` | The placed things. |
| `lights` | Point lights. The sun and ambient light live in `environment`. |
| `water`, `rivers` | Water volumes and river ribbons. |
| `metadata` | A map of string keys to string values for your own data. |

An **entity** is a placed thing. Exactly one of `modelRef` and `prefabRef` is set. `modelRef` is a path such as `models/tree_oak.glb`, and `prefabRef` is the id of a prefab. `transform` has `position`, `rotation` (Euler angles in radians, XYZ order), and `scale`. `tint` is an optional RGBA color from 0 to 1. `tags` is a list of strings, and `userData` is a map of strings, both for your game.

A **light** has an `id`, a `name`, `kind: 'point'`, a `position`, a `color`, an `intensity`, and a `range` in world units. A **water volume** is a box with an `id`, `kind: 'box'`, a `center`, a `size` (full extents, not half), a `surfaceHeight`, an RGBA `color`, `waveAmplitude`, and `waveSpeed`. A **river** has an `id` and follows `controlPoints` (at least two), with one width per point in `widths`, plus `depth`, `flowSpeed`, and a `color`.

A **terrain** is a grid of `width` by `depth` cells, `cellSize` world units apart, starting at `origin`. `heights` holds `width * depth` numbers in row-major order, so the cell at `x`, `z` is `heights[z * width + x]`. `layers` lists splat layers, texture layers that blend across the terrain: each has an `id`, a `textureRef`, one `weights` number from 0 to 1 per cell, and a `tileScale`.

A **prefab** is a reusable group saved as its own file: `schemaVersion`, `id`, `name`, `children`, and `bounds`. Each child has the same `modelRef` or `prefabRef` choice as an entity, plus a `transform`, a `tint`, and `tags`. Prefabs can contain prefabs. A cycle is reported as a warning and skipped.

**Your own data.** Unknown fields survive loading but are dropped when the file is saved. `load()` prints a warning for each one. Keep game-specific data in `metadata`, `userData`, and `tags`, which are saved.

**Versions.** A file with an older `schemaVersion` is migrated when it loads. Version 1 stored lights as entities with `userData.kind` set to `point_light`; the migration moves them into `lights`. A file with a newer version than the engine fails validation.

The next snippet builds a document in code, validates it, and saves it:

```ts
import { WorldData } from '@bornengine/engine';
import type { LightData } from '@bornengine/engine';

const level = WorldData.create('level-01', 'First level');
const document = level.document;

if (document !== null) {
  document.entities.push(WorldData.createEntity('ent_0001', 'models/tree_oak.glb', [4, 0, -6]));
  const lantern: LightData = {
    id: 'light_0001',
    name: 'Lantern',
    kind: 'point',
    position: [0, 3, 0],
    color: [1, 0.85, 0.55],
    intensity: 2,
    range: 12,
  };
  document.lights.push(lantern);
}

const result = level.validate();
if (!result.ok) {
  console.error(result.errors.join('\n'));
} else {
  const saved = level.save('assets/worlds/level-01.world.json');
  if (!saved.ok) console.error(saved.errors.join('\n'));
}
```

`validate()` returns `{ ok, errors }` and checks the version, the ids, the vectors, the entity references, the terrain size, and the lights. `save(path?)` stamps the current `schemaVersion`, validates, and writes the file. Without `path`, it writes to the path the document was loaded from. `save` writes `<path>.tmp` first and reads it back, copies the old file to `<path>.bak`, and then writes `<path>`, so a failed write leaves a good copy behind. Add `*.tmp` and `*.bak` to your ignore file if you keep worlds in version control.

Pure helpers on `WorldData` do not need a `Game`: `create(id, name)`, `createEntity(id, modelRef, position)`, `migrate(document)`, `validateDocument(document)`, `serialize(document)`, `validatePrefab(prefab)`, and `migratePrefab(prefab)`. For terrain: `createDefaultTerrain()` returns a flat 128 by 128 grid centered on the origin, `sampleTerrain(terrain, x, z)` returns the interpolated surface height at a world position (positions outside the grid use the nearest edge cell), `createTerrainLayer(terrain, id, textureRef, tileScale)` returns an empty layer, and `quantizeWeight(weight)` rounds a weight to three decimals.

## Loading and instantiation

`new WorldData(path)` reads nothing until you call `load()`. `load()` returns `true` on success. On failure it returns `false` and `error` explains why: the file is empty or missing, the JSON is invalid, or validation failed. After loading, `document` holds the `WorldDocument`, and `name`, `id`, and `isLoaded` summarize it. You can also pass a `WorldDocument` object to the constructor instead of a path.

`data.instantiate(game, options)` creates scene nodes and returns a `WorldInstance`. The options are:

| Option | Meaning |
| --- | --- |
| `getModel(path)` | Required. Return the loaded `Model` for a `modelRef`, or `null`. The model must belong to the same `Game`. An entity whose model is `null` or not loaded is skipped with a warning. |
| `prefabs` | A `PrefabLibrary`. Without it, entities that use `prefabRef` are skipped with a warning. |

Check the instance before you use it:

| Member | Meaning |
| --- | --- |
| `error` | `null` on success. The message says the data was not loaded or the game was not ready. |
| `warnings` | Problems that did not stop the load: unknown models, missing prefabs, prefab cycles, and a water volume or river that failed to build. |
| `isLoaded` | `true` when the instance was created without an error and has not been disposed. |
| `entityNodes` | A list of `{ id, node }` for every entity that was placed. |
| `getEntityNode(id)` | The `SceneNode` of one entity, or `null`. |
| `terrain`, `water`, `rivers` | The nodes for the terrain, the water volumes, and the rivers. |

What `instantiate` builds:

- The terrain becomes one node. It is a mesh whose vertex colors tint by layer weight. The `textureRef` of a layer is stored but not loaded: the engine does not texture the terrain from it, so a game that wants textures must apply them itself.
- Each model entity becomes one node that shows the first mesh of its model, placed with the entity's transform and tint.
- Each prefab entity becomes a group node at the entity's transform, plus one child node per model in the prefab. The children get the prefab's own child transforms and are linked to the group node. The renderer does not combine parent and child transforms (see [Scene graph](../scene/)), so check prefab placement in a small test world before you rely on it, and move the child nodes, not the group node, if you move a prefab at run time.
- Water volumes and rivers become nodes with a water material.
- The environment lights the first frame, and shadows are switched on or off from `environment.shadowsEnabled`. Lighting for later frames needs `applyLighting`, described below.

Nodes are ordinary `SceneNode` objects, so you can hide or move them with that API.

```ts
import { Colors, Game, PrefabLibrary, WorldData, WorldInstance } from '@bornengine/engine';
import type { Camera3D, WorldDocument } from '@bornengine/engine';

const camera: Camera3D = {
  position: { x: 0, y: 12, z: 24 },
  target: { x: 0, y: 0, z: 0 },
  up: { x: 0, y: 1, z: 0 },
  fovy: 60,
  projection: 'perspective',
};

class WorldGame extends Game {
  private instance: WorldInstance | null = null;
  private document: WorldDocument | null = null;

  constructor() {
    super({ window: { title: 'World', width: 1024, height: 576 }, renderMode: '3d' });
  }

  protected override onStart(): void {
    const data = new WorldData('assets/worlds/level-01.world.json');
    if (!data.load()) throw new Error(data.error ?? 'World load failed');

    const prefabs = new PrefabLibrary();
    try {
      prefabs.load('assets/prefabs/small_house.prefab.json');
    } catch (error) {
      console.error(String(error));
    }

    const instance = data.instantiate(this, {
      getModel: (path) => this.assets.loadModel(path),
      prefabs,
    });
    if (instance.error !== null) throw new Error(instance.error);
    for (const warning of instance.warnings) console.warn(warning);

    this.instance = instance;
    this.document = data.document;
  }

  protected override render(): void {
    const sky = this.document === null ? [0.5, 0.7, 0.9] : this.document.environment.skyColor;
    this.renderer.clear({ r: Math.floor(sky[0] * 255), g: Math.floor(sky[1] * 255), b: Math.floor(sky[2] * 255), a: 255 });
    if (this.instance !== null) this.instance.applyLighting();
    if (this.renderer.begin3D(camera)) this.renderer.end3D();
    this.renderer.drawText('World loaded', { x: 16, y: 16 }, 20, Colors.WHITE);
  }
}

new WorldGame().run();
```

`getModel` calls `this.assets.loadModel`, which caches by path, so many entities that use one model share one `Model`. The example clears the screen with `environment.skyColor` because `applyLighting` does not draw the sky.

`PrefabLibrary` holds prefabs by id. `load(path)` reads a `.prefab.json` file, registers it, and returns it. It **throws** when the file is missing or invalid, so wrap it in `try` as above. `register(prefab)` adds a prefab you built in code and returns `false` if it is invalid. Other members: `get(id)`, `create(id, name)`, `save(path, prefab)`, and `size`.

## Environment and ownership

**Lighting runs every frame.** Call `instance.applyLighting()` once per frame, before you draw. It sets the ambient light, the sun, the point lights from `lights`, and the fog. The renderer clears its lighting at the start of each frame, so a world lit once at load is dark from the second frame on. `applyLighting` returns `false` if the instance is not loaded.

What `applyLighting` reads from `environment`:

- `ambientColor` and `ambientIntensity` set the ambient light.
- `sunDirection`, `sunColor`, and `sunIntensity` set the sun.
- `fogColor` and `fogEnd` set the fog. The engine fog is exponential, so the density is chosen to reach about 95 percent fog at `fogEnd`. `fogStart` is stored but not used.
- Shadows are not changed by `applyLighting`. `instantiate` sets them once.
- `skyColor` is not applied. Use it as the clear color.

**Ownership.**

- A `WorldInstance` owns the nodes it created. `dispose()` disposes them, and it is safe to call twice. Call it when you replace the level.
- The instance does not own the models that `getModel` returned. They stay in the asset scope that loaded them, and the scope releases them. With `game.assets` they live until shutdown. To free them with the level, load them through a `Scene`'s `assets`.
- The instance is registered with the game, so shutdown disposes it if you did not.
- An instance works only with the `Game` that created it. Models and nodes from another game are refused.
- `WorldData` has no native resources. It is plain data, and you can edit `document` freely and save it again.

## Next steps

- [Scene graph](../scene/) covers the `SceneNode` API that the instance's nodes use.
- [Models](../models/) covers loading the models that a world places.
- [Assets and worlds guide](../../guides/assets-and-worlds/) puts worlds and assets together.
- [World format guide](../../guides/world-format/) describes the files for editor authors.
