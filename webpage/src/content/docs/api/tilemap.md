---
title: Tilemaps
description: Draw a grid of tiles from a sprite sheet and read its solid cells for collision.
section: API
order: 36
---

A tile map is a grid of cells. Each cell holds a number, called a tile ID, and each ID stands for a small picture, called a tile. A level that would take thousands of separate sprites becomes a table of numbers: easy to store, easy to edit, and cheap to draw.

`Tilemap` is a component that draws such a grid from a `SpriteSheet`. It can also report which cells are solid, so that you can build collision for them. `Tilemap` is exported from `@bornengine/engine` and from `@bornengine/engine/tilemap`. Read [Sprites and animation](../sprites/) first if you have not used `SpriteSheet` and `SpriteFrame`.

Four terms appear on this page:

- **Cell**: one square of the grid, addressed by a column and a row. Cell `(0, 0)` is the top-left cell.
- **Tile ID**: the number stored in a cell. ID `0` always means an empty cell. IDs you define are positive whole numbers.
- **Tile definition**: the entry that connects one ID to a sprite frame and, optionally, to collision data.
- **Solid tile**: a tile that blocks movement. The tilemap only reports solid cells. It does not stop anything by itself.

## Tile definitions

Create the map with `new Tilemap(sheet, options)`. The options describe the grid, the tile size, the tile definitions, and the starting cells.

| Option | Meaning |
| --- | --- |
| `columns`, `rows` | Grid size in cells. Positive whole numbers. |
| `tileWidth`, `tileHeight` | Size of one cell in world units. Positive. |
| `tiles` | The tile definitions. At least one is required. |
| `data` | The starting IDs, row by row. If you pass it, it must have exactly `columns * rows` entries. Without it, every cell starts empty. |
| `cellFlips` | Optional flip flags per cell, row by row, with `columns * rows` entries. |
| `tint` | A tint color for every tile. Default white, which leaves the art unchanged. |
| `visible` | `false` hides the map without removing it. Default `true`. |
| `renderOrder` | Draw order among components. Default 0. |

A tile definition has these fields:

| Field | Meaning |
| --- | --- |
| `id` | A positive whole number, unique in the map. |
| `frame` | A `SpriteFrame` from the same sheet, or the name of a frame that you defined by name in that sheet. |
| `solid` | `true` marks the whole cell as solid. |
| `collision` | One rectangle, measured from the top-left corner of the cell, that is solid instead of the whole cell. It must fit inside the cell. A tile with a `collision` rectangle is solid. |

The frame is scaled so that its untrimmed size fills one cell, so give `tileWidth` and `tileHeight` the size of your frames for a one-to-one pixel mapping. A name in `frame` works only for frames defined with the `frames` option of `SpriteSheet`. Frames that come from `gridFrame()` have no name to look up; pass the `SpriteFrame` itself.

The next function turns rows of text into IDs and builds a map. In the text, `.` is empty, `#` is solid ground, and `=` is a thin ledge whose solid part is only the top 12 units of the cell.

```ts
import { SpriteSheet, Tilemap } from '@bornengine/engine';

const LEVEL = [
  '................',
  '................',
  '....##..........',
  '..........==....',
  '################',
];

function createLevelMap(sheet: SpriteSheet): Tilemap | null {
  const ground = sheet.gridFrame(0, 0);
  const ledge = sheet.gridFrame(1, 0);
  if (ground === null || ledge === null) return null;

  const data: number[] = [];
  for (let row = 0; row < LEVEL.length; row++) {
    for (let column = 0; column < LEVEL[row].length; column++) {
      const symbol = LEVEL[row].charAt(column);
      data.push(symbol === '#' ? 1 : symbol === '=' ? 2 : 0);
    }
  }

  const map = new Tilemap(sheet, {
    columns: LEVEL[0].length,
    rows: LEVEL.length,
    tileWidth: 32,
    tileHeight: 32,
    tiles: [
      { id: 1, frame: ground, solid: true },
      { id: 2, frame: ledge, collision: { x: 0, y: 0, width: 32, height: 12 } },
    ],
    data,
  });
  if (map.error !== null) {
    console.error(map.error);
    return null;
  }
  return map;
}
```

The constructor does not throw. If an option is invalid, the map sets `error` to a message and disables itself, so it draws nothing and reports no solid cells. Check `error` after you build a map. Common causes are:

- The sheet has an error, or its texture is not loaded.
- `columns`, `rows`, `tileWidth`, or `tileHeight` is not positive, or `columns` or `rows` is not a whole number.
- The grid has more than 1,000,000 cells.
- `tiles` is empty, an ID is `0`, negative, fractional, or repeated, or a frame belongs to another sheet.
- `data` or `cellFlips` has the wrong length, or `data` contains an ID that no tile defines.
- A `collision` rectangle does not fit inside the tile.

### Change cells at run time

