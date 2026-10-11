---
title: World format
description: Read the versioned JSON formats for 2D maps, 3D worlds, and prefabs, and load, check, and save them safely.
section: Guides
order: 62
---

BornEngine stores levels as JSON files that editors and your game both read. Three file types exist, and they do not overlap:

| File | Describes | Version field | Engine API |
| --- | --- | --- | --- |
| `*.world2d.json` | A 2D map: tile layers and object layers | `"format": "bornengine.world2d"` and `"version": 2` | `validateWorld2D`, `migrateWorld2D`, `serializeWorld2D`, `World2DLoader` |
| `*.world.json` | A 3D level: environment, terrain, entities, lights, water, rivers | `"schemaVersion": 2` | `WorldData`, `WorldInstance` |
| `*.prefab.json` | A reusable group of 3D model placements | `"schemaVersion": 2` | `PrefabLibrary` |

Every file carries a version so that older files can be upgraded and newer files are refused instead of misread. This guide covers the 2D format first, then the 3D world and prefab formats.

## 2D worlds

A 2D world holds tile layers and object layers over one or more tile images. You can write one by hand, draw it in the BornEngineTools map editor for VS Code, or convert a Tiled map with `bornengine import tiled`.

Two versions exist:

- **Version 2** is the compact storage format. Engine 0.18.2 writes it: `serializeWorld2D` always produces version 2, and so does the map editor. Engine releases from 0.16.1 can load it.
- **Version 1** is the older expanded form, where every tile cell is an object and every vector is `{ x, y }`. It has no defaults, so every field must be present and valid. `bornengine import tiled` writes it today. The engine still reads it, and the editor upgrades it to version 2 when you save.

The CLI is behind the engine here. CLI 0.7.1 accepts only version 1 in its asset audit, so a project that contains an engine-written version 2 map fails `bornengine build`, `run`, and `dev`. See Limits to know, below.

The loader does not care which version a file has. `migrateWorld2D` turns both into the same expanded in-memory `World2DDocument` with `version: 2`.

### A version 2 file

This map has two tile images, a 6 by 4 floor layer, and one object layer with a spawn point:

```json
{
  "format": "bornengine.world2d",
  "version": 2,
  "id": "moonlit-pier",
  "name": "Moonlit Pier",
  "size": [6, 4],
  "tileSize": [32, 32],
  "tilesets": [
    { "id": "ground", "image": "assets/ground.png", "columns": 4, "tileCount": 16 },
    { "id": "props", "image": "assets/props.png", "columns": 2, "tileCount": 4 }
  ],
  "layers": [
    {
      "id": "floor",
      "type": "tilemap",
      "data": [1, 1, 1, 1, 1, 1, 2, 2, 2, 2, 2, 2, 1, 1, 17, 1, 1, 1, 3, 3, -137, 3, 3, 3]
    },
    {
      "id": "actors",
      "type": "objects",
      "objects": [
        {
          "id": "start",
          "type": "spawn",
          "position": [48, 64],
          "size": [24, 24],
          "tags": ["player"],
          "properties": { "health": { "type": "int", "value": 3 } },
          "components": [
            { "kind": "spriteRenderer", "data": { "tilesetId": "props", "tileId": 0 } },
            { "kind": "game.spawn-point", "data": { "team": "blue" } }
          ]
        }
      ]
    }
  ],
  "metadata": { "author": "docs" }
}
```

Fields that you leave out take defaults, so a hand-written file stays short. Vectors are `[x, y]` pairs and rectangles are `[x, y, width, height]`. The engine also accepts `{ x, y }` objects.

### Top-level fields

| Field | Meaning |
| --- | --- |
| `format` | Must be `bornengine.world2d`. |
| `version` | `2` for compact storage, or `1` for the expanded form. |
| `id` | A non-empty string. Required. |
| `name` | Display name. Defaults to `id`. |
| `size` | Default grid size of tile layers, as `[columns, rows]`. A layer can set its own `size`. |
| `tileSize` | Default tile size in pixels, as `[width, height]`. A tileset or layer can set its own. |
| `assets` | Extra project-relative paths. Tileset images and `file` properties are added for you. |
| `tilesets` | The tile images. Required. |
| `layers` | The layers, drawn in order. Required. |
| `metadata` | Any JSON object. The engine does not read it. |

