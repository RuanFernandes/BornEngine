import { GameContext, bindGameContext } from '../../src/core/context';
import type { Game } from '../../src/core/game';
import { GameObject } from '../../src/game/game-object';
import { GameScene } from '../../src/game/game-scene';
import { PhysicsWorld2D } from '../../src/physics2d/physics-world-2d';
import { CharacterBody2D } from '../../src/physics2d/character-body-2d';
import { Vector2D } from '../../src/math/vector2d';

function expect(value: boolean, label: string): void {
  if (!value) {
    console.error('FAIL: ' + label);
    process.exit(1);
  }
}

function makeCharacter(game: Game, world: PhysicsWorld2D, x: number, y: number): {
  character: CharacterBody2D; scene: GameScene; object: GameObject;
} {
  const character = new CharacterBody2D(world, { width: 10, height: 10 });
  const object = new GameObject({ position: { x, y, z: 0 } });
  expect(object.addComponent(character) === character, 'character component attaches to its owner object');
  const scene = new GameScene(game);
  expect(scene.add(object) === object, 'character owner attaches to its scene');
  return { character, scene, object };
}

const game = {} as Game;
const context = GameContext.create();
if (context === null) {
  console.error('FAIL: runtime context is available');
  process.exit(1);
}
context.markReady();
bindGameContext(game, context);

const wallWorld = new PhysicsWorld2D(game, { gravity: { x: 0, y: 0 }, fixedTimeStep: 0.1 });
wallWorld.createBody({ type: 'static', shape: { type: 'box', width: 10, height: 100 }, position: { x: 30, y: 0 } });
const wall = makeCharacter(game, wallWorld, 0, 0);
expect(wall.character.moveAndSlide({ x: 100, y: 0 }, 0.5), 'wall movement completes safely');
expect(Math.abs(wall.character.position.x - 20) < 0.001 && wall.character.velocity.x === 0 &&
  wall.character.isOnWall && !wall.character.isOnFloor && !wall.character.isOnCeiling,
  'horizontal motion stops at a wall and reports a wall contact');
expect(wall.character.contactNormals.length === 1 && wall.character.contactNormals[0].x === -1,
  'wall contact reports the stable outward normal');
const wallNormal = wall.character.contactNormals[0];
expect(wallNormal instanceof Vector2D && wallNormal.magnitude === 1 &&
  wallNormal.clamped(Vector2D.zero(), Vector2D.one()).x === 0,
  'character contact normals expose Vector2D values and methods');
wallNormal.set(0, 0);
expect(wall.character.contactNormals[0].x === -1,
  'character contact normals are returned as isolated snapshots');
wall.scene.destroy();
wallWorld.dispose();

const circleWorld = new PhysicsWorld2D(game, { gravity: { x: 0, y: 0 }, fixedTimeStep: 0.1 });
circleWorld.createBody({ type: 'static', shape: { type: 'circle', radius: 5 }, position: { x: 10, y: 0 }, isSensor: true });
circleWorld.createBody({ type: 'static', shape: { type: 'circle', radius: 10 }, position: { x: 30, y: 0 } });
const circle = makeCharacter(game, circleWorld, 0, 0);
expect(circle.character.moveAndSlide({ x: 100, y: 0 }, 0.5), 'circle obstacle movement completes safely');
expect(Math.abs(circle.character.position.x - 15) < 0.001 && circle.character.isOnWall &&
  circle.character.contactNormals[0].x === -1,
  'circle obstacles block the box sweep while sensors remain non-solid');
circle.scene.destroy();
circleWorld.dispose();

const floorWorld = new PhysicsWorld2D(game, { gravity: { x: 0, y: 0 }, fixedTimeStep: 0.1 });
floorWorld.createBody({ type: 'static', shape: { type: 'box', width: 100, height: 10 }, position: { x: 0, y: 20 } });
const floor = makeCharacter(game, floorWorld, 0, 0);
expect(floor.character.moveAndSlide({ x: 0, y: 100 }, 0.5), 'floor movement completes safely');
expect(Math.abs(floor.character.position.y - 10) < 0.001 && floor.character.velocity.y === 0 &&
  floor.character.isOnFloor, 'downward motion stops on the floor in positive-Y-down coordinates y=' +
    floor.character.position.y + ' vy=' + floor.character.velocity.y + ' floor=' + floor.character.isOnFloor);
