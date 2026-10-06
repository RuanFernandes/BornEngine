---
title: World2D API
description: Validate, migrate, serialize, and instantiate versioned 2D world documents.
section: API / World
order: 44
---

The `@bornengine/engine/world2d` module defines a versioned format for 2D tilemaps and object layers. It is separate from the 3D `WorldData` format. The in-memory `World2DDocument` stays expanded and editable; version 2 only changes how maps are stored on disk.

## Versions and migration

The engine reads both explicit version-1 maps and compact version-2 maps. `migrateWorld2D` returns a normalized version-2 document without changing its input. Opening an older map for reading does not rewrite its file; saving it from the editor writes version 2. Invalid version-1 data remains invalid and produces diagnostics instead of being silently repaired.

Maps written as version 2 require an engine release that supports the version-2 World2D storage contract. Projects using an older engine release must update the engine before loading those maps.

## Main and extra tile sources

`tilesets[0]` is the main source. Further entries are extra sources, such as another atlas or an image containing one tile. A source stores its image path and grid metadata; tile pixels remain in the image file and are never copied into the map JSON.

Tiles from different sources can share a tile layer when their cell dimensions match the layer's tile size. Each cell retains its stable `tilesetId` and local, zero-based `tileId` in memory. Changing the main source reorders the source descriptors; it does not change placed cells, flips, or geometry. Saving then regenerates compact numeric codes from the new source order.

## Version-2 tile codes

The stored grid is row-major. Each source receives a consecutive numeric range, starting at 1, in descriptor order. The empty cell is code `0`. An unflipped tile uses `sourceStart + tileId`. A flipped tile is stored as the negative value `-(globalTileCode * 8 + flipMask)`, where mask bits `1`, `2`, and `4` mean horizontal, vertical, and diagonal flip.

For example, with a 16-tile main source and a 4-tile extra source, the first main tile is `1`, the first extra tile is `17`, and the first extra tile with horizontal flip is `-137`. These numbers are storage codes, not public runtime tile IDs.

```json
{
  "format": "bornengine.world2d",
  "version": 2,
  "id": "town",
  "size": [4, 2],
  "tileSize": [16, 16],
  "tilesets": [
    { "id": "ground", "image": "assets/ground.png", "columns": 4, "tileCount": 16 },
    { "id": "details", "image": "assets/details.png", "columns": 2, "tileCount": 4 }
  ],
  "layers": [
    { "id": "floor", "type": "tilemap", "data": [1, 1, 17, 0, 2, 2, -137, 0] }
  ]
}
```

## Adaptive grid storage

The serializer measures each complete grid envelope, including its palette and encoded text, and picks the smallest supported representation. A layer can use a different representation from another layer.

| Encoding | `data` shape | Meaning |
| --- | --- | --- |
| Dense | `[code, ...]` | One number per cell |
| RLE | `{ "encoding": "rle", "values": [count, code, ...] }` | Consecutive runs, including across row boundaries |
| Sparse | `{ "encoding": "sparse", "base": code, "values": [gap, code, ...] }` | Fill with the common code, then apply exceptions; a missing `base` means 0 |
| Bits | `{ "encoding": "bits", "palette": [code, ...], "values": "Base64" }` | Palette indices packed into bytes |
| LZ | `{ "encoding": "lz", "palette": [code, ...], "values": "Base64" }` | Bounded LZ compression of the same packed palette indices |

Decoding validates dimensions, run totals, sparse positions, palette indices, Base64, padding, and LZ output bounds before creating cells. A tile layer can contain up to 1,000,000 cells. Codec selection is deterministic; size ties prefer Dense, RLE, Sparse, Bits, then LZ.

## Defaults and compact JSON

Compact output omits values that can be restored from the schema: default names, empty metadata, visible state, opacity, offsets, parallax, empty property/tag/component lists, zero margins and spacing, and other default geometry. Known vectors use `[x, y]` tuples and rectangles use `[x, y, width, height]` tuples. Tile source images and file-property paths are inferred into `assets`; extra declared assets are preserved.

The default serializer produces minified compact JSON with maximum codec effort. Readable mode emits formatted metadata and flat numeric Dense tile data, which is easier to inspect but larger. Fast effort considers the less expensive codecs and is intended for continuous editing.

