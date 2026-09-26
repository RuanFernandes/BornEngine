import test from 'node:test';
import assert from 'node:assert/strict';
import { createColyseusBridge } from '../colyseus_bridge.js';

class Signal {
  callbacks = new Set();
  on(callback) {
    this.callbacks.add(callback);
    return () => this.callbacks.delete(callback);
  }
  emit(...args) {
    for (const callback of [...this.callbacks]) callback(...args);
  }
  clear() { this.callbacks.clear(); }
}

class FakeRoom {
  roomId = 'room-id';
  sessionId = 'session-id';
  reconnectionToken = 'resume-token';
  state = { players: { p1: { x: 3 } } };
  onStateChange = new Signal();
  onError = new Signal();
  onLeave = new Signal();
  onReconnect = new Signal();
  onDrop = new Signal();
  messageCallback = null;
  sent = [];
  left = [];
  removedListeners = false;
  onMessage(type, callback) {
    assert.equal(type, '*');
    this.messageCallback = callback;
    return () => { this.messageCallback = null; };
  }
  send(type, payload) { this.sent.push({ type, payload }); }
  sendBytes(type, bytes) { this.sent.push({ type, bytes }); }
  request(type, payload, options) {
    this.requestCall = { type, payload, options };
    return this.requestPromise;
  }
  leave(consented) {
    this.left.push(consented);
    this.onLeave.emit(consented ? 1000 : 4000, 'left');
    return Promise.resolve(1000);
  }
  removeAllListeners() { this.removedListeners = true; }
}

class FakeClient {
  static instances = [];
  constructor(endpoint) {
    if (!endpoint.startsWith('ws://') && !endpoint.startsWith('wss://')
        && !endpoint.startsWith('http://') && !endpoint.startsWith('https://')) {
      throw new Error('invalid endpoint');
    }
    this.endpoint = endpoint;
    this.calls = [];
    FakeClient.instances.push(this);
  }
  call(method, ...args) {
    this.calls.push({ method, args });
    if (this.rejectNext) {
      const error = this.rejectNext;
      this.rejectNext = null;
      return Promise.reject(error);
    }
    return Promise.resolve(this.nextRoom);
  }
  joinOrCreate(...args) { return this.call('joinOrCreate', ...args); }
  create(...args) { return this.call('create', ...args); }
  join(...args) { return this.call('join', ...args); }
  joinById(...args) { return this.call('joinById', ...args); }
  reconnect(...args) { return this.call('reconnect', ...args); }
}

function createHarness() {
  FakeClient.instances = [];
  const bridge = createColyseusBridge({ Client: FakeClient });
  const client = bridge.bloom_colyseus_client_create('ws://localhost:2567');
  const fakeClient = FakeClient.instances[0];
  const room = new FakeRoom();
  fakeClient.nextRoom = room;
  const roomHandle = bridge.bloom_colyseus_client_join(client, 0, 'test_room', '{"seed":7}');
  return { bridge, client, fakeClient, room, roomHandle };
}

function drain(bridge) {
  bridge.bloom_colyseus_poll();
  const events = [];
  for (;;) {
    const encoded = bridge.bloom_colyseus_next_event();
    if (!encoded) return events;
    events.push(JSON.parse(encoded));
  }
}

test('client methods map to the official matchmaking methods and queue join snapshots', async () => {
  const { bridge, client, fakeClient, room, roomHandle } = createHarness();
  await Promise.resolve();
  const joinEvent = drain(bridge).find((event) => event.kind === 'join');
  assert.deepEqual(fakeClient.calls[0], { method: 'joinOrCreate', args: ['test_room', { seed: 7 }] });
  assert.equal(joinEvent.room, roomHandle);
  assert.equal(joinEvent.roomId, room.roomId);
  assert.deepEqual(joinEvent.state, room.state);
  assert.equal(bridge.bloom_colyseus_room_id(roomHandle), 'room-id');
  assert.equal(bridge.bloom_colyseus_room_session_id(roomHandle), 'session-id');
  assert.equal(bridge.bloom_colyseus_room_reconnection_token(roomHandle), 'resume-token');
  bridge.bloom_colyseus_client_dispose(client);
  assert.deepEqual(room.left, [true]);
  assert.equal(room.removedListeners, true);
});

