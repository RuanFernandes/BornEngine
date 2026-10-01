import assert from 'node:assert/strict';
import test from 'node:test';

const wasmEnv = await import(new URL('../public/env.js', import.meta.url).href) as {
  __rquickjs_host_now_us(): number;
};

test('QuickJS host clock reports performance time in microseconds', () => {
  const original = globalThis.performance;
  Object.defineProperty(globalThis, 'performance', {
    configurable: true,
    value: { now: () => 12.345 },
  });

  try {
    assert.equal(wasmEnv.__rquickjs_host_now_us(), 12345);
  } finally {
    Object.defineProperty(globalThis, 'performance', { configurable: true, value: original });
  }
});
