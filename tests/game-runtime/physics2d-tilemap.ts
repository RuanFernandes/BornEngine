import { GameContext, bindGameContext } from '../../src/core/context';
import type { Game } from '../../src/core/game';
import type { Renderer } from '../../src/core/renderer';
import type { Color, Rect, Vec2 } from '../../src/core/types';
import { GameObject } from '../../src/game/game-object';
import { GameScene } from '../../src/game/game-scene';
import { Scene } from '../../src/game/scene';
import { PhysicsWorld2D } from '../../src/physics2d/physics-world-2d';
import type { PhysicsContact2D } from '../../src/physics2d/physics-body-2d';
import { SpriteSheet } from '../../src/sprites/sprite-sheet';
import { Tilemap } from '../../src/tilemap/tilemap';
import type { Texture } from '../../src/textures/texture';

function expect(value: boolean, label: string): void {
  if (!value) {
    console.error('FAIL: ' + label);
    process.exit(1);
  }
}

function hasId(values: Array<{ id: number }>, id: number): boolean {
  for (let index = 0; index < values.length; index++) if (values[index].id === id) return true;
  return false;
}

const game = {} as Game;
const context = GameContext.create();
if (context === null) {
  console.error('FAIL: runtime context is available');
  process.exit(1);
}
context.markReady();
bindGameContext(game, context);

const world = new PhysicsWorld2D(game, {
  gravity: { x: 0, y: 0 },
  fixedTimeStep: 0.1,
  maxSubSteps: 4,
});
expect(world.isReady && world.error === null, 'PhysicsWorld2D binds to a ready Game context');

const wall = world.createBody({ type: 'static', shape: { type: 'box', width: 2, height: 4 }, position: { x: 5, y: 0 } });
const ball = world.createBody({
  type: 'dynamic',
  shape: { type: 'circle', radius: 1 },
  position: { x: 2.5, y: 0 },
  velocity: { x: 10, y: 0 },
  friction: 0,
});
let collisionEnter = 0;
ball.onCollisionEnter = (contact) => {
  collisionEnter++;
  expect(contact.self === ball && contact.other === wall && contact.normal.x > 0,
    'body collision callback receives a self-oriented normal');
};
expect(world.step(0.1) === 1, 'fixed-step world runs one substep at the configured timestep');
expect(collisionEnter === 1 && ball.position.x < 4 && ball.velocity.x <= 0,
  'circle-box collision resolves penetration and velocity');

const queryHit = world.raycast({ x: 0, y: 0 }, { x: 1, y: 0 }, 20);
expect(queryHit !== null && queryHit.body === ball,
  'raycast returns the closest body in the ray path');
const reverseRayHit = world.raycast({ x: 10, y: 0 }, { x: -1, y: 0 }, 10);
expect(reverseRayHit !== null && reverseRayHit.body === wall && reverseRayHit.normal.x > 0,
  'reverse box raycasts return an outward-facing normal');
const insideBoxRayHit = world.raycast({ x: 5, y: 0 }, { x: 1, y: 0 }, 10);
expect(insideBoxRayHit !== null && insideBoxRayHit.body === wall &&
  insideBoxRayHit.normal.x > 0 && Math.abs(insideBoxRayHit.distance - 1) < 0.001,
  'box raycasts starting inside return the outward normal of the exit face');
const pointHits = world.overlapPoint(ball.position);
expect(pointHits.length === 1 && pointHits[0].id === ball.id,
  'point overlap query includes a body containing the point');
const circleHits = world.overlapCircle({ x: 5, y: 0 }, 1.1);
expect(hasId(circleHits, wall.id),
  'circle overlap query finds an axis-aligned box');

const boxA = world.createBody({
  type: 'static', shape: { type: 'box', width: 2, height: 2 }, position: { x: 60, y: 0 },
});
const boxB = world.createBody({
  type: 'dynamic', shape: { type: 'box', width: 2, height: 2 }, position: { x: 61.5, y: 0 },
});
let boxContact = false;
boxB.onCollisionEnter = () => { boxContact = true; };
expect(world.step(0.1) === 1 && boxContact && boxB.position.x > 61.5,
  'box-box contacts resolve dynamic bodies away from static geometry');

const trigger = world.createBody({
  type: 'static', shape: { type: 'circle', radius: 1 }, position: { x: 20, y: 0 }, isSensor: true,
});
const visitor = world.createBody({
  type: 'dynamic', shape: { type: 'circle', radius: 0.5 }, position: { x: 21, y: 0 },
});
let triggerPhases = '';
trigger.onTriggerEnter = () => { triggerPhases += 'enter,'; };
trigger.onTriggerStay = () => { triggerPhases += 'stay,'; };
trigger.onTriggerExit = () => { triggerPhases += 'exit,'; };
expect(world.step(0.1) === 1, 'trigger pair advances in the next fixed step');
expect(world.step(0.1) === 1, 'trigger stay advances in the next fixed step');
visitor.setPosition({ x: 25, y: 0 });
expect(world.step(0.1) === 1 && triggerPhases === 'enter,stay,exit,',
  'trigger callbacks report enter, stay, and exit in order');
