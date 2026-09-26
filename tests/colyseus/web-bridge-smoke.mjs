import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { createColyseusBridge } from '../../native/web/colyseus_bridge.js';

const requireWebDependencies = createRequire(new URL('../../native/web/package.json', import.meta.url));
const { Client } = requireWebDependencies('@colyseus/sdk');
const ffi = createColyseusBridge({ Client });
const endpoint = process.env.COLYSEUS_URL ?? 'ws://127.0.0.1:2567';
const client = ffi.bloom_colyseus_client_create(endpoint);
assert.ok(client > 0, 'bridge should create a client using the official SDK');

const eventQueue = [];
function collectEvents() {
  ffi.bloom_colyseus_poll();
  for (;;) {
    const encoded = ffi.bloom_colyseus_next_event();
    if (!encoded) return;
    eventQueue.push(JSON.parse(encoded));
  }
}

async function waitFor(label, predicate, timeoutMs = 10_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    collectEvents();
    const index = eventQueue.findIndex(predicate);
    if (index >= 0) return eventQueue.splice(index, 1)[0];
    const failure = eventQueue.find((event) => event.kind === 'error');
    if (failure) throw new Error(`${label} failed: ${failure.message}`);
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
  throw new Error(`Timed out waiting for ${label}`);
}

async function main() {
  let roomHandle = 0;
  try {
    roomHandle = ffi.bloom_colyseus_client_join(client, 0, 'test_room', JSON.stringify({ name: 'BornEngine web bridge' }));
    const joined = await waitFor('room join', (event) => event.kind === 'join' && event.room === roomHandle);
    assert.ok(joined.roomId);
    assert.ok(joined.sessionId);
    assert.equal(ffi.bloom_colyseus_room_is_connected(roomHandle), 1);
    const initialState = await waitFor('initial nested room state', (event) =>
      event.kind === 'state' && event.room === roomHandle && event.state?.counter === 0
      && Object.keys(event.state?.players ?? {}).length > 0);
    assert.equal(initialState.state.counter, 0);

    ffi.bloom_colyseus_room_send(roomHandle, 'echo', JSON.stringify({ value: 'web-bridge' }));
    const echo = await waitFor('string message', (event) => event.kind === 'message' && event.room === roomHandle && event.type === 'echo');
    assert.deepEqual(echo.data, { value: 'web-bridge' });

    ffi.bloom_colyseus_room_send(roomHandle, 'i7', JSON.stringify({ value: 'numeric-bridge' }));
    const numeric = await waitFor('numeric message', (event) => event.kind === 'message' && event.room === roomHandle && event.type === 'i8');
    assert.deepEqual(numeric.data, { value: 'numeric-bridge' });

    ffi.bloom_colyseus_room_send(roomHandle, 'increment', JSON.stringify({ amount: 3 }));
    const state = await waitFor('state snapshot', (event) => event.kind === 'state' && event.room === roomHandle && event.state?.counter === 3);
    assert.equal(state.state.counter, 3);

    ffi.bloom_colyseus_room_send_bytes(roomHandle, 'bytes', '[1,2,3,255]');
    await waitFor('binary state update', (event) => event.kind === 'state' && event.room === roomHandle && event.state?.lastBytes === '1,2,3,255');

    const request = ffi.bloom_colyseus_room_request(roomHandle, 'request_sum', '{"a":9,"b":33}');
    const reply = await waitFor('request response', (event) => event.kind === 'request' && event.room === roomHandle && event.request === request);
    assert.equal(reply.outcome, 0);
    assert.equal(reply.data, 42);

    ffi.bloom_colyseus_room_leave(roomHandle, 1);
    await waitFor('room leave', (event) => event.kind === 'leave' && event.room === roomHandle);
    assert.equal(ffi.bloom_colyseus_room_is_connected(roomHandle), 0);
    console.log('Colyseus Web FFI bridge smoke test passed');
  } finally {
    ffi.bloom_colyseus_client_dispose(client);
  }
}

await main();