Paths are relative to the project root and use forward slashes. A path cannot start with `/`, contain `\`, `:`, or control characters, or have an empty, `.`, or `..` segment.

### Tilesets

| Field | Meaning |
| --- | --- |
| `id` | Unique, non-empty. Layers and objects refer to a tileset by this id. |
| `image` | Path of the tile image. The pixels stay in the image, never in the map. |
| `tileSize` | `[width, height]`. Optional when the map has a `tileSize`. |
| `columns`, `tileCount` | Positive integers. Both default to 1. |
| `margin`, `spacing` | `[x, y]` gaps in pixels, default `[0, 0]`. |
| `tiles` | Optional per-tile data: `tileId`, an optional `collision` rectangle `[x, y, width, height]` inside the tile, and `properties`. |

The first tileset is the main source. Further tilesets are extra sources, such as another atlas or an image with one tile. Every tileset used in a layer must have the layer's tile size. Tile ids are zero-based.

### Layers

Every layer has an `id` (unique) and a `type` of `tilemap` or `objects`. These optional fields apply to both types: `name` (defaults to `id`), `visible` (true), `opacity` (0 to 1, default 1), `offset` (`[0, 0]`), `parallax` (`[1, 1]`), and `properties`.

A `tilemap` layer adds `size` and `tileSize`, which default to the map's values, and `data`, one number per cell in row-major order. The layer holds at most 1,000,000 cells.

An `objects` layer adds `objects`. Each object has:

| Field | Meaning |
| --- | --- |
| `id` | Unique across all object layers. |
| `name` | Defaults to `id`. |
| `type` | Any string. Your game decides what it means. |
| `position`, `size` | `[x, y]` and `[width, height]`. Required. Size cannot be negative. |
| `rotation` | Degrees, default 0. |
| `origin` | Pivot as `[x, y]` from 0 to 1, default `[0, 0]`. |
| `visible` | Default true. |
| `tags` | A list of strings. |
| `properties` | Named values, each `{ "type": "...", "value": ... }`. The types are `string`, `int`, `float`, `bool`, `color`, and `file`. A `color` is `#RRGGBB` or `#AARRGGBB`. A `file` is a project-relative path. |
| `components` | Descriptors `{ "kind": "...", "data": { ... } }` that the loader turns into components. |

The loader builds two component kinds itself. `spriteRenderer` takes `tilesetId`, `tileId`, and optional `flipX`, `flipY`, `size`, `pivot`, and `tint`. `physicsBody2D` takes `type` (`static`, `dynamic`, or `kinematic`), a `shape` (a box with `width` and `height`, or a circle with `radius`), and optional `isSensor`, `layer`, and `mask`; it needs a physics world in the loader options. Any other kind is yours: you register a factory for it.

### Tile data

Each cell is a number. `0` is empty. Tilesets get consecutive ranges of codes starting at 1, in the order they appear. In the file above, `ground` owns codes 1 to 16 and `props` owns 17 to 20, so `17` is the first `props` tile. A flipped tile is stored as the negative number `-(code * 8 + mask)`, where the mask adds 1 for a horizontal flip, 2 for a vertical flip, and 4 for a diagonal flip. `-137` is the first `props` tile flipped horizontally: `-(17 * 8 + 1)`.

A saved layer picks the smallest of five shapes for `data`:

| Shape | Example |
| --- | --- |
| Dense list | `[1, 1, 17, 0]` |
| Runs | `{ "encoding": "rle", "values": [count, code, ...] }` |
| Exceptions to one common code | `{ "encoding": "sparse", "base": code, "values": [gap, code, ...] }` |
| Packed palette indexes | `{ "encoding": "bits", "palette": [code, ...], "values": "<Base64>" }` |
| Compressed palette indexes | `{ "encoding": "lz", "palette": [code, ...], "values": "<Base64>" }` |

You can write a dense list by hand. The [World2D API](../../api/world2d/) describes each shape and the measured size savings.

### Check, upgrade, and save

`validateWorld2D(input)` never throws. It returns `ok` and a list of diagnostics. Each diagnostic has a JSON Pointer `path`, a stable `code`, and a `message`. `formatWorld2DDiagnostics` prints them as `/layers/0/data [tile_layer_length]: ...`. `migrateWorld2D(input)` returns `ok`, `diagnostics`, and a `document`. The document is the normalized version 2 form, built without changing the input, or `null` when the file is invalid.

