import assert from 'node:assert/strict';
import test from 'node:test';
import { installBrowserFfi } from '../src/preview/browser-host.js';

test('browser host exposes native FFI and dispatches JavaScript game callbacks', () => {
  let observedDelta = -1;
  const nativeCall = (): number => 7;
  const host: Record<string, unknown> = {};

  installBrowserFfi(host, { bloom_get_platform: nativeCall });

  assert.equal((host.bloom_get_platform as () => number)(), 7);
  const dispatch = host.callWasmClosure as (callback: (dt: number) => void, dt: number) => void;
  dispatch((dt) => { observedDelta = dt; }, 0.016);
  assert.equal(observedDelta, 0.016);
});

test('browser host rejects a non-function game callback', () => {
  const host: Record<string, unknown> = {};
  installBrowserFfi(host, {});
  const dispatch = host.callWasmClosure as (callback: unknown, dt: number) => void;

  assert.throws(() => dispatch(42, 0.016), /JavaScript game callback/);
});
