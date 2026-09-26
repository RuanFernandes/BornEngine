import { Mat4, Quat, Vec3 } from '../core/types';
import {
  mat4Multiply,
  quatMultiply,
  quatNormalize,
  quatToMat4,
} from '../math/internal';

export interface TransformOptions {
  position?: Vec3;
  rotation?: Quat;
  scale?: Vec3;
}

/** @internal Used by GameObject when preserving world transforms. */
export interface TransformTRS {
  position: Vec3;
  rotation: Quat;
  scale: Vec3;
}

function copyVec3(value: Vec3): Vec3 {
  return { x: value.x, y: value.y, z: value.z };
}

function copyQuat(value: Quat): Quat {
  return { x: value.x, y: value.y, z: value.z, w: value.w };
}

function dot(a: Vec3, b: Vec3): number {
  return a.x * b.x + a.y * b.y + a.z * b.z;
}

function cross(a: Vec3, b: Vec3): Vec3 {
  return {
    x: a.y * b.z - a.z * b.y,
    y: a.z * b.x - a.x * b.z,
    z: a.x * b.y - a.y * b.x,
  };
}

function normalizeVector(value: Vec3): Vec3 {
  const length = Math.sqrt(dot(value, value));
  if (length === 0) return { x: 0, y: 0, z: 0 };
  return { x: value.x / length, y: value.y / length, z: value.z / length };
}

function perpendicularTo(value: Vec3): Vec3 {
  const basis = Math.abs(value.x) < 0.8
    ? { x: 1, y: 0, z: 0 }
    : { x: 0, y: 1, z: 0 };
  const projection = dot(value, basis);
  return normalizeVector({
    x: basis.x - value.x * projection,
    y: basis.y - value.y * projection,
    z: basis.z - value.z * projection,
  });
}

function rotationFromAxes(xAxis: Vec3, yAxis: Vec3, zAxis: Vec3): Quat {
  const m00 = xAxis.x;
  const m01 = yAxis.x;
  const m02 = zAxis.x;
  const m10 = xAxis.y;
  const m11 = yAxis.y;
  const m12 = zAxis.y;
  const m20 = xAxis.z;
  const m21 = yAxis.z;
  const m22 = zAxis.z;
  const trace = m00 + m11 + m22;

  if (trace > 0) {
    const s = Math.sqrt(trace + 1) * 2;
    return quatNormalize({
      x: (m21 - m12) / s,
      y: (m02 - m20) / s,
      z: (m10 - m01) / s,
      w: 0.25 * s,
    });
  }

  if (m00 > m11 && m00 > m22) {
    const s = Math.sqrt(1 + m00 - m11 - m22) * 2;
    return quatNormalize({
      x: 0.25 * s,
      y: (m01 + m10) / s,
      z: (m02 + m20) / s,
      w: (m21 - m12) / s,
    });
  }

  if (m11 > m22) {
    const s = Math.sqrt(1 + m11 - m00 - m22) * 2;
    return quatNormalize({
      x: (m01 + m10) / s,
      y: 0.25 * s,
      z: (m12 + m21) / s,
      w: (m02 - m20) / s,
    });
  }

  const s = Math.sqrt(1 + m22 - m00 - m11) * 2;
  return quatNormalize({
    x: (m02 + m20) / s,
    y: (m12 + m21) / s,
    z: 0.25 * s,
    w: (m10 - m01) / s,
  });
}

