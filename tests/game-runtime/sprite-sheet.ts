import { GameContext, bindGameContext } from '../../src/core/context';
import type { Game } from '../../src/core/game';
import type { Renderer } from '../../src/core/renderer';
import type { Color, Rect, Vec2 } from '../../src/core/types';
import { GameObject } from '../../src/game/game-object';
import { GameScene } from '../../src/game/game-scene';
import { SpriteRenderer, SpriteSheet } from '../../src/sprites';
import type { SpriteFrame } from '../../src/sprites';
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
  origin: Vec2;
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
  drawRegion(source: Rect, destination: Rect, origin: Vec2, rotation: number, tint: Color): boolean {
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
  trim: { offset: { x: 8, y: 4 }, originalSize: { x: 32, y: 16 } },
};
const sheet = new SpriteSheet(texture, { frames: [definition] });
const frame = sheet.getFrame('walk-0');
expect(sheet.error === null && frame !== null && sheet.getFrame('missing') === null,
  'named frames are available by name');
expect(frame !== null && frame.source.x === 4 && frame.trim !== null && frame.originalSize.x === 32,
  'frame retains source, trim, and original-size metadata');
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
scene.render({} as Renderer);
expect(calls.length === 1, 'scene automatically draws an attached sprite');
expect(calls[0].source.x === 4 && calls[0].source.y === 6 && calls[0].source.width === -16,
  'sprite flip reverses its source region');
expect(calls[0].destination.x === 10 && calls[0].destination.y === 20 &&
  calls[0].destination.width === 32 && calls[0].destination.height === 4,
  'sprite draw uses world position and scale while preserving trim proportions');
expect(calls[0].origin.x === 0 && calls[0].origin.y === 4,
  'sprite draw uses its normalized pivot: ' + calls[0].origin.x + ',' + calls[0].origin.y);
expect(Math.abs(calls[0].rotation - 90) < 0.001,
  'sprite draw uses world Z rotation: ' + calls[0].rotation);
expect(calls[0].tint.r === 0.8 && calls[0].tint.g === 0.6,
  'sprite tint is passed to the texture draw call');
expect(disposeCalls === 0, 'SpriteSheet does not dispose its shared Texture');

console.log('PASS: sprite sheets and renderer');
