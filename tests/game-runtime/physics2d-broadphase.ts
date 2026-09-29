import { GameContext, bindGameContext } from '../../src/core/context';
import type { Game } from '../../src/core/game';
import type { Vector2DLike } from '../../src/core/types';
import { PhysicsWorld2D } from '../../src/physics2d/physics-world-2d';
import { Vector2D } from '../../src/math/vector2d';
import type { PhysicsBody2D } from '../../src/physics2d/physics-body-2d';

function expect(value: boolean, label: string): void {
  if (!value) {
    console.error('FAIL: ' + label);
    process.exit(1);
  }
}

function boxOverlap(a: PhysicsBody2D, b: PhysicsBody2D): boolean {
  const ap = a.position;
  const bp = b.position;
  const as = a.shape as { type: 'box'; width: number; height: number };
  const bs = b.shape as { type: 'box'; width: number; height: number };
  return Math.abs(ap.x - bp.x) < (as.width + bs.width) * 0.5 &&
    Math.abs(ap.y - bp.y) < (as.height + bs.height) * 0.5;
}

function expectedPairs(bodies: PhysicsBody2D[]): string[] {
  const result: string[] = [];
  for (let left = 0; left < bodies.length; left++) {
    const a = bodies[left];
    if (a.enabled && !a.isDisposed) {
      for (let right = left + 1; right < bodies.length; right++) {
        const b = bodies[right];
        const candidateEnabled = b.enabled;
        const candidateNotDisposed = !b.isDisposed;
        const aAcceptsB = (a.layer & b.mask) !== 0;
        const bAcceptsA = (b.layer & a.mask) !== 0;
        const overlaps = boxOverlap(a, b);
        if (candidateEnabled) {
          if (candidateNotDisposed) {
            if (aAcceptsB) {
              if (bAcceptsA) {
                if (overlaps) result.push(a.id + ':' + b.id);
              }
            }
          }
        }
      }
    }
  }
  return result;
}

function containsPoint(body: PhysicsBody2D, point: Vector2DLike): boolean {
  const p = body.position;
  const shape = body.shape as { type: 'box'; width: number; height: number };
  return Math.abs(point.x - p.x) <= shape.width * 0.5 &&
    Math.abs(point.y - p.y) <= shape.height * 0.5;
}

function overlapsCircle(body: PhysicsBody2D, center: Vector2DLike, radius: number): boolean {
  const p = body.position;
  const shape = body.shape as { type: 'box'; width: number; height: number };
  const x = Math.max(p.x - shape.width * 0.5, Math.min(center.x, p.x + shape.width * 0.5));
  const y = Math.max(p.y - shape.height * 0.5, Math.min(center.y, p.y + shape.height * 0.5));
  const dx = x - center.x;
  const dy = y - center.y;
  return dx * dx + dy * dy <= radius * radius;
}

function overlapsBox(body: PhysicsBody2D, center: Vector2DLike, size: Vector2DLike): boolean {
  const p = body.position;
  const shape = body.shape as { type: 'box'; width: number; height: number };
  return Math.abs(p.x - center.x) < (shape.width + size.x) * 0.5 &&
    Math.abs(p.y - center.y) < (shape.height + size.y) * 0.5;
}

function rayBoxDistance(body: PhysicsBody2D, origin: Vector2DLike, direction: Vector2DLike, maxDistance: number): number {
  const p = body.position;
  const shape = body.shape as { type: 'box'; width: number; height: number };
  let near = -Infinity;
  let far = Infinity;
  const ox = origin.x - p.x;
  const oy = origin.y - p.y;
  const hx = shape.width * 0.5;
  const hy = shape.height * 0.5;
  if (Math.abs(direction.x) < 0.0000001) {
    if (Math.abs(ox) > hx) return Infinity;
  } else {
    let first = (-hx - ox) / direction.x;
    let second = (hx - ox) / direction.x;
    if (first > second) { const swap = first; first = second; second = swap; }
    near = Math.max(near, first);
    far = Math.min(far, second);
  }
  if (Math.abs(direction.y) < 0.0000001) {
    if (Math.abs(oy) > hy) return Infinity;
  } else {
    let first = (-hy - oy) / direction.y;
    let second = (hy - oy) / direction.y;
    if (first > second) { const swap = first; first = second; second = swap; }
    near = Math.max(near, first);
    far = Math.min(far, second);
  }
  if (near > far) return Infinity;
  const hit = near >= 0 ? near : far;
  return hit >= 0 && hit <= maxDistance ? hit : Infinity;
}

