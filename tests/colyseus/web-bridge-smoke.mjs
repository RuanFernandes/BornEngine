import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const requireWebDependencies = createRequire(new URL('../../native/web/package.json', import.meta.url));
let sdkModule;
if (process.env.COLYSEUS_BRIDGE_MODULE) {
  const bundle = await readFile(resolve(process.env.COLYSEUS_BRIDGE_MODULE));
  const bundleUrl = `data:text/javascript;base64,${bundle.toString('base64')}`;
  sdkModule = await import(bundleUrl);
} else {
  const bridge = await import(new URL('../../native/web/colyseus_bridge.js', import.meta.url));
  sdkModule = {
    ...bridge,
    Client: requireWebDependencies('@colyseus/sdk').Client,
  };
}
const { Client, createColyseusBridge } = sdkModule;
class ManualReconnectClient extends Client {
  joinOrCreate(...args) {
    return super.joinOrCreate(...args).then((room) => {
      room.reconnection.enabled = false;
      return room;
    });
  }
}
const ffi = createColyseusBridge({ Client: ManualReconnectClient });
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

async function collectFor(timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  const collected = [];
  while (Date.now() < deadline) {
    collectEvents();
    collected.push(...eventQueue.splice(0));
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
  return collected;
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

    const token = ffi.bloom_colyseus_room_reconnection_token(roomHandle);
    assert.ok(token, 'joined room should provide a reconnection token');
    ffi.bloom_colyseus_room_leave(roomHandle, 0);
    await waitFor('unconsented room drop', (event) => event.kind === 'drop' && event.room === roomHandle);

    const reconnectedRoom = ffi.bloom_colyseus_client_join(client, 4, token, '{}');
    assert.ok(reconnectedRoom > 0, 'bridge should start token-based reconnection');
    const reconnected = await waitFor('manual room reconnect', (event) => event.kind === 'join' && event.room === reconnectedRoom);
    assert.ok(reconnected.roomId);
    const pendingRequest = ffi.bloom_colyseus_room_request(reconnectedRoom, 'request_delay', '{"delayMs":1200}');
    assert.ok(pendingRequest > 0, 'bridge should start an in-flight request before disposal');
    ffi.bloom_colyseus_client_dispose(client);
    const lateEvents = await collectFor(1_500);
    assert.equal(
      lateEvents.some((event) => event.kind === 'request' && event.request === pendingRequest),
      false,
      'disposing a client should cancel its in-flight request callback',
    );

    const pendingClient = ffi.bloom_colyseus_client_create(endpoint);
    const pendingJoin = ffi.bloom_colyseus_client_join(pendingClient, 0, 'test_room', '{}');
    ffi.bloom_colyseus_client_dispose(pendingClient);
    const pendingEvents = await collectFor(600);
    assert.equal(
      pendingEvents.some((event) => event.room === pendingJoin && ['join', 'error'].includes(event.kind)),
      false,
      'disposing a client should discard late pending-join callbacks',
    );
    console.log('Colyseus Web FFI bridge smoke test passed');
  } finally {
    ffi.bloom_colyseus_client_dispose(client);
  }
}

await main();