const queuedContacts: PhysicsContact2D[] = world.popContacts();
expect(queuedContacts.length >= 3, 'contact queue can be drained by the game loop');
expect(world.popContacts().length === 0, 'popContacts drains records instead of returning them repeatedly');

const otherLayer = world.createBody({
  type: 'static', shape: { type: 'box', width: 3, height: 3 }, position: { x: 35, y: 0 }, layer: 2, mask: 2,
});
const filteredRay = world.raycast({ x: 30, y: 0 }, { x: 1, y: 0 }, 10, { layerMask: 1 });
expect(filteredRay === null, 'query layer masks exclude non-matching body categories');
expect(otherLayer.isDisposed === false, 'registered bodies remain live until explicitly disposed');
const temporaryBody = world.createBody({ type: 'static', shape: { type: 'circle', radius: 1 } });
const countWithTemporary = world.bodyCount;
temporaryBody.dispose();
expect(world.bodyCount === countWithTemporary - 1,
  'disposing a body immediately removes it from its owning world');

const cappedWorld = new PhysicsWorld2D(game, { gravity: { x: 0, y: 0 }, fixedTimeStep: 0.1, maxSubSteps: 2 });
expect(cappedWorld.step(0.35) === 2 && cappedWorld.droppedTime > 0.14,
  'large deltas respect the catch-up budget and report discarded time');

const ownerScene = new GameScene(game);
const movingObject = new GameObject({ position: { x: 0, y: 0, z: 7 } });
const attachedBody = world.createBody({ type: 'dynamic', shape: { type: 'box', width: 1, height: 1 } });
expect(movingObject.addComponent(attachedBody) === attachedBody && ownerScene.add(movingObject) === movingObject,
  '2D physics components attach through the ordinary GameObject lifecycle');
attachedBody.setVelocity({ x: 1, y: 0 });
world.step(0.1);
expect(movingObject.transform.worldPosition.x > 0 && movingObject.transform.worldPosition.z === 7,
  'dynamic bodies sync position while preserving the GameObject depth');
movingObject.active = false;
const inactivePosition = attachedBody.position.x;
world.step(0.1);
expect(attachedBody.position.x === inactivePosition,
  'bodies on inactive GameObjects do not simulate');
movingObject.active = true;

const standaloneBody = world.createBody({
  type: 'dynamic',
  shape: { type: 'circle', radius: 0.25 },
  position: { x: 200, y: 200 },
  velocity: { x: 2, y: 0 },
  gravityScale: 0,
  friction: 0,
});
expect(world.step(0.1) === 1 && Math.abs(standaloneBody.position.x - 200.2) < 0.001,
  'standalone bodies use their configured world position and simulate while the world steps');

const positionedBody = world.createBody({
  type: 'static',
  shape: { type: 'box', width: 1, height: 1 },
  position: { x: 100, y: 100 },
});
const positionedObject = new GameObject({ position: { x: 300, y: 320, z: 0 } });
positionedObject.addComponent(positionedBody);
ownerScene.add(positionedObject);
expect(world.step(0.1) === 1 && positionedBody.position.x === 300 && positionedBody.position.y === 320,
  'an attached body takes its initial world position from its GameObject transform');
ownerScene.remove(positionedObject);
positionedBody.dispose();
standaloneBody.dispose();

const draws: Array<{ source: Rect; destination: Rect; origin: Vec2; rotation: number; tint: Color }> = [];
const texture = {
  width: 32,
  height: 16,
  isLoaded: true,
  dispose(): void {},
  drawRegion(source: Rect, destination: Rect, origin: Vec2, rotation: number, tint: Color): boolean {
    draws.push({ source, destination, origin, rotation, tint });
    return true;
  },
} as any as Texture;
context.register(texture);
const sheet = new SpriteSheet(texture, { frameWidth: 16, frameHeight: 16 });
const tileFrame0 = sheet.gridFrame(0, 0);
const tileFrame1 = sheet.gridFrame(1, 0);
if (tileFrame0 === null || tileFrame1 === null) {
  console.error('FAIL: tile atlas frames are valid');
  process.exit(1);
}
const tilemap = new Tilemap(sheet, {
  columns: 2,
  rows: 2,
  tileWidth: 16,
  tileHeight: 16,
  tiles: [
    { id: 1, frame: tileFrame0, solid: true },
    { id: 2, frame: tileFrame1, collision: { x: 2, y: 3, width: 8, height: 6 } },
  ],
  data: [1, 0, 2, 1],
});
expect(tilemap.error === null && tilemap.tileCount === 3,
  'tilemap validates named atlas frames and row-major cell data');
const solidTiles = tilemap.getSolidTiles();
expect(solidTiles.length === 3 && solidTiles[1].bounds.x === 2 && solidTiles[1].bounds.y === 19 &&
  solidTiles[1].bounds.width === 8 && solidTiles[1].bounds.height === 6,
  'solid tile data includes custom local collision rectangles');