`serializeWorld2D(document, options)` writes version 2. The default is minified JSON with the smallest `data` shapes (`mode: 'compact'`, `effort: 'max'`). `mode: 'readable'` writes indented JSON and plain dense rows, which is easier to review in a diff. `effort: 'fast'` skips the slowest compression for quick saves. It accepts a version 1 or version 2 document and returns `ok`, `diagnostics`, and the `json` text.

This function reads a map, checks it, and writes it back as version 2:

```ts
import { Game } from '@bornengine/engine';
import { formatWorld2DDiagnostics, serializeWorld2D, validateWorld2D } from '@bornengine/engine/world2d';

export function upgradeMap(game: Game, path: string): boolean {
  const text = game.input.readFile(path);
  if (text.length === 0) {
    console.error('Could not read ' + path);
    return false;
  }

  let input: unknown;
  try {
    input = JSON.parse(text);
  } catch (error) {
    console.error(path + ' is not valid JSON.');
    return false;
  }

  const check = validateWorld2D(input);
  if (!check.ok) {
    console.error(formatWorld2DDiagnostics(check.diagnostics));
    return false;
  }

  const saved = serializeWorld2D(input);
  if (!saved.ok) {
    console.error(formatWorld2DDiagnostics(saved.diagnostics));
    return false;
  }
  return game.input.writeFile(path, saved.json);
}
```

These diagnostics come up most often:

| Code | Meaning |
| --- | --- |
| `invalid_format` | `format` is not `bornengine.world2d`. A 3D `.world.json` file ends up here. |
| `unsupported_version` | `version` is not 1 or 2. |
| `missing_id`, `duplicate_id` | An id is empty, or two tilesets, layers, or objects share one. |
| `invalid_asset_path` | A path is absolute or uses `..`, backslashes, or a drive prefix. |
| `missing_asset` | In a version 1 file, a tileset image or `file` property is not in `assets`. |
| `unknown_tileset` | A cell or component names a tileset that does not exist. |
| `tile_id_out_of_range` | A tile id is below 0 or not below the tileset's `tileCount`. |
| `tile_size_mismatch` | A layer's `tileSize` differs from a tileset it uses. |
| `tile_layer_length`, `tile_grid_size_mismatch` | `data` has a different number of cells than `size` implies. |
| `tile_grid_too_large` | The layer has more than 1,000,000 cells. |
| `collision_out_of_bounds` | A tile collision rectangle does not fit inside the tile. |

### Load a map into a scene

`World2DLoader` validates a map, then builds its objects into a scene. You give it a function that turns a tile into a sprite frame, because only your game knows how its textures are owned. Each tile layer becomes one game object per tileset it uses, each with a tilemap component, and each map object becomes a game object with its components.

```ts
import { Game, Scene, SpriteSheet } from '@bornengine/engine';
import type { SpriteFrame } from '@bornengine/engine';
import { World2DLoader, formatWorld2DDiagnostics } from '@bornengine/engine/world2d';
import type { World2DTilesetData } from '@bornengine/engine/world2d';

class TownLevel extends Scene {
  private readonly sheets = new Map<string, SpriteSheet>();

  constructor(game: Game, mapPath: string) {
    super(game, { name: 'Town' });
    const loader = new World2DLoader(undefined, {
      resolveSpriteFrame: (tileset, tileId, imagePath) => this.frameFor(tileset, tileId, imagePath),
    });
    const result = loader.loadJSON(game.input.readFile(mapPath), this);
    if (!result.ok) console.error(formatWorld2DDiagnostics(result.diagnostics));
  }

  private frameFor(tileset: World2DTilesetData, tileId: number, imagePath: string): SpriteFrame | null {
    let sheet = this.sheets.get(tileset.id);
    if (sheet === undefined) {
      const texture = this.assets.loadTexture(imagePath);
      if (texture === null || !texture.isLoaded) return null;
      sheet = new SpriteSheet(texture, {
        frameWidth: tileset.tileWidth,
        frameHeight: tileset.tileHeight,
        margin: tileset.margin,
        spacing: tileset.spacing,
      });
      this.sheets.set(tileset.id, sheet);
    }
    return sheet.gridFrame(tileId % tileset.columns, Math.floor(tileId / tileset.columns));
  }
}

class TownGame extends Game {
  protected override onStart(): void {
    this.scenes.changeTo(new TownLevel(this, 'assets/maps/town.world2d.json'));
  }

  protected override loop(deltaTime: number): void {
    this.scenes.update(deltaTime);
  }
}

new TownGame().run();
```

