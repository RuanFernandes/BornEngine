import type { Rect } from '../core/types';

/** Checks the full source rectangle, including negative-size flip rectangles, against a texture. */
export function isTextureSourceRegionInBounds(source: Rect, width: number, height: number): boolean {
  if (
    source === null ||
    source === undefined ||
    !Number.isFinite(source.x) ||
    !Number.isFinite(source.y) ||
    !Number.isFinite(source.width) ||
    !Number.isFinite(source.height) ||
    !Number.isFinite(width) ||
    !Number.isFinite(height) ||
    source.width === 0 ||
    source.height === 0 ||
    width <= 0 ||
    height <= 0
  )
    return false;
  const left = Math.min(source.x, source.x + source.width);
  const top = Math.min(source.y, source.y + source.height);
  const right = Math.max(source.x, source.x + source.width);
  const bottom = Math.max(source.y, source.y + source.height);
  return left >= 0 && top >= 0 && right <= width && bottom <= height;
}
