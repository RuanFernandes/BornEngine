import { injectKeyDown, injectKeyUp } from '../../src/core/index';
import { InputActionMap } from '../../src/input/input-action-map';

declare const process: { exit(code: number): never };

function expect(value: boolean, label: string): void {
  if (!value) {
    console.error('FAIL: ' + label);
    process.exit(1);
  }
}

const map = new InputActionMap();
const jumpKey = 71;
const secondJumpKey = 72;
const horizontalLeft = 73;
const verticalUp = 74;

expect(map.bindAction('jump', { kind: 'key', key: jumpKey }), 'bind a valid action');
injectKeyDown(jumpKey);
map.update();
expect(map.isDown('jump') && map.wasPressed('jump') && !map.wasReleased('jump'),
  'a key press produces one pressed edge');
map.update();
expect(map.isDown('jump') && !map.wasPressed('jump') && !map.wasReleased('jump'),
  'a held key stays down without repeating its pressed edge');
injectKeyUp(jumpKey);
map.update();
expect(!map.isDown('jump') && !map.wasPressed('jump') && map.wasReleased('jump'),
  'a key release produces one released edge');
map.update();
expect(!map.wasReleased('jump'), 'the released edge clears on the next update');

injectKeyDown(secondJumpKey);
map.update();
expect(!map.isDown('jump'), 'an unbound held key does not activate an action');
expect(map.bindAction('jump', { kind: 'key', key: secondJumpKey }),
  'append a second binding to an action');
map.update();
expect(map.isDown('jump') && !map.wasPressed('jump') && !map.wasReleased('jump'),
  'rebinding adopts a key already held as the new baseline');
injectKeyDown(jumpKey);
map.update();
expect(map.isDown('jump') && !map.wasPressed('jump') && !map.wasReleased('jump'),
  'adding another held binding does not add an edge');
injectKeyUp(secondJumpKey);
map.update();
expect(map.isDown('jump') && !map.wasReleased('jump'),
  'releasing one of two held bindings does not release the action');
injectKeyUp(jumpKey);
map.update();
expect(!map.isDown('jump') && map.wasReleased('jump'),
  'releasing the last overlapping binding releases the action');

const move = new InputActionMap();
expect(move.bindAxis('horizontal', { negative: [{ kind: 'key', key: horizontalLeft }] }),
  'bind horizontal axis');
expect(move.bindAxis('vertical', { negative: [{ kind: 'key', key: verticalUp }] }),
  'bind vertical axis');
injectKeyDown(horizontalLeft);
injectKeyDown(verticalUp);
move.update();
const diagonal = move.readVector2('horizontal', 'vertical');
expect(diagonal.x === -1 && diagonal.y === -1,
  'readVector2 preserves unnormalized diagonal values');
expect(!move.isDown('unknown') && !move.wasPressed('unknown') &&
  !move.wasReleased('unknown') && move.readAxis('unknown') === 0,
  'unknown queries return the neutral state');

expect(!map.bindAction('', { kind: 'key', key: 1 }), 'reject empty action names');
expect(!map.bindAction('invalid', { kind: 'key', key: -1 }), 'reject negative key indices');
expect(map.bindAxis('look', { gamepadAxis: { axis: 0 } }), 'bind a valid analog axis');
expect(!map.bindAxis('look', { gamepadAxis: { axis: 0, deadzone: 1 } }),
  'reject invalid axis replacement');
expect(map.readAxis('look') === 0, 'invalid replacement preserves prior axis');
expect(!map.unbindAction('missing') && !map.unbindAxis('missing'),
  'unknown unbind requests return false');

injectKeyUp(horizontalLeft);
injectKeyUp(verticalUp);
map.clear();
move.clear();
console.log('InputActionMap public fixture passed');
