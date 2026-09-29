import { GameContext, bindGameContext } from '../../src/core/context';
import type { Game } from '../../src/core/game';
import { GameObject } from '../../src/game/game-object';
import { GameScene } from '../../src/game/game-scene';
import { Vector2D } from '../../src/math/vector2d';
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

const invalid = [
  [{ x: 0, y: 0 }, { x: 1, y: 0 }],
  [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 2, y: 0 }],
  [{ x: 0, y: 0 }, { x: 2, y: 0 }, { x: 1, y: 1 }, { x: 2, y: 2 }, { x: 0, y: 2 }],
  [{ x: 0, y: 0 }, { x: 2, y: 2 }, { x: 0, y: 2 }, { x: 2, y: 0 }],
  [{ x: 0, y: -10 }, { x: 5.9, y: 8 }, { x: -9.5, y: -3 },
    { x: 9.5, y: -3 }, { x: -5.9, y: 8 }],
  [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: Infinity, y: 1 }],
  [{ x: 0, y: 0 }, { x: 2, y: 0 }, { x: 2, y: 0 }, { x: 0, y: 2 }],
  [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: undefined as unknown as number, y: 1 }],
  [{ x: 1e308, y: 0 }, { x: 0, y: 1e308 }, { x: -1e308, y: 0 }],
];
for (let i = 0; i < invalid.length; i++) {
  const body = world.createBody({ type: 'static', shape: { type: 'convex', vertices: invalid[i] } });
  expect(body.error !== null, 'invalid convex points fail safely ' + i + ' error=' + body.error);
}
expect(world.createBody({ type: 'static', shape: { type: 'segment', start: { x: 0, y: 0 }, end: { x: 0, y: 0 } } }).error !== null,
  'zero length segment fails safely');
expect(world.createBody({ type: 'static', shape: { type: 'segment',
  start: { x: undefined as unknown as number, y: 0 }, end: { x: 1, y: 0 } } }).error !== null,
  'missing segment coordinate fails safely');
expect(world.createBody({ type: 'static', shape: { type: 'segment',
  start: { x: -1e308, y: 0 }, end: { x: 1e308, y: 0 } } }).error !== null,
  'segment with overflowing length fails safely');
expect(world.createBody({ type: 'dynamic', shape: { type: 'convex', vertices: [
  { x: 0, y: 0 }, { x: 2, y: 0 }, { x: 0, y: 2 },
] } }).error !== null, 'dynamic convex shape is excluded');

const clockwise = world.createBody({ type: 'static', shape: { type: 'convex', vertices: [
  { x: -6, y: 0 }, { x: 6, y: 0 }, { x: 6, y: 6 }, { x: -6, y: 6 },
] }, position: { x: -50, y: 0 } });
const anticlockwise = world.createBody({ type: 'static', shape: { type: 'convex', vertices: [
  { x: -6, y: 6 }, { x: 6, y: 6 }, { x: 6, y: 0 }, { x: -6, y: 0 },
] }, position: { x: -30, y: 0 } });
expect(clockwise.error === null && anticlockwise.error === null, 'both polygon windings are accepted');
const polygonBall = world.createBody({ type: 'dynamic', shape: { type: 'circle', radius: 1 },
  position: { x: -50, y: -0.5 }, gravityScale: 0 });
world.step(0.1);
let contact = world.popContacts();
expect(contact.length > 0 && contact[0].normal.y < -0.99 && polygonBall.position.y < -0.5,
  'circle resolves a convex polygon edge contact');
polygonBall.dispose();
world.clearContacts();
const polygonBox = world.createBody({ type: 'dynamic', shape: { type: 'box', width: 2, height: 2 },
  position: { x: -30, y: -0.5 }, gravityScale: 0 });
world.step(0.1);
contact = world.popContacts();
expect(contact.length > 0 && Math.abs(contact[0].point.y) < 0.0001 &&
  contact[0].normal.y < -0.99,
  'box contact point lies on the convex surface edge');
polygonBox.dispose();
world.clearContacts();
const original = { x: -10, y: 0 };
const segment = world.createBody({ type: 'static', shape: { type: 'segment', start: original, end: { x: 10, y: -10 } },
  position: { x: 0, y: 0 } });
original.x = 100;
expect(segment.shape.type === 'segment' && segment.shape.start.x === -10, 'segment points are copied');
const ball = world.createBody({ type: 'dynamic', shape: { type: 'circle', radius: 1 }, position: { x: -10, y: -0.5 }, gravityScale: 0 });
world.step(0.1);
contact = world.popContacts();
expect(contact.length > 0 && Math.abs(contact[0].normal.magnitude - 1) < 0.0001,
  'circle contacts a segment endpoint with a unit normal');
ball.dispose();
segment.dispose();
world.clearContacts();

const ascending = world.createBody({ type: 'static', shape: { type: 'segment',
  start: { x: -20, y: 10 }, end: { x: 20, y: -10 } } });
const scene = new GameScene(game);
const character = new CharacterBody2D(world, { width: 2, height: 2 });
const object = new GameObject({ position: { x: -10, y: -12, z: 0 } });
object.addComponent(character);
scene.add(object);
expect(character.moveAndSlide({ x: 0, y: 100 }, 0.2) && character.isOnFloor,
  'descending onto an ascending ramp reports floor');
expect(character.contactNormals.length > 0 && character.contactNormals[0].x < 0 &&
  character.contactNormals[0].y < 0 && Math.abs(character.contactNormals[0].magnitude - 1) < 0.0001,
  'ascending ramp has a stable sloped unit normal');
expect(!character.isOnWall && character.velocity.x < -1 && character.velocity.y > 0 &&
  character.position.x < -10,
  'character slides along the ramp with floor classification and remaining motion');
