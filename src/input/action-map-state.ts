import type { Rect } from '../core/types';

/**
 * A physical input that counts as "down" for an action: a key, mouse button, gamepad button, or a touch inside a screen rectangle.
 */
export type ActionButtonBinding =
  | { kind: 'key'; key: number }
  | { kind: 'mouse'; button: number }
  | { kind: 'gamepad'; button: number }
  | { kind: 'touch-region'; rect: Rect };

/**
 * Binding for an analog axis built from negative and positive button groups and/or a gamepad axis. The result is clamped to -1..1.
 */
export interface ActionAxisBinding {
  negative?: ActionButtonBinding[];
  positive?: ActionButtonBinding[];
  gamepadAxis?: { axis: number; scale?: number; deadzone?: number };
}

/** Position of one touch slot at the time an input snapshot was taken. */
export interface TouchSample {
  active: boolean;
  x: number;
  y: number;
}

/** Device state sampled once per update and used to evaluate action and axis bindings. */
export interface ActionInputSnapshot {
  keys: number[];
  mouseButtons: number[];
  gamepadButtons: number[];
  gamepadAxes: number[];
  /** Optional sparse axis indices aligned with `gamepadAxes`. */
  gamepadAxisIndices?: number[];
  touches: Array<TouchSample | null>;
}

/** Per-frame state of an action: whether it is held and whether it was pressed or released this frame. */
export interface ActionState {
  isDown: boolean;
  wasPressed: boolean;
  wasReleased: boolean;
}

function containsIndex(indices: number[], value: number): boolean {
  for (let index = 0; index < indices.length; index++) {
    if (indices[index] === value) return true;
  }
  return false;
}

/** Returns true when the binding is active in the given input snapshot. */
export function evaluateButtonBinding(binding: ActionButtonBinding, snapshot: ActionInputSnapshot): boolean {
  if (binding.kind === 'key') return containsIndex(snapshot.keys, binding.key);
  if (binding.kind === 'mouse') return containsIndex(snapshot.mouseButtons, binding.button);
  if (binding.kind === 'gamepad') return containsIndex(snapshot.gamepadButtons, binding.button);

  const rect = binding.rect;
  const right = rect.x + rect.width;
  const bottom = rect.y + rect.height;
  for (let index = 0; index < snapshot.touches.length; index++) {
    const touch = snapshot.touches[index];
    if (
      touch !== null &&
      touch.active &&
      touch.x >= rect.x &&
      touch.x <= right &&
      touch.y >= rect.y &&
      touch.y <= bottom
    )
      return true;
  }
  return false;
}

/** Returns true when at least one of the bindings is active in the given input snapshot. */
export function evaluateActionBindings(bindings: ActionButtonBinding[], snapshot: ActionInputSnapshot): boolean {
  for (let index = 0; index < bindings.length; index++) {
    if (evaluateButtonBinding(bindings[index], snapshot)) return true;
  }
  return false;
}

/**
 * Computes the axis value in -1..1 from button groups and the optional gamepad axis, applying its deadzone (default 0.15) and scale.
 */
export function evaluateAxisBinding(binding: ActionAxisBinding, snapshot: ActionInputSnapshot): number {
  const negative = binding.negative === undefined ? false : evaluateActionBindings(binding.negative, snapshot);
  const positive = binding.positive === undefined ? false : evaluateActionBindings(binding.positive, snapshot);
  let value = (positive ? 1 : 0) - (negative ? 1 : 0);

  if (binding.gamepadAxis !== undefined) {
    const axis = binding.gamepadAxis.axis;
    let axisPosition = axis;
    if (snapshot.gamepadAxisIndices !== undefined) {
      axisPosition = -1;
      for (let index = 0; index < snapshot.gamepadAxisIndices.length; index++) {
        if (snapshot.gamepadAxisIndices[index] === axis) {
          axisPosition = index;
          break;
        }
      }
    }
    let analog =
      axisPosition >= 0 && axisPosition < snapshot.gamepadAxes.length ? snapshot.gamepadAxes[axisPosition] : 0;
    if (analog !== analog) analog = 0;
    const deadzone = binding.gamepadAxis.deadzone === undefined ? 0.15 : binding.gamepadAxis.deadzone;
    const scale = binding.gamepadAxis.scale === undefined ? 1 : binding.gamepadAxis.scale;
    const magnitude = Math.abs(analog);
    if (magnitude <= deadzone) {
      analog = 0;
    } else {
      const direction = analog < 0 ? -1 : 1;
      analog = ((direction * (magnitude - deadzone)) / (1 - deadzone)) * scale;
    }
    value += analog;
  }

  if (value < -1) return -1;
  if (value > 1) return 1;
  return value;
}

/**
 * Returns the next action state from the previous and current down values. When `suppressEdge` is true, no pressed or released edge is reported.
 */
export function advanceActionState(previous: boolean, current: boolean, suppressEdge: boolean): ActionState {
  return {
    isDown: current,
    wasPressed: !suppressEdge && !previous && current,
    wasReleased: !suppressEdge && previous && !current,
  };
}
