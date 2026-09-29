import { getGameContext } from '../core/context';
import type { ContextResource, GameContext } from '../core/context';
import type { Game } from '../core/game';
import type { Vec2 } from '../core/types';
import { PhysicsBody2D } from './physics-body-2d';
import type {
  PhysicsBodyContact2D,
  PhysicsBody2DOptions,
  PhysicsContact2D,
  PhysicsContactPhase2D,
  PhysicsShape2D,
} from './physics-body-2d';

export interface PhysicsWorld2DOptions {
  gravity?: Vec2;
  fixedTimeStep?: number;
  maxSubSteps?: number;
}

export interface PhysicsRayHit2D {
  readonly body: PhysicsBody2D;
  readonly point: Readonly<Vec2>;
  readonly normal: Readonly<Vec2>;
  readonly distance: number;
}

export interface PhysicsQueryOptions2D {
  layerMask?: number;
  includeSensors?: boolean;
}

interface ContactGeometry {
  normal: Vec2;
  point: Vec2;
  penetration: number;
}

interface ShapePose {
  position: Vec2;
  shape: PhysicsShape2D;
}

interface MutableContact extends PhysicsContact2D {}

interface BroadphaseBounds {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

interface GridRange {
  minX: number;
  minY: number;
  columns: number;
  rows: number;
  oversized: boolean;
}

interface BodyMembership {
  cells: string[];
  oversized: boolean;
}

interface CandidatePair {
  bodyA: PhysicsBody2D;
  bodyB: PhysicsBody2D;
}

interface AxisSweepHit {
  distance: number;
  normal: Vec2;
}

const BROADPHASE_CELL_SIZE = 64;
const MAX_GRID_CELLS_PER_BODY = 4096;

function finite(value: number): boolean {
  return value === value && value !== Infinity && value !== -Infinity;
}

function validVec(value: Vec2): boolean {
  return value !== null && value !== undefined && finite(value.x) && finite(value.y);
}

function copyVec(value: Vec2): Vec2 { return { x: value.x, y: value.y }; }
function clamp(value: number, min: number, max: number): number { return Math.max(min, Math.min(max, value)); }
function bodyBounds(body: PhysicsBody2D): BroadphaseBounds {
  const position = body.position;
  if (body.shape.type === 'circle') {
    return {
      minX: position.x - body.shape.radius,
      minY: position.y - body.shape.radius,
      maxX: position.x + body.shape.radius,
      maxY: position.y + body.shape.radius,
    };
  }
  return {
    minX: position.x - body.shape.width * 0.5,
    minY: position.y - body.shape.height * 0.5,
    maxX: position.x + body.shape.width * 0.5,
    maxY: position.y + body.shape.height * 0.5,
  };
}

function sweepBoxAgainstBody(position: Vec2, width: number, height: number, axis: 'x' | 'y', delta: number,
  target: PhysicsBody2D): AxisSweepHit | null {
  if (delta === 0) return null;
  const movingPositive = delta > 0;
  const targetPosition = target.position;
  const halfX = width * 0.5;
  const halfY = height * 0.5;
  let targetMinimum: number;
  let targetMaximum: number;
  if (target.shape.type === 'circle') {
    const orthogonalOffset = axis === 'x'
      ? Math.max(Math.abs(position.y - targetPosition.y) - halfY, 0)
      : Math.max(Math.abs(position.x - targetPosition.x) - halfX, 0);
    if (orthogonalOffset > target.shape.radius) return null;
    const remainingRadius = Math.sqrt(Math.max(0,
      target.shape.radius * target.shape.radius - orthogonalOffset * orthogonalOffset));
    targetMinimum = (axis === 'x' ? targetPosition.x : targetPosition.y) - remainingRadius;
    targetMaximum = (axis === 'x' ? targetPosition.x : targetPosition.y) + remainingRadius;
  } else {
    const targetHalfX = target.shape.width * 0.5;
    const targetHalfY = target.shape.height * 0.5;
    if (axis === 'x') {
      const overlapY = position.y + halfY > targetPosition.y - targetHalfY &&
        position.y - halfY < targetPosition.y + targetHalfY;
      if (!overlapY) return null;
      targetMinimum = targetPosition.x - targetHalfX;
      targetMaximum = targetPosition.x + targetHalfX;
    } else {
      const overlapX = position.x + halfX > targetPosition.x - targetHalfX &&
        position.x - halfX < targetPosition.x + targetHalfX;
      if (!overlapX) return null;
      targetMinimum = targetPosition.y - targetHalfY;
      targetMaximum = targetPosition.y + targetHalfY;
    }
  }

  const currentAxis = axis === 'x' ? position.x : position.y;
  const targetAxis = axis === 'x' ? targetPosition.x : targetPosition.y;
  const movingHalf = axis === 'x' ? halfX : halfY;
  if (movingPositive) {
    if (currentAxis > targetAxis) return null;
    const distance = Math.max(0, targetMinimum - (currentAxis + movingHalf));
    if (distance <= delta) return { distance, normal: axis === 'x' ? { x: -1, y: 0 } : { x: 0, y: -1 } };
  } else {
    if (currentAxis < targetAxis) return null;
    const distance = Math.max(0, (currentAxis - movingHalf) - targetMaximum);
    if (distance <= -delta) return { distance, normal: axis === 'x' ? { x: 1, y: 0 } : { x: 0, y: 1 } };
  }
  return null;
}

function boundsOverlap(a: BroadphaseBounds, b: BroadphaseBounds): boolean {
  return a.minX <= b.maxX && a.maxX >= b.minX && a.minY <= b.maxY && a.maxY >= b.minY;
}

function sameCellKeys(a: string[], b: string[]): boolean {
  if (a.length !== b.length) return false;
  for (let index = 0; index < a.length; index++) if (a[index] !== b[index]) return false;
  return true;
}

function hasCellKey(values: string[], value: string): boolean {
  for (let index = 0; index < values.length; index++) if (values[index] === value) return true;
  return false;
}

function gridCellKey(x: number, y: number): string { return x + ',' + y; }

function removeAt<T>(values: T[], index: number): void {
  for (let current = index; current + 1 < values.length; current++) values[current] = values[current + 1];
  values.pop();
}

/**
 * A small deterministic 2D rigid-body solver for arcade and platform games.
 * Call step() from the active Scene.update() and dispose it with Scene.own().
 */
export class PhysicsWorld2D implements ContextResource {
  readonly context: GameContext;
  readonly error: string | null;

