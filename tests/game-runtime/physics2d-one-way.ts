import { GameContext, bindGameContext } from '../../src/core/context';
import type { Game } from '../../src/core/game';
import { GameObject } from '../../src/game/game-object';
import { GameScene } from '../../src/game/game-scene';
import { CharacterBody2D } from '../../src/physics2d/character-body-2d';
import { PhysicsWorld2D } from '../../src/physics2d/physics-world-2d';

function expect(value: boolean, label: string): void {
  if (!value) { console.error('FAIL: ' + label); process.exit(1); }
}
const game = {} as Game;
const context = GameContext.create();
if (context === null) process.exit(1);
context.markReady();
bindGameContext(game, context);
const world = new PhysicsWorld2D(game, { gravity: { x: 0, y: 0 }, fixedTimeStep: 0.1 });
const invalid = world.createBody({ type: 'static', shape: { type: 'segment',
  start: { x: -10, y: 0 }, end: { x: 10, y: 0 } }, oneWay: { normal: { x: 0, y: 0 }, tolerance: 0.01 } });
expect(invalid.error !== null, 'one-way outward normal must be nonzero');
const invalidTolerance = world.createBody({ type: 'static', shape: { type: 'segment',
  start: { x: -10, y: 0 }, end: { x: 10, y: 0 } }, oneWay: { normal: { x: 0, y: -1 }, tolerance: -1 } });
expect(invalidTolerance.error !== null, 'one-way tolerance must be nonnegative');
const overflowNormal = world.createBody({ type: 'static', shape: { type: 'segment',
  start: { x: -10, y: 0 }, end: { x: 10, y: 0 } },
  oneWay: { normal: { x: 1.7e308, y: 1.7e308 }, tolerance: 0 } });
expect(overflowNormal.error !== null, 'overflowing one-way normal is rejected instead of becoming zero');
const platform = world.createBody({ type: 'static', shape: { type: 'segment',
  start: { x: -10, y: 0 }, end: { x: 10, y: 0 } }, oneWay: { normal: { x: 0, y: -1 }, tolerance: 0.01 },
  layer: 2, mask: 1 });
expect(platform.error === null, 'one-way segment is ready');
const rising = world.createBody({ type: 'dynamic', shape: { type: 'circle', radius: 1 },
  position: { x: 0, y: 5 }, velocity: { x: 0, y: -100 }, gravityScale: 0, layer: 1, mask: 2 });
world.step(0.1);
expect(rising.position.y < -4.9 && world.popContacts().length === 0,
  'body rising through underside passes through the one-way platform');
rising.dispose();
const falling = world.createBody({ type: 'dynamic', shape: { type: 'box', width: 2, height: 2 },
  position: { x: 0, y: -5 }, velocity: { x: 0, y: 50 }, gravityScale: 0, layer: 1, mask: 2, ccd: true });
world.step(0.1);
const first = world.popContacts();
expect(falling.position.y <= -0.99 && first.length === 1 && first[0].normal.y < -0.99,
  'body approaching the outward side lands on one-way surface');
expect(first[0].normal.magnitude === 1, 'one-way contact normal is a Vector2D unit value');
falling.dispose();
world.clearContacts();
const filtered = world.createBody({ type: 'dynamic', shape: { type: 'circle', radius: 1 },
  position: { x: 0, y: -0.5 }, gravityScale: 0, layer: 4, mask: 2 });
world.step(0.1);
expect(world.popContacts().length === 0, 'layer and mask filter one-way contacts');
filtered.dispose();
const character = new CharacterBody2D(world, { width: 2, height: 2 });
const characterObject = new GameObject({ position: { x: 0, y: 5, z: 0 } });
const scene = new GameScene(game);
characterObject.addComponent(character);
scene.add(characterObject);
expect(character.moveAndSlide({ x: 0, y: -100 }, 0.1) && character.position.y < -4.9 &&
  !character.isOnCeiling,
  'kinematic character passes upward through a one-way underside');
expect(character.moveAndSlide({ x: 0, y: 100 }, 0.1) && character.position.y <= -0.99 &&
  character.isOnFloor,
  'kinematic character lands on the outward side of a one-way platform');
scene.destroy();
platform.dispose();
const circleWorld = new PhysicsWorld2D(game, { gravity: { x: 0, y: 0 }, fixedTimeStep: 0.1 });
circleWorld.createBody({ type: 'static', shape: { type: 'circle', radius: 2 },
  oneWay: { normal: { x: -1, y: 0 }, tolerance: 0 } });
const fromInside = circleWorld.createBody({ type: 'dynamic', shape: { type: 'circle', radius: 0.5 },
  position: { x: -2.2, y: 0 }, velocity: { x: 5, y: 0 }, gravityScale: 0 });
circleWorld.step(0.1);
expect(circleWorld.popContacts().length === 0 && Math.abs(fromInside.position.x + 1.7) < 0.0001,
  'one-way circle rejects approach that began inside its outward support plane');
fromInside.dispose();
circleWorld.clearContacts();
const fromOutside = circleWorld.createBody({ type: 'dynamic', shape: { type: 'circle', radius: 0.5 },
  position: { x: -3, y: 0 }, velocity: { x: 10, y: 0 }, gravityScale: 0 });
circleWorld.step(0.1);
expect(circleWorld.popContacts().length === 1 && fromOutside.position.x < -2,
  'one-way circle accepts an approach from beyond its radius');
circleWorld.dispose();
world.dispose();
context.dispose();
console.log('Physics2D one-way checks passed.');
