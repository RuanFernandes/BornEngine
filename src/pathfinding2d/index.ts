export const ASTAR_GRID_2D_MAX_CELLS = 1_000_000;

export interface GridPoint2D {
  x: number;
  y: number;
}

export interface AStarGrid2DOptions {
  allowDiagonal?: boolean;
  allowCornerCutting?: boolean;
}

interface SearchEntry {
  index: number;
  cost: number;
  heuristic: number;
  score: number;
}

const ORTHOGONAL_NEIGHBORS: number[][] = [[-1, 0], [0, -1], [1, 0], [0, 1]];
const DIAGONAL_NEIGHBORS: number[][] = [[-1, -1], [1, -1], [1, 1], [-1, 1]];
const DIAGONAL_COST = Math.SQRT2;

function comesBefore(a: SearchEntry, b: SearchEntry): boolean {
  if (a.score !== b.score) return a.score < b.score;
  if (a.heuristic !== b.heuristic) return a.heuristic < b.heuristic;
  return a.index < b.index;
}

class SearchHeap {
  private readonly entries: SearchEntry[] = [];

  push(entry: SearchEntry): void {
    this.entries.push(entry);
    let index = this.entries.length - 1;
    while (index > 0) {
      const parent = Math.floor((index - 1) / 2);
      const parentEntry = this.entries[parent];
      if (!comesBefore(entry, parentEntry)) break;
      this.entries[index] = parentEntry;
      index = parent;
    }
    this.entries[index] = entry;
  }

  pop(): SearchEntry | null {
    if (this.entries.length === 0) return null;
    const first = this.entries[0];
    const last = this.entries.pop() as SearchEntry;
    if (this.entries.length === 0) return first;

    let index = 0;
    while (true) {
      const left = index * 2 + 1;
      if (left >= this.entries.length) break;
      const right = left + 1;
      let child = left;
      if (right < this.entries.length && comesBefore(this.entries[right], this.entries[left])) child = right;
      if (!comesBefore(this.entries[child], last)) break;
      this.entries[index] = this.entries[child];
      index = child;
    }
    this.entries[index] = last;
    return first;
  }
}

/** A deterministic A* pathfinder for a bounded, uniform-cost 2D grid. */
export class AStarGrid2D {
  readonly width: number;
  readonly height: number;
  private readonly walkableCells: boolean[] = [];

  /** Creates an open grid. Grids are limited to one million cells. */
  constructor(width: number, height: number) {
    if (typeof width !== 'number' || typeof height !== 'number' ||
      Math.floor(width) !== width || Math.floor(height) !== height ||
      width <= 0 || height <= 0 || width * height > ASTAR_GRID_2D_MAX_CELLS) {
      throw new RangeError(`AStarGrid2D dimensions must be positive integers with at most ${ASTAR_GRID_2D_MAX_CELLS} cells`);
    }
    this.width = width;
    this.height = height;
    const count = width * height;
    for (let index = 0; index < count; index++) this.walkableCells.push(true);
  }

  /** Returns false for invalid or out-of-bounds coordinates. */
  isWalkable(x: number, y: number): boolean {
    if (!this.isCellCoordinate(x, y)) return false;
    return this.walkableCells[y * this.width + x];
  }

  /** Changes a cell's traversability. Returns false when the cell is invalid. */
  setWalkable(x: number, y: number, walkable: boolean): boolean {
    if (!this.isCellCoordinate(x, y) || typeof walkable !== 'boolean') return false;
    this.walkableCells[y * this.width + x] = walkable;
    return true;
  }

