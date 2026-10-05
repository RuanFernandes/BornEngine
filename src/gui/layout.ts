import type { GuiPoint, GuiSize } from './types';

export function validateGuiCoordinate(value: number, name: string): number {
  if (!Number.isFinite(value)) throw new RangeError(`${name} must be finite.`);
  return value;
}

export function validateGuiDimension(value: number, name: string): number {
  if (!Number.isFinite(value) || value < 0) throw new RangeError(`${name} must be finite and non-negative.`);
  return value;
}

export function centeredCoordinate(parentExtent: number, childExtent: number): number {
  return (parentExtent - childExtent) / 2;
}

export function addGuiPoints(left: GuiPoint, right: GuiPoint): GuiPoint {
  return { x: left.x + right.x, y: left.y + right.y };
}

export function subtractGuiPoints(left: GuiPoint, right: GuiPoint): GuiPoint {
  return { x: left.x - right.x, y: left.y - right.y };
}

export function clampGuiSize(size: GuiSize, minimum: GuiSize): GuiSize {
  return {
    width: Math.max(size.width, minimum.width),
    height: Math.max(size.height, minimum.height),
  };
}