expect(floor.character.contactNormals.length === 1 && floor.character.contactNormals[0].y === -1,
  'floor contact reports a normal against gravity');
floor.scene.destroy();
floorWorld.dispose();

const ceilingWorld = new PhysicsWorld2D(game, { gravity: { x: 0, y: 0 }, fixedTimeStep: 0.1 });
ceilingWorld.createBody({ type: 'static', shape: { type: 'box', width: 100, height: 10 }, position: { x: 0, y: -20 } });
const ceiling = makeCharacter(game, ceilingWorld, 0, 0);
expect(ceiling.character.moveAndSlide({ x: 0, y: -100 }, 0.5), 'ceiling movement completes safely');
expect(Math.abs(ceiling.character.position.y + 10) < 0.001 && ceiling.character.velocity.y === 0 &&
  ceiling.character.isOnCeiling, 'upward motion stops at the ceiling');
expect(ceiling.character.contactNormals.length === 1 && ceiling.character.contactNormals[0].y === 1,
  'ceiling contact reports its outward normal');
ceiling.scene.destroy();
ceilingWorld.dispose();

const cornerWorld = new PhysicsWorld2D(game, { gravity: { x: 0, y: 0 }, fixedTimeStep: 0.1 });
cornerWorld.createBody({ type: 'static', shape: { type: 'box', width: 10, height: 20 }, position: { x: 15, y: 10 } });
cornerWorld.createBody({ type: 'static', shape: { type: 'box', width: 20, height: 10 }, position: { x: 10, y: 15 } });
const corner = makeCharacter(game, cornerWorld, 0, 0);
expect(corner.character.moveAndSlide({ x: 100, y: 100 }, 0.5), 'corner movement completes safely');
expect(Math.abs(corner.character.position.x - 5) < 0.001 && Math.abs(corner.character.position.y - 5) < 0.001 &&
  corner.character.isOnWall && corner.character.isOnFloor,
  'axis-separated movement slides into a corner and reports both surfaces');
expect(corner.character.contactNormals.length === 2,
  'corner movement reports each blocking axis normal once');
const beforeZero = corner.character.position;
expect(corner.character.moveAndSlide({ x: 0, y: 0 }, cornerWorld.fixedTimeStep),
  'zero input is a valid fixed-step update');
expect(corner.character.position.x === beforeZero.x && corner.character.position.y === beforeZero.y &&
  corner.character.contactNormals.length === 0 && !corner.character.isOnFloor && !corner.character.isOnWall,
  'zero input leaves position stable and clears per-step contacts');
corner.scene.destroy();
cornerWorld.dispose();

const loopWorld = new PhysicsWorld2D(game, { gravity: { x: 0, y: 0 }, fixedTimeStep: 0.05 });
const loop = makeCharacter(game, loopWorld, -32, 0);
for (let step = 0; step < 10; step++) {
  expect(loop.character.moveAndSlide({ x: 20, y: 0 }, loopWorld.fixedTimeStep),
    'fixed-step character update ' + step + ' succeeds');
  expect(loopWorld.step(loopWorld.fixedTimeStep) === 1, 'world advances one matching fixed step');
}
expect(Math.abs(loop.character.position.x + 22) < 0.001,
  'repeated fixed-step movement is deterministic');
loop.scene.destroy();
loopWorld.dispose();

const detachedWorld = new PhysicsWorld2D(game, { gravity: { x: 0, y: 0 } });
const detached = new CharacterBody2D(detachedWorld, { width: 10, height: 10 });
expect(!detached.moveAndSlide({ x: 1, y: 0 }, 1 / 60),
  'a detached component fails safely without moving');
const invalid = new CharacterBody2D(detachedWorld, { width: -1, height: 10 });
expect(invalid.error !== null && !invalid.moveAndSlide({ x: 1, y: 0 }, 1 / 60),
  'invalid character options fail safely');
detachedWorld.dispose();
expect(!detached.moveAndSlide({ x: 1, y: 0 }, 1 / 60),
  'a disposed world invalidates character movement safely');
context.dispose();
console.log('CharacterBody2D runtime checks passed.');
