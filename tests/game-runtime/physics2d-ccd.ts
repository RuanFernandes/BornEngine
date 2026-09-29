import { GameContext, bindGameContext } from '../../src/core/context';
import type { Game } from '../../src/core/game';
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
const wall = world.createBody({ type: 'static', shape: { type: 'segment',
  start: { x: 0, y: -10 }, end: { x: 0, y: 10 } }, layer: 2, mask: 1 });
const fast = world.createBody({ type: 'dynamic', shape: { type: 'circle', radius: 0.5 },
  position: { x: -10, y: 0 }, velocity: { x: 200, y: 0 }, gravityScale: 0, friction: 0,
  layer: 1, mask: 2, ccd: true, ccdThreshold: 1 });
world.step(0.1);
const hits = world.popContacts();
expect(fast.position.x <= -0.49 && hits.length === 1 && hits[0].phase === 'enter',
  'opt-in CCD prevents a fast circle tunneling through a thin segment');
expect(Math.abs(hits[0].normal.magnitude - 1) < 0.0001,
  'swept contact normal is a unit Vector2D');
fast.dispose();
world.clearContacts();
const discrete = world.createBody({ type: 'dynamic', shape: { type: 'circle', radius: 0.5 },
  position: { x: -10, y: 2 }, velocity: { x: 200, y: 0 }, gravityScale: 0, layer: 1, mask: 2 });
world.step(0.1);
expect(discrete.position.x > 9 && world.popContacts().length === 0,
  'ordinary discrete body retains its opt-out behavior');
discrete.dispose();
world.clearContacts();
const filtered = world.createBody({ type: 'dynamic', shape: { type: 'box', width: 1, height: 1 },
  position: { x: -10, y: 0 }, velocity: { x: 200, y: 0 }, gravityScale: 0,
  layer: 4, mask: 2, ccd: true });
world.step(0.1);
expect(filtered.position.x > 9 && world.popContacts().length === 0,
  'CCD obeys symmetric collision filters');
filtered.dispose();
world.clearContacts();
const box = world.createBody({ type: 'dynamic', shape: { type: 'box', width: 1, height: 1 },
  position: { x: -10, y: -2 }, velocity: { x: 200, y: 0 }, gravityScale: 0,
  layer: 1, mask: 2, ccd: true });
world.step(0.1);
expect(box.position.x <= -0.49 && world.popContacts().length === 1,
  'opt-in CCD prevents a fast box tunneling through a segment');
box.dispose();
world.clearContacts();
wall.dispose();
const poly = world.createBody({ type: 'static', shape: { type: 'convex', vertices: [
  { x: -1, y: -10 }, { x: 1, y: -10 }, { x: 1, y: 10 }, { x: -1, y: 10 },
] } });
const projectile = world.createBody({ type: 'dynamic', shape: { type: 'circle', radius: 0.25 },
  position: { x: -20, y: 0 }, velocity: { x: 400, y: 0 }, gravityScale: 0, ccd: true });
world.step(0.1);
expect(projectile.position.x <= -1.24 && world.popContacts().length === 1,
  'CCD catches a fast circle against a convex wall');
projectile.dispose();
world.clearContacts();
poly.dispose();
const cornerPolygon = world.createBody({ type: 'static', shape: { type: 'convex', vertices: [
  { x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 10 }, { x: 0, y: 10 },
] } });
const nearMiss = world.createBody({ type: 'dynamic', shape: { type: 'circle', radius: 1 },
  position: { x: -10, y: -0.9 }, velocity: { x: 91, y: 0 }, gravityScale: 0, ccd: true });
world.clearContacts();
world.step(0.1);
expect(nearMiss.position.x > -0.91 && world.popContacts().length === 0,
  'circle CCD does not report a false hit outside a convex corner');
nearMiss.dispose();
cornerPolygon.dispose();
const still = world.createBody({ type: 'dynamic', shape: { type: 'circle', radius: 1 },
  position: { x: -10, y: -10 }, velocity: { x: 0, y: 0 }, gravityScale: 0, ccd: true });
world.step(0.1);
expect(still.position.x === -10 && still.position.y === -10 && world.popContacts().length === 0,
  'zero velocity CCD stays finite and contact free');
