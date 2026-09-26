import * as nativeMath from './internal';
import type { BoundingBox, FrustumPlanes, Mat4, Quat as QuatLike, Ray, RayHit, Vec2 as Vec2Like, Vec3 as Vec3Like, Vec4 as Vec4Like } from '../core/types';
import { checkCollisionCircleRec, checkCollisionCircles, checkCollisionPointCircle, checkCollisionPointRec, checkCollisionRecs, getCollisionRec } from '../shapes/internal';

export class Vec2 implements Vec2Like {
  constructor(public x = 0, public y = 0) {}
  static zero(): Vec2 { return new Vec2(); }
  static from(value: Vec2Like): Vec2 { return new Vec2(value.x, value.y); }
  add(value: Vec2Like): Vec2 { return new Vec2(this.x + value.x, this.y + value.y); }
  subtract(value: Vec2Like): Vec2 { return new Vec2(this.x - value.x, this.y - value.y); }
  scale(factor: number): Vec2 { return new Vec2(this.x * factor, this.y * factor); }
  get length(): number { return Math.sqrt(this.x * this.x + this.y * this.y); }
  get lengthSquared(): number { return this.x * this.x + this.y * this.y; }
  normalized(): Vec2 { const length = this.length; return length === 0 ? Vec2.zero() : this.scale(1 / length); }
  dot(value: Vec2Like): number { return this.x * value.x + this.y * value.y; }
  distanceTo(value: Vec2Like): number { return Math.sqrt((value.x - this.x) ** 2 + (value.y - this.y) ** 2); }
  lerp(value: Vec2Like, amount: number): Vec2 { return new Vec2(this.x + (value.x - this.x) * amount, this.y + (value.y - this.y) * amount); }
}

export class Vec3 implements Vec3Like {
  constructor(public x = 0, public y = 0, public z = 0) {}
  static zero(): Vec3 { return new Vec3(); }
  static from(value: Vec3Like): Vec3 { return new Vec3(value.x, value.y, value.z); }
  add(value: Vec3Like): Vec3 { return new Vec3(this.x + value.x, this.y + value.y, this.z + value.z); }
  subtract(value: Vec3Like): Vec3 { return new Vec3(this.x - value.x, this.y - value.y, this.z - value.z); }
  scale(factor: number): Vec3 { return new Vec3(this.x * factor, this.y * factor, this.z * factor); }
  get length(): number { return Math.sqrt(this.x * this.x + this.y * this.y + this.z * this.z); }
  get lengthSquared(): number { return this.x * this.x + this.y * this.y + this.z * this.z; }
  normalized(): Vec3 { const length = this.length; return length === 0 ? Vec3.zero() : this.scale(1 / length); }
  dot(value: Vec3Like): number { return this.x * value.x + this.y * value.y + this.z * value.z; }
  cross(value: Vec3Like): Vec3 { return new Vec3(this.y * value.z - this.z * value.y, this.z * value.x - this.x * value.z, this.x * value.y - this.y * value.x); }
  distanceTo(value: Vec3Like): number { return Math.sqrt((value.x - this.x) ** 2 + (value.y - this.y) ** 2 + (value.z - this.z) ** 2); }
  lerp(value: Vec3Like, amount: number): Vec3 { return new Vec3(this.x + (value.x - this.x) * amount, this.y + (value.y - this.y) * amount, this.z + (value.z - this.z) * amount); }
}

export class Vec4 implements Vec4Like {
  constructor(public x = 0, public y = 0, public z = 0, public w = 0) {}
  static zero(): Vec4 { return new Vec4(); }
  static from(value: Vec4Like): Vec4 { return new Vec4(value.x, value.y, value.z, value.w); }
  add(value: Vec4Like): Vec4 { return new Vec4(this.x + value.x, this.y + value.y, this.z + value.z, this.w + value.w); }
  scale(factor: number): Vec4 { return new Vec4(this.x * factor, this.y * factor, this.z * factor, this.w * factor); }
  get length(): number { return Math.sqrt(this.x * this.x + this.y * this.y + this.z * this.z + this.w * this.w); }
  normalized(): Vec4 { const length = this.length; return length === 0 ? Vec4.zero() : this.scale(1 / length); }
}

export class Quat implements QuatLike {
  constructor(public x = 0, public y = 0, public z = 0, public w = 1) {}
  static identity(): Quat { return new Quat(); }
  static fromEuler(pitch: number, yaw: number, roll: number): Quat { return Quat.from(nativeMath.quatFromEuler(pitch, yaw, roll)); }
  static slerp(a: QuatLike, b: QuatLike, amount: number): Quat { return Quat.from(nativeMath.quatSlerp(a, b, amount)); }
  static from(value: QuatLike): Quat { return new Quat(value.x, value.y, value.z, value.w); }
  normalized(): Quat { return Quat.from(nativeMath.quatNormalize(this)); }
  multiply(value: QuatLike): Quat { return Quat.from(nativeMath.quatMultiply(this, value)); }
  toMatrix(): Matrix4 { return new Matrix4(nativeMath.quatToMat4(this)); }
}

