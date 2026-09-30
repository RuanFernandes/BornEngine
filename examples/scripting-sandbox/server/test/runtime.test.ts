import assert from 'node:assert/strict';
import test from 'node:test';
import { shouldEnableSandboxDevRuntime } from '../src/sandbox/runtime.js';

test('disables the server script editor in production even when requested', () => {
  assert.equal(shouldEnableSandboxDevRuntime({ NODE_ENV: 'production', BORNENGINE_SANDBOX_DEV: '1' }), false);
});

test('enables the server script editor only when development is configured', () => {
  assert.equal(shouldEnableSandboxDevRuntime({ NODE_ENV: 'development', BORNENGINE_SANDBOX_DEV: '1' }), true);
  assert.equal(shouldEnableSandboxDevRuntime({ NODE_ENV: 'development', BORNENGINE_SANDBOX_DEV: '0' }), false);
});
