import { GameContext, bindGameContext } from '../../src/core/context';
import type { Game } from '../../src/core/game';
import type { Color, Rect, Vec2 } from '../../src/core/types';
import type { Renderer } from '../../src/core/renderer';
import { GameObject } from '../../src/game/game-object';
import { GameScene } from '../../src/game/game-scene';
import { SpriteSheet } from '../../src/sprites/sprite-sheet';
import { Tilemap } from '../../src/tilemap/tilemap';
import type { TilemapCellFlip } from '../../src/tilemap/tilemap';
import type { Texture } from '../../src/textures/texture';

function expect(value: boolean, label: string): void {
  if (!value) {
    console.error('FAIL: ' + label);
    process.exit(1);
  }
}

interface DrawCall {
  source: Rect;
  destination: Rect;
  rotation: number;
}

function transformPoint(point: Vec2, flip: TilemapCellFlip): Vec2 {
  let x = point.x;
  let y = point.y;
  if (flip.flipDiagonal === true) { const swap = x; x = y; y = swap; }
  if (flip.flipX === true) x = 1 - x;
  if (flip.flipY === true) y = 1 - y;
  return { x, y };
}

function expectedMatrix(flip: TilemapCellFlip): number[] {
  const center = transformPoint({ x: 0.5, y: 0.5 }, flip);
  const xPoint = transformPoint({ x: 1, y: 0.5 }, flip);
  const yPoint = transformPoint({ x: 0.5, y: 1 }, flip);
  return [(xPoint.x - center.x) * 2, (yPoint.x - center.x) * 2,
    (xPoint.y - center.y) * 2, (yPoint.y - center.y) * 2];
}

function actualMatrix(draw: DrawCall): number[] {
  const sourceX = draw.source.width < 0 ? -1 : 1;
  const sourceY = draw.source.height < 0 ? -1 : 1;
  const radians = draw.rotation * Math.PI / 180;
  const cosine = Math.round(Math.cos(radians));
  const sine = Math.round(Math.sin(radians));
  return [cosine * sourceX, -sine * sourceY, sine * sourceX, cosine * sourceY];
}

function sameMatrix(a: number[], b: number[]): boolean {
  for (let index = 0; index < 4; index++) if (a[index] !== b[index]) return false;
  return true;
}

function contains(rect: Rect, point: Vec2): boolean {
  return point.x >= rect.x && point.x < rect.x + rect.width &&
    point.y >= rect.y && point.y < rect.y + rect.height;
}

const game = {} as Game;
const context = GameContext.create();
if (context === null) {
  console.error('FAIL: runtime context is available');
  process.exit(1);
}
context.markReady();
bindGameContext(game, context);

const drawCalls: DrawCall[] = [];
const texture = {
  width: 32,
  height: 16,
  isLoaded: true,
  dispose(): void {},
  drawRegion(source: Rect, destination: Rect, _origin: Vec2, rotation: number, _tint: Color): boolean {
    drawCalls.push({ source: { x: source.x, y: source.y, width: source.width, height: source.height },
      destination: { x: destination.x, y: destination.y, width: destination.width, height: destination.height },
      rotation });
    return true;
  },
} as any as Texture;
context.register(texture);
const sheet = new SpriteSheet(texture, { frameWidth: 16, frameHeight: 16 });
const frameA = sheet.gridFrame(0, 0);
const frameB = sheet.gridFrame(1, 0);
if (frameA === null || frameB === null) {
  console.error('FAIL: atlas frames are valid');
  process.exit(1);
}