`getTile(column, row)` returns the ID in a cell, or `0` for a cell outside the map. `setTile(column, row, id)` changes a cell and returns `false`, without changing anything, if the cell does not exist or no tile defines the ID. Use ID `0` to clear a cell. `fill(id)` sets every cell. `tileCount` is the number of cells that are not empty, and `getFrame(id)` returns the frame that an ID uses.

The position of a map is the position of its top-left corner, so a cell is `Math.floor((worldPosition - mapPosition) / tileSize)`. This function removes the tile under a world position:

```ts
import { Tilemap } from '@bornengine/engine';

function breakTileAt(map: Tilemap, worldX: number, worldY: number): boolean {
  const owner = map.gameObject;
  if (owner === null) return false;
  const origin = owner.transform.worldPosition;
  const column = Math.floor((worldX - origin.x) / map.tileWidth);
  const row = Math.floor((worldY - origin.y) / map.tileHeight);
  return map.setTile(column, row, 0);
}
```

The function assumes that the map is not rotated and has a scale of 1.

### Flip a tile

Each cell can be flipped. A `TilemapCellFlip` has three optional flags, `flipX`, `flipY`, and `flipDiagonal`. They follow the order that Tiled uses: the diagonal flip is applied first, then the horizontal flip, then the vertical flip. Pass the flags as the last argument of `setTile`, or pass a `cellFlips` array to the constructor. A `setTile` call without flags resets that cell to no flip.

```ts
import { Tilemap } from '@bornengine/engine';
import type { TilemapCellFlip } from '@bornengine/engine';

function mirrorCell(map: Tilemap, column: number, row: number): boolean {
  const flip: TilemapCellFlip = { flipX: true };
  const id = map.getTile(column, row);
  return id !== 0 && map.setTile(column, row, id, flip);
}
```

## Render and update

Add the map to a `GameObject` like any other component. The scene draws it every frame; the tilemap has no `update` of its own and does not animate, so there are no animated tiles.

- The world position of the object is the top-left corner of cell `(0, 0)`.
- The world scale and the Z rotation of the object apply to the whole map. A negative scale mirrors the map around the object's position.
- `renderOrder` sorts the map among the other components of the scene. Lower values draw first, so give a background map a negative value.
- `tint` and `visible` can change at any time. A hidden map still reports its solid cells, which is useful when the map is only collision data.

The map keeps a list of occupied cells for every block of 16 by 16 cells, so empty cells cost nothing. The scene draws inside a camera pass when it has a `camera2D` or a `viewport2D`, and in that pass the map skips every block that is outside the view. Without a camera, every occupied cell is drawn. These read-only counters describe the work:

- `chunkCount` is the number of blocks.
- `lastRenderVisibleChunkCount` and `lastRenderVisitedCellCount` describe the most recent draw.
- `dirtyChunkCount` counts blocks that are new or that `setTile` or `fill` changed since they were last drawn. It is a diagnostic counter.

`renderer.stats.spritesDrawn` and `renderer.stats.spritesCulled` include tiles.

This program draws a map of 80 by 60 cells, much larger than the window, and lets you scroll with the arrow keys. It shows how many tiles are drawn and skipped. It needs `assets/tiles.png`, with a floor tile in the first 32 by 32 cell and a wall tile in the second.

```ts
import { Colors, Game, GameObject, Key, Scene, SpriteSheet, Tilemap, Vector2D } from '@bornengine/engine';
import type { SpriteFrame } from '@bornengine/engine';

const COLUMNS = 80;
const ROWS = 60;
const TILE = 32;

class MapScene extends Scene {
  private focusX = 400;
  private focusY = 225;

  constructor(game: Game, floor: SpriteFrame, wall: SpriteFrame) {
    super({ name: 'map' });

    const data: number[] = [];
    for (let row = 0; row < ROWS; row++) {
      for (let column = 0; column < COLUMNS; column++) {
        const border = row === 0 || column === 0 || row === ROWS - 1 || column === COLUMNS - 1;
        data.push(border ? 2 : 1);
      }
    }

    const map = new Tilemap(floor.sheet, {
      columns: COLUMNS,
      rows: ROWS,
      tileWidth: TILE,
      tileHeight: TILE,
      tiles: [
        { id: 1, frame: floor },
        { id: 2, frame: wall, solid: true },
      ],
      data,
    });
    if (map.error !== null) {
      console.error(map.error);
      return;
    }

    const mapObject = new GameObject({ name: 'Map' });
    mapObject.addComponent(map);
    this.addNode(mapObject);
    this.pan(0, 0);
  }

  pan(dx: number, dy: number): void {
    this.focusX += dx;
    this.focusY += dy;
    this.camera2D = {
      offset: new Vector2D(400, 225),
      target: new Vector2D(this.focusX, this.focusY),
      rotation: 0,
      zoom: 1,
    };
  }
}

class MapDemo extends Game {
  private level: MapScene | null = null;

  constructor() {
    super({ window: { title: 'Tilemap', width: 800, height: 450 }, targetFps: 60 });
  }

  protected override onStart(): void {
    const texture = this.assets.loadTexture('assets/tiles.png');
    if (texture === null || !texture.isLoaded) {
      console.error(texture?.error ?? 'Could not load assets/tiles.png');
      this.stop();
      return;
    }
    const sheet = new SpriteSheet(texture, { frameWidth: TILE, frameHeight: TILE });
    const floor = sheet.gridFrame(0, 0);
    const wall = sheet.gridFrame(1, 0);
    if (floor === null || wall === null) {
      console.error(sheet.error ?? 'The sheet needs two tiles in its first row.');
      this.stop();
      return;
    }
    this.level = new MapScene(this, floor, wall);
    this.scenes.changeTo(this.level);
  }

  protected override loop(deltaTime: number): void {
    const level = this.level;
    if (level !== null) {
      let dx = 0;
      let dy = 0;
      if (this.input.isKeyDown(Key.LEFT)) dx -= 1;
      if (this.input.isKeyDown(Key.RIGHT)) dx += 1;
      if (this.input.isKeyDown(Key.UP)) dy -= 1;
      if (this.input.isKeyDown(Key.DOWN)) dy += 1;
      if (dx !== 0 || dy !== 0) level.pan(dx * 400 * deltaTime, dy * 400 * deltaTime);
    }
    this.scenes.update(deltaTime);
  }

  protected override render(): void {
    this.renderer.clear(Colors.BLACK);
    super.render();
    const stats = this.renderer.stats;
    const text = `drawn ${stats.spritesDrawn}   culled ${stats.spritesCulled}`;
    this.renderer.drawText(text, { x: 8, y: 8 }, 16, Colors.WHITE);
  }
}

new MapDemo().run();
```

