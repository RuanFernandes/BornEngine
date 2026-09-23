import assert from 'node:assert/strict';
import test from 'node:test';
import { copyFeedback, nextMenuState } from '../src/scripts/interaction-state.mjs';

test('menu state toggles predictably', () => {
  assert.equal(nextMenuState(false), true);
  assert.equal(nextMenuState(true), false);
});

test('copy feedback exposes accessible success and failure messages', () => {
  assert.deepEqual(copyFeedback(true), {
    label: 'Copied',
    liveMessage: 'Code copied to clipboard.',
  });
  assert.deepEqual(copyFeedback(false), {
    label: 'Copy failed',
    liveMessage: 'Copy failed. Select the code and copy it manually.',
  });
});
