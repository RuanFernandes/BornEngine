---
title: World2D API
description: Load, validate, convert, and save the 2D world JSON format that the Tiled importer writes.
section: API
order: 44
---

A **World2D document** is a JSON file that describes a 2D level: tilesets, tile layers, and object layers. Its `format` field is `"bornengine.world2d"`, and by convention its name ends in `.world2d.json`.

If you draw your maps in Tiled, the CLI writes this file for you:

```sh
bornengine import tiled assets/level.tmx --output assets/level.world2d.json
```

See [Import](../../cli/import/) for what the importer accepts. This page covers what happens next: loading the file into a scene, validating it, and saving it back. The names below come from `@bornengine/engine/world2d`. The package root exports them as well.

This format is separate from the 3D `WorldData` format. For 3D levels, see [World data](../world/).

## The file format

The importer writes a **version 1** document. Every field is present, vectors are `{ x, y }` objects, and tile cells are objects. This is a small complete document:

```json
{
  "format": "bornengine.world2d",
  "version": 1,
  "id": "cave",
  "name": "Cave",
  "assets": ["assets/tiles.png"],
  "tilesets": [
    {
      "id": "tiles",
      "image": "assets/tiles.png",
      "tileWidth": 16,
      "tileHeight": 16,
      "columns": 2,
      "tileCount": 4,
      "margin": { "x": 0, "y": 0 },
      "spacing": { "x": 0, "y": 0 },
      "tiles": [
        { "tileId": 0, "collision": { "x": 0, "y": 0, "width": 16, "height": 16 }, "properties": {} }
      ]
    }
  ],
  "layers": [
    {
      "id": "layer-1",
      "type": "tilemap",
      "name": "Ground",
      "visible": true,
      "opacity": 1,
      "offset": { "x": 0, "y": 0 },
      "parallax": { "x": 1, "y": 1 },
      "width": 3,
      "height": 1,
      "tileSize": { "x": 16, "y": 16 },
      "data": [
        { "tilesetId": "tiles", "tileId": 0, "flipX": false, "flipY": false, "flipDiagonal": false },
        { "tilesetId": "tiles", "tileId": 0, "flipX": false, "flipY": false, "flipDiagonal": false },
        { "tilesetId": "tiles", "tileId": 1, "flipX": true, "flipY": false, "flipDiagonal": false }
      ]
    },
    {
      "id": "layer-2",
      "type": "objects",
      "name": "Collision",
      "visible": true,
      "opacity": 1,
      "offset": { "x": 0, "y": 0 },
      "parallax": { "x": 1, "y": 1 },
      "objects": [
        {
          "id": "object-1",
          "name": "Floor",
          "type": "collision",
          "position": { "x": 0, "y": 16 },
          "rotation": 0,
          "size": { "x": 48, "y": 8 },
          "origin": { "x": 0, "y": 0 },
          "visible": true,
          "tags": [],
          "properties": {},
          "components": [
            {
              "kind": "physicsBody2D",
              "data": { "type": "static", "shape": { "type": "box", "width": 48, "height": 8 }, "isSensor": false, "layer": 1, "mask": 2147483647 }
            }
          ]
        }
      ]
    }
  ],
  "metadata": {}
}
```

What each part means:

- A **tileset** describes one atlas image, a single image that holds many tiles, cut into a grid of `tileWidth` by `tileHeight` pixels, with `columns`, `tileCount`, `margin`, and `spacing`. Tile ids start at 0 and run left to right, then top to bottom. `tiles` lists per-tile extras: a `collision` rectangle and typed `properties` (`string`, `int`, `float`, `bool`, `color`, or `file`).
- A **tilemap layer** has `width` and `height` in cells and a `tileSize` in pixels. `data` lists the cells row by row. A cell is `null` when empty, or an object with a `tilesetId`, a zero-based `tileId`, and three flip flags.
- An **object layer** holds `objects`. Each object has a `position`, a `rotation` in degrees, a `size`, an `origin`, a `type` string, `tags`, `properties`, and a list of `components`. A component is `{ kind, data }`.
- Every layer has `visible`, `opacity`, `offset`, `parallax`, and optional `properties`.
- `assets` lists the files the map refers to, as project-relative paths with forward slashes.

