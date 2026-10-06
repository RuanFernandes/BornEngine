export interface SpriteFrameRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export function cropSpriteFrameFromDrag(
  start: { x: number; y: number },
  end: { x: number; y: number },
  imageWidth: number,
  imageHeight: number,
  gridSize: number,
  snapToGrid: boolean,
): SpriteFrameRect | null {
  if (!Number.isInteger(imageWidth) || imageWidth <= 0 || !Number.isInteger(imageHeight) || imageHeight <= 0 ||
      !Number.isFinite(start.x) || !Number.isFinite(start.y) || !Number.isFinite(end.x) || !Number.isFinite(end.y) ||
      !Number.isInteger(gridSize) || gridSize <= 0) return null;

  const startX = Math.max(0, Math.min(imageWidth - 1, Math.floor(start.x)));
  const startY = Math.max(0, Math.min(imageHeight - 1, Math.floor(start.y)));
  const endX = Math.max(0, Math.min(imageWidth - 1, Math.floor(end.x)));
  const endY = Math.max(0, Math.min(imageHeight - 1, Math.floor(end.y)));
  let left = Math.min(startX, endX);
  let top = Math.min(startY, endY);
  let right = Math.max(startX, endX) + 1;
  let bottom = Math.max(startY, endY) + 1;

  if (snapToGrid) {
    left = Math.floor(left / gridSize) * gridSize;
    top = Math.floor(top / gridSize) * gridSize;
    right = Math.min(imageWidth, Math.ceil(right / gridSize) * gridSize);
    bottom = Math.min(imageHeight, Math.ceil(bottom / gridSize) * gridSize);
  }

  if (right <= left || bottom <= top) return null;
  return { x: left, y: top, width: right - left, height: bottom - top };
}