/** @internal Inverts an affine transform, returning null for singular input. */
export function invertTransformMatrix(matrix: Mat4): Mat4 | null {
  if (Math.abs(matrix[3]) > 0.00001 || Math.abs(matrix[7]) > 0.00001 ||
      Math.abs(matrix[11]) > 0.00001 || Math.abs(matrix[15] - 1) > 0.00001) {
    return null;
  }

  const a = matrix[0], b = matrix[4], c = matrix[8];
  const d = matrix[1], e = matrix[5], f = matrix[9];
  const g = matrix[2], h = matrix[6], i = matrix[10];
  const determinant = a * (e * i - f * h) - b * (d * i - f * g) +
    c * (d * h - e * g);
  if (Math.abs(determinant) < 0.0000000001) return null;

  const inverseDeterminant = 1 / determinant;
  const i00 = (e * i - f * h) * inverseDeterminant;
  const i01 = (c * h - b * i) * inverseDeterminant;
  const i02 = (b * f - c * e) * inverseDeterminant;
  const i10 = (f * g - d * i) * inverseDeterminant;
  const i11 = (a * i - c * g) * inverseDeterminant;
  const i12 = (c * d - a * f) * inverseDeterminant;
  const i20 = (d * h - e * g) * inverseDeterminant;
  const i21 = (b * g - a * h) * inverseDeterminant;
  const i22 = (a * e - b * d) * inverseDeterminant;
  const tx = matrix[12], ty = matrix[13], tz = matrix[14];

  return [
    i00, i10, i20, 0,
    i01, i11, i21, 0,
    i02, i12, i22, 0,
    -(i00 * tx + i01 * ty + i02 * tz),
    -(i10 * tx + i11 * ty + i12 * tz),
    -(i20 * tx + i21 * ty + i22 * tz),
    1,
  ];
}

/** @internal Decomposes an affine matrix when it can be represented as TRS. */
export function decomposeTransformMatrix(matrix: Mat4): TransformTRS | null {
  const epsilon = 0.00001;
  if (Math.abs(matrix[3]) > epsilon || Math.abs(matrix[7]) > epsilon ||
      Math.abs(matrix[11]) > epsilon || Math.abs(matrix[15] - 1) > epsilon) {
    return null;
  }

  let scaleX = Math.sqrt(matrix[0] * matrix[0] + matrix[1] * matrix[1] + matrix[2] * matrix[2]);
  const scaleY = Math.sqrt(matrix[4] * matrix[4] + matrix[5] * matrix[5] + matrix[6] * matrix[6]);
  const scaleZ = Math.sqrt(matrix[8] * matrix[8] + matrix[9] * matrix[9] + matrix[10] * matrix[10]);
  let xAxis: Vec3 | null = scaleX > epsilon
    ? { x: matrix[0] / scaleX, y: matrix[1] / scaleX, z: matrix[2] / scaleX }
    : null;
  let yAxis: Vec3 | null = scaleY > epsilon
    ? { x: matrix[4] / scaleY, y: matrix[5] / scaleY, z: matrix[6] / scaleY }
    : null;
  let zAxis: Vec3 | null = scaleZ > epsilon
    ? { x: matrix[8] / scaleZ, y: matrix[9] / scaleZ, z: matrix[10] / scaleZ }
    : null;

  if (xAxis !== null && yAxis !== null && Math.abs(dot(xAxis, yAxis)) > epsilon) return null;
  if (xAxis !== null && zAxis !== null && Math.abs(dot(xAxis, zAxis)) > epsilon) return null;
  if (yAxis !== null && zAxis !== null && Math.abs(dot(yAxis, zAxis)) > epsilon) return null;

  if (xAxis !== null && yAxis !== null && zAxis !== null) {
    const orientation = dot(cross(xAxis, yAxis), zAxis);
    if (Math.abs(Math.abs(orientation) - 1) > epsilon) return null;
    if (orientation < 0) {
      scaleX = -scaleX;
      xAxis = { x: -xAxis.x, y: -xAxis.y, z: -xAxis.z };
    }
  } else if (xAxis !== null && yAxis !== null) {
    zAxis = normalizeVector(cross(xAxis, yAxis));
  } else if (xAxis !== null && zAxis !== null) {
    yAxis = normalizeVector(cross(zAxis, xAxis));
  } else if (yAxis !== null && zAxis !== null) {
    xAxis = normalizeVector(cross(yAxis, zAxis));
  } else if (xAxis !== null) {
    yAxis = perpendicularTo(xAxis);
    zAxis = normalizeVector(cross(xAxis, yAxis));
  } else if (yAxis !== null) {
    xAxis = perpendicularTo(yAxis);
    zAxis = normalizeVector(cross(xAxis, yAxis));
  } else if (zAxis !== null) {
    xAxis = perpendicularTo(zAxis);
    yAxis = normalizeVector(cross(zAxis, xAxis));
  } else {
    xAxis = { x: 1, y: 0, z: 0 };
    yAxis = { x: 0, y: 1, z: 0 };
    zAxis = { x: 0, y: 0, z: 1 };
  }

  return {
    position: { x: matrix[12], y: matrix[13], z: matrix[14] },
    rotation: rotationFromAxes(xAxis, yAxis, zAxis),
    scale: { x: scaleX, y: scaleY, z: scaleZ },
  };
}