The loader never half-builds a level. If validation, frame lookup, component creation, or attaching fails, it returns `ok: false` with diagnostics and none of the new objects reach the scene. Extra loader diagnostics include `asset_resolver_missing` (no `resolveSpriteFrame`), `sprite_frame_missing`, `component_factory_missing`, and `physics_world_missing`.

For custom component kinds, create a `World2DComponentRegistry`, call `registerComponentFactory(kind, factory)`, and pass it as the first argument of `World2DLoader`. A factory receives a copy of the descriptor's `data` and a context with the document, the scene, the layer, and the source object, so it can read the object's `type`, `tags`, and `properties`. It returns a component, or a diagnostic to stop the load. Built-in names `spriteRenderer` and `physicsBody2D` cannot be registered.

The loader applies layer offset, visibility, and opacity, object position and rotation, and tile flips. It does not apply `parallax`: the value stays in the document for your camera code. Tile cells support diagonal flips, but a `spriteRenderer` descriptor does not, and the loader reports `unsupported_sprite_flip`.

### Limits to know

- **The CLI asset audit accepts version 1 maps only.** The engine and the map editor write version 2, but CLI 0.7.1 stops with `unsupported world format version Some(2)` when a project contains a version 2 `.world2d.json` file. The error comes from `bornengine assets validate`, and also from `bornengine build`, `run`, and `dev`, which run the same audit first. `serializeWorld2D` has no option to write version 1. Until the CLI accepts version 2, keep maps in the version 1 form that `bornengine import tiled` writes, and do not save them from the map editor, which upgrades them.
- **Saved paths are plain text.** The format does not check that an image exists. `bornengine assets validate` does, for the maps it can read.
- **Saving is meant for editors.** `game.input.writeFile` resolves relative paths the way asset loads do. On iOS that is the app bundle, which a shipped app cannot normally write. In the browser it writes to local storage under that path, and `readFile` checks local storage before the served files.

## 3D worlds and prefabs

A `*.world.json` file describes one 3D level. A `*.prefab.json` file describes a reusable composite, such as a house made of walls and a roof. Both are pretty-printed JSON with `schemaVersion: 2`. Positions, colors, and vectors are plain number arrays.

### A world file

This file has the sky and sun settings, a tree, a prefab house, a lantern, and a water volume:

```json
{
  "schemaVersion": 2,
  "name": "Garden",
  "id": "garden",
  "bounds": {
    "min": [-50, -10, -50],
    "max": [50, 50, 50]
  },
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
      "modelRef": "assets/models/tree_oak.glb",
      "prefabRef": null,
      "transform": {
        "position": [4, 0, -2],
        "rotation": [0, 1.57, 0],
        "scale": [1, 1, 1]
      },
      "tint": null,
      "tags": ["climbable"],
      "userData": {
        "species": "oak"
      }
    },
    {
      "id": "ent_0002",
      "name": "house",
      "modelRef": null,
      "prefabRef": "small_house",
      "transform": {
        "position": [-8, 0, 3],
        "rotation": [0, 0, 0],
        "scale": [1, 1, 1]
      },
      "tint": [1, 0.9, 0.9, 1],
      "tags": [],
      "userData": {}
    }
  ],
  "lights": [
    {
      "id": "light_0001",
      "name": "Lantern",
      "kind": "point",
      "position": [0, 2, 0],
      "color": [1, 0.8, 0.5],
      "intensity": 1.5,
      "range": 12
    }
  ],
  "water": [
    {
      "id": "water_0001",
      "kind": "box",
      "center": [20, -0.5, 0],
      "size": [10, 2, 10],
      "surfaceHeight": 0,
      "color": [0.1, 0.4, 0.7, 0.6],
      "waveAmplitude": 0.05,
      "waveSpeed": 1
    }
  ],
  "rivers": [],
  "metadata": {
    "gameId": "garden-demo"
  }
}
```

The top-level blocks:

| Block | Purpose |
| --- | --- |
| `schemaVersion`, `name`, `id` | Version, display name, and a stable slug. `name` and `id` must not be empty. |
| `bounds` | The world's box as `min` and `max` points. Viewers use it to place a camera. |
| `environment` | Sky color, ambient light, the sun, fog, and whether shadows are on. |
| `terrain` | A heightmap, or `null` when the world has none. |
| `entities` | Placed models and prefabs. |
| `lights` | Point lights. |
| `water`, `rivers` | Water volumes and river ribbons. Both arrays are required, even when empty. |
| `metadata` | Your own data, as text values. |

