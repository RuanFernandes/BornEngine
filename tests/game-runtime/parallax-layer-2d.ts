import { GameContext, bindGameContext } from '../../src/core/context';
import type { Game } from '../../src/core/game';
import type { Renderer } from '../../src/core/renderer';
import type { Camera2D, Color, Rect, Vec2 } from '../../src/core/types';
import { GameObject } from '../../src/game/game-object';
import { GameScene } from '../../src/game/game-scene';
import { GameComponent } from '../../src/game/game-component';
import { ParallaxLayer2D } from '../../src/camera2d/parallax-layer-2d';
import { SpriteRenderer } from '../../src/sprites/sprite-renderer';
import { SpriteSheet } from '../../src/sprites/sprite-sheet';
import type { Texture } from '../../src/textures/texture';

declare const process: { exit(code: number): never };

function expect(value: boolean, label: string): void {
  if (!value) {
    console.error('FAIL: ' + label);
    process.exit(1);
  }
}

function createGame(): { game: Game; context: GameContext } {
  const game = {} as Game;
  const context = GameContext.create();
  if (context === null) {
    console.error('FAIL: parallax fixture context is available');
    process.exit(1);
  }
  context.markReady();
  bindGameContext(game, context);
  return { game, context };
}

const { game, context } = createGame();
const draws: Array<{ destination: Rect }> = [];
const texture = {
  handle: 1,
  width: 2,
  height: 2,
  isLoaded: true,
  dispose(): void {},
  drawRegion(_source: Rect, destination: Rect, _origin: Vec2, _rotation: number, _tint: Color): boolean {
    draws.push({ destination });
    return true;
  },
} as any as Texture;
context.register(texture);
const sheet = new SpriteSheet(texture, { frameWidth: 2, frameHeight: 2 });
const frame = sheet.gridFrame(0, 0);
expect(frame !== null, 'parallax fixture atlas frame is available');
if (frame === null) process.exit(1);

const camera: Camera2D = {
  offset: { x: 0, y: 0 }, target: { x: 0, y: 0 }, rotation: 0, zoom: 1,
};
const renderer = {
  activeCamera2D: camera,
  _beginSceneRender(): void {},
  isRectVisibleIn2D(): boolean { return true; },
  _recordSpriteDrawn(): void {},
  _recordSpriteCulled(): void {},
} as any as Renderer;
const scene = new GameScene(game);
const root = new GameObject();
const layerEvents: string[] = [];
const layer = new ParallaxLayer2D({
  factor: { x: 0.5, y: 0.25 },
  renderOrder: -10,
  draw(_renderer, _offset): void { layerEvents.push('layer'); },
});
root.addComponent(layer);
class RenderProbe extends GameComponent {
  renderOrder = 10;
  render(_renderer: Renderer): void { layerEvents.push('probe'); }
}
root.addComponent(new RenderProbe());
const spriteObject = new GameObject({ position: { x: 5, y: 4, z: 0 } });
spriteObject.addComponent(new SpriteRenderer(frame, { size: { x: 2, y: 2 } }));
root.addChild(spriteObject, { preserveWorldTransform: false });
scene.add(root);
scene.render(renderer);
expect(layerEvents.join(',') === 'layer,probe',
  'parallax callback participates in stable GameComponent render ordering');
expect(draws.length === 1 && draws[0].destination.x === 4 && draws[0].destination.y === 3,
  'parallax layer begins at its initial camera position without moving its sprite');

camera.target = { x: 20, y: 10 };
scene.render(renderer);
expect(draws.length === 2 && draws[1].destination.x === 14 && draws[1].destination.y === 10.5,
  'parallax factors move descendant sprites at the configured fraction of camera motion');

const independentCamera = new ParallaxLayer2D({ factor: 0.5 });
const noCameraOffset = independentCamera.offsetForCamera(null);
expect(noCameraOffset.x === 0 && noCameraOffset.y === 0,
  'parallax safely returns zero without an active camera');
const invalidLayer = new ParallaxLayer2D({ factor: { x: NaN, y: Infinity } });
expect(invalidLayer.error !== null && invalidLayer.factor.x === 1 && invalidLayer.factor.y === 1,
  'invalid parallax factors disable parallax safely');

scene.destroy();
context.disposeResources();
console.log('ParallaxLayer2D runtime fixture passed');