expect(tilemap.setTile(1, 0, 1) && tilemap.getTile(1, 0) === 1,
  'tilemap supports validated runtime cell updates');
const badMap = new Tilemap(sheet, {
  columns: 1, rows: 1, tileWidth: 16, tileHeight: 16,
  tiles: [{ id: 1, frame: tileFrame0 }], data: [4],
});
expect(badMap.error !== null && !badMap.setTile(0, 0, 4),
  'invalid tile IDs fail safely without throwing');

const mapObject = new GameObject({ position: { x: 10, y: 20, z: 0 } });
mapObject.addComponent(tilemap);
const mapScene = new GameScene(game);
expect(mapScene.add(mapObject) === mapObject, 'tilemap component attaches to a GameObject');
let drawnQuads = 0;
let culledQuads = 0;
let cameraSeesTiles = true;
const renderer = {
  _beginSceneRender(): void {},
  isRectVisibleIn2D(): boolean { return cameraSeesTiles; },
  _recordSpriteDrawn(): void { drawnQuads++; },
  _recordSpriteCulled(): void { culledQuads++; },
} as any as Renderer;
mapScene.render(renderer);
expect(draws.length === 4 && draws[0].destination.x === 10 && draws[0].destination.y === 20 &&
  draws[0].destination.width === 16 && draws[0].destination.height === 16 &&
  drawnQuads === 4 && culledQuads === 0,
  'tilemap draws visible occupied cells at transformed world positions and records sprite metrics');
draws.length = 0;
cameraSeesTiles = false;
mapScene.render(renderer);
expect(draws.length === 0 && drawnQuads === 4 && culledQuads === 4,
  'tilemap camera culling skips offscreen atlas draws and records culled quads');

const trimmedSheet = new SpriteSheet(texture, {
  frames: [{
    name: 'trimmed',
    source: { x: 20, y: 4, width: 8, height: 6 },
    trim: { offset: { x: 2, y: 3 }, originalSize: { x: 16, y: 16 } },
  }],
});
const trimmedFrame = trimmedSheet.getFrame('trimmed');
expect(trimmedSheet.error === null && trimmedFrame !== null,
  'tilemap test trimmed atlas frame is valid: ' + (trimmedSheet.error || 'frame missing'));
if (trimmedFrame === null) process.exit(1);
const trimmedMap = new Tilemap(trimmedSheet, {
  columns: 1,
  rows: 1,
  tileWidth: 16,
  tileHeight: 16,
  tiles: [{ id: 1, frame: trimmedFrame }],
  data: [1],
});
expect(trimmedMap.error === null && trimmedMap.tileCount === 1,
  'mirrored tilemap is ready with one occupied cell: ' + (trimmedMap.error || 'empty map'));
const mirroredMapObject = new GameObject({
  position: { x: 10, y: 20, z: 0 },
  scale: { x: -1, y: 1, z: 1 },
});
mirroredMapObject.addComponent(trimmedMap);
const trimmedScene = new GameScene(game);
expect(trimmedScene.add(mirroredMapObject) === mirroredMapObject,
  'mirrored tilemap attaches to the scene');
draws.length = 0;
cameraSeesTiles = true;
trimmedScene.render(renderer);
expect(draws.length === 1 && draws[0].source.width === -8 &&
  draws[0].destination.x === -4 && draws[0].destination.y === 23,
  'tilemap mirrors trimmed frame offsets when world scale is negative: ' +
    draws.length + ', ' + (draws.length > 0 ? draws[0].source.width + '/' +
      draws[0].destination.x + '/' + draws[0].destination.y : 'no draw'));
trimmedScene.destroy();

expect(tilemap.setTile(0, 0, 0) && tilemap.getSolidTiles().length === 3,
  'empty cells no longer contribute collision rectangles');
const bodyCountBeforeInvalid = world.bodyCount;
const invalidBody = world.createBody({ type: 'dynamic', shape: { type: 'box', width: -1, height: 1 } });
expect(invalidBody.error !== null && world.bodyCount === bodyCountBeforeInvalid,
  'malformed bodies expose an error and are excluded from the world');

mapScene.destroy();
ownerScene.destroy();
const lifecycleScene = new Scene(game);
const sceneOwnedWorld = new PhysicsWorld2D(game);
expect(lifecycleScene.own(sceneOwnedWorld) === sceneOwnedWorld,
  'a physics world can be owned by a Scene for cleanup');
lifecycleScene.destroy();
expect(sceneOwnedWorld.isDisposed, 'unloading a Scene disposes its owned physics world');
cappedWorld.dispose();
world.dispose();
expect(world.isDisposed && world.bodyCount === 0 && attachedBody.isDisposed,
  'world disposal releases all owned bodies');
context.dispose();
console.log('Physics2D and tilemap runtime checks passed.');
