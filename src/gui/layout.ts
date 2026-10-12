import type { GuiPoint, GuiSize } from './types';

/**
 * Returns `value` if it is finite.
 * @throws RangeError if `value` is not finite.
 */
export function validateGuiCoordinate(value: number, name: string): number {
  if (!Number.isFinite(value)) throw new RangeError(`${name} must be finite.`);
  return value;
}

/**
 * Returns `value` if it is finite and not negative.
 * @throws RangeError if `value` is not finite or is negative.
 */
export function validateGuiDimension(value: number, name: string): number {
  if (!Number.isFinite(value) || value < 0) throw new RangeError(`${name} must be finite and non-negative.`);
  return value;
}

/** Returns the offset that centers a child extent inside a parent extent. */
export function centeredCoordinate(parentExtent: number, childExtent: number): number {
  return (parentExtent - childExtent) / 2;
}

/** Returns the component-wise sum of two points. */
export function addGuiPoints(left: GuiPoint, right: GuiPoint): GuiPoint {
  return { x: left.x + right.x, y: left.y + right.y };
}

/** Returns `left` minus `right`, component-wise. */
export function subtractGuiPoints(left: GuiPoint, right: GuiPoint): GuiPoint {
  return { x: left.x - right.x, y: left.y - right.y };
}

/** Returns `size` with each dimension raised to at least the matching dimension of `minimum`. */
export function clampGuiSize(size: GuiSize, minimum: GuiSize): GuiSize {
  return {
    width: Math.max(size.width, minimum.width),
    height: Math.max(size.height, minimum.height),
  };
}
