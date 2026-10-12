import * as nativeMath from './internal';
import type {
  BoundingBox,
  FrustumPlanes,
  Mat4,
  Quat as QuatLike,
  Ray,
  RayHit,
  Vector2DLike,
  Vec3 as Vec3Like,
  Vec4 as Vec4Like,
} from '../core/types';
import {
  checkCollisionCircleRec,
  checkCollisionCircles,
  checkCollisionPointCircle,
  checkCollisionPointRec,
  checkCollisionRecs,
  getCollisionRec,
} from '../shapes/internal';
export { Vector2D } from './vector2d';

/** 3D vector with non-mutating math helpers. */
export class Vec3 implements Vec3Like {
  /** Creates a vector; components default to 0. */
  constructor(
    public x = 0,
    public y = 0,
    public z = 0,
  ) {}
  /** Returns a new vector with all components 0. */
  static zero(): Vec3 {
    return new Vec3();
  }
  /** Copies any `{ x, y, z }` value into a new vector. */
  static from(value: Vec3Like): Vec3 {
    return new Vec3(value.x, value.y, value.z);
  }
  /** Returns the component-wise sum. */
  add(value: Vec3Like): Vec3 {
    return new Vec3(this.x + value.x, this.y + value.y, this.z + value.z);
  }
  /** Returns the component-wise difference. */
  subtract(value: Vec3Like): Vec3 {
    return new Vec3(this.x - value.x, this.y - value.y, this.z - value.z);
  }
  /** Returns the vector multiplied by a scalar. */
  scale(factor: number): Vec3 {
    return new Vec3(this.x * factor, this.y * factor, this.z * factor);
  }
  /** Euclidean length of the vector. */
  get length(): number {
    return Math.sqrt(this.x * this.x + this.y * this.y + this.z * this.z);
  }
  /** Squared length; cheaper than `length` when only comparing distances. */
  get lengthSquared(): number {
    return this.x * this.x + this.y * this.y + this.z * this.z;
  }
  /** Returns a unit-length copy, or a zero vector when the length is 0. */
  normalized(): Vec3 {
    const length = this.length;
    return length === 0 ? Vec3.zero() : this.scale(1 / length);
  }
  /** Dot product with another vector. */
  dot(value: Vec3Like): number {
    return this.x * value.x + this.y * value.y + this.z * value.z;
  }
  /** Cross product with another vector. */
  cross(value: Vec3Like): Vec3 {
    return new Vec3(
      this.y * value.z - this.z * value.y,
      this.z * value.x - this.x * value.z,
      this.x * value.y - this.y * value.x,
    );
  }
  /** Distance to another point. */
  distanceTo(value: Vec3Like): number {
    return Math.sqrt((value.x - this.x) ** 2 + (value.y - this.y) ** 2 + (value.z - this.z) ** 2);
  }
  /**
   * Linearly interpolates toward `value`; `amount` 0 returns this vector and 1 returns `value`. The amount is not clamped.
   */
  lerp(value: Vec3Like, amount: number): Vec3 {
    return new Vec3(
      this.x + (value.x - this.x) * amount,
      this.y + (value.y - this.y) * amount,
      this.z + (value.z - this.z) * amount,
    );
  }
}

/** 4D vector with non-mutating math helpers. */
export class Vec4 implements Vec4Like {
  /** Creates a vector; components default to 0. */
  constructor(
    public x = 0,
    public y = 0,
    public z = 0,
    public w = 0,
  ) {}
  /** Returns a new vector with all components 0. */
  static zero(): Vec4 {
    return new Vec4();
  }
  /** Copies any `{ x, y, z, w }` value into a new vector. */
  static from(value: Vec4Like): Vec4 {
    return new Vec4(value.x, value.y, value.z, value.w);
  }
  /** Returns the component-wise sum. */
  add(value: Vec4Like): Vec4 {
    return new Vec4(this.x + value.x, this.y + value.y, this.z + value.z, this.w + value.w);
  }
  /** Returns the vector multiplied by a scalar. */
  scale(factor: number): Vec4 {
    return new Vec4(this.x * factor, this.y * factor, this.z * factor, this.w * factor);
  }
  /** Euclidean length of the vector. */
  get length(): number {
    return Math.sqrt(this.x * this.x + this.y * this.y + this.z * this.z + this.w * this.w);
  }
  /** Returns a unit-length copy, or a zero vector when the length is 0. */
  normalized(): Vec4 {
    const length = this.length;
    return length === 0 ? Vec4.zero() : this.scale(1 / length);
  }
}

