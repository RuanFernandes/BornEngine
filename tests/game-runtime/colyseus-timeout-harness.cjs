const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { stripTypeScriptTypes } = require('node:module');

const root = path.resolve(__dirname, '../..');
const source = fs.readFileSync(path.join(root, 'src/colyseus/index.ts'), 'utf8');
const events = [];
const cancelled = [];
let nextClient = 1;
let nextRoom = 1;
let nextRequest = 1;

class TestContext {
  constructor() {
    this.isReady = true;
    this.isDisposed = false;
    this.resources = new Set();
    this.services = new Map();
  }
  register(resource) { this.resources.add(resource); return true; }
  unregister(resource) { this.resources.delete(resource); }
  owns(resource) { return this.resources.has(resource); }
  registerFrameService() {}
  unregisterFrameService() {}
  getOrCreateService(key, create) {
    if (!this.services.has(key)) this.services.set(key, create());
    return this.services.get(key);
  }
  removeService(key, service) {
    if (this.services.get(key) === service) this.services.delete(key);
  }
}

const context = new TestContext();
const sandbox = {
  getGameContext: () => context,
  bloom_colyseus_client_create: () => nextClient++,
  bloom_colyseus_client_join: () => nextRoom++,
  bloom_colyseus_client_dispose: () => {},
  bloom_colyseus_poll: () => {},
  bloom_colyseus_has_event: () => events.length,
  bloom_colyseus_next_event: () => JSON.stringify(events.shift()),
  bloom_colyseus_room_request: () => nextRequest++,
  bloom_colyseus_room_cancel_request: (_room, request) => cancelled.push(request),
  bloom_colyseus_room_is_connected: () => 1,
  bloom_colyseus_room_id: () => 'test-room',
  bloom_colyseus_room_session_id: () => 'test-session',
  bloom_colyseus_room_reconnection_token: () => 'test-token',
  console,
};

const code = stripTypeScriptTypes(source
  .replace('constructor(readonly value: number) {}', 'constructor(value: number) { this.value = value; }')
  .replace('constructor(private readonly context: GameContext) {', 'constructor(context: GameContext) { this.context = context;')
  .replace('constructor(owner: Game, readonly endpoint: string) {', 'constructor(owner: Game, endpoint: string) { this.endpoint = endpoint;')
  .replace(/^import[^\n]*\n/gm, '')
  .replace(/^export /gm, ''), { mode: 'strip' });
vm.runInNewContext(code + '\nthis.ColyseusClient = ColyseusClient;', sandbox, { filename: 'colyseus/index.ts' });

function joinedClient() {
  const client = new sandbox.ColyseusClient({}, 'ws://127.0.0.1:2567');
  let room;
  assert.equal(client.joinOrCreateWithCallbacks('test_room', {}, {
    onJoin: (joined) => { room = joined; },
    onError: (error) => { throw error; },
  }), true);
  events.push({ kind: 'join', room: nextRoom - 1 });
  client.poll();
  assert.ok(room);
  return { client, room };
}

function startDelayedRequest(room, onError) {
  assert.equal(room.requestWithCallbacks('request_delay', { delayMs: 500 }, {
    onSuccess: () => assert.fail('Delayed request unexpectedly succeeded'),
    onError,
  }, { timeout: 0 }), true);
}

{
  const { client, room } = joinedClient();
  const outcomes = [];
  startDelayedRequest(room, (error) => outcomes.push(['older', error.message]));
  startDelayedRequest(room, (error) => {
    outcomes.push(['newer', error.message]);
    client.dispose();
  });
  client.poll();
  assert.deepEqual(outcomes, [
    ['newer', 'Colyseus request timed out'],
    ['older', 'Colyseus room was disposed'],
  ]);
}

{
  const { client, room } = joinedClient();
  const outcomes = [];
  startDelayedRequest(room, (error) => outcomes.push(['older', error.message]));
  startDelayedRequest(room, (error) => {
    outcomes.push(['newer', error.message]);
    room.poll();
  });
  client.poll();
  assert.deepEqual(outcomes, [
    ['newer', 'Colyseus request timed out'],
    ['older', 'Colyseus request timed out'],
  ]);
  client.dispose();
}

assert.equal(cancelled.length, 4);
assert.equal(new Set(cancelled).size, 4);
console.log('Colyseus reentrant timeout smoke passed');