  private gravityValue: Vec2;
  private fixedTimeStepValue: number;
  private maxSubStepsValue: number;
  private accumulator = 0;
  private elapsedDroppedTime = 0;
  private bodies: PhysicsBody2D[] = [];
  private broadphaseCells = new Map<string, PhysicsBody2D[]>();
  private bodyMemberships = new Map<number, BodyMembership>();
  private oversizedBodies: PhysicsBody2D[] = [];
  private activeContacts: MutableContact[] = [];
  private contactEvents: PhysicsContact2D[] = [];
  private disposed = false;
  private stepping = false;
  private candidatePairCount = 0;
  private narrowphaseTestCount = 0;
  private queryCandidateCount = 0;

  constructor(owner: Game, options: PhysicsWorld2DOptions = {}) {
    this.context = getGameContext(owner);
    const settings: PhysicsWorld2DOptions = options === null || options === undefined ? {} : options;
    this.gravityValue = settings.gravity === undefined
      ? { x: 0, y: 980 }
      : validVec(settings.gravity) ? copyVec(settings.gravity) : { x: NaN, y: NaN };
    this.fixedTimeStepValue = settings.fixedTimeStep === undefined ? 1 / 60 : settings.fixedTimeStep;
    this.maxSubStepsValue = settings.maxSubSteps === undefined ? 5 : settings.maxSubSteps;

    if (!this.context.isReady || this.context.isDisposed) {
      this.error = 'The Game must be ready before creating PhysicsWorld2D.';
      return;
    }
    if (!validVec(this.gravityValue) || !finite(this.fixedTimeStepValue) || this.fixedTimeStepValue <= 0 ||
        !finite(this.maxSubStepsValue) || this.maxSubStepsValue < 1 ||
        Math.floor(this.maxSubStepsValue) !== this.maxSubStepsValue) {
      this.error = 'PhysicsWorld2D gravity, fixedTimeStep, or maxSubSteps is invalid.';
      return;
    }
    this.error = this.context.register(this) ? null : 'Unable to register PhysicsWorld2D with the Game.';
  }

  get isReady(): boolean { return !this.disposed && this.error === null && this.context.isReady && !this.context.isDisposed; }
  get isDisposed(): boolean { return this.disposed; }
  get gravity(): Vec2 { return copyVec(this.gravityValue); }
  get fixedTimeStep(): number { return this.fixedTimeStepValue; }
  get maxSubSteps(): number { return this.maxSubStepsValue; }
  get bodyCount(): number { return this.bodies.length; }
  get contactCount(): number { return this.contactEvents.length; }
  get droppedTime(): number { return this.elapsedDroppedTime; }
  /** Candidate pairs in the most recent fixed step, before collision filters. */
  get lastCandidatePairCount(): number { return this.candidatePairCount; }
  /** Pairs that reached the existing narrowphase in the most recent fixed step. */
  get lastNarrowphaseTestCount(): number { return this.narrowphaseTestCount; }
  /** Bodies tested by the most recent spatial query. */
  get lastQueryCandidateCount(): number { return this.queryCandidateCount; }

  setGravity(value: Vec2): boolean {
    if (!this.isReady || !validVec(value)) return false;
    this.gravityValue = copyVec(value);
    return true;
  }

  setFixedTimeStep(value: number, maxSubSteps = this.maxSubStepsValue): boolean {
    if (!this.isReady || !finite(value) || value <= 0 || !finite(maxSubSteps) ||
        maxSubSteps < 1 || Math.floor(maxSubSteps) !== maxSubSteps) return false;
    this.fixedTimeStepValue = value;
    this.maxSubStepsValue = maxSubSteps;
    this.accumulator = Math.min(this.accumulator, value);
    return true;
  }

  createBody(options: PhysicsBody2DOptions): PhysicsBody2D {
    return new PhysicsBody2D(this, options);
  }

