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

function finite(value: number): boolean {
  return value === value && value !== Infinity && value !== -Infinity;
}

function validVec(value: Vec2): boolean {
  return value !== null && value !== undefined && finite(value.x) && finite(value.y);
}

function copyVec(value: Vec2): Vec2 { return { x: value.x, y: value.y }; }
function clamp(value: number, min: number, max: number): number { return Math.max(min, Math.min(max, value)); }
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
  private activeContacts: MutableContact[] = [];
  private contactEvents: PhysicsContact2D[] = [];
  private disposed = false;
  private stepping = false;

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

    let closest: PhysicsRayHit2D | null = null;
    const includeSensors = options.includeSensors === undefined ? true : options.includeSensors;
    const snapshot = this.bodies.slice();
    for (let index = 0; index < snapshot.length; index++) {
      const body = snapshot[index];
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
    const snapshot = this.bodies.slice();
    for (let index = 0; index < snapshot.length; index++) {
      const body = snapshot[index];
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
    const snapshot = this.bodies.slice();
    for (let index = 0; index < snapshot.length; index++) {
      const body = snapshot[index];
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
    const snapshot = this.bodies.slice();
    for (let index = 0; index < snapshot.length; index++) {
      const body = snapshot[index];
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
    for (let index = this.bodies.length - 1; index >= 0; index--) {
      if (this.bodies[index] === body) removeAt(this.bodies, index);
    }
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    const pending = this.bodies.slice();
    this.bodies = [];
    for (let index = pending.length - 1; index >= 0; index--) pending[index]._disposeFromWorld();
    this.activeContacts = [];
    this.contactEvents = [];
    this.accumulator = 0;
    this.context.unregister(this);
  }

  private simulate(dt: number): void {
    const snapshot = this.bodies.slice();
    const active: PhysicsBody2D[] = [];
    for (let index = 0; index < snapshot.length; index++) {
      const body = snapshot[index];
      if (body._isUsable() && body._syncFromTransform()) active.push(body);
    }

    for (let index = 0; index < active.length; index++) active[index]._integrate(dt, this.gravityValue);

    const currentContacts: MutableContact[] = [];
    for (let leftIndex = 0; leftIndex < active.length; leftIndex++) {
      const bodyA = active[leftIndex];
      for (let rightIndex = leftIndex + 1; rightIndex < active.length; rightIndex++) {
        const bodyB = active[rightIndex];
        if (!filtersAllow(bodyA, bodyB)) continue;
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
    }

    for (let index = 0; index < active.length; index++) active[index]._syncToTransform();

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