function expectedQueryIds(bodies: PhysicsBody2D[], predicate: (body: PhysicsBody2D) => boolean,
  layerMask: number, includeSensors: boolean): number[] {
  const result: number[] = [];
  for (let index = 0; index < bodies.length; index++) {
    const body = bodies[index];
    const usable = body.enabled && !body.isDisposed;
    const layerMatches = (body.layer & layerMask) !== 0;
    const sensorMatches = includeSensors || !body.isSensor;
    const overlaps = predicate(body);
    if (usable) {
      if (layerMatches) {
        if (sensorMatches) {
          if (overlaps) result.push(body.id);
        }
      }
    }
  }
  return result;
}

function actualIds(bodies: PhysicsBody2D[]): number[] {
  const result: number[] = [];
  for (let index = 0; index < bodies.length; index++) result.push(bodies[index].id);
  return result;
}

function idsEqual(actual: number[], expected: number[]): boolean {
  if (actual.length !== expected.length) return false;
  for (let index = 0; index < actual.length; index++) if (actual[index] !== expected[index]) return false;
  return true;
}

const game = {} as Game;
const context = GameContext.create();
if (context === null) {
  console.error('FAIL: runtime context is available');
  process.exit(1);
}
context.markReady();
bindGameContext(game, context);

const world = new PhysicsWorld2D(game, { gravity: { x: 0, y: 0 }, fixedTimeStep: 0.01 });
expect(world.gravity instanceof Vector2D, 'physics gravity is returned as a Vector2D');
let randomState = 4711;
function random(): number {
  randomState = (randomState * 48271) % 2147483647;
  return randomState / 2147483647;
}

const bodies: PhysicsBody2D[] = [];
for (let index = 0; index < 56; index++) {
  const layer = 1 << (index % 3);
  const mask = index % 4 === 0 ? 0x7fffffff : 1 << ((index + 1) % 3);
  const position = index < 48
    ? { x: Math.floor(random() * 1600) - 800, y: Math.floor(random() * 1200) - 600 }
    : { x: -128 + (index - 48) * 3, y: -64 + (index - 48) * 2 };
  const size = index === 0 ? { width: 320, height: 256 } : {
    width: index === 1 ? 128 : 10 + Math.floor(random() * 18),
    height: index === 1 ? 192 : 10 + Math.floor(random() * 18),
  };
  bodies.push(world.createBody({
    type: 'static', shape: { type: 'box', width: size.width, height: size.height },
    position, isSensor: true, layer, mask,
  }));
}

function verifyPairs(label: string): void {
  expect(world.step(0.01) === 1, label + ': fixed step runs');
  const actual: string[] = [];
  const contacts = world.popContacts();
  for (let index = 0; index < contacts.length; index++) {
    const contact = contacts[index];
    if (contact.phase !== 'exit') actual.push(contact.bodyA.id + ':' + contact.bodyB.id);
  }
  const expected = expectedPairs(bodies);
  expect(actual.join(',') === expected.join(','), label +
    ': broadphase contacts match brute-force pair oracle actual=' + actual.join(',') +
    ' expected=' + expected.join(','));
  expect(world.lastCandidatePairCount >= expected.length,
    label + ': candidate count includes every oracle pair');
}

verifyPairs('seeded negative and large-body layout');
expect(world.lastCandidatePairCount < bodies.length * (bodies.length - 1) / 2,
  'uniform grid tests fewer pairs than the full body cross product');

const point = { x: -128, y: -64 };
const circleCenter = { x: -64, y: -64 };
const circleRadius = 96;
const boxCenter = { x: 0, y: 0 };
const boxSize = { x: 280, y: 180 };
const rayOrigin = { x: -900, y: -64 };
const rayDirection = { x: 1, y: 0 };
const rayLimit = 1400;
const queryMask = 3;
const includeSensors = true;