still.dispose();
const cornerWall = world.createBody({ type: 'static', shape: { type: 'segment',
  start: { x: 0, y: -10 }, end: { x: 0, y: 10 } } });
const cornerFloor = world.createBody({ type: 'static', shape: { type: 'segment',
  start: { x: -10, y: 5 }, end: { x: 10, y: 5 } } });
const diagonal = world.createBody({ type: 'dynamic', shape: { type: 'circle', radius: 0.5 },
  position: { x: -10, y: -5 }, velocity: { x: 200, y: 100 }, gravityScale: 0, friction: 0, ccd: true });
world.clearContacts();
world.step(0.1);
const cornerHits = world.popContacts();
expect(diagonal.position.x <= -0.49 && diagonal.position.y <= 4.501 && cornerHits.length === 2 &&
  cornerHits[0].bodyA === cornerWall && cornerHits[1].bodyA === cornerFloor,
  'CCD resolves earliest hit then sweeps remaining time into the next surface in creation order');
diagonal.dispose();
cornerWall.dispose();
cornerFloor.dispose();
world.clearContacts();
const tieA = world.createBody({ type: 'static', shape: { type: 'segment',
  start: { x: 0, y: -10 }, end: { x: 0, y: 10 } } });
const tieB = world.createBody({ type: 'static', shape: { type: 'segment',
  start: { x: 0, y: -10 }, end: { x: 0, y: 10 } } });
for (let repeat = 0; repeat < 2; repeat++) {
  const runner = world.createBody({ type: 'dynamic', shape: { type: 'circle', radius: 0.5 },
    position: { x: -10, y: 0 }, velocity: { x: 200, y: 0 }, gravityScale: 0, ccd: true });
  world.step(0.1);
  const tieHits = world.popContacts();
  expect(tieHits.length === 1 && tieHits[0].bodyA === tieA && tieHits[0].bodyB === runner,
    'equal-time CCD hits choose the first-created static surface on repeat ' + repeat);
  runner.dispose();
  world.clearContacts();
}
tieA.dispose();
tieB.dispose();
const batched = new PhysicsWorld2D(game, { gravity: { x: 0, y: 0 }, fixedTimeStep: 0.05 });
const split = new PhysicsWorld2D(game, { gravity: { x: 0, y: 0 }, fixedTimeStep: 0.05 });
batched.createBody({ type: 'static', shape: { type: 'segment',
  start: { x: 0, y: -10 }, end: { x: 0, y: 10 } } });
split.createBody({ type: 'static', shape: { type: 'segment',
  start: { x: 0, y: -10 }, end: { x: 0, y: 10 } } });
const batchedBody = batched.createBody({ type: 'dynamic', shape: { type: 'circle', radius: 0.5 },
  position: { x: -10, y: 0 }, velocity: { x: 200, y: 0 }, gravityScale: 0, ccd: true });
const splitBody = split.createBody({ type: 'dynamic', shape: { type: 'circle', radius: 0.5 },
  position: { x: -10, y: 0 }, velocity: { x: 200, y: 0 }, gravityScale: 0, ccd: true });
batched.step(0.1);
split.step(0.05);
split.step(0.05);
const batchedEvents = batched.popContacts();
const splitEvents = split.popContacts();
expect(Math.abs(batchedBody.position.x - splitBody.position.x) < 0.000001 &&
  batchedEvents.length === splitEvents.length && batchedEvents.length > 0 &&
  batchedEvents[0].phase === splitEvents[0].phase,
  'CCD fixed steps agree when the same time is batched or split');
batched.dispose();
split.dispose();
const endpointWorld = new PhysicsWorld2D(game, { gravity: { x: 0, y: 0 }, fixedTimeStep: 0.1 });
endpointWorld.createBody({ type: 'static', shape: { type: 'segment',
  start: { x: 10, y: 0 }, end: { x: 20, y: 10 } } });
const endpointBox = endpointWorld.createBody({ type: 'dynamic', shape: { type: 'box', width: 1, height: 1 },
  position: { x: 7, y: 0.3 }, velocity: { x: 24, y: 0 }, gravityScale: 0, ccd: true });
endpointWorld.step(0.1);
expect(Math.abs(endpointBox.position.x - 9.4) < 0.0001 && endpointWorld.popContacts().length === 0,
  'CCD box passes a diagonal segment endpoint separated on the world X axis');