const flipCases: TilemapCellFlip[] = [
  {},
  { flipX: true },
  { flipY: true },
  { flipDiagonal: true },
  { flipDiagonal: true, flipX: true },
  { flipDiagonal: true, flipY: true },
  { flipDiagonal: true, flipX: true, flipY: true },
  { flipX: true },
];
const expectedFlipCases: TilemapCellFlip[] = [];
const flipData: number[] = [];
for (let index = 0; index < flipCases.length; index++) {
  flipData.push(1);
  expectedFlipCases.push({ flipX: flipCases[index].flipX, flipY: flipCases[index].flipY,
    flipDiagonal: flipCases[index].flipDiagonal });
}
const flipMap = new Tilemap(sheet, {
  columns: 8, rows: 1, tileWidth: 16, tileHeight: 16,
  tiles: [{ id: 1, frame: frameA }], data: flipData, cellFlips: flipCases,
});
expect(flipMap.error === null, 'row-major per-cell flip flags validate');
flipCases[1].flipX = false;
expect(flipMap.setTile(7, 0, 1), 'setTile without flags resets the cell to the default transform');
const flipObject = new GameObject();
flipObject.addComponent(flipMap);
const flipScene = new GameScene(game);
flipScene.add(flipObject);
const renderer = {
  _beginSceneRender(): void {},
  isRectVisibleIn2D(): boolean { return true; },
  _recordSpriteDrawn(): void {},
  _recordSpriteCulled(_count?: number): void {},
} as any as Renderer;
flipScene.render(renderer);
expect(drawCalls.length === 8, 'all non-empty cells render in row-major order');
for (let index = 0; index < flipCases.length; index++) {
  const expected = index === 7 ? expectedMatrix({}) : expectedMatrix(expectedFlipCases[index]);
  expect(sameMatrix(actualMatrix(drawCalls[index]), expected),
    'Tiled diagonal-first transform is preserved for cell ' + index);
}
flipScene.destroy();
const invalidFlipMap = new Tilemap(sheet, { columns: 1, rows: 1, tileWidth: 16, tileHeight: 16,
  tiles: [{ id: 1, frame: frameA }], cellFlips: [{ flipX: 1 } as any] });
expect(invalidFlipMap.error !== null, 'non-boolean flip flags are rejected error=' + invalidFlipMap.error);

const cells = new Array(32 * 32);
for (let index = 0; index < cells.length; index++) cells[index] = 0;
const map = new Tilemap(sheet, {
  columns: 32, rows: 32, tileWidth: 8, tileHeight: 8,
  tiles: [
    { id: 1, frame: frameA, solid: true },
    { id: 2, frame: frameB, collision: { x: 2, y: 1, width: 4, height: 3 } },
  ], data: cells,
});
expect(map.error === null && map.chunkCount === 4, 'tilemap indexes cells in fixed-size chunks');
expect(map.setTile(0, 0, 1) && map.setTile(1, 0, 1) && map.setTile(0, 1, 1) && map.setTile(1, 1, 1),
  'full-cell collision cells can be assigned');
expect(map.setTile(2, 0, 2) && map.setTile(3, 0, 2), 'custom rectangles remain per-cell');
expect(map.setTile(4, 0, 2, { flipDiagonal: true, flipX: true }),
  'tile flip flags can be assigned with a collision-bearing tile');
const regions = map.getSolidRegions();
expect(regions.length === 4, 'adjacent full cells merge while custom rectangles remain unmerged');
expect(regions[0].x === 0 && regions[0].y === 0 && regions[0].width === 16 && regions[0].height === 16,
  'merged region reports exact local pixel bounds');
expect(regions[1].x === 18 && regions[1].y === 1 && regions[1].width === 4 && regions[1].height === 3 &&
  regions[2].x === 26 && regions[2].y === 1 && regions[2].width === 4 && regions[2].height === 3 &&
  regions[3].x === 36 && regions[3].y === 2 && regions[3].width === 3 && regions[3].height === 4,
  'custom collision rectangles retain their original float bounds');
const solidTiles = map.getSolidTiles();
for (let y = 0.25; y < 24; y += 0.5) {
  for (let x = 0.25; x < 40; x += 0.5) {
    let tileCovered = false;
    let regionCovered = false;
    for (let index = 0; index < solidTiles.length; index++) {
      if (contains(solidTiles[index].bounds, { x, y })) tileCovered = true;
    }
    for (let index = 0; index < regions.length; index++) {
      if (contains(regions[index], { x, y })) regionCovered = true;
    }
    expect(tileCovered === regionCovered, 'solid-region union matches per-cell union at ' + x + ',' + y);
  }
}

