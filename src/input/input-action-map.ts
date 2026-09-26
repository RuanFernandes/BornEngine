import {
  getGamepadAxis,
  getMaxTouchPoints,
  getTouchPosition,
  isGamepadButtonDown,
  isKeyDown,
  isMouseButtonDown,
  isTouchActive,
} from '../core/internal';
import type { Rect, Vec2 } from '../core/types';
import {
  advanceActionState,
  evaluateActionBindings,
  evaluateAxisBinding,
} from './action-map-state';
import type {
  ActionAxisBinding,
  ActionButtonBinding,
  ActionInputSnapshot,
  ActionState,
} from './action-map-state';

interface ActionEntry {
  name: string;
  bindings: ActionButtonBinding[];
  state: ActionState;
  suppressNextEdge: boolean;
}

interface AxisEntry {
  name: string;
  binding: ActionAxisBinding;
  value: number;
}

function finiteNumber(value: number): boolean {
  return typeof value === 'number' && value === value &&
    value !== Infinity && value !== -Infinity;
}

function validIndex(value: number): boolean {
  return finiteNumber(value) && value >= 0 && Math.floor(value) === value;
}

function validName(name: string): boolean {
  return typeof name === 'string' && name.trim().length > 0;
}

function copyRect(rect: Rect): Rect | null {
  if (rect === null || typeof rect !== 'object') return null;
  if (!finiteNumber(rect.x) || !finiteNumber(rect.y) ||
      !finiteNumber(rect.width) || !finiteNumber(rect.height) ||
      rect.width < 0 || rect.height < 0 ||
      !finiteNumber(rect.x + rect.width) || !finiteNumber(rect.y + rect.height)) {
    return null;
  }
  return { x: rect.x, y: rect.y, width: rect.width, height: rect.height };
}

function copyButtonBinding(binding: ActionButtonBinding): ActionButtonBinding | null {
  if (binding === null || typeof binding !== 'object') return null;
  if (binding.kind === 'key') {
    return validIndex(binding.key) ? { kind: 'key', key: binding.key } : null;
  }
  if (binding.kind === 'mouse') {
    return validIndex(binding.button) ? { kind: 'mouse', button: binding.button } : null;
  }
  if (binding.kind === 'gamepad') {
    return validIndex(binding.button) ? { kind: 'gamepad', button: binding.button } : null;
  }
  if (binding.kind === 'touch-region') {
    const rect = copyRect(binding.rect);
    return rect === null ? null : { kind: 'touch-region', rect };
  }
  return null;
}

function sameButtonBinding(left: ActionButtonBinding, right: ActionButtonBinding): boolean {
  if (left.kind !== right.kind) return false;
  if (left.kind === 'key' && right.kind === 'key') return left.key === right.key;
  if (left.kind === 'mouse' && right.kind === 'mouse') return left.button === right.button;
  if (left.kind === 'gamepad' && right.kind === 'gamepad') return left.button === right.button;
  if (left.kind === 'touch-region' && right.kind === 'touch-region') {
    return left.rect.x === right.rect.x && left.rect.y === right.rect.y &&
      left.rect.width === right.rect.width && left.rect.height === right.rect.height;
  }
  return false;
}

function containsBinding(bindings: ActionButtonBinding[], candidate: ActionButtonBinding): boolean {
  for (let index = 0; index < bindings.length; index++) {
    if (sameButtonBinding(bindings[index], candidate)) return true;
  }
  return false;
}

function copyButtonBindings(bindings: ActionButtonBinding[]): ActionButtonBinding[] | null {
  if (!Array.isArray(bindings)) return null;
  const copied: ActionButtonBinding[] = [];
  for (let index = 0; index < bindings.length; index++) {
    const binding = copyButtonBinding(bindings[index]);
    if (binding === null) return null;
    copied.push(binding);
  }
  return copied;
}

