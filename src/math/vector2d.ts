import type { Vector2DLike } from '../core/types';

/** Mutable 2D vector value with allocation-safe, non-mutating math helpers. */
export class Vector2D implements Vector2DLike {
  /** Horizontal component. */
  x: number;
  /** Vertical component. */
  y: number;

  /** Creates a vector; components default to 0. */
  constructor(x?: number, y?: number) {
    this.x = x === undefined ? 0 : x;
    this.y = y === undefined ? 0 : y;
  }

  /** Returns a new vector (0, 0). */
  static zero(): Vector2D {
    return new Vector2D(0, 0);
  }
  /** Returns a new vector (1, 1). */
  static one(): Vector2D {
    return new Vector2D(1, 1);
  }
  /** Returns a new vector (0, 1). */
  static up(): Vector2D {
    return new Vector2D(0, 1);
  }
  /** Returns a new vector (0, -1). */
  static down(): Vector2D {
    return new Vector2D(0, -1);
  }
  /** Returns a new vector (-1, 0). */
  static left(): Vector2D {
    return new Vector2D(-1, 0);
  }
  /** Returns a new vector (1, 0). */
  static right(): Vector2D {
    return new Vector2D(1, 0);
  }

  /** Copies any `{ x, y }` value into a new vector. */
  static from(value: Vector2DLike): Vector2D {
    return new Vector2D(value.x, value.y);
  }
  /** Returns a new vector with the same components. */
  clone(): Vector2D {
    return new Vector2D(this.x, this.y);
  }
  /** Sets both components in place and returns this vector. */
  set(x: number, y: number): this {
    this.x = x;
    this.y = y;
    return this;
  }
  /** Copies the components of `value` into this vector in place and returns this vector. */
  copy(value: Vector2DLike): this {
    this.x = value.x;
    this.y = value.y;
    return this;
  }

  /** Length of the vector. */
  get magnitude(): number {
    return Math.sqrt(this.x * this.x + this.y * this.y);
  }
  /** Squared length; cheaper than `magnitude` when only comparing distances. */
  get sqrMagnitude(): number {
    return this.x * this.x + this.y * this.y;
  }
  /** Length of the vector; same as `magnitude`. */
  get length(): number {
    return this.magnitude;
  }
  /** Squared length; same as `sqrMagnitude`. */
  get lengthSquared(): number {
    return this.sqrMagnitude;
  }
  /** Unit-length copy, or a zero vector when the length is 0. */
  get normalized(): Vector2D {
    return Vector2D.normalize(this);
  }