Color components are numbers from 0 to 1. Rotation holds Euler angles in radians, applied in the order X, then Y, then Z, after scaling and before translation.

**Entities.** Each entity has an `id` that is unique in the file, a `name`, exactly one of `modelRef` (a model path) or `prefabRef` (a prefab id), a `transform` with `position`, `rotation`, and `scale`, an optional `tint` as four numbers (or `null`), `tags` (strings), and `userData` (named text values). Use `tags`, `userData`, and `metadata` for your own data. Their values must be strings, so store numbers as text.

**Lights.** A light has an `id`, a `name`, `kind` set to `point`, a `position`, a `color`, an `intensity`, and a `range` in world units. Beyond the range it adds no light. Only point lights exist. The sun and ambient light belong to `environment`.

**Water.** A volume has `kind` set to `box`, a `center`, a `size` (the full extents, not half extents), a `surfaceHeight`, a four-number `color`, and `waveAmplitude` and `waveSpeed`. The loader places the box using the x and z of `center`. Its top face sits at `surfaceHeight`, and it extends down by `size.y`. The y of `center` does not move it. Only boxes are supported.

**Rivers.** A river has `controlPoints` (at least two), `widths` (one per point; if fewer are given the last repeats), `depth` (how far the ribbon sits below the points), `flowSpeed`, and a four-number `color`. The ribbon follows a smooth Catmull-Rom curve through the points.

**Terrain.** `terrain` holds `width` and `depth` in cells, `cellSize`, an `origin` for the (0, 0) corner, `heights` (`width * depth` numbers in row-major order, index `z * width + x`), and `layers`. A layer has an `id`, a `textureRef`, `weights` (`width * depth` numbers from 0 to 1), and a `tileScale`. The loader builds a mesh from `heights` and tints it by layer weights. It does not apply the layer textures, so a game that wants textured splat terrain reads `textureRef` and draws it. `WorldData.sampleTerrain(terrain, x, z)` returns the height at a point.

### A prefab file

A prefab lists children, each with an `id` that is unique in the prefab, exactly one of `modelRef` or `prefabRef`, a `transform`, an optional `tint`, and `tags`. A prefab may contain other prefabs. `bounds` stores a cached box for previews.

```json
{
  "schemaVersion": 2,
  "id": "small_house",
  "name": "Small house",
  "children": [
    {
      "id": "wall_0",
      "modelRef": "assets/models/wall.glb",
      "prefabRef": null,
      "transform": {
        "position": [0, 0, 0],
        "rotation": [0, 0, 0],
        "scale": [1, 1, 1]
      },
      "tint": null,
      "tags": []
    },
    {
      "id": "roof",
      "modelRef": null,
      "prefabRef": "roof_tiles",
      "transform": {
        "position": [0, 2.5, 0],
        "rotation": [0, 0, 0],
        "scale": [1, 1, 1]
      },
      "tint": null,
      "tags": ["roof"]
    }
  ],
  "bounds": {
    "min": [-2, 0, -2],
    "max": [2, 3, 2]
  }
}
```

When the world places a prefab, the loader expands it into one scene node per model, all under a root node at the entity's transform. A child's `tint` replaces the tint of the entity or prefab above it. A prefab that contains itself, directly or through another prefab, is reported and skipped.

### Load a world

`WorldData` reads, checks, and instantiates a world. `PrefabLibrary` holds the prefabs a world may place. `getModel` is where you pick the asset scope and decide what a missing model means.

