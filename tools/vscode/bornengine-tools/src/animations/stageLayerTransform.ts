import type { ResolvedSpriteAnimationTemplateTransform } from './spriteAnimationTemplateSchema';

export interface StageVector {
  readonly x: number;
  readonly y: number;
}

export interface StageCanvasSize {
  readonly width: number;
  readonly height: number;
}

export interface StageLayerSource {
  readonly width: number;
  readonly height: number;
}

export interface StageLayerInput {
  readonly visible: boolean;
  readonly source: StageLayerSource;
  readonly transform: ResolvedSpriteAnimationTemplateTransform;
}

export type StageHitKind = 'move' | 'rotate' | 'scale';
export type StageHandleAxis = -1 | 0 | 1;

export interface StageHit {
  readonly kind: StageHitKind;
  readonly layerIndex: number;
  readonly hx: StageHandleAxis;
  readonly hy: StageHandleAxis;
}

export const STAGE_SCALE_HANDLES: readonly (readonly [StageHandleAxis, StageHandleAxis])[] = [
  [-1, -1], [0, -1], [1, -1], [1, 0], [1, 1], [0, 1], [-1, 1], [-1, 0],
];
export const STAGE_ROTATE_HANDLE_DISTANCE = 26;
export const STAGE_HANDLE_HIT_RADIUS = 8;
const STAGE_MIN_STRETCH = 0.01;

function roundStage(value: number): number {
  return Math.round(value * 1000) / 1000;
}

function clampStretch(value: number): number {
  const magnitude = Math.max(STAGE_MIN_STRETCH, Math.abs(value));
  return roundStage(value < 0 ? -magnitude : magnitude);
}

function radians(degrees: number): number {
  return degrees * Math.PI / 180;
}

function distance(a: StageVector, b: StageVector): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function layerCenter(canvas: StageCanvasSize, transform: ResolvedSpriteAnimationTemplateTransform): StageVector {
  return { x: canvas.width / 2 + transform.offset.x, y: canvas.height / 2 + transform.offset.y };
}

/** Maps a point in layer crop pixels (origin at the crop's top-left) to canvas pixels. */
export function layerPoint(
  canvas: StageCanvasSize,
  source: StageLayerSource,
  transform: ResolvedSpriteAnimationTemplateTransform,
  local: StageVector,
): StageVector {
  const center = layerCenter(canvas, transform);
  const scaleX = transform.stretch.x * transform.zoom;
  const scaleY = transform.stretch.y * transform.zoom;
  const x = (local.x - source.width * transform.pivot.x) * scaleX;
  const y = (local.y - source.height * transform.pivot.y) * scaleY;
  const angle = radians(transform.rotation);
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  return { x: center.x + x * cos - y * sin, y: center.y + x * sin + y * cos };
}

/** Inverse of layerPoint. Returns non-finite values when the layer has zero scale. */
export function layerLocalPoint(
  canvas: StageCanvasSize,
  source: StageLayerSource,
  transform: ResolvedSpriteAnimationTemplateTransform,
  point: StageVector,
): StageVector {
  const center = layerCenter(canvas, transform);
  const dx = point.x - center.x;
  const dy = point.y - center.y;
  const angle = radians(transform.rotation);
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  const x = dx * cos + dy * sin;
  const y = -dx * sin + dy * cos;
  return {
    x: x / (transform.stretch.x * transform.zoom) + source.width * transform.pivot.x,
    y: y / (transform.stretch.y * transform.zoom) + source.height * transform.pivot.y,
  };
}

function handleLocal(source: StageLayerSource, hx: StageHandleAxis, hy: StageHandleAxis): StageVector {
  return {
    x: hx < 0 ? 0 : hx > 0 ? source.width : source.width / 2,
    y: hy < 0 ? 0 : hy > 0 ? source.height : source.height / 2,
  };
}

export function layerHandlePoint(
  canvas: StageCanvasSize,
  source: StageLayerSource,
  transform: ResolvedSpriteAnimationTemplateTransform,
  hx: StageHandleAxis,
  hy: StageHandleAxis,
): StageVector {
  return layerPoint(canvas, source, transform, handleLocal(source, hx, hy));
}

/** Rotation handle sits outside the top edge, along the layer's rotated up direction. */
export function layerRotateHandlePoint(
  canvas: StageCanvasSize,
  source: StageLayerSource,
  transform: ResolvedSpriteAnimationTemplateTransform,
  distanceFromEdge: number,
): StageVector {
  const top = layerHandlePoint(canvas, source, transform, 0, -1);
  const angle = radians(transform.rotation);
  return { x: top.x + Math.sin(angle) * distanceFromEdge, y: top.y - Math.cos(angle) * distanceFromEdge };
}

function isInsideSource(local: StageVector, source: StageLayerSource): boolean {
  return local.x >= 0 && local.x <= source.width && local.y >= 0 && local.y <= source.height;
}