export class Transform {
  position: Vec3;
  rotation: Quat;
  scale: Vec3;
  private parentTransform: Transform | null = null;

  constructor(options: TransformOptions = {}) {
    this.position = copyVec3(options.position || { x: 0, y: 0, z: 0 });
    this.rotation = copyQuat(options.rotation || { x: 0, y: 0, z: 0, w: 1 });
    this.scale = copyVec3(options.scale || { x: 1, y: 1, z: 1 });
  }

  get localMatrix(): Mat4 {
    const matrix = quatToMat4(quatNormalize(this.rotation));
    matrix[0] *= this.scale.x;
    matrix[1] *= this.scale.x;
    matrix[2] *= this.scale.x;
    matrix[4] *= this.scale.y;
    matrix[5] *= this.scale.y;
    matrix[6] *= this.scale.y;
    matrix[8] *= this.scale.z;
    matrix[9] *= this.scale.z;
    matrix[10] *= this.scale.z;
    matrix[12] = this.position.x;
    matrix[13] = this.position.y;
    matrix[14] = this.position.z;
    return matrix;
  }

  get worldMatrix(): Mat4 {
    const local = this.localMatrix;
    if (this.parentTransform === null) return local;
    return mat4Multiply(this.parentTransform.worldMatrix, local);
  }

  get worldPosition(): Vec3 {
    const matrix = this.worldMatrix;
    return { x: matrix[12], y: matrix[13], z: matrix[14] };
  }

  get worldRotation(): Quat {
    const local = quatNormalize(this.rotation);
    if (this.parentTransform === null) return copyQuat(local);
    return quatNormalize(quatMultiply(this.parentTransform.worldRotation, local));
  }

  get worldScale(): Vec3 {
    if (this.parentTransform === null) return copyVec3(this.scale);
    const parentScale = this.parentTransform.worldScale;
    return {
      x: parentScale.x * this.scale.x,
      y: parentScale.y * this.scale.y,
      z: parentScale.z * this.scale.z,
    };
  }

  setWorldPosition(position: Vec3): boolean {
    if (this.parentTransform === null) {
      this.position = copyVec3(position);
      return true;
    }

    const inverse = invertTransformMatrix(this.parentTransform.worldMatrix);
    if (inverse === null) return false;
    this.position = {
      x: inverse[0] * position.x + inverse[4] * position.y + inverse[8] * position.z + inverse[12],
      y: inverse[1] * position.x + inverse[5] * position.y + inverse[9] * position.z + inverse[13],
      z: inverse[2] * position.x + inverse[6] * position.y + inverse[10] * position.z + inverse[14],
    };
    return true;
  }

  setWorldRotation(rotation: Quat): boolean {
    const desired = quatNormalize(rotation);
    if (this.parentTransform === null) {
      this.rotation = copyQuat(desired);
      return true;
    }

    const parentRotation = this.parentTransform.worldRotation;
    const inverseParent: Quat = {
      x: -parentRotation.x,
      y: -parentRotation.y,
      z: -parentRotation.z,
      w: parentRotation.w,
    };
    this.rotation = quatNormalize(quatMultiply(inverseParent, desired));
    return true;
  }

  /** @internal GameObject is the sole hierarchy owner of this Transform. */
  _setParent(parent: Transform | null): boolean {
    let current = parent;
    while (current !== null) {
      if (current === this) return false;
      current = current.parentTransform;
    }
    this.parentTransform = parent;
    return true;
  }

  /** @internal Applies a prevalidated TRS conversion atomically. */
  _setLocalTRS(position: Vec3, rotation: Quat, scale: Vec3): void {
    this.position = copyVec3(position);
    this.rotation = copyQuat(rotation);
    this.scale = copyVec3(scale);
  }
}