Walk the camera across the map and watch `culled` stay high: only the blocks near the window are visited.

For pixel art, set the texture filter to `FILTER_NEAREST` with `texture.setFilter(FILTER_NEAREST)` so tiles stay sharp when the camera zooms. See [Textures](../textures/).

## Collision data

A tilemap knows which cells are solid, but it is not connected to a physics world. You read the solid cells and build the colliders yourself. Two methods report them. Both return rectangles in map-local units, measured from the top-left corner of the map, and neither applies the object's position, scale, or rotation.

- `getSolidTiles()` returns one entry per solid cell, row by row: `{ column, row, tileId, bounds }`. Use it when you need to know which tile a rectangle came from.
- `getSolidRegions()` returns plain rectangles. It joins neighboring full-cell solids into larger rectangles: cells in a row become one run, and runs with the same columns in consecutive rows become one taller rectangle. A tile with a custom `collision` rectangle stays a separate rectangle. Use it to create fewer physics bodies.

Cell flips also transform a custom `collision` rectangle inside its cell.

The next function creates one static `box` body for each solid region. A body is centered on its game object, so the function places each object at the center of its rectangle in world space, which is the position of the map plus the local center of the rectangle. It adds the objects to the scene and returns how many it created.

```ts
import { GameObject, PhysicsWorld2D, Scene, Tilemap } from '@bornengine/engine';

function addMapColliders(scene: Scene, map: Tilemap, world: PhysicsWorld2D): number {
  const owner = map.gameObject;
  const origin = owner === null ? { x: 0, y: 0, z: 0 } : owner.transform.worldPosition;
  const regions = map.getSolidRegions();
  let added = 0;

  for (let index = 0; index < regions.length; index++) {
    const region = regions[index];
    const collider = new GameObject({
      name: 'Tile collider',
      position: {
        x: origin.x + region.x + region.width * 0.5,
        y: origin.y + region.y + region.height * 0.5,
        z: origin.z,
      },
    });
    collider.addComponent(world.createBody({
      type: 'static',
      shape: { type: 'box', width: region.width, height: region.height },
    }));
    if (scene.addNode(collider) !== null) added++;
  }
  return added;
}
```

Keep these limits in mind:

- Physics bodies are axis-aligned and ignore the object's rotation and scale. The function above is correct only for a map that is not rotated and has a scale of 1. For a rotated map, create static `convex` bodies instead, with vertices that you rotate yourself.
- The colliders are a snapshot. If you change a tile with `setTile` or `fill`, the bodies you already created do not change. Destroy the affected objects and create new ones.
- `getSolidTiles()` and `getSolidRegions()` visit every cell. Call them when you build a level, not every frame.
- Every cell stores a tile ID and a flip record, so a map near the limit of 1,000,000 cells uses a lot of memory. Split very large worlds into several maps.
- All tiles of one map come from one `SpriteSheet`, and so from one texture.

## Next steps

- [Physics 2D](../physics2d/) explains the bodies that the colliders above use.
- [2D pathfinding](../pathfinding2d/) can search a map after you copy its solid cells into a grid.
- [World 2D](../world2d/) loads whole maps, including maps imported from Tiled, and creates their tilemaps for you.
- [Physics 2D and tilemaps](../../guides/physics2d-tilemap/) builds a level with collision step by step. The repository example `examples/physics2d-tilemap` turns the solid tiles of a small map into static bodies.
- [Procedural generation](../procedural/) produces tile IDs from noise.