endpointWorld.dispose();
const materialWorld = new PhysicsWorld2D(game, { gravity: { x: 0, y: 0 }, fixedTimeStep: 0.1 });
materialWorld.createBody({ type: 'static', shape: { type: 'segment',
  start: { x: 0, y: -10 }, end: { x: 0, y: 10 } }, restitution: 1, friction: 1 });
const fastMaterial = materialWorld.createBody({ type: 'dynamic', shape: { type: 'circle', radius: 0.5 },
  position: { x: -10, y: 0 }, velocity: { x: 200, y: 50 }, gravityScale: 0,
  restitution: 1, friction: 1, ccd: true });
materialWorld.step(0.1);
const fastVelocity = fastMaterial.velocity;
expect(fastVelocity.x < -199 && Math.abs(fastVelocity.y) < 0.0001 && fastMaterial.position.x < -10,
  'CCD impact applies restitution and friction before moving for the remaining time');
materialWorld.dispose();
const discreteMaterialWorld = new PhysicsWorld2D(game, { gravity: { x: 0, y: 0 }, fixedTimeStep: 0.1 });
discreteMaterialWorld.createBody({ type: 'static', shape: { type: 'segment',
  start: { x: 0, y: -10 }, end: { x: 0, y: 10 } }, restitution: 1, friction: 1 });
const discreteMaterial = discreteMaterialWorld.createBody({ type: 'dynamic', shape: { type: 'circle', radius: 0.5 },
  position: { x: -1, y: 0 }, velocity: { x: 5, y: 1.25 }, gravityScale: 0,
  restitution: 1, friction: 1 });
discreteMaterialWorld.step(0.1);
expect(Math.abs(discreteMaterial.velocity.x + 5) < 0.0001 &&
  Math.abs(discreteMaterial.velocity.y) < 0.0001,
  'CCD material response follows the established discrete restitution and friction rule');
discreteMaterialWorld.dispose();
const circleWallWorld = new PhysicsWorld2D(game, { gravity: { x: 0, y: 0 }, fixedTimeStep: 0.1 });
circleWallWorld.createBody({ type: 'static', shape: { type: 'circle', radius: 1 }, position: { x: 0, y: 0 } });
const fastBox = circleWallWorld.createBody({ type: 'dynamic', shape: { type: 'box', width: 1, height: 1 },
  position: { x: -10, y: 0 }, velocity: { x: 200, y: 0 }, gravityScale: 0, ccd: true });
circleWallWorld.step(0.1);
expect(fastBox.position.x <= -1.49 && circleWallWorld.popContacts().length === 1,
  'opt-in CCD box cannot fully cross a static circle in one fixed step');
circleWallWorld.dispose();
const bounceWorld = new PhysicsWorld2D(game, { gravity: { x: 0, y: 0 }, fixedTimeStep: 0.1 });
bounceWorld.createBody({ type: 'static', shape: { type: 'segment',
  start: { x: 0, y: -100 }, end: { x: 0, y: 100 } }, restitution: 1, friction: 0 });
bounceWorld.createBody({ type: 'static', shape: { type: 'segment',
  start: { x: 2, y: -100 }, end: { x: 2, y: 100 } }, restitution: 1, friction: 0 });
const bouncing = bounceWorld.createBody({ type: 'dynamic', shape: { type: 'circle', radius: 0.25 },
  position: { x: 1, y: 0 }, velocity: { x: 400, y: 0 }, gravityScale: 0,
  restitution: 1, friction: 0, ccd: true });
bounceWorld.step(0.1);
expect(bouncing.position.x >= 0.249 && bouncing.position.x <= 1.751 &&
  bouncing.velocity.x === 0 && bounceWorld.popContacts().length === 2,
  'CCD discards unresolved time and velocity safely after eight corridor impacts');
bounceWorld.dispose();
const sensorWorld = new PhysicsWorld2D(game, { gravity: { x: 0, y: 0 }, fixedTimeStep: 0.1 });
sensorWorld.createBody({ type: 'static', shape: { type: 'segment',
  start: { x: 0, y: -10 }, end: { x: 0, y: 10 } } });
const sensor = sensorWorld.createBody({ type: 'dynamic', shape: { type: 'circle', radius: 0.5 },
  position: { x: -10, y: 0 }, velocity: { x: 200, y: 0 }, gravityScale: 0,
  ccd: true, isSensor: true });