```ts
import { serializeWorld2D, validateWorld2D } from '@bornengine/engine/world2d';
import type { World2DDocument } from '@bornengine/engine/world2d';

declare const document: World2DDocument;
const validation = validateWorld2D(document);
if (!validation.ok) {
  console.error(validation.diagnostics);
} else {
  const saved = serializeWorld2D(document, {
    mode: 'compact', // default; 'readable' writes numeric Dense grids
    effort: 'max',   // default; 'fast' favors edit latency
  });
  if (saved.ok) writeProjectFile('maps/level.world2d.json', saved.json);
}
```

## BornEngineTools save behavior

The VS Code map editor uses fast compact serialization for edits. After 250 ms without edits, a worker prepares maximum-effort output for the exact document revision. A normal save uses that result when it is ready; otherwise it waits up to 750 ms for the current revision and writes a valid fast representation if that local deadline expires. The save is not delayed indefinitely for compression.

**BornEngineTools: Optimize World2D Map** waits for maximum-effort encoding. It applies and saves the result through VS Code's document history only if the map still has the same text, version, and source revision. A stale result is discarded and reported, so an undo or a newer edit cannot be overwritten by an older worker response. Hover previews do not run compression.

## Measured size

These 32×32 tile-only documents include all map metadata and two source descriptors. Image files are external and are not included. The version-1 baseline uses the previous explicit, pretty-printed cell representation; version 2 uses compact JSON and maximum codec effort.

| Fixture | Version 1 | Version 1 lines | Version 2 compact | Version 2 lines | v2 / v1 |
| --- | ---: | ---: | ---: | ---: | ---: |
| Constant tile | 107,539 B | 1,075 | 362 B | 1 | 0.34% |
| Repeated 2×2 pattern | 107,545 B | 1,075 | 394 B | 1 | 0.37% |
| Sparse extra tiles | 16,186 B | 1,075 | 432 B | 1 | 2.67% |
| Varied main and extra tiles | 99,791 B | 1,075 | 4,847 B | 1 | 4.86% |

The measurements come from `tools/measure-world2d-storage.mjs`. Compression gains depend on the map content; these examples do not set a fixed size guarantee for every map.

One local max-effort run, including the bounded LZ candidate, measured:

| Grid | Cells | Encode | JSON parse | Normalize/decode |
| --- | ---: | ---: | ---: | ---: |
| 32×32 | 1,024 | 0.8 ms | <0.1 ms | 1.0 ms |
| 256×256 | 65,536 | 39.1 ms | <0.1 ms | 21.2 ms |
| 1,000×1,000 | 1,000,000 | 496.4 ms | <0.1 ms | 256.2 ms |

These are single-run measurements from one development host, not performance guarantees; run the script on the target machine for local timings.

## Runtime loading

`World2DLoader` receives the destination `GameScene`, an optional document root, a `resolveSpriteFrame` callback, and an optional `PhysicsWorld2D` instance. It normalizes supported version-1 or version-2 input, validates and resolves built-in descriptors, then constructs runtime objects. If validation, resolution, construction, or attachment fails, it returns diagnostics without adding any of the new objects.

```ts
import { World2DComponentRegistry, World2DLoader } from '@bornengine/engine/world2d';

const registry = new World2DComponentRegistry();
registry.registerComponentFactory('gameplay.spawn-marker', (data) => {
  return new SpawnMarker(String(data.spawnId));
});

const loader = new World2DLoader(registry, {
  documentRoot: 'assets/worlds',
  resolveSpriteFrame(tileset, tileId, imagePath) {
    return spriteFrames.resolve(imagePath, tileset, tileId);
  },
  physicsWorld2D,
});
const scene = game.scenes.currentScene;
if (scene !== null) {
  const result = loader.load(document, scene);
  if (!result.ok) console.error(result.diagnostics);
}
```

The built-in object components are `spriteRenderer` and `physicsBody2D`; tilemaps are created from tile layers. A physics descriptor requires a ready `PhysicsWorld2D` owned by the destination Game. Custom component kinds must be registered explicitly. Factories receive a JSON clone of descriptor data and may return a `GameComponent` or a structured diagnostic. `context.resolveAssetPath` returns a path only for assets declared in the document.

Layer offsets, visibility, and opacity are applied during loading. Parallax values remain in the document for game code to use; `GameScene` does not currently provide a layer-parallax camera hook. Diagonal flips are supported on tile cells; `SpriteRenderer` exposes horizontal and vertical flips only.
