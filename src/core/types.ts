/** Structural x/y value accepted by 2D APIs. Use Vector2D for vector math. */
export interface Vector2DLike {
  x: number;
  y: number;
}

/** Three-component vector. */
export interface Vec3 {
  x: number;
  y: number;
  z: number;
}

/** Four-component vector. */
export interface Vec4 {
  x: number;
  y: number;
  z: number;
  w: number;
}

/** RGBA color with channels in the 0-255 range. */
export interface Color {
  r: number;
  g: number;
  b: number;
  a: number;
}

/** Axis-aligned rectangle defined by its origin and size. */
export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** Describes a 2D camera: `target` is the world point shown at the screen position `offset`, `rotation` is in degrees, and `zoom` must be greater than zero. */
export interface Camera2D {
  offset: Vector2DLike;
  target: Vector2DLike;
  rotation: number;
  zoom: number;
}

/** Describes a 3D camera looking from `position` at `target`, with `up` as its up direction and `fovy` as its vertical field of view. */
export interface Camera3D {
  position: Vec3;
  target: Vec3;
  up: Vec3;
  fovy: number;
  projection: 'perspective' | 'orthographic';
}

/** Handle and pixel size of a texture. */
export interface Texture {
  /** Engine handle — same field name as Sound/Music/Font/Model. (Was
   *  `id` before v0.5, the lone outlier among resource types.) */
  handle: number;
  width: number;
  height: number;
}

/** Handle and size of a font. */
export interface Font {
  handle: number;
  size: number;
}

/** Handle of a sound effect. */
export interface Sound {
  handle: number;
}

/** Handle of a music stream. */
export interface Music {
  handle: number;
}

/** Rotation quaternion. */
export interface Quat {
  x: number;
  y: number;
  z: number;
  w: number;
}

/** Ray defined by a start position and a direction. */
export interface Ray {
  position: Vec3;
  direction: Vec3;
}

/** Axis-aligned box defined by its minimum and maximum corners. */
export interface BoundingBox {
  min: Vec3;
  max: Vec3;
}

/** Handle, mesh and material counts, and transform of a model. */
export interface Model {
  handle: number;
  meshCount: number;
  materialCount: number;
  transform: Mat4;
}

/** Result of a ray test: `hit` tells whether anything was struck, with the distance, point, and surface normal of the hit. */
export interface RayHit {
  hit: boolean;
  distance: number;
  point: Vec3;
  normal: Vec3;
}

/** Set of planes that bound a camera view frustum. */
export interface FrustumPlanes {
  planes: Vec4[];
}

/** 4x4 matrix stored as a flat array of 16 numbers. */
export type Mat4 = number[];
