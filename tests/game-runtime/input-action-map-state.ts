import type { ActionButtonBinding, ActionInputSnapshot } from '../../src/input/action-map-state';
import {
  advanceActionState,
  evaluateActionBindings,
  evaluateAxisBinding,
  evaluateButtonBinding,
} from '../../src/input/action-map-state';

declare const process: { exit(code: number): never };

function expect(value: boolean, label: string): void {
  if (!value) {
    console.error('FAIL: ' + label);
    process.exit(1);
  }
}

const sparse: ActionInputSnapshot = {
  keys: [],
  mouseButtons: [],
  gamepadButtons: [],
  gamepadAxes: [],
  touches: [null, null, null, null, { active: true, x: 12, y: 8 }],
};
expect(
  evaluateButtonBinding({ kind: 'touch-region', rect: { x: 10, y: 5, width: 5, height: 5 } }, sparse),
  'active sparse touch slots hit the region',
);

const bindings = [
  { kind: 'key', key: 1 },
  { kind: 'gamepad', button: 3 },
] as ActionButtonBinding[];
const held = { ...sparse, keys: [1], gamepadButtons: [3] };
expect(evaluateActionBindings(bindings, held), 'overlapping physical bindings combine as OR');

const pressed = advanceActionState(false, evaluateActionBindings(bindings, held), false);
expect(pressed.wasPressed, 'combined action reports one press edge');

const overlapping = advanceActionState(
  true,
  evaluateActionBindings(bindings, { ...held, keys: [] }),
  false,
);
expect(overlapping.isDown && !overlapping.wasReleased,
  'releasing one of two held bindings does not release the action');

const released = advanceActionState(true, false, false);
expect(released.wasReleased && !released.isDown, 'the last binding reports one release edge');

expect(
  evaluateAxisBinding({
    negative: [{ kind: 'key', key: 1 }],
    positive: [{ kind: 'key', key: 2 }],
  }, { ...sparse, keys: [1, 2] }) === 0,
  'opposite digital directions cancel',
);
const analogAxis = evaluateAxisBinding(
  { gamepadAxis: { axis: 5, deadzone: 0.2 } },
  { ...sparse, gamepadAxes: [0.6], gamepadAxisIndices: [5] },
);
expect(Math.abs(analogAxis - 0.5) < 0.0001,
  'sparse gamepad axis snapshots remap the remaining analog range',
);

const edge = advanceActionState(false, true, true);
expect(edge.isDown && !edge.wasPressed && !edge.wasReleased,
  'a rebind baseline suppresses a synthetic edge');

console.log('InputActionMap pure snapshot fixture passed');
