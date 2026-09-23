import assert from 'node:assert/strict';
import test from 'node:test';
import { THEME_STORAGE_KEY, nextTheme, resolveTheme } from '../src/scripts/theme-state.mjs';

test('resolves a stored theme before the system preference', () => {
  assert.equal(resolveTheme({ storedTheme: 'ink', prefersDark: false }), 'ink');
  assert.equal(resolveTheme({ storedTheme: 'paper', prefersDark: true }), 'paper');
});

test('uses the system preference when no stored choice exists', () => {
  assert.equal(resolveTheme({ storedTheme: null, prefersDark: true }), 'ink');
  assert.equal(resolveTheme({ storedTheme: null, prefersDark: false }), 'paper');
});

test('rejects unknown storage values and uses the validated fallback without a system choice', () => {
  assert.equal(resolveTheme({ storedTheme: 'sepia', prefersDark: false }), 'paper');
  assert.equal(resolveTheme({ storedTheme: null, prefersDark: undefined, fallback: 'ink' }), 'ink');
});

test('toggles between the two supported themes', () => {
  assert.equal(nextTheme('paper'), 'ink');
  assert.equal(nextTheme('ink'), 'paper');
  assert.equal(THEME_STORAGE_KEY, 'bornengine-theme');
});