function copyAxisBinding(binding: ActionAxisBinding): ActionAxisBinding | null {
  if (binding === null || typeof binding !== 'object') return null;
  const result: ActionAxisBinding = {};

  if (binding.negative !== undefined) {
    const negative = copyButtonBindings(binding.negative);
    if (negative === null) return null;
    result.negative = negative;
  }
  if (binding.positive !== undefined) {
    const positive = copyButtonBindings(binding.positive);
    if (positive === null) return null;
    result.positive = positive;
  }
  if (binding.gamepadAxis !== undefined) {
    const gamepadAxis = binding.gamepadAxis;
    if (gamepadAxis === null || typeof gamepadAxis !== 'object' ||
        !validIndex(gamepadAxis.axis)) return null;
    const scale = gamepadAxis.scale === undefined ? 1 : gamepadAxis.scale;
    const deadzone = gamepadAxis.deadzone === undefined ? 0.15 : gamepadAxis.deadzone;
    if (!finiteNumber(scale) || !finiteNumber(deadzone) ||
        deadzone < 0 || deadzone >= 1) return null;
    result.gamepadAxis = { axis: gamepadAxis.axis, scale, deadzone };
  }
  return result;
}

function findAction(actions: ActionEntry[], name: string): number {
  for (let index = 0; index < actions.length; index++) {
    if (actions[index].name === name) return index;
  }
  return -1;
}

function findAxis(axes: AxisEntry[], name: string): number {
  for (let index = 0; index < axes.length; index++) {
    if (axes[index].name === name) return index;
  }
  return -1;
}

function addUniqueIndex(indices: number[], candidate: number): void {
  for (let index = 0; index < indices.length; index++) {
    if (indices[index] === candidate) return;
  }
  indices.push(candidate);
}

function collectButtonIndex(
  binding: ActionButtonBinding,
  keys: number[],
  mouseButtons: number[],
  gamepadButtons: number[],
): boolean {
  if (binding.kind === 'key') addUniqueIndex(keys, binding.key);
  else if (binding.kind === 'mouse') addUniqueIndex(mouseButtons, binding.button);
  else if (binding.kind === 'gamepad') addUniqueIndex(gamepadButtons, binding.button);
  else return true;
  return false;
}

function collectAxisIndices(
  binding: ActionAxisBinding,
  keys: number[],
  mouseButtons: number[],
  gamepadButtons: number[],
  gamepadAxes: number[],
): { hasTouch: boolean } {
  let hasTouch = false;
  const groups = [binding.negative, binding.positive];
  for (let groupIndex = 0; groupIndex < groups.length; groupIndex++) {
    const group = groups[groupIndex];
    if (group === undefined) continue;
    for (let index = 0; index < group.length; index++) {
      if (collectButtonIndex(group[index], keys, mouseButtons, gamepadButtons)) {
        hasTouch = true;
      }
    }
  }
  if (binding.gamepadAxis !== undefined) {
    addUniqueIndex(gamepadAxes, binding.gamepadAxis.axis);
  }
  return { hasTouch };
}

/**
 * Maps named actions and axes to Core input state. Call `update()` once per
 * frame before querying so every query observes the same input snapshot.
 */
export class InputActionMap {
  private actions: ActionEntry[] = [];
  private axes: AxisEntry[] = [];

  /** Add one or more physical bindings to a named action. */
  bindAction(name: string, bindings: ActionButtonBinding | ActionButtonBinding[]): boolean {
    if (!validName(name)) return false;
    const requested = Array.isArray(bindings) ? bindings : [bindings];
    const copied = copyButtonBindings(requested);
    if (copied === null) return false;

    const unique: ActionButtonBinding[] = [];
    for (let index = 0; index < copied.length; index++) {
      if (!containsBinding(unique, copied[index])) unique.push(copied[index]);
    }

    const actionIndex = findAction(this.actions, name);
    if (actionIndex < 0) {
      this.actions.push({
        name,
        bindings: unique,
        state: { isDown: false, wasPressed: false, wasReleased: false },
        suppressNextEdge: false,
      });
      return true;
    }

    const action = this.actions[actionIndex];
    const additions: ActionButtonBinding[] = [];
    for (let index = 0; index < unique.length; index++) {
      if (!containsBinding(action.bindings, unique[index])) {
        additions.push(unique[index]);
      }
    }
    if (additions.length > 0) {
      action.bindings = action.bindings.concat(additions);
      action.suppressNextEdge = true;
    }
    return true;
  }

  /** Remove an action and all of its bindings. */
  unbindAction(name: string): boolean {
    const index = findAction(this.actions, name);
    if (index < 0) return false;
    this.actions.splice(index, 1);
    return true;
  }

  /** Register or replace a named axis. */
  bindAxis(name: string, binding: ActionAxisBinding): boolean {
    if (!validName(name)) return false;
    const copied = copyAxisBinding(binding);
    if (copied === null) return false;
    const axisIndex = findAxis(this.axes, name);
    if (axisIndex < 0) {
      this.axes.push({ name, binding: copied, value: 0 });
    } else {
      this.axes[axisIndex].binding = copied;
    }
    return true;
  }

