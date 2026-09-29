import { GameContext, bindGameContext } from '../../src/core/context';
import type { Game } from '../../src/core/game';
import type { Renderer } from '../../src/core/renderer';
import type { Color, Rect, Vector2DLike } from '../../src/core/types';
import { GameObject } from '../../src/game/game-object';
import { GameScene } from '../../src/game/game-scene';
import { SpriteRenderer } from '../../src/sprites/sprite-renderer';
import { SpriteSheet } from '../../src/sprites/sprite-sheet';
import type { SpriteFrame } from '../../src/sprites/sprite-sheet';
import type { Texture } from '../../src/textures/texture';
import { Vector2D } from '../../src/math/vector2d';

function expect(value: boolean, label: string): void {
  if (!value) {
    console.error('FAIL: ' + label);
    process.exit(1);
  }
}

interface DrawCall {
  source: Rect;
  destination: Rect;
  origin: Vector2DLike;
  rotation: number;
  tint: Color;
}

const owner = {} as Game;
const context = GameContext.create();
if (context === null) {
  console.error('FAIL: test Game context is available');
  process.exit(1);
}
context.markReady();
bindGameContext(owner, context);

const calls: DrawCall[] = [];
let disposeCalls = 0;
const texture = {
  width: 100,
  height: 70,
  isLoaded: true,
  dispose(): void { disposeCalls++; },
  drawRegion(source: Rect, destination: Rect, origin: Vector2DLike, rotation: number, tint: Color): boolean {
    calls.push({ source, destination, origin, rotation, tint });
    return true;
  },
} as any as Texture;
context.register(texture);

const grid = new SpriteSheet(texture, {
  frameWidth: 16,
  frameHeight: 12,
  margin: { x: 2, y: 3 },
  spacing: { x: 1, y: 2 },
});
expect(grid.error === null && grid.columns === 5 && grid.rows === 4,
  'grid dimensions account for margins and spacing');
expect(grid.margin instanceof Vector2D && grid.spacing instanceof Vector2D &&
  grid.margin.magnitude === Math.sqrt(13) && grid.spacing.distanceTo({ x: 1, y: 2 }) === 0,
  'atlas margins and spacing expose Vector2D values');
grid.margin.set(100, 100);
grid.spacing.set(100, 100);
const topLeftGridFrame = grid.gridFrame(0, 0);
expect(topLeftGridFrame !== null && topLeftGridFrame.source.x === 2 && topLeftGridFrame.source.y === 3,
  'mutating a returned atlas vector cannot alter internal frame geometry');
const gridFrame = grid.gridFrame(4, 3);
expect(gridFrame !== null && gridFrame.source.x === 70 && gridFrame.source.y === 45,
  'grid frame uses the correct atlas coordinates');
expect(grid.gridFrame(4, 3) === gridFrame, 'grid frames are cached and reusable');
expect(grid.gridFrame(5, 0) === null && grid.gridFrame(-1, 0) === null,
  'out-of-range grid coordinates return null');

const definition = {
  name: 'walk-0',
  source: { x: 4, y: 6, width: 16, height: 8 },
  pivot: { x: 0.25, y: 0.75 },
  trim: { offset: { x: 3, y: 1 }, originalSize: { x: 32, y: 16 } },
};
const sheet = new SpriteSheet(texture, { frames: [definition] });
const frame = sheet.getFrame('walk-0');
expect(sheet.error === null && frame !== null && sheet.getFrame('missing') === null,
  'named frames are available by name');
expect(frame !== null && frame.source.x === 4 && frame.trim !== null && frame.originalSize.x === 32,
  'frame retains source, trim, and original-size metadata');
expect(frame !== null && frame.pivot instanceof Vector2D && frame.pivot.clamped({ x: 0, y: 0 }, { x: 1, y: 1 }).equals({ x: 0.25, y: 0.75 }) &&
  frame.originalSize instanceof Vector2D && frame.originalSize.distanceTo({ x: 32, y: 16 }) === 0 &&
  frame.trim !== null && frame.trim.offset instanceof Vector2D &&
  frame.trim.offset.distanceTo({ x: 3, y: 1 }) === 0 &&
  frame.trim.originalSize instanceof Vector2D,
  'frame metadata exposes Vector2D values and methods');
