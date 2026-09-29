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
world.dispose();
context.dispose();
console.log('Physics2D CCD checks passed.');
