import assert from 'node:assert/strict';
import test from 'node:test';
import { INPUT_SEND_INTERVAL_SECONDS, MovementInputThrottle } from '../src/protocol.js';

test('throttles movement below the server limit and sends one stop input', () => {
  const throttle = new MovementInputThrottle();

  for (let frame = 0; frame < 30; frame++) {
    assert.equal(throttle.update(1 / 60, { x: 0, y: 0 }), false);
  }

  assert.equal(throttle.update(INPUT_SEND_INTERVAL_SECONDS / 3, { x: 1, y: 0 }), false);
  assert.equal(throttle.update(INPUT_SEND_INTERVAL_SECONDS / 3, { x: 1, y: 0 }), false);
  assert.equal(throttle.update(INPUT_SEND_INTERVAL_SECONDS / 3, { x: 1, y: 0 }), true);

  assert.equal(throttle.update(INPUT_SEND_INTERVAL_SECONDS / 3, { x: 1, y: 0 }), false);
  assert.equal(throttle.update(INPUT_SEND_INTERVAL_SECONDS / 3, { x: 1, y: 0 }), false);
  assert.equal(throttle.update(INPUT_SEND_INTERVAL_SECONDS / 3, { x: 1, y: 0 }), true);

  assert.equal(throttle.update(INPUT_SEND_INTERVAL_SECONDS / 3, { x: 0, y: 0 }), false);
  assert.equal(throttle.update(INPUT_SEND_INTERVAL_SECONDS / 3, { x: 0, y: 0 }), false);
  assert.equal(throttle.update(INPUT_SEND_INTERVAL_SECONDS / 3, { x: 0, y: 0 }), true);

  for (let frame = 0; frame < 30; frame++) {
    assert.equal(throttle.update(1 / 60, { x: 0, y: 0 }), false);
  }
});