/** Hit-tests the selected layer's handles first, then layer bodies from top to bottom. `scale` converts CSS pixels to canvas pixels. */
export function hitTestStage(
  canvas: StageCanvasSize,
  layers: readonly StageLayerInput[],
  selectedLayerIndex: number,
  point: StageVector,
  scale: number,
): StageHit | null {
  const radius = STAGE_HANDLE_HIT_RADIUS / scale;
  const selected = layers[selectedLayerIndex];
  if (selected?.visible) {
    const rotate = layerRotateHandlePoint(canvas, selected.source, selected.transform, STAGE_ROTATE_HANDLE_DISTANCE / scale);
    if (distance(point, rotate) <= radius) return { kind: 'rotate', layerIndex: selectedLayerIndex, hx: 0, hy: 0 };
    for (const [hx, hy] of STAGE_SCALE_HANDLES) {
      const handle = layerHandlePoint(canvas, selected.source, selected.transform, hx, hy);
      if (distance(point, handle) <= radius) return { kind: 'scale', layerIndex: selectedLayerIndex, hx, hy };
    }
  }
  for (let index = layers.length - 1; index >= 0; index--) {
    const layer = layers[index]!;
    if (!layer.visible) continue;
    const local = layerLocalPoint(canvas, layer.source, layer.transform, point);
    if (isInsideSource(local, layer.source)) return { kind: 'move', layerIndex: index, hx: 0, hy: 0 };
  }
  return null;
}

export function moveTransform(
  base: ResolvedSpriteAnimationTemplateTransform,
  start: StageVector,
  point: StageVector,
): ResolvedSpriteAnimationTemplateTransform {
  return {
    ...base,
    offset: { x: roundStage(base.offset.x + point.x - start.x), y: roundStage(base.offset.y + point.y - start.y) },
  };
}

export function rotateTransform(
  canvas: StageCanvasSize,
  base: ResolvedSpriteAnimationTemplateTransform,
  start: StageVector,
  point: StageVector,
): ResolvedSpriteAnimationTemplateTransform {
  const center = layerCenter(canvas, base);
  const startAngle = Math.atan2(start.y - center.y, start.x - center.x);
  const pointAngle = Math.atan2(point.y - center.y, point.x - center.x);
  return { ...base, rotation: roundStage(base.rotation + (pointAngle - startAngle) * 180 / Math.PI) };
}

/** Resizes from the handle while the opposite anchor point stays fixed in canvas space. Edge handles change one axis only. */
export function scaleTransform(
  canvas: StageCanvasSize,
  source: StageLayerSource,
  base: ResolvedSpriteAnimationTemplateTransform,
  hx: StageHandleAxis,
  hy: StageHandleAxis,
  point: StageVector,
): ResolvedSpriteAnimationTemplateTransform {
  const anchorLocal: StageVector = { x: hx > 0 ? 0 : hx < 0 ? source.width : source.width / 2, y: hy > 0 ? 0 : hy < 0 ? source.height : source.height / 2 };
  const handleAtLocal = handleLocal(source, hx, hy);
  const anchor = layerPoint(canvas, source, base, anchorLocal);
  const angle = radians(base.rotation);
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  const dx = point.x - anchor.x;
  const dy = point.y - anchor.y;
  const localX = dx * cos + dy * sin;
  const localY = -dx * sin + dy * cos;
  const edgeX = handleAtLocal.x - anchorLocal.x;
  const edgeY = handleAtLocal.y - anchorLocal.y;
  const stretch = {
    x: edgeX === 0 ? base.stretch.x : clampStretch(localX / edgeX / base.zoom),
    y: edgeY === 0 ? base.stretch.y : clampStretch(localY / edgeY / base.zoom),
  };
  const scaled = { ...base, stretch };
  const anchorOffset = {
    x: (anchorLocal.x - source.width * base.pivot.x) * stretch.x * base.zoom,
    y: (anchorLocal.y - source.height * base.pivot.y) * stretch.y * base.zoom,
  };
  const anchorWorld = { x: cos * anchorOffset.x - sin * anchorOffset.y, y: sin * anchorOffset.x + cos * anchorOffset.y };
  const center = { x: anchor.x - anchorWorld.x, y: anchor.y - anchorWorld.y };
  return {
    ...scaled,
    offset: { x: roundStage(center.x - canvas.width / 2), y: roundStage(center.y - canvas.height / 2) },
  };
}

export function stageCursorFor(hit: StageHit | null): string {
  if (hit === null) return 'default';
  if (hit.kind === 'move') return 'move';
  if (hit.kind === 'rotate') return 'crosshair';
  if (hit.hx === 0) return 'ns-resize';
  if (hit.hy === 0) return 'ew-resize';
  return hit.hx === hit.hy ? 'nwse-resize' : 'nesw-resize';
}