/** Rotation quaternion. Defaults to the identity rotation. */
export class Quat implements QuatLike {
  /** Creates a quaternion; defaults to identity (0, 0, 0, 1). */
  constructor(
    public x = 0,
    public y = 0,
    public z = 0,
    public w = 1,
  ) {}
  /** Returns the identity rotation. */
  static identity(): Quat {
    return new Quat();
  }
  /** Builds a quaternion from pitch, yaw, and roll angles. */
  static fromEuler(pitch: number, yaw: number, roll: number): Quat {
    return Quat.from(nativeMath.quatFromEuler(pitch, yaw, roll));
  }
  /** Spherically interpolates between two rotations; `amount` 0 returns `a` and 1 returns `b`. */
  static slerp(a: QuatLike, b: QuatLike, amount: number): Quat {
    return Quat.from(nativeMath.quatSlerp(a, b, amount));
  }
  /** Copies any `{ x, y, z, w }` value into a new quaternion. */
  static from(value: QuatLike): Quat {
    return new Quat(value.x, value.y, value.z, value.w);
  }
  /** Returns a unit-length copy of the quaternion. */
  normalized(): Quat {
    return Quat.from(nativeMath.quatNormalize(this));
  }
  /** Returns the product of this rotation and `value`. */
  multiply(value: QuatLike): Quat {
    return Quat.from(nativeMath.quatMultiply(this, value));
  }
  /** Converts the rotation to a 4x4 matrix. */
  toMatrix(): Matrix4 {
    return new Matrix4(nativeMath.quatToMat4(this));
  }
}

/** 4x4 matrix with non-mutating operations. Operations return new matrices. */
export class Matrix4 {
  /** The 16 matrix elements. */
  readonly elements: Mat4;
  /**
   * Creates a matrix from 16 elements (copied), or an identity matrix when omitted or empty.
   * @throws Error if `elements` is non-empty and does not contain exactly 16 numbers.
   */
  constructor(elements?: Mat4) {
    if (!Array.isArray(elements) || elements.length === 0) {
      this.elements = nativeMath.mat4Identity();
    } else if (elements.length !== 16) {
      throw new Error('Matrix4 expects exactly 16 elements');
    } else {
      this.elements = elements.slice();
    }
  }
  /** Returns an identity matrix. */
  static identity(): Matrix4 {
    return new Matrix4();
  }
  /** Multiplies two matrices, given as `Matrix4` or raw 16-element arrays. */
  static multiplyMatrices(a: Matrix4 | Mat4, b: Matrix4 | Mat4): Matrix4 {
    return new Matrix4(nativeMath.mat4Multiply(unwrapMatrix(a), unwrapMatrix(b)));
  }
  /** Creates a perspective projection matrix from a vertical field of view, aspect ratio, and near and far planes. */
  static perspective(fovY: number, aspect: number, near: number, far: number): Matrix4 {
    return new Matrix4(nativeMath.mat4Perspective(fovY, aspect, near, far));
  }
  /** Creates an orthographic projection matrix from the clip volume bounds. */
  static orthographic(left: number, right: number, bottom: number, top: number, near: number, far: number): Matrix4 {
    return new Matrix4(nativeMath.mat4Ortho(left, right, bottom, top, near, far));
  }
  /** Creates a view matrix looking from `eye` toward `center` with the given `up` direction. */
  static lookAt(eye: Vec3Like, center: Vec3Like, up: Vec3Like): Matrix4 {
    return new Matrix4(nativeMath.mat4LookAt(eye, center, up));
  }
  /** Returns this matrix multiplied by `value`. */
  multiply(value: Matrix4 | Mat4): Matrix4 {
    return Matrix4.multiplyMatrices(this, value);
  }
  /** Returns a copy of this matrix translated by `offset`. */
  translated(offset: Vec3Like): Matrix4 {
    return new Matrix4(nativeMath.mat4Translate(this.elements, offset));
  }
  /** Returns a copy of this matrix scaled per axis by `factor`. */
  scaled(factor: Vec3Like): Matrix4 {
    return new Matrix4(nativeMath.mat4Scale(this.elements, factor));
  }
  /** Returns a copy of this matrix rotated around the X axis. */
  rotatedX(angle: number): Matrix4 {
    return new Matrix4(nativeMath.mat4RotateX(this.elements, angle));
  }
  /** Returns a copy of this matrix rotated around the Y axis. */
  rotatedY(angle: number): Matrix4 {
    return new Matrix4(nativeMath.mat4RotateY(this.elements, angle));
  }
  /** Returns a copy of this matrix rotated around the Z axis. */
  rotatedZ(angle: number): Matrix4 {
    return new Matrix4(nativeMath.mat4RotateZ(this.elements, angle));
  }
  /** Returns the inverse of this matrix. */
  inverted(): Matrix4 {
    return new Matrix4(nativeMath.mat4Invert(this.elements));
  }
  /** Returns a copy of the 16 elements. */
  toArray(): Mat4 {
    return this.elements.slice();
  }
}

