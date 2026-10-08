import type { Vector2DLike } from '../core/types';

/** Mutable 2D vector value with allocation-safe, non-mutating math helpers. */
export class Vector2D implements Vector2DLike {
  x: number;
  y: number;

  constructor(x?: number, y?: number) {
    this.x = x === undefined ? 0 : x;
    this.y = y === undefined ? 0 : y;
  }

  static zero(): Vector2D {
    return new Vector2D(0, 0);
  }
  static one(): Vector2D {
    return new Vector2D(1, 1);
  }
  static up(): Vector2D {
    return new Vector2D(0, 1);
  }
  static down(): Vector2D {
    return new Vector2D(0, -1);
  }
  static left(): Vector2D {
    return new Vector2D(-1, 0);
  }
  static right(): Vector2D {
    return new Vector2D(1, 0);
  }

  static from(value: Vector2DLike): Vector2D {
    return new Vector2D(value.x, value.y);
  }
  clone(): Vector2D {
    return new Vector2D(this.x, this.y);
  }
  set(x: number, y: number): this {
    this.x = x;
    this.y = y;
    return this;
  }
  copy(value: Vector2DLike): this {
    this.x = value.x;
    this.y = value.y;
    return this;
  }

  get magnitude(): number {
    return Math.sqrt(this.x * this.x + this.y * this.y);
  }
  get sqrMagnitude(): number {
    return this.x * this.x + this.y * this.y;
  }
  get length(): number {
    return this.magnitude;
  }
  get lengthSquared(): number {
    return this.sqrMagnitude;
  }
  get normalized(): Vector2D {
    return Vector2D.normalize(this);
  }

  add(value: Vector2DLike): Vector2D {
    return new Vector2D(this.x + value.x, this.y + value.y);
  }
  subtract(value: Vector2DLike): Vector2D {
    return new Vector2D(this.x - value.x, this.y - value.y);
  }
  multiply(value: Vector2DLike): Vector2D {
    return new Vector2D(this.x * value.x, this.y * value.y);
  }
  divide(value: Vector2DLike): Vector2D {
    return new Vector2D(value.x === 0 ? 0 : this.x / value.x, value.y === 0 ? 0 : this.y / value.y);
  }
  scale(factor: number): Vector2D {
    return new Vector2D(this.x * factor, this.y * factor);
  }
  dotWith(value: Vector2DLike): number {
    return Vector2D.dot(this, value);
  }
  crossWith(value: Vector2DLike): number {
    return Vector2D.cross(this, value);
  }
  distanceTo(value: Vector2DLike): number {
    return Vector2D.distance(this, value);
  }
  interpolatedTo(value: Vector2DLike, amount: number): Vector2D {
    return Vector2D.lerp(this, value, amount);
  }
  rotatedBy(radians: number): Vector2D {
    return Vector2D.rotate(this, radians);
  }
  clamped(min: Vector2DLike, max: Vector2DLike): Vector2D {
    return Vector2D.clamp(this, min, max);
  }
  clampedMagnitude(maxLength: number): Vector2D {
    return Vector2D.clampMagnitude(this, maxLength);
  }
  equals(value: Vector2DLike): boolean {
    return this.x === value.x && this.y === value.y;
  }
  equalsApprox(value: Vector2DLike, tolerance = 0.00001): boolean {
    return Math.abs(this.x - value.x) <= tolerance && Math.abs(this.y - value.y) <= tolerance;
  }
  static sum(a: Vector2DLike, b: Vector2DLike): Vector2D {
    return new Vector2D(a.x + b.x, a.y + b.y);
  }
  static difference(a: Vector2DLike, b: Vector2DLike): Vector2D {
    return new Vector2D(a.x - b.x, a.y - b.y);
  }
  static componentProduct(a: Vector2DLike, b: Vector2DLike): Vector2D {
    return new Vector2D(a.x * b.x, a.y * b.y);
  }
  static componentQuotient(a: Vector2DLike, b: Vector2DLike): Vector2D {
    return new Vector2D(b.x === 0 ? 0 : a.x / b.x, b.y === 0 ? 0 : a.y / b.y);
  }
  static scaled(value: Vector2DLike, factor: number): Vector2D {
    return new Vector2D(value.x * factor, value.y * factor);
  }
  static normalize(value: Vector2DLike): Vector2D {
    const magnitude = Vector2D.magnitude(value);
    return magnitude === 0 ? Vector2D.zero() : Vector2D.scaled(value, 1 / magnitude);
  }
  static magnitude(value: Vector2DLike): number {
    return Math.sqrt(value.x * value.x + value.y * value.y);
  }
  static sqrMagnitude(value: Vector2DLike): number {
    return value.x * value.x + value.y * value.y;
  }
  static dot(a: Vector2DLike, b: Vector2DLike): number {
    return a.x * b.x + a.y * b.y;
  }
  static cross(a: Vector2DLike, b: Vector2DLike): number {
    return a.x * b.y - a.y * b.x;
  }
  static distance(a: Vector2DLike, b: Vector2DLike): number {
    const x = b.x - a.x,
      y = b.y - a.y;
    return Math.sqrt(x * x + y * y);
  }
  static distanceSquared(a: Vector2DLike, b: Vector2DLike): number {
    const x = b.x - a.x,
      y = b.y - a.y;
    return x * x + y * y;
  }
  static min(a: Vector2DLike, b: Vector2DLike): Vector2D {
    return new Vector2D(Math.min(a.x, b.x), Math.min(a.y, b.y));
  }
  static max(a: Vector2DLike, b: Vector2DLike): Vector2D {
    return new Vector2D(Math.max(a.x, b.x), Math.max(a.y, b.y));
  }
  static clamp(value: Vector2DLike, min: Vector2DLike, max: Vector2DLike): Vector2D {
    const minX = Math.min(min.x, max.x),
      maxX = Math.max(min.x, max.x);
    const minY = Math.min(min.y, max.y),
      maxY = Math.max(min.y, max.y);
    return new Vector2D(Math.max(minX, Math.min(maxX, value.x)), Math.max(minY, Math.min(maxY, value.y)));
  }
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
  static lerpUnclamped(a: Vector2DLike, b: Vector2DLike, amount: number): Vector2D {
    return new Vector2D(a.x + (b.x - a.x) * amount, a.y + (b.y - a.y) * amount);
  }
  static moveTowards(current: Vector2DLike, target: Vector2DLike, maxDistanceDelta: number): Vector2D {
    const x = target.x - current.x,
      y = target.y - current.y;
    const distance = Math.sqrt(x * x + y * y);
    if (distance === 0 || distance <= maxDistanceDelta) return Vector2D.from(target);
    return new Vector2D(current.x + (x / distance) * maxDistanceDelta, current.y + (y / distance) * maxDistanceDelta);
  }
  static reflect(direction: Vector2DLike, normal: Vector2DLike): Vector2D {
    const unitNormal = Vector2D.normalize(normal);
    return Vector2D.difference(direction, Vector2D.scaled(unitNormal, 2 * Vector2D.dot(direction, unitNormal)));
  }
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
  static perpendicular(value: Vector2DLike): Vector2D {
    return new Vector2D(-value.y, value.x);
  }
}