  /** Advances the fixed-step accumulator; returns the number of substeps run. */
  step(deltaTime: number): number {
    if (!this.isReady || !finite(deltaTime) || deltaTime < 0 || this.stepping) return 0;
    const frameBudget = this.fixedTimeStepValue * this.maxSubStepsValue;
    const acceptedDelta = Math.min(deltaTime, frameBudget);
    this.elapsedDroppedTime += deltaTime - acceptedDelta;
    this.accumulator += acceptedDelta;

    this.stepping = true;
    let steps = 0;
    try {
      while (this.accumulator + 0.0000000001 >= this.fixedTimeStepValue &&
          steps < this.maxSubStepsValue && this.isReady) {
        this.simulate(this.fixedTimeStepValue);
        this.accumulator -= this.fixedTimeStepValue;
        if (this.accumulator < 0) this.accumulator = 0;
        steps++;
      }
    } finally {
      this.stepping = false;
    }
    return steps;
  }

  /** Returns the nearest positive hit or null. Directions are normalized internally. */
  raycast(origin: Vec2, direction: Vec2, maxDistance: number, options: PhysicsQueryOptions2D = {}): PhysicsRayHit2D | null {
    if (!this.isReady || !validVec(origin) || !validVec(direction) || !finite(maxDistance) || maxDistance < 0) return null;
    const length = Math.sqrt(direction.x * direction.x + direction.y * direction.y);
    if (length <= 0.0000001) return null;
    const dx = direction.x / length;
    const dy = direction.y / length;
    const layerMask = options.layerMask === undefined ? 0x7fffffff : options.layerMask;
    if (!validMask(layerMask)) return null;

    const end = { x: origin.x + dx * maxDistance, y: origin.y + dy * maxDistance };
    const candidates = this.queryCandidates({
      minX: Math.min(origin.x, end.x),
      minY: Math.min(origin.y, end.y),
      maxX: Math.max(origin.x, end.x),
      maxY: Math.max(origin.y, end.y),
    });
    let closest: PhysicsRayHit2D | null = null;
    const includeSensors = options.includeSensors === undefined ? true : options.includeSensors;
    for (let index = 0; index < candidates.length; index++) {
      const body = candidates[index];
      if (!this.isQueryable(body, layerMask, includeSensors)) continue;
      const hit = rayShape(origin, { x: dx, y: dy }, maxDistance, body);
      if (hit !== null && (closest === null || hit.distance < closest.distance)) {
        closest = { body, point: hit.point, normal: hit.normal, distance: hit.distance };
      }
    }
    return closest;
  }

  overlapPoint(point: Vec2, options: PhysicsQueryOptions2D = {}): PhysicsBody2D[] {
    if (!this.isReady || !validVec(point)) return [];
    const layerMask = options.layerMask === undefined ? 0x7fffffff : options.layerMask;
    if (!validMask(layerMask)) return [];
    const includeSensors = options.includeSensors === undefined ? true : options.includeSensors;
    const result: PhysicsBody2D[] = [];
    const candidates = this.queryCandidates({ minX: point.x, minY: point.y, maxX: point.x, maxY: point.y });
    for (let index = 0; index < candidates.length; index++) {
      const body = candidates[index];
      if (this.isQueryable(body, layerMask, includeSensors) && containsPoint(body, point)) result.push(body);
    }
    return result;
  }

  overlapCircle(center: Vec2, radius: number, options: PhysicsQueryOptions2D = {}): PhysicsBody2D[] {
    if (!this.isReady || !validVec(center) || !finite(radius) || radius <= 0) return [];
    const layerMask = options.layerMask === undefined ? 0x7fffffff : options.layerMask;
    if (!validMask(layerMask)) return [];
    const includeSensors = options.includeSensors === undefined ? true : options.includeSensors;
    const query: ShapePose = { position: copyVec(center), shape: { type: 'circle', radius } };
    const result: PhysicsBody2D[] = [];
    const candidates = this.queryCandidates({
      minX: center.x - radius, minY: center.y - radius,
      maxX: center.x + radius, maxY: center.y + radius,
    });
    for (let index = 0; index < candidates.length; index++) {
      const body = candidates[index];
      if (this.isQueryable(body, layerMask, includeSensors) && collide(query, body) !== null) result.push(body);
    }
    return result;
  }

  overlapBox(center: Vec2, size: Vec2, options: PhysicsQueryOptions2D = {}): PhysicsBody2D[] {
    if (!this.isReady || !validVec(center) || !validVec(size) || size.x <= 0 || size.y <= 0) return [];
    const layerMask = options.layerMask === undefined ? 0x7fffffff : options.layerMask;
    if (!validMask(layerMask)) return [];
    const includeSensors = options.includeSensors === undefined ? true : options.includeSensors;
    const query: ShapePose = {
      position: copyVec(center),
      shape: { type: 'box', width: size.x, height: size.y },
    };
    const result: PhysicsBody2D[] = [];
    const candidates = this.queryCandidates({
      minX: center.x - size.x * 0.5, minY: center.y - size.y * 0.5,
      maxX: center.x + size.x * 0.5, maxY: center.y + size.y * 0.5,
    });
    for (let index = 0; index < candidates.length; index++) {
      const body = candidates[index];
      if (this.isQueryable(body, layerMask, includeSensors) && collide(query, body) !== null) result.push(body);
    }
    return result;
  }

  /** Drains collision and trigger enter/stay/exit records since the last call. */
  popContacts(): PhysicsContact2D[] {
    const result = this.contactEvents.slice();
    this.contactEvents = [];
    return result;
  }

  clearContacts(): void {
    this.activeContacts = [];
    this.contactEvents = [];
  }

