import type { GuiProfile } from './profile';
import type { GuiRect } from './types';

export const GuiControlKind = {
  Control: 0,
} as const;

export type GuiControlKindCode = typeof GuiControlKind[keyof typeof GuiControlKind];

export interface GuiControlCommand {
  kind: number;
  id: number;
  rect: GuiRect;
  clip: GuiRect | null;
  profile: GuiProfile;
  values: number[];
  text: string;
}

export function intersectGuiRects(left: GuiRect, right: GuiRect): GuiRect {
  const x = Math.max(left.x, right.x);
  const y = Math.max(left.y, right.y);
  const rightEdge = Math.min(left.x + left.width, right.x + right.width);
  const bottomEdge = Math.min(left.y + left.height, right.y + right.height);
  return {
    x,
    y,
    width: Math.max(0, rightEdge - x),
    height: Math.max(0, bottomEdge - y),
  };
}