The engine has two built-in component kinds. `spriteRenderer` draws a tile as a sprite: `tilesetId`, `tileId`, and optional `flipX`, `flipY`, `size`, `pivot`, and `tint`. `physicsBody2D` creates a 2D physics body: `type` (`static`, `dynamic`, or `kinematic`), a `shape` (a `box` with `width` and `height`, or a `circle` with `radius`), `isSensor`, `layer`, and `mask`. The importer turns every Tiled rectangle whose class is `collision` into a static `physicsBody2D` box. Other Tiled objects become plain objects with no components. Their `type`, `tags`, and `properties` stay in the document.

**Versions.** The importer writes version 1. The engine reads version 1 and the compact version 2 that [Saving](#saving) describes. A version 1 file is strict: every field must be present, and a hand-written file must spell out values such as `margin` and `spacing` as `{ x, y }` objects. Version 2 may omit fields that have defaults. After loading, the in-memory document always has the expanded shape and `version: 2`.

## Loading a map

`World2DLoader` turns a document into game objects inside a scene. Read [Limits](#limits) before you start: in engine 0.18.2 a tile layer that mixes empty cells and tiles does not load.

```ts
import { Colors, Game, PhysicsWorld2D, Scene, SpriteSheet } from '@bornengine/engine';
import type { SpriteFrame } from '@bornengine/engine';
import { formatWorld2DDiagnostics, World2DLoader } from '@bornengine/engine/world2d';
import type { World2DTilesetData } from '@bornengine/engine/world2d';

const MAP_PATH = 'assets/level.world2d.json';

class Level extends Scene {
  readonly error: string | null;

  constructor(game: Game, source: string, physics: PhysicsWorld2D) {
    super({ name: 'level' });
    const sheets = new Map<string, SpriteSheet>();
    const loader = new World2DLoader(undefined, {
      physicsWorld2D: physics,
      resolveSpriteFrame: (tileset: World2DTilesetData, tileId: number, imagePath: string): SpriteFrame | null => {
        let sheet = sheets.get(tileset.id);
        if (sheet === undefined) {
          const texture = this.assets.loadTexture(imagePath);
          if (texture === null || !texture.isLoaded) return null;
          sheet = new SpriteSheet(texture, {
            frameWidth: tileset.tileWidth,
            frameHeight: tileset.tileHeight,
            margin: tileset.margin,
            spacing: tileset.spacing,
          });
          sheets.set(tileset.id, sheet);
        }
        return sheet.gridFrame(tileId % tileset.columns, Math.floor(tileId / tileset.columns));
      },
    });
    const result = loader.loadJSON(source, this);
    this.error = result.ok ? null : formatWorld2DDiagnostics(result.diagnostics);
  }
}

class MapGame extends Game {
  private readonly physics = new PhysicsWorld2D(this);

  constructor() {
    super({ window: { title: 'World2D', width: 960, height: 540 }, renderMode: '2d' });
  }

  protected override onStart(): void {
    const source = this.input.readFile(MAP_PATH);
    if (source.length === 0) throw new Error(`Could not read ${MAP_PATH}`);
    const level = new Level(this, source, this.physics);
    if (level.error !== null) {
      level.unload();
      throw new Error(level.error);
    }
    this.scenes.changeTo(level);
  }

  protected override loop(deltaTime: number): void {
    this.physics.step(deltaTime);
    this.scenes.update(deltaTime);
  }

  protected override render(): void {
    this.renderer.clear(Colors.DARKBLUE);
    super.render();
  }
}

new MapGame().run();
```

`new World2DLoader(registry?, options?)` takes an optional [component registry](#custom-components) and these options:

| Option | Meaning |
| --- | --- |
| `documentRoot` | A folder that is put in front of every asset path in the map. The default is an empty string, so paths stay relative to the project folder. |
| `resolveSpriteFrame(tileset, tileId, imagePath)` | Returns the sprite frame for one tile, or `null`. `imagePath` is the tileset image joined to `documentRoot`. Required when the map has any tiles or `spriteRenderer` components. |
| `physicsWorld2D` | A ready `PhysicsWorld2D` from the same game. Required when any object has a `physicsBody2D` component, which is every Tiled `collision` object. |

Two methods load a map into a `GameScene` or a `Scene`:

- `load(input, scene, documentRoot?)` takes a parsed JSON value.
- `loadJSON(text, scene, documentRoot?)` takes the file text. Read the text with `game.input.readFile(path)`.

Both return a `World2DLoadResult`:

| Field | Meaning |
| --- | --- |
| `ok` | `true` when everything was created and attached. |
| `diagnostics` | A list of `{ path, code, message }`. Empty on success. |
| `document` | The expanded `World2DDocument` on success, otherwise `null`. |
| `instances` | One entry for every game object that was created: `sourceId`, `sourceKind` (`'object'` or `'tilemap'`), `tilesetId` (tilemaps only), and `gameObject`. |

`formatWorld2DDiagnostics(diagnostics)` turns the list into text such as `/layers/0/data/0 [asset_resolver_missing]: Loading this descriptor requires a sprite-frame resolver.`

**The load is all or nothing.** The loader checks the whole document first. If anything fails, it adds nothing to the scene and returns the diagnostics. On success it attaches every object in one step, so each `onAwake` sees the whole level. Common failures:

| Code | Cause |
| --- | --- |
| `invalid_json` | `loadJSON` got text that is not JSON. |
| `component_factory_missing` | A component `kind` has no factory in the registry. |
| `asset_resolver_missing` | The map has tiles but no `resolveSpriteFrame`. |
| `sprite_frame_missing` | Your resolver returned `null` for a tile. |
| `physics_world_missing` | A `physicsBody2D` needs `physicsWorld2D`, and none was given or it is not ready. |
| `physics_world_mismatch` | The physics world belongs to a different game than the scene. |
| `sprite_frame_game_mismatch` | A frame's texture belongs to a different game than the scene. |

**What is created.**

- Each tile layer becomes one game object per tileset that it uses, named `<layer name> (<tileset id>)`, placed at the layer's `offset`, with a `Tilemap` component. The layer's `visible` and `opacity` apply, and the flip flags are honored. All frames of one tileset must come from one `SpriteSheet`, so create the sheet once per tileset, as the example does.
- Each object becomes a game object named after the object, placed at its `position` plus the layer `offset`, rotated by `rotation` degrees about the Z axis, and active when both the layer and the object are visible. A `spriteRenderer` descriptor uses the object's `size` and `origin` for the sprite size and pivot unless the descriptor sets its own.
- The object's `type`, `tags`, and `properties` are not copied to the game object. Read them from `result.document`.

To find the game objects for a kind of object, match `instances` against the document by id:

```ts
import type { GameObject } from '@bornengine/engine';
import type { World2DLoadResult } from '@bornengine/engine/world2d';

export function findObjectsByType(result: World2DLoadResult, type: string): GameObject[] {
  const found: GameObject[] = [];
  if (result.document === null) return found;
  for (const layer of result.document.layers) {
    if (layer.type !== 'objects') continue;
    for (const object of layer.objects) {
      if (object.type !== type) continue;
      for (const instance of result.instances) {
        if (instance.sourceKind === 'object' && instance.sourceId === object.id) found.push(instance.gameObject);
      }
    }
  }
  return found;
}
```

## Validating and converting

`validateWorld2D(input)` accepts any value and returns `{ ok, diagnostics }`. It reads version 1 and version 2. A path in a diagnostic points into the JSON, for example `/layers/0/data/3/tilesetId`.

`migrateWorld2D(input)` returns `{ ok, diagnostics, document }`. The `document` is the expanded in-memory form with `version: 2`. Your input is not changed. `normalizeWorld2DStorage` is the function behind both calls.

```ts
import { formatWorld2DDiagnostics, migrateWorld2D, serializeWorld2D, validateWorld2D } from '@bornengine/engine/world2d';
import type { Game } from '@bornengine/engine';

export function compactMap(game: Game, from: string, to: string): boolean {
  const text = game.input.readFile(from);
  if (text.length === 0) return false;
  const input: unknown = JSON.parse(text);

  const validation = validateWorld2D(input);
  if (!validation.ok) {
    console.error(formatWorld2DDiagnostics(validation.diagnostics));
    return false;
  }

  const migrated = migrateWorld2D(input);
  if (migrated.document !== null) console.log(`${migrated.document.layers.length} layers in ${migrated.document.name}`);

  const saved = serializeWorld2D(input, { mode: 'compact', effort: 'max' });
  if (!saved.ok) {
    console.error(formatWorld2DDiagnostics(saved.diagnostics));
    return false;
  }
  return game.input.writeFile(to, saved.json);
}
```

## Saving

`serializeWorld2D(input, options?)` returns `{ ok, diagnostics, json }`. It accepts an expanded document or compact storage. It writes **version 2**. The options are:

| Option | Values | Meaning |
| --- | --- | --- |
| `mode` | `'compact'` (default), `'readable'` | Compact output is minified and leaves out default values. Readable output is indented, with tile data one row per line. |
| `effort` | `'max'` (default), `'fast'` | `'max'` tries every tile-grid encoding. `'fast'` skips the LZ encoding, which suits frequent saves. |

The excerpt above becomes this in compact mode. The engine writes it on a single line. It is indented here to read it:

```json
{
  "format": "bornengine.world2d",
  "version": 2,
  "id": "cave",
  "name": "Cave",
  "size": [3, 1],
  "tileSize": [16, 16],
  "tilesets": [
    { "id": "tiles", "image": "assets/tiles.png", "columns": 2, "tileCount": 4, "tiles": [{ "tileId": 0, "collision": [0, 0, 16, 16] }] }
  ],
  "layers": [
    { "id": "layer-1", "name": "Ground", "type": "tilemap", "data": [1, 1, -17] },
    {
      "id": "layer-2",
      "name": "Collision",
      "type": "objects",
      "objects": [
        {
          "id": "object-1",
          "name": "Floor",
          "type": "collision",
          "position": [0, 16],
          "size": [48, 8],
          "components": [
            { "kind": "physicsBody2D", "data": { "isSensor": false, "layer": 1, "mask": 2147483647, "shape": { "height": 8, "type": "box", "width": 48 }, "type": "static" } }
          ]
        }
      ]
    }
  ]
}
```

What changed:

- Known vectors are `[x, y]` tuples and rectangles are `[x, y, width, height]`.
- Values that equal the defaults are left out: a `name` equal to the `id`, `visible: true`, `opacity: 1`, zero `offset`, `parallax` of 1, empty `tags`, `properties`, and `metadata`, and a tileset `tileSize` equal to the map `tileSize`. The `assets` list is rebuilt from tileset images and `file` properties, and extra entries are kept.
- Tile cells are stored as numbers. `0` is an empty cell. The tilesets are numbered in order, starting at 1: a tile has the code `first code of its tileset + tileId`. A flipped tile is stored as the negative number `-(code * 8 + flags)`, where the flag values are 1 for `flipX`, 2 for `flipY`, and 4 for `flipDiagonal`. In the example, the tileset has 4 tiles, so tile 1 has the code 2, and tile 1 flipped horizontally is `-(2 * 8 + 1)`, which is `-17`.

For large maps the serializer picks the smallest encoding for each tile layer. The `data` field then takes one of these shapes:

| Encoding | `data` shape | Meaning |
| --- | --- | --- |
| Dense | `[code, ...]` | One number per cell. |
| RLE | `{ "encoding": "rle", "values": [count, code, ...] }` | Runs of equal codes, counted across row ends. |
| Sparse | `{ "encoding": "sparse", "base": code, "values": [gap, code, ...] }` | A common code fills the grid, and each pair sets one different cell after skipping `gap` cells. A missing `base` means 0. |
| Bits | `{ "encoding": "bits", "palette": [code, ...], "values": "Base64" }` | Palette indexes packed into bytes. |
| LZ | `{ "encoding": "lz", "palette": [code, ...], "values": "Base64" }` | The same packed bytes after compression. |

When two encodings have the same size, the earlier one in the table wins. A tile layer can have up to 1,000,000 cells. The loader and validator check dimensions, run totals, positions, palette indexes, Base64, and sizes before they build cells. `readable` mode always writes the dense form.

Map editors and converters can use `@bornengine/engine/world2d/editor`. It exports the validation, migration, and serialization functions, plus the tile codebook and grid codec.

## Custom components

The Tiled importer only creates the built-in `physicsBody2D` kind. For other kinds, such as a spawn marker you add to a map by hand or with another program, register a **factory**. The loader calls it for each component descriptor of that kind and attaches the result.

```ts
import { GameComponent } from '@bornengine/engine';
import { World2DComponentRegistry, World2DLoader } from '@bornengine/engine/world2d';

class SpawnPoint extends GameComponent {
  readonly team: string;

  constructor(team: string) {
    super();
    this.team = team;
  }
}

const registry = new World2DComponentRegistry();
const registered = registry.registerComponentFactory('gameplay.spawn', (data, context) => {
  if (typeof data.team !== 'string') {
    return { path: '', code: 'invalid_spawn', message: `Spawn "${context.object.id}" needs a team name.` };
  }
  return new SpawnPoint(data.team);
});

export const loader = new World2DLoader(registry);
console.log(registered, registry.hasComponentFactory('gameplay.spawn'));
```

`registerComponentFactory(kind, factory)` returns `false` and registers nothing when `kind` is empty or only spaces, when it is one of the built-in kinds (`spriteRenderer` or `physicsBody2D`), or when the kind already has a factory. `hasComponentFactory(kind)` checks for one.

A factory receives two arguments and returns a `GameComponent` or a diagnostic:

- `data` is a copy of the descriptor's data, so you can keep it.
- `context` holds the `document`, the `documentRoot`, the destination `scene`, the `layer`, the `object`, and `resolveAssetPath(path)`. That function returns the path joined to `documentRoot` only for paths listed in the document's `assets`, and `null` for anything else.

A diagnostic you return is added to the result, and the load fails. If a factory throws, the load fails with `component_factory_failed`. If it returns anything else, it fails with `invalid_factory_result`.

## Limits

- **Tile layers with empty cells fail to load.** In engine 0.18.2, a tile layer that has both empty cells and tiles fails with `tilemap_construction_failed` and the message `Tilemap cell flip flags must be boolean.` A layer where every cell holds a tile loads. Most Tiled layers have empty cells, so load only the object layers with the loader and build the tile layers yourself. `withoutTileLayers` below removes the tile layers from the document before you pass it to `loader.load(withoutTileLayers(text), scene)`, and `addTileLayers` builds them for a map with one tileset.
- `parallax` is stored and saved, but the loader does not apply it.
- A `spriteRenderer` descriptor cannot use `flipDiagonal`. Tile cells can use all three flips.
- Only `spriteRenderer` and `physicsBody2D` are built in. Any other kind needs a factory, or the load fails with `component_factory_missing`.
- The scene, the sprite sheets, and the physics world must belong to the same `Game`.

```ts
import { GameObject, Tilemap } from '@bornengine/engine';
import type { Scene, SpriteSheet, TilemapCellFlip, TilemapTileDefinition } from '@bornengine/engine';
import { migrateWorld2D } from '@bornengine/engine/world2d';

export function withoutTileLayers(source: string): unknown {
  const document = JSON.parse(source) as { layers: Array<{ type: string }> };
  return { ...document, layers: document.layers.filter((layer) => layer.type !== 'tilemap') };
}

export function addTileLayers(scene: Scene, source: string, sheet: SpriteSheet): void {
  const migrated = migrateWorld2D(JSON.parse(source));
  if (!migrated.ok || migrated.document === null) throw new Error('The map is not valid.');
  const tileset = migrated.document.tilesets[0];

  for (const layer of migrated.document.layers) {
    if (layer.type !== 'tilemap') continue;
    const tiles: TilemapTileDefinition[] = [];
    const data: number[] = [];
    const flips: TilemapCellFlip[] = [];

    for (const cell of layer.data) {
      if (cell === null) {
        data.push(0);
        flips.push({});
        continue;
      }
      if (cell.tilesetId !== tileset.id) throw new Error('This helper supports one tileset.');
      const id = cell.tileId + 1;
      if (!tiles.some((tile) => tile.id === id)) {
        const frame = sheet.gridFrame(cell.tileId % tileset.columns, Math.floor(cell.tileId / tileset.columns));
        if (frame === null) throw new Error(`Tile ${cell.tileId} is outside the atlas.`);
        tiles.push({ id, frame });
      }
      data.push(id);
      flips.push({ flipX: cell.flipX, flipY: cell.flipY, flipDiagonal: cell.flipDiagonal });
    }

    const map = new Tilemap(sheet, {
      columns: layer.width,
      rows: layer.height,
      tileWidth: layer.tileSize.x,
      tileHeight: layer.tileSize.y,
      tiles,
      data,
      cellFlips: flips,
      visible: layer.visible,
      tint: { r: 255, g: 255, b: 255, a: Math.round(layer.opacity * 255) },
    });
    const object = new GameObject({ name: layer.name, position: { x: layer.offset.x, y: layer.offset.y, z: 0 } });
    object.addComponent(map);
    scene.addNode(object);
  }
}
```

The helper stores tile `n` as tile id `n + 1`, because id 0 means an empty cell in a `Tilemap`. See [Tilemap](../tilemap/) for the component.

## Next steps

- [Import](../../cli/import/) lists what the Tiled importer accepts and rejects.
- [Tilemap](../tilemap/) covers the component that draws tile layers.
- [Physics 2D](../physics2d/) covers the bodies that `physicsBody2D` creates.
- [2D production workflow](../../guides/2d-production-workflow/) puts maps, physics, and saving together.
