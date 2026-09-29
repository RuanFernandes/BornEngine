import { InputActionMap } from '../../src/input/input-action-map';
import type { ActionInputSnapshot } from '../../src/input/action-map-state';

declare const process: { exit(code: number): never };

function expect(value: boolean, label: string): void {
  if (!value) {
    console.error('FAIL: ' + label);
    process.exit(1);
  }
}

let keys: number[] = [];
let mouse: number[] = [];
let gamepadButtons: number[] = [];
let gamepadAxes: Record<number, number> = {};
let touches: Array<{ active: boolean; x: number; y: number } | null> = [];
const input = {
  isKeyDown: (key: number) => keys.indexOf(key) >= 0,
  isMouseButtonDown: (button: number) => mouse.indexOf(button) >= 0,
  isGamepadButtonDown: (button: number) => gamepadButtons.indexOf(button) >= 0,
  getGamepadAxis: (axis: number) => gamepadAxes[axis] ?? 0,
  getMaxTouchPoints: () => touches.length,
  isTouchActive: (slot: number) => touches[slot] !== null && touches[slot].active,
  getTouchPosition: (slot: number) => {
    const touch = touches[slot];
    return touch === null ? { x: 0, y: 0 } : { x: touch.x, y: touch.y };
  },
};

const original = new InputActionMap(input as any);
expect(original.bindAction('jump', [
  { kind: 'key', key: 32 },
  { kind: 'mouse', button: 1 },
  { kind: 'gamepad', button: 2 },
  { kind: 'touch-region', rect: { x: 1, y: 2, width: 3, height: 4 } },
]), 'button bindings cover keyboard, mouse, gamepad, and touch');
expect(original.bindAxis('move', {
  negative: [{ kind: 'key', key: 65 }],
  positive: [{ kind: 'key', key: 68 }],
  gamepadAxis: { axis: 3, scale: -1, deadzone: 0.2 },
}), 'axis data includes digital and analog bindings');

const exported = original.toData();
const restored = new InputActionMap(input as any);
expect(restored.loadData(exported), 'serialized map loads successfully');
expect(JSON.stringify(restored.toData()) === JSON.stringify(exported),
  'every binding family round-trips through stable data');

const beforeInvalidLoad = JSON.stringify(restored.toData());
const invalid = {
  version: 1,
  actions: [{ name: 'bad', bindings: [{ kind: 'key', key: -1 }] }],
  axes: [],
};
expect(!restored.loadData(invalid as any) &&
  JSON.stringify(restored.toData()) === beforeInvalidLoad,
  'invalid data is rejected atomically without replacing current bindings');
expect(!restored.loadData({ ...exported, version: 2 } as any),
  'unsupported future serialization versions are rejected');

keys = [32];
restored.update();
expect(restored.isDown('jump') && !restored.wasPressed('jump'),
  'rebind baseline suppresses a press edge from a key already held');
keys = [];
restored.update();
expect(!restored.isDown('jump') && !restored.wasReleased('jump'),
  'rebind baseline does not synthesize a release edge');

mouse = [1];
gamepadButtons = [2];
gamepadAxes[3] = 0.6;
touches = [null, { active: true, x: 2, y: 3 }];
const snapshot: ActionInputSnapshot = {
  keys: [], mouseButtons: mouse, gamepadButtons, gamepadAxes: [0.6],
  gamepadAxisIndices: [3], touches,
};
expect(snapshot.mouseButtons[0] === 1 && snapshot.gamepadButtons[0] === 2 &&
  snapshot.touches[1] !== null,
  'all supported device families remain available after serialization');
console.log('InputActionMap serialization fixture passed');
