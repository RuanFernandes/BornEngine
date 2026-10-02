import assert from 'node:assert/strict';
import test from 'node:test';
import { INPUT_SEND_INTERVAL_SECONDS, MovementInputThrottle } from '../src/protocol.js';

test('uses wall-clock spacing when simulation frames run ahead of real time', () => {
  const throttle = new MovementInputThrottle();
  const originalNow = Date.now;
  let now = 1_000;
  Date.now = () => now;

  try {
    assert.equal(throttle.update(0.05, { x: 1, y: 0 }), true);
    now += 16;
    assert.equal(throttle.update(0.05, { x: 1, y: 0 }), false);
    now += 16;
    assert.equal(throttle.update(0.05, { x: 1, y: 0 }), false);
    now += 16;
    assert.equal(throttle.update(0.05, { x: 1, y: 0 }), false);
    now += 16;
    assert.equal(throttle.update(0.05, { x: 1, y: 0 }), true);
  } finally {
    Date.now = originalNow;
  }
});

test('throttles movement against wall time and sends one stop input', () => {
  const throttle = new MovementInputThrottle();
  const originalNow = Date.now;
  let now = 1_000;
  Date.now = () => now;

  const update = (delta: number, x: number, y: number): boolean => {
    now += delta * 1_000;
    return throttle.update(delta, { x, y });
  };

  try {
    for (let frame = 0; frame < 30; frame++) {
      assert.equal(update(1 / 60, 0, 0), false);
    }

    assert.equal(update(INPUT_SEND_INTERVAL_SECONDS / 3, 1, 0), true);
    assert.equal(update(INPUT_SEND_INTERVAL_SECONDS / 3, 1, 0), false);
    assert.equal(update(INPUT_SEND_INTERVAL_SECONDS / 3, 1, 0), false);
    assert.equal(update(INPUT_SEND_INTERVAL_SECONDS / 3, 1, 0), true);

    assert.equal(update(INPUT_SEND_INTERVAL_SECONDS / 3, 0, 0), false);
    assert.equal(update(INPUT_SEND_INTERVAL_SECONDS / 3, 0, 0), false);
    assert.equal(update(INPUT_SEND_INTERVAL_SECONDS / 3, 0, 0), true);

    for (let frame = 0; frame < 30; frame++) {
      assert.equal(update(1 / 60, 0, 0), false);
    }
  } finally {
    Date.now = originalNow;
  }
});

test('uses actual elapsed time to send a stop input after uneven frames', () => {
  const throttle = new MovementInputThrottle();
  const originalNow = Date.now;
  let now = 2_000;
  Date.now = () => now;

  try {
    assert.equal(throttle.update(0.049, { x: 1, y: 0 }), true);
    now += 40;
    assert.equal(throttle.update(0.040, { x: 1, y: 0 }), false);
    now += 12;
    assert.equal(throttle.update(0.012, { x: 1, y: 0 }), false);
    now += 8;
    assert.equal(throttle.update(0.008, { x: 1, y: 0 }), true);
    now += 16;
    assert.equal(throttle.update(0.016, { x: 0, y: 0 }), false);
    now += 44;
    assert.equal(throttle.update(0.044, { x: 0, y: 0 }), true);
    now += 250;
    assert.equal(throttle.update(0.250, { x: 0, y: 0 }), false);
  } finally {
    Date.now = originalNow;
  }
});