  /** Returns the component-wise sum. */
  add(value: Vector2DLike): Vector2D {
    return new Vector2D(this.x + value.x, this.y + value.y);
  }
  /** Returns the component-wise difference. */
  subtract(value: Vector2DLike): Vector2D {
    return new Vector2D(this.x - value.x, this.y - value.y);
  }
  /** Returns the component-wise product. */
  multiply(value: Vector2DLike): Vector2D {
    return new Vector2D(this.x * value.x, this.y * value.y);
  }
  /** Returns the component-wise quotient; a component divided by 0 becomes 0. */
  divide(value: Vector2DLike): Vector2D {
    return new Vector2D(value.x === 0 ? 0 : this.x / value.x, value.y === 0 ? 0 : this.y / value.y);
  }
  /** Returns the vector multiplied by a scalar. */
  scale(factor: number): Vector2D {
    return new Vector2D(this.x * factor, this.y * factor);
  }
  /** Dot product with `value`. */
  dotWith(value: Vector2DLike): number {
    return Vector2D.dot(this, value);
  }
  /** Scalar 2D cross product with `value`. */
  crossWith(value: Vector2DLike): number {
    return Vector2D.cross(this, value);
  }
  /** Distance to `value`. */
  distanceTo(value: Vector2DLike): number {
    return Vector2D.distance(this, value);
  }
  /** Linearly interpolates toward `value` with `amount` clamped to 0..1. */
  interpolatedTo(value: Vector2DLike, amount: number): Vector2D {
    return Vector2D.lerp(this, value, amount);
  }
  /** Returns the vector rotated by `radians`, counter-clockwise. */
  rotatedBy(radians: number): Vector2D {
    return Vector2D.rotate(this, radians);
  }
  /** Returns the vector with each component limited to the `min`..`max` range. */
  clamped(min: Vector2DLike, max: Vector2DLike): Vector2D {
    return Vector2D.clamp(this, min, max);
  }
  /** Returns the vector with its length limited to `maxLength`. */
  clampedMagnitude(maxLength: number): Vector2D {
    return Vector2D.clampMagnitude(this, maxLength);
  }
  /** True when both components are exactly equal. */
  equals(value: Vector2DLike): boolean {
    return this.x === value.x && this.y === value.y;
  }
  /** True when both components differ by at most `tolerance`. */
  equalsApprox(value: Vector2DLike, tolerance = 0.00001): boolean {
    return Math.abs(this.x - value.x) <= tolerance && Math.abs(this.y - value.y) <= tolerance;
  }
  /** Returns the component-wise sum of `a` and `b`. */
  static sum(a: Vector2DLike, b: Vector2DLike): Vector2D {
    return new Vector2D(a.x + b.x, a.y + b.y);
  }
  /** Returns `a` minus `b`, component-wise. */
  static difference(a: Vector2DLike, b: Vector2DLike): Vector2D {
    return new Vector2D(a.x - b.x, a.y - b.y);
  }
  /** Returns the component-wise product of `a` and `b`. */
  static componentProduct(a: Vector2DLike, b: Vector2DLike): Vector2D {
    return new Vector2D(a.x * b.x, a.y * b.y);
  }
  /** Returns `a` divided by `b` component-wise; a component divided by 0 becomes 0. */
  static componentQuotient(a: Vector2DLike, b: Vector2DLike): Vector2D {
    return new Vector2D(b.x === 0 ? 0 : a.x / b.x, b.y === 0 ? 0 : a.y / b.y);
  }
  /** Returns `value` multiplied by a scalar. */
  static scaled(value: Vector2DLike, factor: number): Vector2D {
    return new Vector2D(value.x * factor, value.y * factor);
  }
  /** Returns a unit-length copy of `value`, or a zero vector when its length is 0. */
  static normalize(value: Vector2DLike): Vector2D {
    const magnitude = Vector2D.magnitude(value);
    return magnitude === 0 ? Vector2D.zero() : Vector2D.scaled(value, 1 / magnitude);
  }
  /** Length of `value`. */
  static magnitude(value: Vector2DLike): number {
    return Math.sqrt(value.x * value.x + value.y * value.y);
  }
  /** Squared length of `value`. */
  static sqrMagnitude(value: Vector2DLike): number {
    return value.x * value.x + value.y * value.y;
  }
  /** Dot product of `a` and `b`. */
  static dot(a: Vector2DLike, b: Vector2DLike): number {
    return a.x * b.x + a.y * b.y;
  }
  /** Scalar 2D cross product of `a` and `b`. */
  static cross(a: Vector2DLike, b: Vector2DLike): number {
    return a.x * b.y - a.y * b.x;
  }
  /** Distance between `a` and `b`. */
  static distance(a: Vector2DLike, b: Vector2DLike): number {
    const x = b.x - a.x,
      y = b.y - a.y;
    return Math.sqrt(x * x + y * y);
  }
  /** Squared distance between `a` and `b`. */
  static distanceSquared(a: Vector2DLike, b: Vector2DLike): number {
    const x = b.x - a.x,
      y = b.y - a.y;
    return x * x + y * y;
  }
  /** Returns the component-wise minimum of `a` and `b`. */
  static min(a: Vector2DLike, b: Vector2DLike): Vector2D {
    return new Vector2D(Math.min(a.x, b.x), Math.min(a.y, b.y));
  }
  /** Returns the component-wise maximum of `a` and `b`. */
  static max(a: Vector2DLike, b: Vector2DLike): Vector2D {
    return new Vector2D(Math.max(a.x, b.x), Math.max(a.y, b.y));
  }
  /** Returns `value` with each component limited to the `min`..`max` range. */
  static clamp(value: Vector2DLike, min: Vector2DLike, max: Vector2DLike): Vector2D {
    const minX = Math.min(min.x, max.x),
      maxX = Math.max(min.x, max.x);
    const minY = Math.min(min.y, max.y),
      maxY = Math.max(min.y, max.y);
    return new Vector2D(Math.max(minX, Math.min(maxX, value.x)), Math.max(minY, Math.min(maxY, value.y)));
  }
  /** Returns `value` with its length limited to `maxLength`. */
  static clampMagnitude(value: Vector2DLike, maxLength: number): Vector2D {
    const limit = Math.max(0, maxLength);
    const squared = Vector2D.sqrMagnitude(value);
    if (squared <= limit * limit) return Vector2D.from(value);
    return Vector2D.scaled(value, limit / Math.sqrt(squared));
  }
  /** Interpolates with an amount clamped to [0, 1]. */
  static lerp(a: Vector2DLike, b: Vector2DLike, amount: number): Vector2D {
    const t = Math.max(0, Math.min(1, amount));
    return Vector2D.lerpUnclamped(a, b, t);
  }
  /** Linearly interpolates from `a` to `b` without clamping `amount`. */
  static lerpUnclamped(a: Vector2DLike, b: Vector2DLike, amount: number): Vector2D {
    return new Vector2D(a.x + (b.x - a.x) * amount, a.y + (b.y - a.y) * amount);
  }
  /** Moves `current` toward `target` by at most `maxDistanceDelta`, without overshooting. */
  static moveTowards(current: Vector2DLike, target: Vector2DLike, maxDistanceDelta: number): Vector2D {
    const x = target.x - current.x,
      y = target.y - current.y;
    const distance = Math.sqrt(x * x + y * y);
    if (distance === 0 || distance <= maxDistanceDelta) return Vector2D.from(target);
    return new Vector2D(current.x + (x / distance) * maxDistanceDelta, current.y + (y / distance) * maxDistanceDelta);
  }
  /** Reflects `direction` off a surface with the given `normal`. */
  static reflect(direction: Vector2DLike, normal: Vector2DLike): Vector2D {
    const unitNormal = Vector2D.normalize(normal);
    return Vector2D.difference(direction, Vector2D.scaled(unitNormal, 2 * Vector2D.dot(direction, unitNormal)));
  }
  /** Projects `value` onto `onto`; returns a zero vector when `onto` is zero. */
  static project(value: Vector2DLike, onto: Vector2DLike): Vector2D {
    const denominator = Vector2D.sqrMagnitude(onto);
    return denominator === 0 ? Vector2D.zero() : Vector2D.scaled(onto, Vector2D.dot(value, onto) / denominator);
  }
  /** Returns the unsigned angle in degrees, matching common game-engine APIs. */
  static angle(a: Vector2DLike, b: Vector2DLike): number {
    const denominator = Vector2D.magnitude(a) * Vector2D.magnitude(b);
    if (denominator === 0) return 0;
    const cosine = Math.max(-1, Math.min(1, Vector2D.dot(a, b) / denominator));
    return Math.acos(cosine) * (180 / Math.PI);
  }
  /** Returns the signed angle in degrees from `from` to `to`. */
  static signedAngle(from: Vector2DLike, to: Vector2DLike): number {
    return Math.atan2(Vector2D.cross(from, to), Vector2D.dot(from, to)) * (180 / Math.PI);
  }
  /** Rotates by radians, counter-clockwise in Cartesian coordinates. */
  static rotate(value: Vector2DLike, radians: number): Vector2D {
    const cosine = Math.cos(radians),
      sine = Math.sin(radians);
    return new Vector2D(value.x * cosine - value.y * sine, value.x * sine + value.y * cosine);
  }
  /** Returns `value` rotated 90 degrees counter-clockwise. */
  static perpendicular(value: Vector2DLike): Vector2D {
    return new Vector2D(-value.y, value.x);
  }
}
