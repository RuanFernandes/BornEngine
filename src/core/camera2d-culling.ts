import type { Camera2D, Rect } from './types';

/** World-space AABB visible through a 2D camera, or null for invalid input. */
export function getCamera2DWorldBounds(camera: Camera2D, viewportWidth: number, viewportHeight: number): Rect | null {
  if (
    camera === null ||
    camera === undefined ||
    camera.offset === null ||
    camera.offset === undefined ||
    camera.target === null ||
    camera.target === undefined ||
    !isFiniteNumber(camera.offset.x) ||
    !isFiniteNumber(camera.offset.y) ||
    !isFiniteNumber(camera.target.x) ||
    !isFiniteNumber(camera.target.y) ||
    !isFiniteNumber(camera.rotation) ||
    !isFiniteNumber(camera.zoom) ||
    camera.zoom === 0 ||
    !isFiniteNumber(viewportWidth) ||
    !isFiniteNumber(viewportHeight) ||
    viewportWidth <= 0 ||
    viewportHeight <= 0
  )
    return null;

  const zoom = camera.zoom;
  const radians = (camera.rotation * Math.PI) / 180;
  const cosine = Math.cos(radians);
  const sine = Math.sin(radians);
  const cornersX = [0, viewportWidth, viewportWidth, 0];
  const cornersY = [0, 0, viewportHeight, viewportHeight];
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;

  for (let index = 0; index < 4; index++) {
    const screenX = (cornersX[index] - camera.offset.x) / zoom;
    const screenY = (cornersY[index] - camera.offset.y) / zoom;
    const worldX = camera.target.x + cosine * screenX - sine * screenY;
    const worldY = camera.target.y + sine * screenX + cosine * screenY;
    if (worldX < minX) minX = worldX;
    if (worldY < minY) minY = worldY;
    if (worldX > maxX) maxX = worldX;
    if (worldY > maxY) maxY = worldY;
  }

  return { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
}

export function isRectIntersecting(left: Rect, right: Rect): boolean {
  if (
    left === null ||
    left === undefined ||
    right === null ||
    right === undefined ||
    !isFiniteNumber(left.x) ||
    !isFiniteNumber(left.y) ||
    !isFiniteNumber(left.width) ||
    !isFiniteNumber(left.height) ||
    !isFiniteNumber(right.x) ||
    !isFiniteNumber(right.y) ||
    !isFiniteNumber(right.width) ||
    !isFiniteNumber(right.height)
  )
    return true;
  const leftMinX = Math.min(left.x, left.x + left.width);
  const leftMaxX = Math.max(left.x, left.x + left.width);
  const leftMinY = Math.min(left.y, left.y + left.height);
  const leftMaxY = Math.max(left.y, left.y + left.height);
  const rightMinX = Math.min(right.x, right.x + right.width);
  const rightMaxX = Math.max(right.x, right.x + right.width);
  const rightMinY = Math.min(right.y, right.y + right.height);
  const rightMaxY = Math.max(right.y, right.y + right.height);
  return leftMinX <= rightMaxX && leftMaxX >= rightMinX && leftMinY <= rightMaxY && leftMaxY >= rightMinY;
}

function isFiniteNumber(value: number): boolean {
  return value === value && value !== Infinity && value !== -Infinity;
}