  /** Remove a named axis. */
  unbindAxis(name: string): boolean {
    const index = findAxis(this.axes, name);
    if (index < 0) return false;
    this.axes.splice(index, 1);
    return true;
  }

  /** Remove all registered actions and axes. */
  clear(): void {
    this.actions.length = 0;
    this.axes.length = 0;
  }

  /** Capture device state and advance the action/axis snapshot. */
  update(): void {
    const keys: number[] = [];
    const mouseButtons: number[] = [];
    const gamepadButtons: number[] = [];
    const gamepadAxisIndices: number[] = [];
    let hasTouchBindings = false;

    for (let actionIndex = 0; actionIndex < this.actions.length; actionIndex++) {
      const action = this.actions[actionIndex];
      for (let bindingIndex = 0; bindingIndex < action.bindings.length; bindingIndex++) {
        if (collectButtonIndex(action.bindings[bindingIndex], keys, mouseButtons, gamepadButtons)) {
          hasTouchBindings = true;
        }
      }
    }
    for (let axisIndex = 0; axisIndex < this.axes.length; axisIndex++) {
      const collected = collectAxisIndices(
        this.axes[axisIndex].binding, keys, mouseButtons, gamepadButtons, gamepadAxisIndices,
      );
      hasTouchBindings = hasTouchBindings || collected.hasTouch;
    }

    const snapshot: ActionInputSnapshot = {
      keys: [],
      mouseButtons: [],
      gamepadButtons: [],
      gamepadAxes: [],
      gamepadAxisIndices,
      touches: [],
    };
    for (let index = 0; index < keys.length; index++) {
      if (isKeyDown(keys[index])) snapshot.keys.push(keys[index]);
    }
    for (let index = 0; index < mouseButtons.length; index++) {
      if (isMouseButtonDown(mouseButtons[index])) snapshot.mouseButtons.push(mouseButtons[index]);
    }
    for (let index = 0; index < gamepadButtons.length; index++) {
      if (isGamepadButtonDown(gamepadButtons[index])) snapshot.gamepadButtons.push(gamepadButtons[index]);
    }

    for (let index = 0; index < gamepadAxisIndices.length; index++) {
      snapshot.gamepadAxes.push(getGamepadAxis(gamepadAxisIndices[index]));
    }

    if (hasTouchBindings) {
      const reportedTouchCount = getMaxTouchPoints();
      const touchCount = finiteNumber(reportedTouchCount) && reportedTouchCount >= 0
        ? Math.floor(reportedTouchCount)
        : 0;
      for (let slot = 0; slot < touchCount; slot++) {
        if (!isTouchActive(slot)) {
          snapshot.touches.push(null);
        } else {
          const position = getTouchPosition(slot);
          snapshot.touches.push({ active: true, x: position.x, y: position.y });
        }
      }
    }

    for (let index = 0; index < this.actions.length; index++) {
      const action = this.actions[index];
      const current = evaluateActionBindings(action.bindings, snapshot);
      action.state = advanceActionState(action.state.isDown, current, action.suppressNextEdge);
      action.suppressNextEdge = false;
    }
    for (let index = 0; index < this.axes.length; index++) {
      this.axes[index].value = evaluateAxisBinding(this.axes[index].binding, snapshot);
    }
  }

  /** True when any binding for the action is down in the last snapshot. */
  isDown(name: string): boolean {
    const index = findAction(this.actions, name);
    return index >= 0 ? this.actions[index].state.isDown : false;
  }

  /** True for the frame in which the action changed from up to down. */
  wasPressed(name: string): boolean {
    const index = findAction(this.actions, name);
    return index >= 0 ? this.actions[index].state.wasPressed : false;
  }

  /** True for the frame in which the action changed from down to up. */
  wasReleased(name: string): boolean {
    const index = findAction(this.actions, name);
    return index >= 0 ? this.actions[index].state.wasReleased : false;
  }

  /** Read a named axis from the last completed snapshot. */
  readAxis(name: string): number {
    const index = findAxis(this.axes, name);
    return index >= 0 ? this.axes[index].value : 0;
  }

  /** Read two named axes without normalizing diagonal values. */
  readVector2(horizontal: string, vertical: string): Vec2 {
    return { x: this.readAxis(horizontal), y: this.readAxis(vertical) };
  }
}