  /** @internal Registers a body exactly once; bodies cannot cross worlds. */
  _registerBody(body: PhysicsBody2D): boolean {
    if (!this.isReady || body.world !== this || body.isDisposed || body.error !== null) return false;
    for (let index = 0; index < this.bodies.length; index++) {
      if (this.bodies[index] === body) return true;
    }
    this.bodies.push(body);
    return true;
  }

  /** @internal Removes a body; the next step emits exits for its active contacts. */
  _unregisterBody(body: PhysicsBody2D): void {
    this.removeBodyMembership(body);
    for (let index = this.bodies.length - 1; index >= 0; index--) {
      if (this.bodies[index] === body) removeAt(this.bodies, index);
    }
  }

  /** @internal Keeps direct position changes out of stale grid cells. */
  _bodyMoved(body: PhysicsBody2D): void {
    if (body.world === this && !body.isDisposed && body._isUsable()) this.updateBodyMembership(body);
  }

  /** @internal Sweeps a kinematic box along X then Y and reports the blocking outward normals. */
  _moveKinematicBox(body: PhysicsBody2D, width: number, height: number, delta: Vec2):
    { position: Vec2; normals: Vec2[] } | null {
    if (!this.isReady || body.world !== this || body.type !== 'kinematic' || body.shape.type !== 'box' ||
        body.shape.width !== width || body.shape.height !== height || !body._isUsable() || !validVec(delta)) return null;
    let position = body.position;
    const normals: Vec2[] = [];
    if (delta.x !== 0) {
      const hit = this.sweepKinematicBoxAxis(body, width, height, position, 'x', delta.x);
      if (hit !== null) {
        const direction = delta.x > 0 ? 1 : -1;
        position = { x: position.x + direction * hit.distance, y: position.y };
        normals.push(hit.normal);
      } else position = { x: position.x + delta.x, y: position.y };
      if (!body.setPosition(position)) return null;
    }
    if (delta.y !== 0) {
      const hit = this.sweepKinematicBoxAxis(body, width, height, position, 'y', delta.y);
      if (hit !== null) {
        const direction = delta.y > 0 ? 1 : -1;
        position = { x: position.x, y: position.y + direction * hit.distance };
        normals.push(hit.normal);
      } else position = { x: position.x, y: position.y + delta.y };
      if (!body.setPosition(position)) return null;
    }
    return { position: copyVec(position), normals };
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    const pending = this.bodies.slice();
    this.bodies = [];
    for (let index = pending.length - 1; index >= 0; index--) pending[index]._disposeFromWorld();
    this.activeContacts = [];
    this.contactEvents = [];
    this.broadphaseCells.clear();
    this.bodyMemberships.clear();
    this.oversizedBodies = [];
    this.accumulator = 0;
    this.context.unregister(this);
  }

  private simulate(dt: number): void {
    const snapshot = this.bodies.slice();
    const active: PhysicsBody2D[] = [];
    for (let index = 0; index < snapshot.length; index++) {
      const body = snapshot[index];
      if (body._isUsable() && body._syncFromTransform()) active.push(body);
      else this.removeBodyMembership(body);
    }

    for (let index = 0; index < active.length; index++) active[index]._integrate(dt, this.gravityValue);

    for (let index = 0; index < active.length; index++) this.updateBodyMembership(active[index]);
    const candidatePairs = this.collectCandidatePairs(active);

    const currentContacts: MutableContact[] = [];
    this.narrowphaseTestCount = 0;
    for (let index = 0; index < candidatePairs.length; index++) {
      const bodyA = candidatePairs[index].bodyA;
      const bodyB = candidatePairs[index].bodyB;
      if (!filtersAllow(bodyA, bodyB)) continue;
      this.narrowphaseTestCount++;
      const geometry = collide(bodyA, bodyB);
      if (geometry === null) continue;
      const wasTouching = this.findContact(this.activeContacts, bodyA, bodyB);
      const contact: MutableContact = {
        phase: wasTouching === null ? 'enter' : 'stay',
        bodyA,
        bodyB,
        normal: copyVec(geometry.normal),
        point: copyVec(geometry.point),
        penetration: geometry.penetration,
        isTrigger: bodyA.isSensor || bodyB.isSensor,
      };
      if (!contact.isTrigger) resolveContact(bodyA, bodyB, geometry);
      currentContacts.push(contact);
    }

    for (let index = 0; index < active.length; index++) {
      active[index]._syncToTransform();
      this.updateBodyMembership(active[index]);
    }

    const contactBatch: PhysicsContact2D[] = [];
    for (let index = 0; index < currentContacts.length; index++) contactBatch.push(currentContacts[index]);
    for (let index = 0; index < this.activeContacts.length; index++) {
      const previous = this.activeContacts[index];
      if (this.findContact(currentContacts, previous.bodyA, previous.bodyB) !== null) continue;
      contactBatch.push({
        phase: 'exit',
        bodyA: previous.bodyA,
        bodyB: previous.bodyB,
        normal: copyVec(previous.normal),
        point: copyVec(previous.point),
        penetration: 0,
        isTrigger: previous.isTrigger,
      });
    }
    this.activeContacts = currentContacts;
    this.dispatchContacts(contactBatch);
  }

