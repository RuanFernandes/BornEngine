---
title: 2D pathfinding
description: Find deterministic routes across bounded grids with A*.
section: API / Pathfinding 2D
order: 40
---

`AStarGrid2D` finds shortest routes on a uniform-cost grid. Import it from the package root or the `@bornengine/engine/pathfinding2d` subpath.

## Create a grid

New grids start with every cell walkable. Mark blocked cells after creating the grid; coordinates use integer `x` and `y` values beginning at zero.

```ts
import { AStarGrid2D } from '@bornengine/engine/pathfinding2d';

const grid = new AStarGrid2D(12, 8);
for (let y = 0; y < grid.height; y++) {
  if (y !== 4) grid.setWalkable(5, y, false);
}
```

The grid is intentionally independent of rendering and physics. Build it from tile collision data or game rules, then use the returned points to move an entity through your own gameplay system.

## Find a route

`findPath` includes both the start and goal in the result. It returns `null` when a coordinate is invalid, blocked, or unreachable. With no options, movement is orthogonal and each step has cost 1.

```ts
const route = grid.findPath({ x: 1, y: 1 }, { x: 10, y: 6 });
if (route === null) {
  console.log('No route is available.');
} else {
  console.log(route); // Pass these cells to your movement system.
}
```

The implementation uses A* with a binary heap and deterministic tie breaking. Costs are uniform, so terrain weights and per-cell movement costs are not part of this API.

## Diagonal movement and limits

Set `allowDiagonal` to enable diagonal steps. Diagonal steps cost approximately 1.414; corner cutting remains disabled unless `allowCornerCutting` is explicitly enabled. When corner cutting is disabled, both adjacent orthogonal cells must be open.

```ts
const routeWithDiagonals = grid.findPath(
  { x: 1, y: 1 },
  { x: 10, y: 6 },
  { allowDiagonal: true },
);
```

Dimensions must be positive integers and a grid can contain at most 1,000,000 cells. `setWalkable` returns `false` for invalid coordinates; `isWalkable` also returns `false` outside the grid.
