import type { GUI } from './gui';
import type { GuiPoint } from './types';

export const GUIEventType = {
  Action: 1,
  Change: 2,
  Focus: 3,
  Blur: 4,
  PointerEnter: 5,
  PointerLeave: 6,
  PointerMove: 7,
  PointerDown: 8,
  PointerUp: 9,
  PointerDrag: 10,
  Wheel: 11,
  KeyDown: 12,
  KeyUp: 13,
} as const;

export type GUIEventTypeCode = (typeof GUIEventType)[keyof typeof GUIEventType];

export interface GUIEventOptions {
  local?: GuiPoint;
  global?: GuiPoint;
  key?: number;
  button?: number;
  wheelX?: number;
  wheelY?: number;
  modifiers?: number;
}

export class GUIEvent {
  readonly type: number;
  readonly target: GUI;
  currentTarget: GUI | null = null;
  readonly localX?: number;
  readonly localY?: number;
  readonly globalX?: number;
  readonly globalY?: number;
  readonly key?: number;
  readonly button?: number;
  readonly wheelX?: number;
  readonly wheelY?: number;
  readonly modifiers?: number;
  private propagationStopped = false;

  constructor(type: number, target: GUI, options: GUIEventOptions = {}) {
    this.type = type;
    this.target = target;
    this.localX = options.local?.x;
    this.localY = options.local?.y;
    this.globalX = options.global?.x;
    this.globalY = options.global?.y;
    this.key = options.key;
    this.button = options.button;
    this.wheelX = options.wheelX;
    this.wheelY = options.wheelY;
    this.modifiers = options.modifiers;
  }

  stopPropagation(): void {
    this.propagationStopped = true;
  }

  isPropagationStopped(): boolean {
    return this.propagationStopped;
  }
}