function unwrapMatrix(value: Matrix4 | Mat4): Mat4 {
  return typeof value === 'object' && value !== null && value instanceof Matrix4 ? value.elements : value;
}

/** Static numeric helpers: interpolation, clamping, random numbers, and easing curves. */
export class Mathf {
  /** Linearly interpolates from `a` to `b` by `amount`. */
  static lerp(a: number, b: number, amount: number): number {
    return nativeMath.lerp(a, b, amount);
  }
  /** Limits `value` to the range `min` to `max`. */
  static clamp(value: number, min: number, max: number): number {
    return nativeMath.clamp(value, min, max);
  }
  /** Maps `value` from the range `inMin`..`inMax` to the range `outMin`..`outMax`. */
  static remap(value: number, inMin: number, inMax: number, outMin: number, outMax: number): number {
    return nativeMath.remap(value, inMin, inMax, outMin, outMax);
  }
  /** Returns a random number between `min` and `max`. */
  static randomFloat(min: number, max: number): number {
    return nativeMath.randomFloat(min, max);
  }
  /** Returns a random integer between `min` and `max`. */
  static randomInt(min: number, max: number): number {
    return nativeMath.randomInt(min, max);
  }
  /** Quadratic ease-in for progress `t` in 0..1. */
  static easeInQuad(t: number): number {
    return nativeMath.easeInQuad(t);
  }
  /** Quadratic ease-out for progress `t` in 0..1. */
  static easeOutQuad(t: number): number {
    return nativeMath.easeOutQuad(t);
  }
  /** Quadratic ease-in-out for progress `t` in 0..1. */
  static easeInOutQuad(t: number): number {
    return nativeMath.easeInOutQuad(t);
  }
  /** Cubic ease-in for progress `t` in 0..1. */
  static easeInCubic(t: number): number {
    return nativeMath.easeInCubic(t);
  }
  /** Cubic ease-out for progress `t` in 0..1. */
  static easeOutCubic(t: number): number {
    return nativeMath.easeOutCubic(t);
  }
  /** Cubic ease-in-out for progress `t` in 0..1. */
  static easeInOutCubic(t: number): number {
    return nativeMath.easeInOutCubic(t);
  }
  /** Elastic ease-in for progress `t` in 0..1. */
  static easeInElastic(t: number): number {
    return nativeMath.easeInElastic(t);
  }
  /** Elastic ease-out for progress `t` in 0..1. */
  static easeOutElastic(t: number): number {
    return nativeMath.easeOutElastic(t);
  }
  /** Bounce ease for progress `t` in 0..1. */
  static easeBounce(t: number): number {
    return nativeMath.easeBounce(t);
  }
}