  private queryCandidates(bounds: BroadphaseBounds): PhysicsBody2D[] {
    this.queryCandidateCount = 0;
    if (!this.isReady || !finite(bounds.minX) || !finite(bounds.minY) ||
        !finite(bounds.maxX) || !finite(bounds.maxY)) return [];
    this.syncBroadphaseMemberships();

    const candidates: PhysicsBody2D[] = [];
    const seen = new Map<number, boolean>();
    const range = this.gridRange(bounds);
    if (range.oversized) {
      for (let index = 0; index < this.bodies.length; index++) {
        const body = this.bodies[index];
        if (this.isActiveBody(body)) {
          if (boundsOverlap(bodyBounds(body), bounds)) {
            if (!seen.has(body.id)) {
              seen.set(body.id, true);
              candidates.push(body);
            }
          }
        }
      }
    } else {
      for (let yOffset = 0; yOffset < range.rows; yOffset++) {
        const y = range.minY + yOffset;
        for (let xOffset = 0; xOffset < range.columns; xOffset++) {
          const key = gridCellKey(range.minX + xOffset, y);
          const bucket = this.broadphaseCells.get(key);
          if (bucket === undefined) continue;
          for (let index = 0; index < bucket.length; index++) {
            const body = bucket[index];
            const overlapsQuery = boundsOverlap(bodyBounds(body), bounds);
            const alreadySeen = seen.has(body.id);
            if (overlapsQuery) {
              if (!alreadySeen) {
                seen.set(body.id, true);
                candidates.push(body);
              }
            }
          }
        }
      }
      for (let index = 0; index < this.oversizedBodies.length; index++) {
        const body = this.oversizedBodies[index];
        if (this.isActiveBody(body)) {
          if (boundsOverlap(bodyBounds(body), bounds)) {
            if (!seen.has(body.id)) {
              seen.set(body.id, true);
              candidates.push(body);
            }
          }
        }
      }
    }
    candidates.sort((a, b) => a.id - b.id);
    this.queryCandidateCount = candidates.length;
    return candidates;
  }

  private syncBroadphaseMemberships(): void {
    const snapshot = this.bodies.slice();
    for (let index = 0; index < snapshot.length; index++) {
      const body = snapshot[index];
      if (body._isUsable() && body._syncFromTransform()) this.updateBodyMembership(body);
      else this.removeBodyMembership(body);
    }
  }

  private sweepKinematicBoxAxis(body: PhysicsBody2D, width: number, height: number, position: Vec2,
    axis: 'x' | 'y', delta: number): AxisSweepHit | null {
    const halfX = width * 0.5;
    const halfY = height * 0.5;
    const endX = position.x + (axis === 'x' ? delta : 0);
    const endY = position.y + (axis === 'y' ? delta : 0);
    const candidates = this.queryCandidates({
      minX: Math.min(position.x, endX) - halfX,
      minY: Math.min(position.y, endY) - halfY,
      maxX: Math.max(position.x, endX) + halfX,
      maxY: Math.max(position.y, endY) + halfY,
    });
    let closest: AxisSweepHit | null = null;
    for (let index = 0; index < candidates.length; index++) {
      const candidate = candidates[index];
      if (candidate !== body && this.isQueryable(candidate, body.mask, false)) {
        if (filtersAllow(body, candidate)) {
          const hit = sweepBoxAgainstBody(position, width, height, axis, delta, candidate);
          if (hit !== null && (closest === null || hit.distance < closest.distance)) closest = hit;
        }
      }
    }
    return closest;
  }

  private isActiveBody(body: PhysicsBody2D): boolean {
    return body._isUsable() && body._syncFromTransform();
  }

  private gridRange(bounds: BroadphaseBounds): GridRange {
    const minX = Math.floor(bounds.minX / BROADPHASE_CELL_SIZE);
    const minY = Math.floor(bounds.minY / BROADPHASE_CELL_SIZE);
    const maxX = Math.floor(bounds.maxX / BROADPHASE_CELL_SIZE);
    const maxY = Math.floor(bounds.maxY / BROADPHASE_CELL_SIZE);
    const columns = Math.max(1, maxX - minX + 1);
    const rows = Math.max(1, maxY - minY + 1);
    const oversized = !finite(columns) || !finite(rows) || columns * rows > MAX_GRID_CELLS_PER_BODY;
    return { minX, minY, columns, rows, oversized };
  }

  private cellKeys(bounds: BroadphaseBounds): BodyMembership {
    const range = this.gridRange(bounds);
    if (range.oversized) return { cells: [], oversized: true };
    const cells: string[] = [];
    const seen = new Map<string, boolean>();
    for (let yOffset = 0; yOffset < range.rows; yOffset++) {
      const y = range.minY + yOffset;
      for (let xOffset = 0; xOffset < range.columns; xOffset++) {
        const key = gridCellKey(range.minX + xOffset, y);
        if (!seen.has(key)) { seen.set(key, true); cells.push(key); }
      }
    }
    return { cells, oversized: false };
  }