  /** Finds an optimal path including both endpoints, or returns null when invalid or unreachable. */
  findPath(start: GridPoint2D, goal: GridPoint2D, options: AStarGrid2DOptions = {}): GridPoint2D[] | null {
    if (!this.isPoint(start) || !this.isPoint(goal) ||
      !this.isWalkable(start.x, start.y) || !this.isWalkable(goal.x, goal.y)) return null;

    const startIndex = start.y * this.width + start.x;
    const goalIndex = goal.y * this.width + goal.x;
    if (startIndex === goalIndex) return [{ x: start.x, y: start.y }];

    const allowDiagonal = options !== null && options.allowDiagonal === true;
    const allowCornerCutting = options !== null && options.allowCornerCutting === true;
    const neighbors = allowDiagonal ? ORTHOGONAL_NEIGHBORS.concat(DIAGONAL_NEIGHBORS) : ORTHOGONAL_NEIGHBORS;
    const count = this.walkableCells.length;
    const costs: number[] = [];
    const parents: number[] = [];
    const closed: boolean[] = [];
    for (let index = 0; index < count; index++) {
      costs.push(Infinity);
      parents.push(-1);
      closed.push(false);
    }

    const goalX = goal.x;
    const goalY = goal.y;
    costs[startIndex] = 0;
    const startHeuristic = this.heuristic(start.x, start.y, goalX, goalY, allowDiagonal);
    const open = new SearchHeap();
    open.push({ index: startIndex, cost: 0, heuristic: startHeuristic, score: startHeuristic });

    while (true) {
      const current = open.pop();
      if (current === null) break;
      if (closed[current.index] || current.cost > costs[current.index]) continue;
      if (current.index === goalIndex) return this.reconstructPath(parents, startIndex, goalIndex);
      closed[current.index] = true;

      const currentX = current.index % this.width;
      const currentY = Math.floor(current.index / this.width);
      for (let neighborIndex = 0; neighborIndex < neighbors.length; neighborIndex++) {
        const offset = neighbors[neighborIndex];
        const nextX = currentX + offset[0];
        const nextY = currentY + offset[1];
        if (!this.isWalkable(nextX, nextY)) continue;

        const diagonal = offset[0] !== 0 && offset[1] !== 0;
        if (diagonal && !allowCornerCutting &&
          (!this.isWalkable(currentX + offset[0], currentY) ||
            !this.isWalkable(currentX, currentY + offset[1]))) continue;

        const nextIndex = nextY * this.width + nextX;
        if (closed[nextIndex]) continue;
        const nextCost = costs[current.index] + (diagonal ? DIAGONAL_COST : 1);
        if (nextCost >= costs[nextIndex]) continue;

        parents[nextIndex] = current.index;
        costs[nextIndex] = nextCost;
        const heuristic = this.heuristic(nextX, nextY, goalX, goalY, allowDiagonal);
        open.push({ index: nextIndex, cost: nextCost, heuristic, score: nextCost + heuristic });
      }
    }

    return null;
  }

  private isCellCoordinate(x: number, y: number): boolean {
    return typeof x === 'number' && typeof y === 'number' &&
      Math.floor(x) === x && Math.floor(y) === y &&
      x >= 0 && y >= 0 && x < this.width && y < this.height;
  }

  private isPoint(value: GridPoint2D): boolean {
    return value !== null && typeof value === 'object' && this.isCellCoordinate(value.x, value.y);
  }

  private heuristic(x: number, y: number, goalX: number, goalY: number, allowDiagonal: boolean): number {
    const dx = Math.abs(goalX - x);
    const dy = Math.abs(goalY - y);
    if (!allowDiagonal) return dx + dy;
    const smaller = Math.min(dx, dy);
    const larger = Math.max(dx, dy);
    return larger + (DIAGONAL_COST - 1) * smaller;
  }

  private reconstructPath(parents: number[], startIndex: number, goalIndex: number): GridPoint2D[] | null {
    const reversed: GridPoint2D[] = [];
    let current = goalIndex;
    while (current !== -1 && reversed.length <= this.walkableCells.length) {
      reversed.push({ x: current % this.width, y: Math.floor(current / this.width) });
      if (current === startIndex) break;
      current = parents[current];
    }
    if (reversed.length === 0 || current !== startIndex) return null;

    const route: GridPoint2D[] = [];
    for (let index = reversed.length - 1; index >= 0; index--) route.push(reversed[index]);
    return route;
  }
}