sensorWorld.step(0.1);
const sensorContacts = sensorWorld.popContacts();
expect(sensor.position.x > 9.99 && Math.abs(sensor.velocity.x - 200) < 0.0001 &&
  sensorContacts.length === 1 && sensorContacts[0].isTrigger,
  'CCD sensor passes through a solid surface and reports a swept trigger');
sensorWorld.dispose();
const touchingCircleWorld = new PhysicsWorld2D(game, { gravity: { x: 0, y: 0 }, fixedTimeStep: 0.1 });
touchingCircleWorld.createBody({ type: 'static', shape: { type: 'segment',
  start: { x: 0, y: -10 }, end: { x: 0, y: 10 } } });
const touchingCircle = touchingCircleWorld.createBody({ type: 'dynamic', shape: { type: 'circle', radius: 0.5 },
  position: { x: -0.5, y: 0 }, velocity: { x: 200, y: 0 }, gravityScale: 0, ccd: true });
touchingCircleWorld.step(0.1);
expect(touchingCircle.position.x <= -0.4999 && touchingCircle.velocity.x <= 0 &&
  touchingCircleWorld.popContacts().length === 1,
  'CCD circle moving into a surface from exact contact is resolved at time zero');
touchingCircleWorld.dispose();
const touchingBoxWorld = new PhysicsWorld2D(game, { gravity: { x: 0, y: 0 }, fixedTimeStep: 0.1 });
touchingBoxWorld.createBody({ type: 'static', shape: { type: 'segment',
  start: { x: 0, y: -10 }, end: { x: 0, y: 10 } } });
const touchingBox = touchingBoxWorld.createBody({ type: 'dynamic', shape: { type: 'box', width: 1, height: 1 },
  position: { x: -0.5, y: 0 }, velocity: { x: 200, y: 0 }, gravityScale: 0, ccd: true });
touchingBoxWorld.step(0.1);
expect(touchingBox.position.x <= -0.4999 && touchingBox.velocity.x <= 0 &&
  touchingBoxWorld.popContacts().length === 1,
  'CCD box moving into a surface from exact contact is resolved at time zero');
touchingBoxWorld.dispose();
const embeddedBoxWorld = new PhysicsWorld2D(game, { gravity: { x: 0, y: 0 }, fixedTimeStep: 0.1 });
embeddedBoxWorld.createBody({ type: 'static', shape: { type: 'segment',
  start: { x: 0, y: -10 }, end: { x: 0, y: 10 } } });
const embeddedBox = embeddedBoxWorld.createBody({ type: 'dynamic', shape: { type: 'box', width: 1, height: 1 },
  position: { x: -0.25, y: 0 }, velocity: { x: 200, y: 0 }, gravityScale: 0, ccd: true });
embeddedBoxWorld.step(0.1);
expect(embeddedBox.position.x < 0 && embeddedBox.velocity.x <= 0 && embeddedBoxWorld.popContacts().length === 1,
  'CCD resolves an initially penetrating box instead of allowing it to tunnel deeper');
embeddedBoxWorld.dispose();
const touchingCirclePairWorld = new PhysicsWorld2D(game, { gravity: { x: 0, y: 0 }, fixedTimeStep: 0.1 });
touchingCirclePairWorld.createBody({ type: 'static', shape: { type: 'circle', radius: 1 } });
const touchingCirclePair = touchingCirclePairWorld.createBody({ type: 'dynamic', shape: { type: 'circle', radius: 0.5 },
  position: { x: -1.5, y: 0 }, velocity: { x: 200, y: 0 }, gravityScale: 0, ccd: true });
touchingCirclePairWorld.step(0.1);
expect(touchingCirclePair.position.x <= -1.4999 && touchingCirclePair.velocity.x <= 0 &&
  touchingCirclePairWorld.popContacts().length === 1,
  'CCD circle pair moving into exact contact is resolved at time zero');
touchingCirclePairWorld.dispose();
const touchingBoxCircleWorld = new PhysicsWorld2D(game, { gravity: { x: 0, y: 0 }, fixedTimeStep: 0.1 });
touchingBoxCircleWorld.createBody({ type: 'static', shape: { type: 'circle', radius: 1 } });
const touchingBoxCircle = touchingBoxCircleWorld.createBody({ type: 'dynamic', shape: { type: 'box', width: 1, height: 1 },
  position: { x: -1.5, y: 0 }, velocity: { x: 200, y: 0 }, gravityScale: 0, ccd: true });
