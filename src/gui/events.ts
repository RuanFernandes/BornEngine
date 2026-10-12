import type { GUI } from './gui';
import type { GuiPoint } from './types';

/** Numeric codes for the events a GUI control can receive. */
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

/** Union of the numeric values in `GUIEventType`. */
export type GUIEventTypeCode = (typeof GUIEventType)[keyof typeof GUIEventType];

/** Optional pointer, key, and wheel details attached to a `GUIEvent`. */
export interface GUIEventOptions {
  local?: GuiPoint;
  global?: GuiPoint;
  key?: number;
  button?: number;
  wheelX?: number;
  wheelY?: number;
  modifiers?: number;
}

/** Event delivered to GUI controls, bubbling from the target control up through its parents. */
export class GUIEvent {
  /** Event type, one of the `GUIEventType` values. */
  readonly type: number;
  /** Control the event was originally dispatched to. */
  readonly target: GUI;
  /** Control currently handling the event while it bubbles, or `null` before dispatch. */
  currentTarget: GUI | null = null;
  /** Pointer X in the target control's local space, when the event carries a pointer position. */
  readonly localX?: number;
  /** Pointer Y in the target control's local space, when the event carries a pointer position. */
  readonly localY?: number;
  /** Pointer X in global GUI coordinates, when the event carries a pointer position. */
  readonly globalX?: number;
  /** Pointer Y in global GUI coordinates, when the event carries a pointer position. */
  readonly globalY?: number;
  /** Key code for key events. */
  readonly key?: number;
  /** Pointer button for pointer events. */
  readonly button?: number;
  /** Horizontal wheel delta for wheel events. */
  readonly wheelX?: number;
  /** Vertical wheel delta for wheel events. */
  readonly wheelY?: number;
  /** Modifier key bit flags active when the event occurred. */
  readonly modifiers?: number;
  private propagationStopped = false;

  /**
   * Creates an event of the given type for `target`.
   * @param options Optional pointer, key, and wheel details.
   */
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

  /** Prevents the event from bubbling to the parents of the current control. */
  stopPropagation(): void {
    this.propagationStopped = true;
  }

  /** Returns whether `stopPropagation` has been called on this event. */
  isPropagationStopped(): boolean {
    return this.propagationStopped;
  }
}