```ts
import { Colors, Game, PrefabLibrary, WorldData } from '@bornengine/engine';
import type { Camera3D, Model, WorldInstance } from '@bornengine/engine';

class WorldViewer extends Game {
  private instance: WorldInstance | null = null;
  private sky = Colors.BLACK;
  private readonly camera: Camera3D = {
    position: { x: 0, y: 12, z: 24 },
    target: { x: 0, y: 0, z: 0 },
    up: { x: 0, y: 1, z: 0 },
    fovy: 60,
    projection: 'perspective',
  };

  constructor() {
    super({ window: { title: 'World viewer', width: 1280, height: 720 }, targetFps: 60 });
  }

  protected override onStart(): void {
    const data = new WorldData('assets/worlds/garden.world.json');
    if (!data.load() || data.document === null) {
      console.error(data.error === null ? 'World load failed.' : data.error);
      this.stop();
      return;
    }

    const prefabs = new PrefabLibrary();
    try {
      prefabs.load('assets/prefabs/small_house.prefab.json');
    } catch (error) {
      console.error('Prefab load failed: ' + String(error));
    }

    const instance = data.instantiate(this, {
      getModel: (path: string): Model | null => {
        const model = this.assets.loadModel(path);
        return model !== null && model.isLoaded ? model : null;
      },
      prefabs,
    });
    if (instance.error !== null) {
      console.error(instance.error);
      this.stop();
      return;
    }
    for (const warning of instance.warnings) console.error(warning);

    const sky = data.document.environment.skyColor;
    this.sky = { r: Math.floor(sky[0] * 255), g: Math.floor(sky[1] * 255), b: Math.floor(sky[2] * 255), a: 255 };
    this.instance = instance;
  }

  protected override render(): void {
    this.renderer.clear(this.sky);
    if (this.instance === null) return;
    this.instance.applyLighting();
    if (this.renderer.begin3D(this.camera)) this.renderer.end3D();
  }

  protected override onStop(): void {
    if (this.instance !== null) this.instance.dispose();
  }
}

new WorldViewer().run();
```

Points to know about loading:

- **`load()` returns a boolean.** On failure it sets `data.error` instead of throwing. `load()` reads the file, upgrades older versions, and validates. `data.validate()` checks a document again, for example after you edit it.
- **A bad entity does not fail the load.** An entity whose model cannot be found, or whose prefab is missing, is skipped, and a message is added to `instance.warnings`. Always print them.
- **Call `applyLighting()` every frame.** The renderer clears its lights at the start of each frame. The call re-applies ambient light, the sun, the world's point lights, and fog. `instantiate()` applies the environment once, so the first frame looks right, but a game that never calls it again goes dark on frame two. Shadows are set when the world is instantiated.
- **Clear with the sky color.** `skyColor` is a 0 to 1 color that your game turns into the clear color, as the example does. The engine does not clear with it for you.
- **The instance owns the nodes it created.** `dispose()` removes them. It does not release the models that `getModel` returned. Those stay with the asset scope you loaded them from.
- **Draw with the camera open.** The world's nodes are retained scene nodes, so you do not draw them yourself. The example opens and closes a 3D pass each frame.

### Edit and save

`WorldData` can also change and write a document. `save()` checks the document, stamps the current `schemaVersion`, and writes it.

```ts
import { WorldData } from '@bornengine/engine';

export function addLamp(path: string): boolean {
  const data = new WorldData(path);
  if (!data.load() || data.document === null) return false;

  data.document.lights.push({
    id: 'light_0002',
    name: 'Lamp',
    kind: 'point',
    position: [0, 3, 0],
    color: [1, 0.9, 0.7],
    intensity: 1,
    range: 10,
  });

  const result = data.save();
  if (!result.ok) console.error(result.errors.join('\n'));
  return result.ok;
}
```

A save is careful because it replaces a level. It writes `<path>.tmp` and reads it back, copies the current file to `<path>.bak`, and then writes `<path>`. If the check fails, nothing is written. Add `*.tmp` and `*.bak` to your `.gitignore`. As with 2D maps, saving is meant for editors on desktop. In the browser the text goes to local storage.

### Versions and unknown fields

- A file with an older `schemaVersion` is upgraded when it loads. Version 1 stored point lights as entities with `userData.kind` set to `point_light`; the upgrade moves them into `lights`.
- A file with a newer `schemaVersion` fails validation. For a file at version 3 the message is `world.schemaVersion 3 is newer than engine version 2`. It is never read as if it matched.
- A field that the schema does not list loads without error, and the console prints a warning that names it. The saver writes only the known fields, so the field is lost on the next save. Put your own data in `metadata`, `userData`, or `tags`.

## Next steps

- [World2D API](../../api/world2d/) documents the tile codecs, the loader, and the size measurements.
- [World data API](../../api/world/) covers `WorldData` and `WorldInstance`.
- [Asset pipeline](../assets/) explains how the paths in these files resolve on each target.
- [2D production workflow](../2d-production-workflow/) takes a Tiled map to a packaged game.
- [Organize assets and worlds](../assets-and-worlds/) loads shared models and a world together.