if (frame !== null) frame.pivot.set(0, 0);
expect(frame !== null && frame.pivot.x === 0.25 && frame.pivot.y === 0.75,
  'mutating a returned frame vector cannot alter immutable atlas metadata');
const invalid = new SpriteSheet(texture, {
  frames: [{ name: 'outside', source: { x: 96, y: 68, width: 8, height: 8 } }],
});
expect(invalid.error !== null && invalid.getFrame('outside') === null,
  'out-of-texture frame definitions fail safely');

if (frame === null) process.exit(1);
const sprite = new SpriteRenderer(frame, {
  size: { x: 32, y: 16 },
  pivot: { x: 0.25, y: 0.75 },
  tint: { r: 0.8, g: 0.6, b: 0.4, a: 1 },
  flipX: true,
  flipY: true,
});
const scene = new GameScene(owner);
const object = new GameObject({
  position: { x: 10, y: 20, z: 0 },
  scale: { x: 2, y: 0.5, z: 1 },
  rotation: { x: 0, y: 0, z: 0.70710678, w: 0.70710678 },
});
object.addComponent(sprite);
expect(scene.add(object) === object, 'sprite renderer attaches to the texture owning Game');
expect(!sprite._canAttachTo({ owns: (_resource: object) => false } as any),
  'sprite renderer rejects a texture owned by another Game');
let cameraVisible = true;
let culledSprites = 0;
let submittedSprites = 0;
let measuredBounds: Rect | null = null;
const renderer = {
  _beginSceneRender(): void {},
  isRectVisibleIn2D(bounds: Rect): boolean { measuredBounds = bounds; return cameraVisible; },
  _recordSpriteDrawn(): void { submittedSprites++; },
  _recordSpriteCulled(): void { culledSprites++; },
} as any as Renderer;
scene.render(renderer);
expect(calls.length === 1, 'scene automatically draws an attached sprite');
expect(calls[0].source.x === 20 && calls[0].source.y === 14 &&
  calls[0].source.width === -16 && calls[0].source.height === -8,
  'sprite flips sample the same atlas frame instead of the neighboring region');
expect(calls[0].destination.x === 20 && calls[0].destination.y === 17.5 &&
  calls[0].destination.width === 32 && calls[0].destination.height === 4,
  'sprite draw uses world position and scale while preserving trim proportions');
expect(calls[0].origin.x === -10 && calls[0].origin.y === 2.5 &&
  calls[0].destination.x + calls[0].origin.x === 10 &&
  calls[0].destination.y + calls[0].origin.y === 20,
  'trimmed and mirrored sprite geometry keeps its pivot at the GameObject position');
expect(Math.abs(calls[0].rotation - 90) < 0.001,
  'sprite draw uses world Z rotation: ' + calls[0].rotation);
expect(measuredBounds !== null && Math.abs(measuredBounds.x - 8.5) < 0.01 &&
  Math.abs(measuredBounds.y - 30) < 0.01 && Math.abs(measuredBounds.width - 4) < 0.01 &&
  Math.abs(measuredBounds.height - 32) < 0.01,
  'sprite camera bounds account for world rotation and mirrored trim pivot');
expect(submittedSprites === 1 && culledSprites === 0,
  'sprite workload counts successfully submitted quads');
cameraVisible = false;
scene.render(renderer);
expect(calls.length === 1 && submittedSprites === 1 && culledSprites === 1,
  'camera culling avoids texture submission and records the skipped sprite');
expect(calls[0].tint.r === 0.8 && calls[0].tint.g === 0.6,
  'sprite tint is passed to the texture draw call');
expect(disposeCalls === 0, 'SpriteSheet does not dispose its shared Texture');

console.log('PASS: sprite sheets and renderer');