touchingBoxCircleWorld.step(0.1);
expect(touchingBoxCircle.position.x <= -1.4999 && touchingBoxCircle.velocity.x <= 0 &&
  touchingBoxCircleWorld.popContacts().length === 1,
  'CCD box moving into a circle from exact contact is resolved at time zero');
touchingBoxCircleWorld.dispose();
const touchingCircleConvexWorld = new PhysicsWorld2D(game, { gravity: { x: 0, y: 0 }, fixedTimeStep: 0.1 });
touchingCircleConvexWorld.createBody({ type: 'static', shape: { type: 'convex', vertices: [
  { x: 0, y: -10 }, { x: 1, y: -10 }, { x: 1, y: 10 }, { x: 0, y: 10 },
] } });
const touchingCircleConvex = touchingCircleConvexWorld.createBody({ type: 'dynamic', shape: { type: 'circle', radius: 0.5 },
  position: { x: -0.5, y: 0 }, velocity: { x: 200, y: 0 }, gravityScale: 0, ccd: true });
touchingCircleConvexWorld.step(0.1);
expect(touchingCircleConvex.position.x <= -0.4999 && touchingCircleConvex.velocity.x <= 0 &&
  touchingCircleConvexWorld.popContacts().length === 1,
  'CCD circle moving into exact contact with a convex surface is resolved at time zero');
touchingCircleConvexWorld.dispose();
const touchingBoxConvexWorld = new PhysicsWorld2D(game, { gravity: { x: 0, y: 0 }, fixedTimeStep: 0.1 });
touchingBoxConvexWorld.createBody({ type: 'static', shape: { type: 'convex', vertices: [
  { x: 0, y: -10 }, { x: 1, y: -10 }, { x: 1, y: 10 }, { x: 0, y: 10 },
] } });
const touchingBoxConvex = touchingBoxConvexWorld.createBody({ type: 'dynamic', shape: { type: 'box', width: 1, height: 1 },
  position: { x: -0.5, y: 0 }, velocity: { x: 200, y: 0 }, gravityScale: 0, ccd: true });
touchingBoxConvexWorld.step(0.1);
expect(touchingBoxConvex.position.x <= -0.4999 && touchingBoxConvex.velocity.x <= 0 &&
  touchingBoxConvexWorld.popContacts().length === 1,
  'CCD box moving into exact contact with a convex surface is resolved at time zero');
touchingBoxConvexWorld.dispose();
const separatingWorld = new PhysicsWorld2D(game, { gravity: { x: 0, y: 0 }, fixedTimeStep: 0.1 });
separatingWorld.createBody({ type: 'static', shape: { type: 'segment',
  start: { x: 0, y: -10 }, end: { x: 0, y: 10 } } });
const separatingCircle = separatingWorld.createBody({ type: 'dynamic', shape: { type: 'circle', radius: 0.5 },
  position: { x: -0.5, y: 0 }, velocity: { x: -200, y: 0 }, gravityScale: 0, ccd: true });
separatingWorld.step(0.1);
expect(separatingCircle.position.x < -20 && separatingWorld.popContacts().length === 0,
  'CCD circle moves freely away from a surface at exact contact');
separatingWorld.dispose();
const separatingBoxWorld = new PhysicsWorld2D(game, { gravity: { x: 0, y: 0 }, fixedTimeStep: 0.1 });
separatingBoxWorld.createBody({ type: 'static', shape: { type: 'segment',
  start: { x: 0, y: -10 }, end: { x: 0, y: 10 } } });
const separatingBox = separatingBoxWorld.createBody({ type: 'dynamic', shape: { type: 'box', width: 1, height: 1 },
  position: { x: -0.5, y: 0 }, velocity: { x: -200, y: 0 }, gravityScale: 0, ccd: true });
separatingBoxWorld.step(0.1);
expect(separatingBox.position.x < -20 && separatingBoxWorld.popContacts().length === 0,
  'CCD box moves freely away from a surface at exact contact');
separatingBoxWorld.dispose();
world.dispose();
context.dispose();
console.log('Physics2D CCD checks passed.');
