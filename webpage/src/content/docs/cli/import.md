---
title: Import maps
description: Convert orthogonal Tiled maps into BornEngine World2D documents.
section: CLI
order: 26
---

Tiled is a map editor that saves maps as `.tmx` files. `bornengine import tiled` converts one of those maps into a `.world2d.json` document, the format that the engine's 2D world loader reads. The conversion is strict. It stops with an error on anything it cannot represent, so you never get a partly converted map.

```sh
bornengine import tiled maps/level.tmx --output maps/level.world2d.json
```

Run the command from the folder that holds the map and everything it uses. The CLI treats the current folder as the project root. The map, its tileset files, its tileset images, and every file named by a property must be inside that folder. Paths in the output are relative to it.

`--output` is required and must end in `.world2d.json`. The CLI creates missing parent folders. It builds the whole document before it writes anything, and it writes through a temporary file, so a failed import does not replace an existing output file. On success it prints `Imported <map> to <output>`.

## A complete workflow

1. Save the map in Tiled as a `.tmx` file inside your project. Use an orthogonal map of fixed size, and tile layer data in CSV or XML format without compression.
2. Run `bornengine import tiled` to create the `.world2d.json` document.
3. Run `bornengine assets validate`. It reads the `assets` list in the document and checks that every image exists. See [Asset audit](../assets/).
4. Load the document in your game with `World2DLoader`. See [World2D](../../api/world2d/) and the [2D production workflow](../../guides/2d-production-workflow/).

The importer does not copy or convert images. They stay where they are, and the document refers to them by project-relative path. Load them through your game's asset manager.

## What the importer reads

- **Maps.** Orthogonal, finite maps with the default `right-down` render order. Tile layer data in CSV or XML. The importer reads the map properties into `metadata`.
- **Tilesets.** Tilesets embedded in the map, or external `.tsx` files. Each tileset must use one atlas image. Margin and spacing are kept. The importer takes `columns` and `tilecount` from the tileset, or works them out from the image size, which must fit the tile size, margin, and spacing exactly.
- **Tile layers.** Names, visibility, opacity from 0 to 1, offsets, parallax factors, properties, and the horizontal, vertical, and diagonal flip flags of each tile. An empty cell becomes `null`.
- **Object layers.** Rectangles and points. Each object keeps its name, class, position, rotation, size, visibility, and properties. An object whose class is `collision` and that has a size also gets a static `physicsBody2D` component with a box shape.
- **Tile collision.** One unrotated rectangle per tile, taken from the tile's object group.
- **Properties.** String, integer, float, boolean, color, and file values. A file property is resolved relative to the map, must point to a file inside the project, and is added to the document's `assets` list.

The class of an object, or its type in older Tiled files, becomes the `type` of the object in the document. Layer and object IDs from Tiled become `layer-<id>` and `object-<id>`. The document `id` is the map file name without its extension, and `name` is that text with hyphens and underscores turned into spaces and a capital first letter.

## What the importer rejects

Each of these stops the import with an error that names the file and the feature:

- Isometric, hexagonal, and staggered maps, infinite maps, other render orders, and map classes.
- Base64 tile data and compressed tile data.
- Tilesets that are collections of single images, tileset classes, nonzero tile offsets, tile animations, per-tile classes, and tile images.
- Group layers.
- Layer classes, layers with a nonzero `x` or `y` attribute, tint colors, and blend modes other than normal. The pixel offsets `offsetx` and `offsety` are supported.
- Tile objects, object templates, object opacity other than 1, and every object shape except rectangles and points: ellipses, polygons, polylines, text, and capsules.
- Tile collision with more than one shape, rotated shapes, and shapes that are not rectangles.
- Class properties and object-reference properties, duplicate property names, and file paths that are absolute, remote, or outside the project.
- XML files larger than 64 MiB.

To use such a map, change it in Tiled first. For example, flatten groups into plain layers, convert polygons into rectangles, and export tile data as CSV.

## The output document

The document has these top-level keys: `format`, `version`, `id`, `name`, `assets`, `tilesets`, `layers`, and `metadata`. The importer writes `bornengine.world2d` version 1, and the engine reads that version. This is a map of two tiles in one row, with the second cell empty:

```json
{
  "format": "bornengine.world2d",
  "version": 1,
  "id": "level",
  "name": "Level",
  "assets": [
    "assets/tiles.png"
  ],
  "tilesets": [
    {
      "id": "tiles",
      "image": "assets/tiles.png",
      "tileWidth": 16,
      "tileHeight": 16,
      "columns": 2,
      "tileCount": 2,
      "margin": { "x": 0, "y": 0 },
      "spacing": { "x": 0, "y": 0 },
      "tiles": []
    }
  ],
  "layers": [
    {
      "type": "tilemap",
      "id": "layer-1",
      "name": "Ground",
      "visible": true,
      "opacity": 1.0,
      "offset": { "x": 0.0, "y": 0.0 },
      "parallax": { "x": 1.0, "y": 1.0 },
      "width": 2,
      "height": 1,
      "tileSize": { "x": 16, "y": 16 },
      "data": [
        { "tilesetId": "tiles", "tileId": 1, "flipX": false, "flipY": false, "flipDiagonal": false },
        null
      ]
    }
  ],
  "metadata": {}
}
```

The real file is formatted with one value per line. A tile cell stores the tileset ID and the tile number inside that tileset, counted from zero. If two tilesets have the same name, the importer adds `-2`, `-3`, and so on to the later IDs. See [World format](../../guides/world-format/) for the full schema.

## Next steps

- [Asset audit](../assets/) validates the document and the images it lists.
- [World2D](../../api/world2d/) documents the loader and the validation functions.
- [2D production workflow](../../guides/2d-production-workflow/) takes a Tiled map from the editor to a running game.
- [Tilemaps](../../api/tilemap/) explains tile grids at run time.
