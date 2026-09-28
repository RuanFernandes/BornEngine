import { getCamera2DWorldBounds, isRectIntersecting } from '../../src/core/camera2d-culling';
import type { Camera2D } from '../../src/core/types';

function expect(value: boolean, label: string): void {
  if (!value) {
    console.error('FAIL: ' + label);
    process.exit(1);
  }
}

function close(actual: number, expected: number): boolean {
  return Math.abs(actual - expected) < 0.001;
}

function camera(offsetX: number, offsetY: number, targetX: number, targetY: number,
  rotation: number, zoom: number): Camera2D {
  return {
    offset: { x: offsetX, y: offsetY },
    target: { x: targetX, y: targetY },
    rotation,
    zoom,
  };
}

const unrotated = getCamera2DWorldBounds(camera(0, 0, 0, 0, 0, 1), 100, 80);
expect(unrotated !== null && unrotated.x === 0 && unrotated.y === 0 &&
  unrotated.width === 100 && unrotated.height === 80,
  'camera helper returns the visible world rectangle for an unrotated view');

const rotated = getCamera2DWorldBounds(camera(100, 50, 20, 30, 90, 2), 200, 100);
expect(rotated !== null && close(rotated.x, -5) && close(rotated.y, -20) &&
  close(rotated.width, 50) && close(rotated.height, 100),
  'camera helper rotates and scales viewport corners into a conservative world AABB');

const offsetRotated = getCamera2DWorldBounds(camera(10, 15, 20, 30, 90, 2), 100, 80);
expect(offsetRotated !== null && close(offsetRotated.x, -12.5) && close(offsetRotated.y, 25) &&
  close(offsetRotated.width, 40) && close(offsetRotated.height, 50),
  'rotated view bounds honor asymmetric viewport offsets using the renderer camera transform');

expect(rotated !== null && isRectIntersecting({ x: 45, y: 5, width: 3, height: 3 }, rotated),
  'camera bounds include rectangles touching their edge');
expect(rotated !== null && !isRectIntersecting({ x: 46, y: 5, width: 3, height: 3 }, rotated),
  'camera bounds reject rectangles fully outside the view AABB');
expect(isRectIntersecting({ x: NaN, y: 0, width: 1, height: 1 }, { x: 0, y: 0, width: 1, height: 1 }),
  'invalid object bounds stay visible to avoid incorrect culling');
expect(getCamera2DWorldBounds(camera(0, 0, 0, 0, 0, 0), 100, 80) === null,
  'zero zoom disables culling rather than producing invalid bounds');
expect(getCamera2DWorldBounds(camera(NaN, 0, 0, 0, 0, 1), 100, 80) === null,
  'invalid camera input disables culling safely');

console.log('PASS: renderer camera culling bounds');
