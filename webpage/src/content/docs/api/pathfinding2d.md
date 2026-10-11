---
title: 2D pathfinding
description: Find the shortest route across a grid of open and blocked cells with A*.
section: API
order: 40
---

Pathfinding answers one question: how does a character get from here to there without walking through walls? `AStarGrid2D` answers it on a grid. A grid is a table of cells, and each cell is either open (walkable) or blocked. A* (pronounced "A star") is a search method that finds the shortest route and avoids checking every possible route.

The result is a list of grid cells, not world positions. You convert between cells and world positions yourself, usually with the tile size of your map. `AStarGrid2D` is exported from `@bornengine/engine` and from `@bornengine/engine/pathfinding2d`.

## Create a grid

`new AStarGrid2D(width, height)` creates a grid in which every cell is open. A cell is addressed by a column `x` from 0 to `width - 1` and a row `y` from 0 to `height - 1`. The constructor throws a `RangeError` if `width` or `height` is not a positive whole number, or if the grid would have more than `ASTAR_GRID_2D_MAX_CELLS` cells, which is 1,000,000.

Two methods change and read cells:

- `setWalkable(x, y, walkable)` opens or blocks a cell. It returns `false` and changes nothing if the cell does not exist.
- `isWalkable(x, y)` returns whether a cell is open. A cell that does not exist is not walkable, so `isWalkable(-1, 0)` is `false`.

`width` and `height` are read-only. You cannot resize a grid; create a new one.

```ts
import { ASTAR_GRID_2D_MAX_CELLS, AStarGrid2D } from '@bornengine/engine';

const grid = new AStarGrid2D(40, 24);
grid.setWalkable(10, 5, false);
for (let y = 8; y < 16; y++) grid.setWalkable(20, y, false);

console.log(grid.width * grid.height, ASTAR_GRID_2D_MAX_CELLS);
console.log(grid.isWalkable(10, 5), grid.isWalkable(0, 0), grid.isWalkable(-1, 0));
console.log(grid.setWalkable(40, 0, false));
```

The grid does not know about tilemaps or physics. To navigate a level that you draw with a `Tilemap`, copy its solid cells into a grid. `getSolidTiles()` lists every cell that has collision, so a tile with only a small collision rectangle also blocks its whole cell for pathfinding.

```ts
import { AStarGrid2D } from '@bornengine/engine';
import type { Tilemap } from '@bornengine/engine';

function createNavigationGrid(map: Tilemap): AStarGrid2D | null {
  if (map.error !== null) return null;
  const grid = new AStarGrid2D(map.columns, map.rows);
  const solids = map.getSolidTiles();
  for (let index = 0; index < solids.length; index++) {
    grid.setWalkable(solids[index].column, solids[index].row, false);
  }
  return grid;
}
```

The grid is a snapshot. If you later change a tile with `map.setTile(...)`, call `grid.setWalkable(...)` for that cell too.

## Find a route

`findPath(start, goal, options)` returns an array of `{ x, y }` cells from `start` to `goal`, including both ends, or `null` when there is no route. It returns `null` if:

- `start` or `goal` is outside the grid, or its coordinates are not whole numbers.
- `start` or `goal` is a blocked cell.
- Blocked cells separate the two.

If `start` and `goal` are the same open cell, the result is an array with that one cell. Each call returns new objects, so you can change the array without affecting the grid.

When two routes cost the same, the search chooses between them in a fixed way, so the same grid and the same query always return the same route.

This example reads a small level from text, finds a route, and prints it. `#` is a wall, `.` is open floor, and `o` marks the route.

```ts
import { AStarGrid2D } from '@bornengine/engine';
import type { GridPoint2D } from '@bornengine/engine';

const LEVEL = [
  '..........',
  '.####.###.',
  '.#........',
  '.#.######.',
  '...#......',
];

function createGrid(rows: string[]): AStarGrid2D {
  const grid = new AStarGrid2D(rows[0].length, rows.length);
  for (let y = 0; y < rows.length; y++) {
    for (let x = 0; x < rows[y].length; x++) {
      if (rows[y].charAt(x) === '#') grid.setWalkable(x, y, false);
    }
  }
  return grid;
}

function drawRoute(rows: string[], route: GridPoint2D[]): string {
  const canvas = rows.map((row) => row.split(''));
  for (let index = 0; index < route.length; index++) {
    canvas[route[index].y][route[index].x] = 'o';
  }
  return canvas.map((row) => row.join('')).join('\n');
}

const grid = createGrid(LEVEL);
const route = grid.findPath({ x: 0, y: 0 }, { x: 9, y: 4 });
if (route === null) {
  console.log('No route.');
} else {
  console.log(drawRoute(LEVEL, route));
  console.log(`${route.length} cells`);
}
```