/** Static collision tests for 3D rays, spheres, boxes, and frustums, and for 2D rectangles, circles, and points. */
export class Collision {
  /** True when the ray hits the bounding box. */
  static rayIntersectsBox(ray: Ray, box: BoundingBox): boolean {
    return nativeMath.rayIntersectsBox(ray, box);
  }
  /** True when the ray hits the sphere. */
  static rayIntersectsSphere(ray: Ray, center: Vec3Like, radius: number): boolean {
    return nativeMath.rayIntersectsSphere(ray, center, radius);
  }
  /** True when the two spheres overlap. */
  static checkSpheres(a: Vec3Like, radiusA: number, b: Vec3Like, radiusB: number): boolean {
    return nativeMath.checkCollisionSpheres(a, radiusA, b, radiusB);
  }
  /** True when the two bounding boxes overlap. */
  static checkBoxes(a: BoundingBox, b: BoundingBox): boolean {
    return nativeMath.checkCollisionBoxes(a, b);
  }
  /** Extracts the six frustum planes from a combined view-projection matrix. */
  static extractFrustumPlanes(matrix: Mat4): FrustumPlanes {
    return nativeMath.extractFrustumPlanes(matrix);
  }
  /** True when the bounding box is at least partly inside the frustum. */
  static isBoxInFrustum(box: BoundingBox, frustum: FrustumPlanes): boolean {
    return nativeMath.isBoxInFrustum(box, frustum);
  }
  /** Tests the ray against the triangle `a`, `b`, `c` and returns the hit details. */
  static rayIntersectsTriangle(ray: Ray, a: Vec3Like, b: Vec3Like, c: Vec3Like): RayHit {
    return nativeMath.rayIntersectsTriangle(ray, a, b, c);
  }
  /** Tests the ray against the bounding box and returns the hit details. */
  static getRayCollisionBox(ray: Ray, box: BoundingBox): RayHit {
    return nativeMath.getRayCollisionBox(ray, box);
  }
  /** True when the two 2D rectangles overlap. */
  static checkRectangles(
    a: { x: number; y: number; width: number; height: number },
    b: { x: number; y: number; width: number; height: number },
  ): boolean {
    return checkCollisionRecs(a, b);
  }
  /** True when the two 2D circles overlap. */
  static checkCircles(a: Vector2DLike, radiusA: number, b: Vector2DLike, radiusB: number): boolean {
    return checkCollisionCircles(a, radiusA, b, radiusB);
  }
  /** True when the 2D circle overlaps the rectangle. */
  static checkCircleRectangle(
    center: Vector2DLike,
    radius: number,
    rect: { x: number; y: number; width: number; height: number },
  ): boolean {
    return checkCollisionCircleRec(center, radius, rect);
  }
  /** True when the 2D point lies inside the rectangle. */
  static checkPointRectangle(
    point: Vector2DLike,
    rect: { x: number; y: number; width: number; height: number },
  ): boolean {
    return checkCollisionPointRec(point, rect);
  }
  /** True when the 2D point lies inside the circle. */
  static checkPointCircle(point: Vector2DLike, center: Vector2DLike, radius: number): boolean {
    return checkCollisionPointCircle(point, center, radius);
  }
  /** Returns the overlapping area of two rectangles as a rectangle. */
  static getRectangleIntersection(
    a: { x: number; y: number; width: number; height: number },
    b: { x: number; y: number; width: number; height: number },
  ): { x: number; y: number; width: number; height: number } {
    return getCollisionRec(a, b);
  }
}

export type { BoundingBox, FrustumPlanes, Ray, RayHit };
export type { Vector2DLike } from '../core/types';
/** Raw 16-element matrix array, as accepted and returned by `Matrix4`. */
export type Matrix4Array = Mat4;