const copy = character.contactNormals[0];
copy.set(0, 0);
expect(character.contactNormals[0].magnitude > 0.99, 'character normal is an isolated Vector2D snapshot');
scene.destroy();
ascending.dispose();
world.clearContacts();

const descending = world.createBody({ type: 'static', shape: { type: 'segment',
  start: { x: -20, y: -10 }, end: { x: 20, y: 10 } } });
const body = world.createBody({ type: 'dynamic', shape: { type: 'box', width: 2, height: 2 },
  position: { x: -10, y: -5.5 }, gravityScale: 0 });
world.step(0.1);
contact = world.popContacts();
expect(contact.length > 0 && contact[0].normal.y < 0 && contact[0].penetration > 0 && body.position.y < -5.5,
  'box resolves penetration against a descending ramp');
body.dispose();
descending.dispose();
world.clearContacts();
const firstSensor = world.createBody({ type: 'static', shape: { type: 'segment',
  start: { x: 90, y: 0 }, end: { x: 110, y: 0 } }, isSensor: true });
const secondSensor = world.createBody({ type: 'static', shape: { type: 'segment',
  start: { x: 90, y: 0 }, end: { x: 110, y: 0 } }, isSensor: true });
const orderingBall = world.createBody({ type: 'dynamic', shape: { type: 'circle', radius: 1 },
  position: { x: 100, y: -0.5 }, gravityScale: 0 });
world.clearContacts();
world.step(0.1);
const orderedEnter = world.popContacts();
world.step(0.1);
const orderedStay = world.popContacts();
expect(orderedEnter.length === 2 && orderedStay.length === 2 &&
  orderedEnter[0].bodyA === firstSensor && orderedEnter[1].bodyA === secondSensor &&
  orderedStay[0].bodyA === firstSensor && orderedStay[1].bodyA === secondSensor &&
  orderedEnter[0].phase === 'enter' && orderedStay[0].phase === 'stay',
  'simultaneous contacts keep creation order across repeated fixed steps');
firstSensor.setPosition({ x: 200, y: 0 });
world.step(0.1);
const mixedPhases = world.popContacts();
expect(mixedPhases.length === 2 && mixedPhases[0].bodyA === firstSensor &&
  mixedPhases[0].phase === 'exit' && mixedPhases[1].bodyA === secondSensor &&
  mixedPhases[1].phase === 'stay',
  'exit and stay contacts retain global pair creation order');
orderingBall.dispose();
firstSensor.dispose();
secondSensor.dispose();
const endpointWorld = new PhysicsWorld2D(game, { gravity: { x: 0, y: 0 }, fixedTimeStep: 0.1 });
endpointWorld.createBody({ type: 'static', shape: { type: 'segment',
  start: { x: 10, y: 0 }, end: { x: 20, y: 10 } } });
const endpointBox = endpointWorld.createBody({ type: 'dynamic', shape: { type: 'box', width: 1, height: 1 },
  position: { x: 9.4, y: 0.3 }, gravityScale: 0 });
endpointWorld.step(0.1);
expect(endpointWorld.popContacts().length === 0 && Math.abs(endpointBox.position.x - 9.4) < 0.0001,
  'box outside segment endpoint is separated on the world X axis');
endpointWorld.dispose();
const rayWorld = new PhysicsWorld2D(game, { gravity: { x: 0, y: 0 } });
rayWorld.createBody({ type: 'static', shape: { type: 'convex', vertices: [
  { x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 10 }, { x: 0, y: 10 },
] } });
const insideRay = rayWorld.raycast({ x: 5, y: 5 }, { x: 1, y: 0 }, 10);
expect(insideRay !== null && Math.abs(insideRay.distance - 5) < 0.0001 &&
  insideRay.normal.x > 0.99 && Math.abs(insideRay.point.x - 10) < 0.0001,
  'convex raycast starting inside returns the outward exit normal');
rayWorld.dispose();
const slideWorld = new PhysicsWorld2D(game, { gravity: { x: 0, y: 0 }, fixedTimeStep: 0.1 });
slideWorld.createBody({ type: 'static', shape: { type: 'segment',
  start: { x: 10, y: -100 }, end: { x: 10, y: 100 } } });
slideWorld.createBody({ type: 'static', shape: { type: 'segment',
  start: { x: 0, y: -100 }, end: { x: 0, y: 100 } } });
slideWorld.createBody({ type: 'static', shape: { type: 'segment',
  start: { x: 0, y: 20 }, end: { x: 10, y: 10 } } });
slideWorld.createBody({ type: 'static', shape: { type: 'segment',
  start: { x: 0, y: 30 }, end: { x: 10, y: 40 } } });
const slideScene = new GameScene(game);
const slideCharacter = new CharacterBody2D(slideWorld, { width: 1, height: 1 });
const slideObject = new GameObject({ position: { x: 5, y: 0, z: 0 } });
slideObject.addComponent(slideCharacter);
slideScene.add(slideObject);
expect(slideCharacter.moveAndSlide({ x: 1000, y: 1000 }, 0.1),
  'four-slide exhaustion fixture advances safely');
expect(slideCharacter.contactNormals.length === 4 &&
  slideCharacter.position.x >= 0.499 && slideCharacter.position.x <= 9.501 &&
  slideCharacter.velocity.x === 0 && slideCharacter.velocity.y === 0,
  'character stops at the last safe contact when four slides are exhausted: normals=' +
  slideCharacter.contactNormals.length + ' x=' + slideCharacter.position.x +
  ' y=' + slideCharacter.position.y + ' vx=' + slideCharacter.velocity.x +
  ' vy=' + slideCharacter.velocity.y);
slideScene.destroy();
slideWorld.dispose();
world.dispose();
context.dispose();
console.log('Physics2D slope checks passed.');