  private updateBodyMembership(body: PhysicsBody2D): void {
    const previous = this.bodyMemberships.get(body.id);
    const next = this.cellKeys(bodyBounds(body));
    if (previous !== undefined && previous.oversized === next.oversized &&
        (next.oversized || sameCellKeys(previous.cells, next.cells))) return;

    if (previous !== undefined) {
      if (previous.oversized) this.removeOversizedBody(body);
      else {
        for (let index = 0; index < previous.cells.length; index++) {
          const key = previous.cells[index];
          if (!hasCellKey(next.cells, key)) this.removeFromCell(key, body);
        }
      }
    }

    if (next.oversized) {
      this.oversizedBodies.push(body);
      this.bodyMemberships.set(body.id, next);
      return;
    }
    for (let index = 0; index < next.cells.length; index++) {
      const key = next.cells[index];
      if (previous === undefined || previous.oversized || !hasCellKey(previous.cells, key)) {
        const bucket = this.broadphaseCells.get(key);
        if (bucket === undefined) this.broadphaseCells.set(key, [body]);
        else {
          bucket.push(body);
          bucket.sort((a, b) => a.id - b.id);
        }
      }
    }
    this.bodyMemberships.set(body.id, next);
  }

  private removeBodyMembership(body: PhysicsBody2D): void {
    const previous = this.bodyMemberships.get(body.id);
    if (previous === undefined) return;
    if (previous.oversized) this.removeOversizedBody(body);
    else for (let index = 0; index < previous.cells.length; index++) this.removeFromCell(previous.cells[index], body);
    this.bodyMemberships.delete(body.id);
  }

  private removeFromCell(key: string, body: PhysicsBody2D): void {
    const bucket = this.broadphaseCells.get(key);
    if (bucket === undefined) return;
    for (let index = bucket.length - 1; index >= 0; index--) {
      if (bucket[index] === body) removeAt(bucket, index);
    }
    if (bucket.length === 0) this.broadphaseCells.delete(key);
  }

  private removeOversizedBody(body: PhysicsBody2D): void {
    for (let index = this.oversizedBodies.length - 1; index >= 0; index--) {
      if (this.oversizedBodies[index] === body) removeAt(this.oversizedBodies, index);
    }
  }

  private collectCandidatePairs(active: PhysicsBody2D[]): CandidatePair[] {
    const result: CandidatePair[] = [];
    const seen = new Map<string, boolean>();
    for (let index = 0; index < active.length; index++) {
      const body = active[index];
      const membership = this.bodyMemberships.get(body.id);
      if (membership === undefined) continue;
      if (membership.oversized) {
        for (let otherIndex = 0; otherIndex < active.length; otherIndex++) {
          const other = active[otherIndex];
          if (other !== body) this.addCandidatePair(body, other, seen, result);
        }
      } else {
        for (let cellIndex = 0; cellIndex < membership.cells.length; cellIndex++) {
          const bucket = this.broadphaseCells.get(membership.cells[cellIndex]);
          if (bucket === undefined) continue;
          for (let otherIndex = 0; otherIndex < bucket.length; otherIndex++) {
            const other = bucket[otherIndex];
            if (other.id > body.id) this.addCandidatePair(body, other, seen, result);
          }
        }
      }
    }
    result.sort((a, b) => a.bodyA.id - b.bodyA.id || a.bodyB.id - b.bodyB.id);
    this.candidatePairCount = result.length;
    return result;
  }

  private addCandidatePair(a: PhysicsBody2D, b: PhysicsBody2D, seen: Map<string, boolean>,
    result: CandidatePair[]): void {
    const bodyA = a.id < b.id ? a : b;
    const bodyB = a.id < b.id ? b : a;
    const key = bodyA.id + ':' + bodyB.id;
    if (seen.has(key)) return;
    seen.set(key, true);
    result.push({ bodyA, bodyB });
  }

  private dispatchContacts(contactBatch: PhysicsContact2D[]): void {
    for (let index = 0; index < contactBatch.length; index++) {
      const contact = contactBatch[index];
      const publicContact: PhysicsContact2D = {
        phase: contact.phase,
        bodyA: contact.bodyA,
        bodyB: contact.bodyB,
        normal: copyVec(contact.normal),
        point: copyVec(contact.point),
        penetration: contact.penetration,
        isTrigger: contact.isTrigger,
      };
      this.contactEvents.push(publicContact);
      const viewA: PhysicsBodyContact2D = {
        phase: contact.phase,
        self: contact.bodyA,
        other: contact.bodyB,
        normal: copyVec(contact.normal),
        point: copyVec(contact.point),
        penetration: contact.penetration,
        isTrigger: contact.isTrigger,
      };
      const viewB: PhysicsBodyContact2D = {
        phase: contact.phase,
        self: contact.bodyB,
        other: contact.bodyA,
        normal: { x: -contact.normal.x, y: -contact.normal.y },
        point: copyVec(contact.point),
        penetration: contact.penetration,
        isTrigger: contact.isTrigger,
      };
      contact.bodyA._emitContact(viewA);
      contact.bodyB._emitContact(viewB);
    }
  }

  private findContact(contacts: PhysicsContact2D[], a: PhysicsBody2D, b: PhysicsBody2D): PhysicsContact2D | null {
    for (let index = 0; index < contacts.length; index++) {
      const contact = contacts[index];
      if (contact.bodyA === a && contact.bodyB === b) return contact;
    }
    return null;
  }

