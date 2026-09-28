---
title: Tilemaps
description: Render atlas-backed tile grids and extract local collision rectangles.
section: API / Sprites
order: 36
---

`Tilemap` is a `GameComponent` that draws a row-major grid from a `SpriteSheet`. Add it to a `GameObject` in a Scene; active scene rendering draws occupied cells and culls tiles outside the 2D camera.

## Tile definitions

Tile ID `0` is reserved for an empty cell. Definitions map each other ID to a frame from the same sheet, with optional solid or custom rectangle collision data.

```ts
import { SpriteSheet, Tilemap, Texture } from '@bornengine/engine';

function createLevelMap(texture: Texture, levelCells: number[]): Tilemap | null {
  const sheet = new SpriteSheet(texture, { frameWidth: 16, frameHeight: 16 });
  const grass = sheet.gridFrame(0, 0);
  const platform = sheet.gridFrame(1, 0);
  if (grass === null || platform === null) return null;

  return new Tilemap(sheet, {
    columns: 32,
    rows: 18,
    tileWidth: 16,
    tileHeight: 16,
    tiles: [
      { id: 1, frame: grass, solid: true },
      { id: 2, frame: platform, collision: { x: 0, y: 8, width: 16, height: 8 } },
    ],
    data: levelCells,
  });
}
```

Each definition may use a `SpriteFrame` or a named frame string. The initial `data` array must contain exactly `columns * rows` IDs in row-major order. Without `data`, all cells start empty. `setTile(column, row, id)`, `getTile()`, and `fill(id)` update cells after construction and reject invalid coordinates or IDs safely.

## Render and update

The tilemap's GameObject world position is the map's top-left origin. Its world scale and Z rotation transform each cell. `tint`, `visible`, and `renderOrder` control draw appearance and ordering. A `Scene.camera2D` activates camera culling; an uncamerad scene draws every occupied tile.

The renderer currently checks each map cell on every render and skips draw submission for offscreen tiles. For very large levels, split content into smaller tilemap components or chunks so iteration cost also stays bounded.

## Collision data

`getSolidTiles()` returns row-major rectangles in map-local pixels. A full-cell solid tile uses its tile dimensions. A custom `collision` rectangle both marks the tile solid and replaces the full-cell bounds. Tilemap collision data is not automatically connected to a physics world; create static `PhysicsBody2D` components from these rectangles as needed. Physics box bodies stay axis-aligned and do not inherit the tilemap's transform. The helper below therefore assumes a translated, unrotated map with unit scale. To use scale, transform each rectangle center with the signed world scale and its dimensions with the absolute scale. A rotated tilemap needs rotated or polygon collision shapes; axis-aligned boxes cannot represent that transform exactly.

```ts
import { GameObject, PhysicsWorld2D, Tilemap } from '@bornengine/engine';

function createStaticColliders(map: Tilemap, world: PhysicsWorld2D): GameObject[] {
  const objects: GameObject[] = [];
  // This conversion assumes no map rotation and a world scale of (1, 1, 1).
  const mapPosition = map.gameObject === null
    ? { x: 0, y: 0, z: 0 }
    : map.gameObject.transform.worldPosition;
  const solidTiles = map.getSolidTiles();

  for (let index = 0; index < solidTiles.length; index++) {
    const tile = solidTiles[index];
    const bodyObject = new GameObject({
      name: 'Tile collider',
      position: {
        x: mapPosition.x + tile.bounds.x + tile.bounds.width * 0.5,
        y: mapPosition.y + tile.bounds.y + tile.bounds.height * 0.5,
        z: mapPosition.z,
      },
    });
    bodyObject.addComponent(world.createBody({
      type: 'static',
      shape: { type: 'box', width: tile.bounds.width, height: tile.bounds.height },
    }));
    objects.push(bodyObject);
  }
  return objects;
}
```

See the [2D physics and tilemaps guide](../../guides/physics2d-tilemap/) for a working example.