export class Matrix4 {
  readonly elements: Mat4;
  constructor(elements?: Mat4) { this.elements = elements === undefined ? nativeMath.mat4Identity() : elements.slice(); }
  static identity(): Matrix4 { return new Matrix4(); }
  static multiply(a: Matrix4 | Mat4, b: Matrix4 | Mat4): Matrix4 { return new Matrix4(nativeMath.mat4Multiply(unwrapMatrix(a), unwrapMatrix(b))); }
  static perspective(fovY: number, aspect: number, near: number, far: number): Matrix4 { return new Matrix4(nativeMath.mat4Perspective(fovY, aspect, near, far)); }
  static orthographic(left: number, right: number, bottom: number, top: number, near: number, far: number): Matrix4 { return new Matrix4(nativeMath.mat4Ortho(left, right, bottom, top, near, far)); }
  static lookAt(eye: Vec3Like, center: Vec3Like, up: Vec3Like): Matrix4 { return new Matrix4(nativeMath.mat4LookAt(eye, center, up)); }
  multiply(value: Matrix4 | Mat4): Matrix4 { return Matrix4.multiply(this, value); }
  translated(offset: Vec3Like): Matrix4 { return new Matrix4(nativeMath.mat4Translate(this.elements, offset)); }
  scaled(factor: Vec3Like): Matrix4 { return new Matrix4(nativeMath.mat4Scale(this.elements, factor)); }
  rotatedX(angle: number): Matrix4 { return new Matrix4(nativeMath.mat4RotateX(this.elements, angle)); }
  rotatedY(angle: number): Matrix4 { return new Matrix4(nativeMath.mat4RotateY(this.elements, angle)); }
  rotatedZ(angle: number): Matrix4 { return new Matrix4(nativeMath.mat4RotateZ(this.elements, angle)); }
  inverted(): Matrix4 { return new Matrix4(nativeMath.mat4Invert(this.elements)); }
  toArray(): Mat4 { return this.elements.slice(); }
}

function unwrapMatrix(value: Matrix4 | Mat4): Mat4 { return value instanceof Matrix4 ? value.elements : value; }

export class Mathf {
  static lerp(a: number, b: number, amount: number): number { return nativeMath.lerp(a, b, amount); }
  static clamp(value: number, min: number, max: number): number { return nativeMath.clamp(value, min, max); }
  static remap(value: number, inMin: number, inMax: number, outMin: number, outMax: number): number { return nativeMath.remap(value, inMin, inMax, outMin, outMax); }
  static randomFloat(min: number, max: number): number { return nativeMath.randomFloat(min, max); }
  static randomInt(min: number, max: number): number { return nativeMath.randomInt(min, max); }
  static easeInQuad(t: number): number { return nativeMath.easeInQuad(t); }
  static easeOutQuad(t: number): number { return nativeMath.easeOutQuad(t); }
  static easeInOutQuad(t: number): number { return nativeMath.easeInOutQuad(t); }
  static easeInCubic(t: number): number { return nativeMath.easeInCubic(t); }
  static easeOutCubic(t: number): number { return nativeMath.easeOutCubic(t); }
  static easeInOutCubic(t: number): number { return nativeMath.easeInOutCubic(t); }
  static easeInElastic(t: number): number { return nativeMath.easeInElastic(t); }
  static easeOutElastic(t: number): number { return nativeMath.easeOutElastic(t); }
  static easeBounce(t: number): number { return nativeMath.easeBounce(t); }
}

export class Collision {
  static rayIntersectsBox(ray: Ray, box: BoundingBox): boolean { return nativeMath.rayIntersectsBox(ray, box); }
  static rayIntersectsSphere(ray: Ray, center: Vec3Like, radius: number): boolean { return nativeMath.rayIntersectsSphere(ray, center, radius); }
  static checkSpheres(a: Vec3Like, radiusA: number, b: Vec3Like, radiusB: number): boolean { return nativeMath.checkCollisionSpheres(a, radiusA, b, radiusB); }
  static checkBoxes(a: BoundingBox, b: BoundingBox): boolean { return nativeMath.checkCollisionBoxes(a, b); }
  static extractFrustumPlanes(matrix: Mat4): FrustumPlanes { return nativeMath.extractFrustumPlanes(matrix); }
  static isBoxInFrustum(box: BoundingBox, frustum: FrustumPlanes): boolean { return nativeMath.isBoxInFrustum(box, frustum); }
  static rayIntersectsTriangle(ray: Ray, a: Vec3Like, b: Vec3Like, c: Vec3Like): RayHit { return nativeMath.rayIntersectsTriangle(ray, a, b, c); }
  static getRayCollisionBox(ray: Ray, box: BoundingBox): RayHit { return nativeMath.getRayCollisionBox(ray, box); }
  static checkRectangles(a: { x: number; y: number; width: number; height: number }, b: { x: number; y: number; width: number; height: number }): boolean { return checkCollisionRecs(a, b); }
  static checkCircles(a: Vec2Like, radiusA: number, b: Vec2Like, radiusB: number): boolean { return checkCollisionCircles(a, radiusA, b, radiusB); }
  static checkCircleRectangle(center: Vec2Like, radius: number, rect: { x: number; y: number; width: number; height: number }): boolean { return checkCollisionCircleRec(center, radius, rect); }
  static checkPointRectangle(point: Vec2Like, rect: { x: number; y: number; width: number; height: number }): boolean { return checkCollisionPointRec(point, rect); }
  static checkPointCircle(point: Vec2Like, center: Vec2Like, radius: number): boolean { return checkCollisionPointCircle(point, center, radius); }
  static getRectangleIntersection(a: { x: number; y: number; width: number; height: number }, b: { x: number; y: number; width: number; height: number }): { x: number; y: number; width: number; height: number } { return getCollisionRec(a, b); }
}

export type { BoundingBox, FrustumPlanes, Ray, RayHit };
export type Matrix4Array = Mat4;