const mapObject = new GameObject();
mapObject.addComponent(map);
const scene = new GameScene(game);
scene.add(mapObject);
let visibleChunkOnly = false;
let culledSprites = 0;
const cullingRenderer = {
  _beginSceneRender(): void {},
  isRectVisibleIn2D(rect: Rect): boolean {
    return !visibleChunkOnly || (rect.x < 128 && rect.y < 128);
  },
  _recordSpriteDrawn(): void {},
  _recordSpriteCulled(count = 1): void { culledSprites += count; },
} as any as Renderer;
scene.render(cullingRenderer);
expect(map.dirtyChunkCount === 0, 'visible initial chunks clear their dirty state');
expect(map.setTile(17, 4, 1) && map.dirtyChunkCount === 1,
  'setTile invalidates exactly its owning chunk');
expect(map.setTile(18, 4, 1) && map.dirtyChunkCount === 1,
  'multiple cell edits in one chunk keep one dirty chunk');
expect(map.setTile(1, 1, 1) && map.dirtyChunkCount === 2,
  'editing a second chunk invalidates that chunk too');
expect(map.fill(0) && map.dirtyChunkCount === map.chunkCount,
  'fill invalidates every chunk and clears its occupied-cell cache');
expect(map.fill(1), 'fill repopulates the tilemap');
visibleChunkOnly = true;
culledSprites = 0;
scene.render(cullingRenderer);
expect(map.lastRenderVisibleChunkCount === 1 && map.lastRenderVisitedCellCount === 256,
  'offscreen chunks skip cell iteration while the visible chunk visits occupied cells');
expect(map.dirtyChunkCount === map.chunkCount - 1,
  'rendering clears only the visible chunk dirty state');
expect(culledSprites === 3 * 256, 'chunk culling preserves per-sprite renderer statistics');

const benchmarkCellCount = 256 * 256;
const sparseData = new Array(benchmarkCellCount);
const denseData = new Array(benchmarkCellCount);
for (let index = 0; index < benchmarkCellCount; index++) {
  sparseData[index] = 0;
  denseData[index] = 1;
}
for (let chunkRow = 0; chunkRow < 16; chunkRow++) {
  for (let chunkColumn = 0; chunkColumn < 16; chunkColumn++) {
    sparseData[(chunkRow * 16) * 256 + chunkColumn * 16] = 1;
  }
}
const sparseMap = new Tilemap(sheet, { columns: 256, rows: 256, tileWidth: 8, tileHeight: 8,
  tiles: [{ id: 1, frame: frameA }], data: sparseData });
const denseMap = new Tilemap(sheet, { columns: 256, rows: 256, tileWidth: 8, tileHeight: 8,
  tiles: [{ id: 1, frame: frameA }], data: denseData });
const benchmarkScene = new GameScene(game);
const sparseObject = new GameObject();
const denseObject = new GameObject();
sparseObject.addComponent(sparseMap);
denseObject.addComponent(denseMap);
benchmarkScene.add(sparseObject);
benchmarkScene.add(denseObject);
culledSprites = 0;
const benchmarkStartedAt = Date.now();
benchmarkScene.render(cullingRenderer);
const benchmarkElapsedMs = Date.now() - benchmarkStartedAt;
expect(sparseMap.chunkCount === 256 && denseMap.chunkCount === 256 &&
  sparseMap.lastRenderVisibleChunkCount === 1 && denseMap.lastRenderVisibleChunkCount === 1,
  'sparse and dense map benchmarks cull the same offscreen chunks');
expect(sparseMap.lastRenderVisitedCellCount === 1 && denseMap.lastRenderVisitedCellCount === 256,
  'sparse and dense benchmarks visit only occupied cells in the visible chunk');
console.log('Tilemap benchmark cells=65536 layout=sparse visited=' + sparseMap.lastRenderVisitedCellCount +
  ' denseVisited=' + denseMap.lastRenderVisitedCellCount + ' elapsedMs=' + benchmarkElapsedMs);
benchmarkScene.destroy();

scene.destroy();
context.dispose();
console.log('Tilemap chunk and collision-region runtime checks passed.');
