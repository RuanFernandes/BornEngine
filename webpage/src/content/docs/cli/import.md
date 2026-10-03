---
title: Import maps
description: Convert supported orthogonal Tiled maps into BornEngine World2D documents.
section: CLI / Import
order: 26
---

`bornengine import tiled` converts a Tiled orthogonal TMX map into the versioned `.world2d.json` format used by BornEngine's 2D world loader.

```sh
bornengine import tiled maps/level.tmx --output maps/level.world2d.json
```

The `--output` path is required and must end in `.world2d.json`. Run the command from the game project root. The input map, referenced external TSX tilesets, and tileset images must be files inside the project; paths in the output document are normalized relative to that root.

The importer reads tile layers, object layers, tilesets, tile and object properties, tile collision rectangles, layer offsets, visibility, opacity, and supported tile flips. It emits diagnostics and stops on unsupported or invalid map data instead of writing a partial world file. The importer does not copy or convert source assets; keep the referenced image files in the project and load them through the game asset manager.

After import, validate the generated document and asset inventory before loading it in a scene:

```sh
bornengine assets validate
```

Use [`World2DLoader`](../../api/world2d/) to resolve atlas frames and instantiate the document. See the [2D production workflow](../../guides/2d-production-workflow/) for a complete Tiled-to-runtime example.