test('state, message, drop, reconnect and leave callbacks retain order and message types', async () => {
  const { bridge, room, roomHandle } = createHarness();
  await Promise.resolve();
  drain(bridge);
  room.state = { players: { p1: { x: 4 } } };
  room.onStateChange.emit(room.state);
  room.messageCallback(17, { ok: true });
  room.onDrop.emit(1006, 'network loss');
  room.onReconnect.emit();
  room.onLeave.emit(1000, 'done');
  assert.deepEqual(drain(bridge), [
    { kind: 'state', room: roomHandle, state: room.state },
    { kind: 'message', room: roomHandle, type: 'i17', data: { ok: true } },
    { kind: 'drop', room: roomHandle, code: 1006, reason: 'network loss' },
    { kind: 'reconnect', room: roomHandle },
    { kind: 'leave', room: roomHandle, code: 1000, reason: 'done' },
  ]);
  assert.equal(bridge.bloom_colyseus_room_is_connected(roomHandle), 0);
  assert.equal(bridge.bloom_colyseus_room_is_reconnecting(roomHandle), 0);
});

test('messages and bytes use the SDK numeric type and Uint8Array forms', async () => {
  const { bridge, room, roomHandle, fakeClient } = createHarness();
  await Promise.resolve();
  drain(bridge);
  bridge.bloom_colyseus_room_send(roomHandle, 'i17', '{"x":2}');
  bridge.bloom_colyseus_room_send_bytes(roomHandle, 'binary', '[0,255,4]');
  assert.deepEqual(room.sent[0], { type: 17, payload: { x: 2 } });
  assert.equal(room.sent[1].type, 'binary');
  assert.ok(room.sent[1].bytes instanceof Uint8Array);
  assert.deepEqual(Array.from(room.sent[1].bytes), [0, 255, 4]);
  assert.equal(bridge.bloom_colyseus_client_join(1, 4, 'token', '{}') > 0, true);
});

test('request replies, rejection reasons, cancellation and matchmaking errors are queued', async () => {
  const { bridge, client, fakeClient, room, roomHandle } = createHarness();
  await Promise.resolve();
  drain(bridge);
  let resolveRequest;
  room.requestPromise = new Promise((resolve) => { resolveRequest = resolve; });
  const request = bridge.bloom_colyseus_room_request(roomHandle, 'sum', '{"a":2}');
  assert.deepEqual(room.requestCall, { type: 'sum', payload: { a: 2 }, options: undefined });
  resolveRequest({ total: 5 });
  await Promise.resolve();
  assert.deepEqual(drain(bridge), [{ kind: 'request', room: roomHandle, request, outcome: 0, data: { total: 5 }, reason: '' }]);

  room.requestPromise = Promise.reject(Object.assign(new Error('full'), { name: 'rejected', reason: { code: 'FULL' } }));
  const rejected = bridge.bloom_colyseus_room_request(roomHandle, 'join', '{}');
  await Promise.resolve();
  assert.deepEqual(drain(bridge), [{ kind: 'request', room: roomHandle, request: rejected, outcome: 1, data: { code: 'FULL' }, reason: 'full' }]);

  room.requestPromise = new Promise(() => {});
  const cancelled = bridge.bloom_colyseus_room_request(roomHandle, 'wait', '{}');
  bridge.bloom_colyseus_room_cancel_request(roomHandle, cancelled);
  assert.deepEqual(drain(bridge), []);

  fakeClient.rejectNext = Object.assign(new Error('room unavailable'), { code: 4210 });
  const failed = bridge.bloom_colyseus_client_join(client, 0, 'bad', '{}');
  await Promise.resolve();
  assert.deepEqual(drain(bridge), [{ kind: 'error', room: failed, code: 4210, message: 'room unavailable' }]);
});

test('all five matchmaking operations and invalid payloads have explicit outcomes', async () => {
  const { bridge, client, fakeClient, room } = createHarness();
  let lastRoomHandle = 0;
  for (const [method, expected] of [[1, 'create'], [2, 'join'], [3, 'joinById'], [4, 'reconnect']]) {
    const target = method === 4 ? 'resume' : `target-${method}`;
    lastRoomHandle = bridge.bloom_colyseus_client_join(client, method, target, '{}');
    await Promise.resolve();
    drain(bridge);
    assert.equal(fakeClient.calls.at(-1).method, expected);
  }
  bridge.bloom_colyseus_room_send(lastRoomHandle, 'chat', '{');
  const error = drain(bridge)[0];
  assert.equal(error.kind, 'error');
  assert.equal(error.room, lastRoomHandle);
  assert.equal(error.code, -1);
  assert.match(error.message, /Invalid Colyseus message JSON/);
  assert.equal(bridge.bloom_colyseus_client_create('not a URL'), 0);
});
