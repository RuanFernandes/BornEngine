import { AStarGrid2D } from '../../src/pathfinding2d';

function expect(value: boolean, label: string): void {
  if (!value) throw new Error(`AStarGrid2D: ${label}`);
}

function samePoint(a: { x: number; y: number }, b: { x: number; y: number }): boolean {
  return a.x === b.x && a.y === b.y;
}

function pathCost(route: Array<{ x: number; y: number }>): number {
  let cost = 0;
  for (let index = 1; index < route.length; index++) {
    const dx = Math.abs(route[index].x - route[index - 1].x);
    const dy = Math.abs(route[index].y - route[index - 1].y);
    cost += dx === 1 && dy === 1 ? Math.sqrt(2) : dx + dy;
  }
  return cost;
}

const grid = new AStarGrid2D(3, 2);
expect(grid.width === 3 && grid.height === 2, 'stores integer grid dimensions');
expect(grid.isWalkable(0, 0) && !grid.isWalkable(-1, 0) && !grid.isWalkable(3, 0),
  'treats out-of-bounds cells as blocked');
expect(!grid.setWalkable(-1, 0, false) && !grid.setWalkable(1.5, 0, false),
  'rejects out-of-bounds and fractional cell edits');
expect(grid.setWalkable(1, 0, false) && !grid.isWalkable(1, 0), 'marks a cell as blocked');

const orthogonalPath = grid.findPath({ x: 0, y: 0 }, { x: 2, y: 0 });
expect(orthogonalPath !== null && orthogonalPath.length === 5 &&
  samePoint(orthogonalPath[0], { x: 0, y: 0 }) && samePoint(orthogonalPath[4], { x: 2, y: 0 }),
  'returns a shortest orthogonal path including start and goal');
expect(orthogonalPath !== null && JSON.stringify(orthogonalPath) ===
  JSON.stringify(grid.findPath({ x: 0, y: 0 }, { x: 2, y: 0 })),
  'chooses a deterministic path for the same grid');
expect(grid.findPath({ x: 1, y: 0 }, { x: 2, y: 0 }) === null,
  'returns no path when the start is blocked');
expect(grid.findPath({ x: 0, y: 0 }, { x: 1, y: 0 }) === null,
  'returns no path when the goal is blocked');
expect(grid.findPath({ x: -1, y: 0 }, { x: 2, y: 0 }) === null &&
  grid.findPath({ x: 0, y: 0 }, { x: 3, y: 0 }) === null &&
  grid.findPath({ x: 0.5, y: 0 }, { x: 2, y: 0 }) === null &&
  grid.findPath({ x: 0, y: 0 }, { x: Number.NaN, y: 1 }) === null,
  'returns no path for invalid coordinates');
const sameCellPath = grid.findPath({ x: 0, y: 0 }, { x: 0, y: 0 });
expect(sameCellPath !== null && sameCellPath.length === 1 && samePoint(sameCellPath[0], { x: 0, y: 0 }),
  'returns the single cell when start equals goal');

const sealed = new AStarGrid2D(3, 3);
sealed.setWalkable(0, 1, false);
sealed.setWalkable(1, 1, false);
sealed.setWalkable(2, 1, false);
expect(sealed.findPath({ x: 0, y: 0 }, { x: 2, y: 2 }) === null,
  'returns no path when a wall seals off the goal');

const diagonal = new AStarGrid2D(2, 2);
const diagonalPath = diagonal.findPath({ x: 0, y: 0 }, { x: 1, y: 1 }, { allowDiagonal: true });
expect(diagonalPath !== null && diagonalPath.length === 2 &&
  Math.abs(pathCost(diagonalPath) - Math.sqrt(2)) < 0.00001,
  'uses sqrt(2) cost for an optimal diagonal step');
const defaultPath = diagonal.findPath({ x: 0, y: 0 }, { x: 1, y: 1 });
expect(defaultPath !== null && defaultPath.length === 3 && Math.abs(pathCost(defaultPath) - 2) < 0.00001,
  'uses orthogonal movement by default');

diagonal.setWalkable(1, 0, false);
diagonal.setWalkable(0, 1, false);
expect(diagonal.findPath({ x: 0, y: 0 }, { x: 1, y: 1 }, { allowDiagonal: true }) === null,
  'prevents diagonal corner cutting by default');
const cornerCut = diagonal.findPath({ x: 0, y: 0 }, { x: 1, y: 1 }, {
  allowDiagonal: true,
  allowCornerCutting: true,
});
expect(cornerCut !== null && cornerCut.length === 2,
  'allows corner cutting only when explicitly enabled');
diagonal.setWalkable(1, 0, true);
const oneOpenSidePath = diagonal.findPath({ x: 0, y: 0 }, { x: 1, y: 1 }, { allowDiagonal: true });
expect(oneOpenSidePath !== null && oneOpenSidePath.length === 3,
  'requires at least one open side cell before taking a diagonal');

let invalidDimensionsRejected = false;
try { new AStarGrid2D(0, 1); } catch (_error) { invalidDimensionsRejected = true; }
expect(invalidDimensionsRejected, 'rejects non-positive grid dimensions');
invalidDimensionsRejected = false;
try { new AStarGrid2D(1001, 1000); } catch (_error) { invalidDimensionsRejected = true; }
expect(invalidDimensionsRejected, 'rejects grids larger than the safe cell limit');

console.log('AStarGrid2D runtime fixture passed');