  private isQueryable(body: PhysicsBody2D, mask: number, includeSensors: boolean): boolean {
    return body._isUsable() && (body.layer & mask) !== 0 && (includeSensors || !body.isSensor) &&
      body._syncFromTransform();
  }
}

function validMask(value: number): boolean {
  return finite(value) && value >= 0 && value <= 0x7fffffff && Math.floor(value) === value;
}

function filtersAllow(a: PhysicsBody2D, b: PhysicsBody2D): boolean {
  return (a.layer & b.mask) !== 0 && (b.layer & a.mask) !== 0;
}

function positionOf(value: ShapePose | PhysicsBody2D): Vec2 {
  if (value instanceof PhysicsBody2D) return value.position;
  return value.position;
}

function shapeOf(value: ShapePose | PhysicsBody2D): PhysicsShape2D {
  if (value instanceof PhysicsBody2D) return value.shape;
  return value.shape;
}

function collide(a: ShapePose | PhysicsBody2D, b: ShapePose | PhysicsBody2D): ContactGeometry | null {
  const aPosition = positionOf(a);
  const bPosition = positionOf(b);
  const aShape = shapeOf(a);
  const bShape = shapeOf(b);
  if (aShape.type === 'circle' && bShape.type === 'circle') {
    const dx = bPosition.x - aPosition.x;
    const dy = bPosition.y - aPosition.y;
    const distanceSq = dx * dx + dy * dy;
    const sum = aShape.radius + bShape.radius;
    if (distanceSq >= sum * sum) return null;
    const distance = Math.sqrt(distanceSq);
    const normal = distance > 0.0000001 ? { x: dx / distance, y: dy / distance } : { x: 1, y: 0 };
    return {
      normal,
      point: { x: aPosition.x + normal.x * (aShape.radius - (sum - distance) * 0.5),
        y: aPosition.y + normal.y * (aShape.radius - (sum - distance) * 0.5) },
      penetration: sum - distance,
    };
  }
  if (aShape.type === 'box' && bShape.type === 'box') {
    const halfAX = aShape.width * 0.5;
    const halfAY = aShape.height * 0.5;
    const halfBX = bShape.width * 0.5;
    const halfBY = bShape.height * 0.5;
    const dx = bPosition.x - aPosition.x;
    const dy = bPosition.y - aPosition.y;
    const overlapX = halfAX + halfBX - Math.abs(dx);
    const overlapY = halfAY + halfBY - Math.abs(dy);
    if (overlapX <= 0 || overlapY <= 0) return null;
    if (overlapX < overlapY) {
      return {
        normal: { x: dx < 0 ? -1 : 1, y: 0 },
        point: { x: (aPosition.x + bPosition.x) * 0.5,
          y: clamp((aPosition.y + bPosition.y) * 0.5, Math.max(aPosition.y - halfAY, bPosition.y - halfBY),
            Math.min(aPosition.y + halfAY, bPosition.y + halfBY)) },
        penetration: overlapX,
      };
    }
    return {
      normal: { x: 0, y: dy < 0 ? -1 : 1 },
      point: { x: clamp((aPosition.x + bPosition.x) * 0.5, Math.max(aPosition.x - halfAX, bPosition.x - halfBX),
        Math.min(aPosition.x + halfAX, bPosition.x + halfBX)), y: (aPosition.y + bPosition.y) * 0.5 },
      penetration: overlapY,
    };
  }
  if (aShape.type === 'circle') return collideCircleBox(aPosition, aShape.radius, bPosition, bShape as { type: 'box'; width: number; height: number });
  const reversed = collideCircleBox(bPosition, (bShape as { type: 'circle'; radius: number }).radius,
    aPosition, aShape as { type: 'box'; width: number; height: number });
  return reversed === null ? null : {
    normal: { x: -reversed.normal.x, y: -reversed.normal.y },
    point: copyVec(reversed.point),
    penetration: reversed.penetration,
  };
}

function collideCircleBox(circle: Vec2, radius: number, box: Vec2,
  shape: { type: 'box'; width: number; height: number }): ContactGeometry | null {
  const halfX = shape.width * 0.5;
  const halfY = shape.height * 0.5;
  const closestX = clamp(circle.x, box.x - halfX, box.x + halfX);
  const closestY = clamp(circle.y, box.y - halfY, box.y + halfY);
  const dx = closestX - circle.x;
  const dy = closestY - circle.y;
  const distanceSq = dx * dx + dy * dy;
  if (distanceSq > radius * radius) return null;
  if (distanceSq > 0.00000001) {
    const distance = Math.sqrt(distanceSq);
    return {
      normal: { x: dx / distance, y: dy / distance },
      point: { x: closestX, y: closestY },
      penetration: radius - distance,
    };
  }

  const distances = [circle.x - (box.x - halfX), (box.x + halfX) - circle.x,
    circle.y - (box.y - halfY), (box.y + halfY) - circle.y];
  let face = 0;
  for (let index = 1; index < distances.length; index++) {
    if (distances[index] < distances[face]) face = index;
  }
  let normal: Vec2 = { x: 0, y: 0 };
  let point: Vec2 = { x: circle.x, y: circle.y };
  if (face === 0) { normal = { x: 1, y: 0 }; point.x = box.x - halfX; }
  else if (face === 1) { normal = { x: -1, y: 0 }; point.x = box.x + halfX; }
  else if (face === 2) { normal = { x: 0, y: 1 }; point.y = box.y - halfY; }
  else { normal = { x: 0, y: -1 }; point.y = box.y + halfY; }
  return { normal, point, penetration: radius + distances[face] };
}

function resolveContact(a: PhysicsBody2D, b: PhysicsBody2D, contact: ContactGeometry): void {
  const inverseA = a._inverseMass();
  const inverseB = b._inverseMass();
  const inverseSum = inverseA + inverseB;
  if (inverseSum <= 0) return;

  const correctionMagnitude = Math.max(contact.penetration - 0.001, 0) * 0.8 / inverseSum;
  a._moveBy(-contact.normal.x * correctionMagnitude * inverseA, -contact.normal.y * correctionMagnitude * inverseA);
  b._moveBy(contact.normal.x * correctionMagnitude * inverseB, contact.normal.y * correctionMagnitude * inverseB);

  const velocityA = a.velocity;
  const velocityB = b.velocity;
  const relativeX = velocityB.x - velocityA.x;
  const relativeY = velocityB.y - velocityA.y;
  const alongNormal = relativeX * contact.normal.x + relativeY * contact.normal.y;
  if (alongNormal > 0) return;
  const restitution = Math.min(a.restitution, b.restitution);
  const impulseMagnitude = -(1 + restitution) * alongNormal / inverseSum;
  const impulseX = contact.normal.x * impulseMagnitude;
  const impulseY = contact.normal.y * impulseMagnitude;
  a._addVelocity(-impulseX * inverseA, -impulseY * inverseA);
  b._addVelocity(impulseX * inverseB, impulseY * inverseB);

  const tangentX0 = relativeX - alongNormal * contact.normal.x;
  const tangentY0 = relativeY - alongNormal * contact.normal.y;
  const tangentLength = Math.sqrt(tangentX0 * tangentX0 + tangentY0 * tangentY0);
  if (tangentLength <= 0.0000001) return;
  const tangentX = tangentX0 / tangentLength;
  const tangentY = tangentY0 / tangentLength;
  let frictionImpulse = -(relativeX * tangentX + relativeY * tangentY) / inverseSum;
  const maximumFriction = impulseMagnitude * Math.sqrt(a.friction * b.friction);
  frictionImpulse = clamp(frictionImpulse, -maximumFriction, maximumFriction);
  a._addVelocity(-tangentX * frictionImpulse * inverseA, -tangentY * frictionImpulse * inverseA);
  b._addVelocity(tangentX * frictionImpulse * inverseB, tangentY * frictionImpulse * inverseB);
}

function containsPoint(body: PhysicsBody2D, point: Vec2): boolean {
  const position = body.position;
  if (body.shape.type === 'circle') {
    const dx = point.x - position.x;
    const dy = point.y - position.y;
    return dx * dx + dy * dy <= body.shape.radius * body.shape.radius;
  }
  return Math.abs(point.x - position.x) <= body.shape.width * 0.5 &&
    Math.abs(point.y - position.y) <= body.shape.height * 0.5;
}

function rayShape(origin: Vec2, direction: Vec2, maxDistance: number, body: PhysicsBody2D):
  { point: Vec2; normal: Vec2; distance: number } | null {
  const position = body.position;
  if (body.shape.type === 'circle') {
    const offsetX = origin.x - position.x;
    const offsetY = origin.y - position.y;
    const projected = offsetX * direction.x + offsetY * direction.y;
    const c = offsetX * offsetX + offsetY * offsetY - body.shape.radius * body.shape.radius;
    const discriminant = projected * projected - c;
    if (discriminant < 0) return null;
    let distance = -projected - Math.sqrt(discriminant);
    if (distance < 0) distance = -projected + Math.sqrt(discriminant);
    if (distance < 0 || distance > maxDistance) return null;
    const point = { x: origin.x + direction.x * distance, y: origin.y + direction.y * distance };
    const normalLength = body.shape.radius;
    return { point, normal: { x: (point.x - position.x) / normalLength, y: (point.y - position.y) / normalLength }, distance };
  }

  let near = -Infinity;
  let far = Infinity;
  let normal: Vec2 = { x: 0, y: 0 };
  let farNormal: Vec2 = { x: 0, y: 0 };
  const halfX = body.shape.width * 0.5;
  const halfY = body.shape.height * 0.5;
  const axes = [
    { origin: origin.x, direction: direction.x, minimum: position.x - halfX, maximum: position.x + halfX, xAxis: true },
    { origin: origin.y, direction: direction.y, minimum: position.y - halfY, maximum: position.y + halfY, xAxis: false },
  ];
  for (let index = 0; index < axes.length; index++) {
    const axis = axes[index];
    if (Math.abs(axis.direction) < 0.0000001) {
      if (axis.origin < axis.minimum || axis.origin > axis.maximum) return null;
      continue;
    }
    let first = (axis.minimum - axis.origin) / axis.direction;
    let second = (axis.maximum - axis.origin) / axis.direction;
    const nearNormal = axis.direction > 0 ? -1 : 1;
    const farAxisNormal = axis.direction > 0 ? 1 : -1;
    if (first > second) {
      const swap = first;
      first = second;
      second = swap;
    }
    if (first > near) {
      near = first;
      normal = axis.xAxis ? { x: nearNormal, y: 0 } : { x: 0, y: nearNormal };
    }
    if (second < far) {
      far = second;
      farNormal = axis.xAxis ? { x: farAxisNormal, y: 0 } : { x: 0, y: farAxisNormal };
    }
    if (near > far) return null;
  }
  const distance = near >= 0 ? near : far;
  if (distance < 0 || distance > maxDistance || !finite(distance)) return null;
  if (near < 0) normal = farNormal;
  return {
    point: { x: origin.x + direction.x * distance, y: origin.y + direction.y * distance },
    normal,
    distance,
  };
}
