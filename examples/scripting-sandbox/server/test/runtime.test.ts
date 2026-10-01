import assert from 'node:assert/strict';
import test from 'node:test';
import { sandboxDevApiPort, shouldEnableSandboxDevRuntime } from '../src/sandbox/runtime.js';

test('disables the server script editor in production even when requested', () => {
  assert.equal(shouldEnableSandboxDevRuntime({ NODE_ENV: 'production', BORNENGINE_SANDBOX_DEV: '1' }), false);
});

test('uses an explicit loopback development API port when configured', () => {
  assert.equal(sandboxDevApiPort({}), 2569);
  assert.equal(sandboxDevApiPort({ BORNENGINE_SANDBOX_DEV_PORT: '31874' }), 31874);
  assert.throws(() => sandboxDevApiPort({ BORNENGINE_SANDBOX_DEV_PORT: '70000' }), /valid TCP port/);
});

test('enables the server script editor only when development is configured', () => {
  assert.equal(shouldEnableSandboxDevRuntime({ NODE_ENV: 'development', BORNENGINE_SANDBOX_DEV: '1' }), true);
  assert.equal(shouldEnableSandboxDevRuntime({ NODE_ENV: 'development', BORNENGINE_SANDBOX_DEV: '0' }), false);
});