const pointHits = world.overlapPoint(point, { layerMask: queryMask, includeSensors });
expect(idsEqual(actualIds(pointHits), expectedQueryIds(bodies, (body) => containsPoint(body, point), queryMask, includeSensors)),
  'point query matches the brute-force oracle actual=' + actualIds(pointHits).join(',') +
    ' expected=' + expectedQueryIds(bodies, (body) => containsPoint(body, point), queryMask, includeSensors).join(',') +
    ' candidates=' + world.lastQueryCandidateCount);
expect(world.lastQueryCandidateCount < bodies.length, 'point query visits only local grid candidates');

const circleHits = world.overlapCircle(circleCenter, circleRadius, { layerMask: queryMask, includeSensors });
expect(idsEqual(actualIds(circleHits), expectedQueryIds(bodies,
  (body) => overlapsCircle(body, circleCenter, circleRadius), queryMask, includeSensors)),
  'circle query matches the brute-force oracle');

const boxHits = world.overlapBox(boxCenter, boxSize, { layerMask: queryMask, includeSensors });
expect(idsEqual(actualIds(boxHits), expectedQueryIds(bodies,
  (body) => overlapsBox(body, boxCenter, boxSize), queryMask, includeSensors)),
  'box query matches the brute-force oracle');

const ray = world.raycast(rayOrigin, rayDirection, rayLimit, { layerMask: queryMask, includeSensors });
let expectedRayBody: PhysicsBody2D | null = null;
let expectedRayDistance = Infinity;
for (let index = 0; index < bodies.length; index++) {
  const body = bodies[index];
  const usable = body.enabled && !body.isDisposed;
  const layerMatches = (body.layer & queryMask) !== 0;
  const sensorMatches = includeSensors || !body.isSensor;
  if (usable) {
    if (layerMatches) {
      if (sensorMatches) {
        const distance = rayBoxDistance(body, rayOrigin, rayDirection, rayLimit);
        if (distance < expectedRayDistance) { expectedRayDistance = distance; expectedRayBody = body; }
      }
    }
  }
}
expect((ray === null ? null : ray.body) === expectedRayBody &&
  (ray === null || Math.abs(ray.distance - expectedRayDistance) < 0.0001),
  'ray query matches the brute-force oracle and preserves nearest-hit ordering');

bodies[3].setPosition({ x: -129, y: -64 });
bodies[7].enabled = false;
verifyPairs('movement and deactivation');
bodies[7].enabled = true;
bodies[3].setPosition({ x: -128, y: -64 });
verifyPairs('reactivation and grid-boundary movement');
bodies[4].dispose();
verifyPairs('body disposal');

const oversized = world.createBody({
  type: 'static', shape: { type: 'box', width: 5000, height: 5000 },
  position: { x: 0, y: 0 }, isSensor: true, layer: 1, mask: 0x7fffffff,
});
bodies.push(oversized);
verifyPairs('oversized-body fallback');

function benchmarkBodies(count: number, dense: boolean): void {
  const benchmarkWorld = new PhysicsWorld2D(game, { gravity: { x: 0, y: 0 }, fixedTimeStep: 0.01 });
  for (let index = 0; index < count; index++) {
    const position = dense
      ? { x: 0, y: 0 }
      : { x: (index % 32) * 128, y: Math.floor(index / 32) * 128 };
    benchmarkWorld.createBody({ type: 'static', shape: { type: 'box', width: 12, height: 12 },
      position, isSensor: true, layer: 1, mask: 0 });
  }
  const startedAt = Date.now();
  expect(benchmarkWorld.step(0.01) === 1, count + '-body benchmark fixed step runs');
  const elapsedMs = Date.now() - startedAt;
  const expectedPairs = dense ? count * (count - 1) / 2 : 0;
  expect(benchmarkWorld.lastCandidatePairCount === expectedPairs,
    count + '-body benchmark candidate count is deterministic');
  console.log('Physics2D benchmark count=' + count + ' layout=' + (dense ? 'dense' : 'sparse') +
    ' candidatePairs=' + benchmarkWorld.lastCandidatePairCount + ' elapsedMs=' + elapsedMs);
  benchmarkWorld.dispose();
}

benchmarkBodies(100, false);
benchmarkBodies(1000, false);
benchmarkBodies(100, true);

world.dispose();
context.dispose();
console.log('Physics2D uniform-grid runtime checks passed.');