The program prints the route along the top row and down the right column, then `14 cells`. That is the shortest way around the walls when each step goes up, down, left, or right.

### From cells to world positions

A game moves in world units, so convert both ends of the route. The helper below turns world positions into cells by dividing by the tile size, and turns each cell of the route into the world position of its center. `followWaypoints` then moves a position along that list, a little each frame.

```ts
import { AStarGrid2D, Vector2D } from '@bornengine/engine';

function findWorldPath(grid: AStarGrid2D, from: Vector2D, to: Vector2D, tileSize: number): Vector2D[] | null {
  const route = grid.findPath(
    { x: Math.floor(from.x / tileSize), y: Math.floor(from.y / tileSize) },
    { x: Math.floor(to.x / tileSize), y: Math.floor(to.y / tileSize) },
  );
  if (route === null) return null;
  const waypoints: Vector2D[] = [];
  for (let index = 0; index < route.length; index++) {
    waypoints.push(new Vector2D((route[index].x + 0.5) * tileSize, (route[index].y + 0.5) * tileSize));
  }
  return waypoints;
}

function followWaypoints(position: Vector2D, waypoints: Vector2D[], speed: number, deltaTime: number): void {
  let budget = speed * deltaTime;
  while (budget > 0 && waypoints.length > 0) {
    const target = waypoints[0];
    const distance = position.distanceTo(target);
    if (distance <= budget) {
      position.set(target.x, target.y);
      waypoints.shift();
      budget -= distance;
    } else {
      position.x += ((target.x - position.x) / distance) * budget;
      position.y += ((target.y - position.y) / distance) * budget;
      budget = 0;
    }
  }
}
```

Both functions assume that cell `(0, 0)` has its top-left corner at the world origin. If your map starts elsewhere, subtract the map position before you divide and add it back after.

A route is a snapshot too. Find a new one when the goal moves or when a cell on the route becomes blocked.

## Diagonal movement and limits

By default a step moves to one of four neighbors: left, right, up, or down. Pass `{ allowDiagonal: true }` to allow the four diagonal neighbors as well, which gives eight directions. A straight step costs 1 and a diagonal step costs the square root of 2, about 1.41, so the search still returns the cheapest route, not just the one with the fewest cells.

A diagonal step passes the corner of the two cells beside it. By default a diagonal step is allowed only when both of those cells are open, so a route never clips the corner of a wall. Pass `allowCornerCutting: true` together with `allowDiagonal: true` to remove that rule. `allowCornerCutting` has no effect without `allowDiagonal`.

```ts
import { AStarGrid2D } from '@bornengine/engine';

const open = new AStarGrid2D(5, 5);
const fourWay = open.findPath({ x: 0, y: 0 }, { x: 4, y: 4 });
const eightWay = open.findPath({ x: 0, y: 0 }, { x: 4, y: 4 }, { allowDiagonal: true });
console.log(fourWay?.length, eightWay?.length);

const corner = new AStarGrid2D(4, 4);
corner.setWalkable(1, 0, false);
const start = { x: 0, y: 0 };
const goal = { x: 1, y: 1 };
const noDiagonal = corner.findPath(start, goal);
const diagonal = corner.findPath(start, goal, { allowDiagonal: true });
const cutting = corner.findPath(start, goal, { allowDiagonal: true, allowCornerCutting: true });
console.log(noDiagonal?.length, diagonal?.length, cutting?.length);
```

The first line prints `9 5`: the straight route crosses 9 cells and the diagonal route crosses 5. The second line prints `3 3 2`. The cell `(1, 0)` is blocked, so without corner cutting the diagonal step from `(0, 0)` to `(1, 1)` is refused and the route takes the long way.

### Limits

- Every open cell costs the same. There are no terrain costs, such as slow mud, and no navigation mesh. The engine has no public `Navigation2D` class.
- A grid holds at most 1,000,000 cells, and coordinates must be whole numbers.
- A cell is open or blocked. The grid does not know about characters, so it cannot avoid other moving objects. Block their cells yourself, or find a new route when they move.
- The route follows grid cells. It is not smoothed into straight lines.
- `findPath` runs to completion before it returns, and each call allocates working arrays with one entry per cell. On a large grid, avoid calling it for many characters in one frame. Spread the requests over several frames, or reuse routes.

## Next steps

- [Tilemaps](../tilemap/) lists the solid cells that you can turn into blocked cells.
- [Physics 2D](../physics2d/) moves and collides the character that follows the route.
- [Procedural generation](../procedural/) builds maps that you can then search.
