import assert from 'node:assert/strict';
import test from 'node:test';
import { clampPlayerPosition, normalizeMoveInput } from '../src/protocol.js';

test('accepts bounded and sequenced movement input', () => {
  assert.deepEqual(normalizeMoveInput({ sequence: 2, x: 0.25, y: 0.5 }, 1), {
    ok: true,
    input: { sequence: 2, x: 0.25, y: 0.5 },
  });
});

test('rejects stale, malformed, oversized and client-authored positions', () => {
  assert.equal(normalizeMoveInput({ sequence: 2, x: 1, y: 0 }, 2).ok, false);
  assert.equal(normalizeMoveInput({ sequence: -1, x: 1, y: 0 }, -1).ok, false);
  assert.equal(normalizeMoveInput({ sequence: 2, x: 100, y: 0 }, 1).ok, false);
  assert.equal(normalizeMoveInput({ sequence: 2, x: 1, y: 0, position: { x: 1, y: 2 } }, 1).ok, false);
});

test('normalizes diagonal input and clamps world bounds', () => {
  const diagonal = normalizeMoveInput({ sequence: 0, x: 1, y: 1 }, -1);
  assert.equal(diagonal.ok, true);
  if (diagonal.ok) assert.ok(Math.abs(Math.hypot(diagonal.input.x, diagonal.input.y) - 1) < 1e-9);
  assert.deepEqual(clampPlayerPosition(-50, 2_000), { x: 20, y: 520 });
});
