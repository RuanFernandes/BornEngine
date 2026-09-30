import assert from 'node:assert/strict';
import test from 'node:test';
import type { Client } from '@colyseus/core';
import { SandboxRoom } from '../src/rooms/SandboxRoom.js';

interface FakeClient {
  sessionId: string;
  messages: { type: string; payload: unknown }[];
  send(type: string, payload: unknown): void;
}

interface InternalRoomHandlers {
  acceptInput(client: Client, payload: unknown): void;
  acceptClientScript(client: Client, payload: unknown): void;
  acceptRuleMessage(client: Client, payload: unknown): void;
  simulate(): void;
}

function fakeClient(sessionId: string): FakeClient {
  return {
    sessionId,
    messages: [],
    send(type, payload) { this.messages.push({ type, payload }); },
  };
}

function fixture() {
  const room = new SandboxRoom();
  const broadcasts: { type: string; payload: unknown }[] = [];
  Object.defineProperty(room, 'broadcast', {
    configurable: true,
    value(type: string, payload: unknown) { broadcasts.push({ type, payload }); },
  });
  return { room, handlers: room as unknown as InternalRoomHandlers, broadcasts };
}

test('assignsFirstPublisherAndTransfersOnLeave', () => {
  const { room, broadcasts } = fixture();
  const first = fakeClient('first');
  const second = fakeClient('second');
  Object.defineProperty(room, 'clients', { configurable: true, value: [first, second] });
  room.onJoin(first as unknown as Client, { name: 'Ada' });
  room.onJoin(second as unknown as Client, { name: 'Lin' });
  assert.equal(room.state.publisherSessionId, 'first');

  room.onLeave(first as unknown as Client);
  assert.equal(room.state.publisherSessionId, 'second');
  assert.ok(broadcasts.some((event) => event.type === 'publisherChanged' &&
    (event.payload as { sessionId: string }).sessionId === 'second'));
});

test('rejectsStaleAndRateLimitedScriptPublishes', () => {
  const { room, handlers, broadcasts } = fixture();
  const publisher = fakeClient('publisher');
  room.onJoin(publisher as unknown as Client);
  handlers.acceptClientScript(publisher as unknown as Client, { revision: 1, source: 'export default {};' });
  handlers.acceptClientScript(publisher as unknown as Client, { revision: 1, source: 'export default {};' });
  handlers.acceptClientScript(publisher as unknown as Client, { revision: 2, source: 'export default {};' });
  const results = publisher.messages.filter((message) => message.type === 'clientScriptResult');
  assert.deepEqual(results.map((message) => (message.payload as { reason: string }).reason), ['stale']);
  assert.equal(room.getClientScriptSnapshot().revision, 1);
  assert.ok(broadcasts.some((event) => event.type === 'clientScriptResult' &&
    (event.payload as { result: string }).result === 'accepted'));
});

test('rejectsInvalidAndOversizedScriptsWithoutAdvancingRoomRevision', async () => {
  const { room, handlers } = fixture();
  const publisher = fakeClient('publisher');
  room.onJoin(publisher as unknown as Client);
  handlers.acceptClientScript(publisher as unknown as Client, { revision: 1, source: 'export default {};' });
  await new Promise((resolve) => setTimeout(resolve, 510));

  handlers.acceptClientScript(publisher as unknown as Client, {
    revision: 2,
    source: 'export default { onStart(ctx: BornEngineScriptContext) { ctx.self.setPosition?.(1, 2, 0); } };',
  });
  await new Promise((resolve) => setTimeout(resolve, 510));
  handlers.acceptClientScript(publisher as unknown as Client, {
    revision: 2,
    source: `export default {};\n//${'x'.repeat(64 * 1024)}`,
  });

  const rejected = publisher.messages.filter((message) => message.type === 'clientScriptResult');
  assert.deepEqual(rejected.map((message) => (message.payload as { reason: string }).reason), [
    'invalid-script',
    'invalid-script',
  ]);
  assert.equal(room.getClientScriptSnapshot().revision, 1);
});

test('rateLimitsInvalidClientScriptCompilationAttempts', async () => {
  const { room, handlers } = fixture();
  const publisher = fakeClient('publisher');
  room.onJoin(publisher as unknown as Client);
  handlers.acceptClientScript(publisher as unknown as Client, {
    revision: 1,
    source: 'export default { onStart() { import("./other.js"); } };',
  });
  handlers.acceptClientScript(publisher as unknown as Client, {
    revision: 1,
    source: 'export default { onStart() { import("./other.js"); } };',
  });

  const rejected = publisher.messages.filter((message) => message.type === 'clientScriptResult');
  assert.deepEqual(rejected.map((message) => (message.payload as { reason: string }).reason), [
    'invalid-script',
  ]);
  assert.equal(room.getClientScriptSnapshot().revision, 0);

  await new Promise((resolve) => setTimeout(resolve, 510));
  handlers.acceptClientScript(publisher as unknown as Client, {
    revision: 1,
    source: 'export default { onStart() { import("./other.js"); } };',
  });
  assert.deepEqual(
    publisher.messages.filter((message) => message.type === 'clientScriptResult')
      .map((message) => (message.payload as { reason: string }).reason),
    ['invalid-script', 'invalid-script'],
  );
});

test('rejectsRevisionJumpsWithoutLockingRoomPublishing', () => {
  const { room, handlers, broadcasts } = fixture();
  const publisher = fakeClient('publisher');
  room.onJoin(publisher as unknown as Client);
  handlers.acceptClientScript(publisher as unknown as Client, {
    revision: Number.MAX_SAFE_INTEGER,
    source: 'export default {};',
  });
  handlers.acceptClientScript(publisher as unknown as Client, {
    revision: 1,
    source: 'export default {};',
  });

  const rejections = publisher.messages.filter((message) => message.type === 'clientScriptResult');
  assert.deepEqual(rejections.map((message) => (message.payload as { reason: string }).reason), [
    'revision-gap',
  ]);
  assert.ok(broadcasts.some((event) => event.type === 'clientScriptResult' &&
    (event.payload as { result: string }).result === 'accepted'));
  assert.equal(room.getClientScriptSnapshot().revision, 1);
});

test('includesCurrentRevisionInPublisherOnlyAndMalformedRejections', () => {
  const { room, handlers } = fixture();
  const publisher = fakeClient('publisher');
  const otherPlayer = fakeClient('other');
  room.onJoin(publisher as unknown as Client);
  room.onJoin(otherPlayer as unknown as Client);

  handlers.acceptClientScript(otherPlayer as unknown as Client, { revision: 1, source: 'export default {};' });
  handlers.acceptClientScript(publisher as unknown as Client, { revision: 0, source: 'export default {};' });

  const rejected = [...publisher.messages, ...otherPlayer.messages]
    .filter((message) => message.type === 'clientScriptResult' &&
      (message.payload as { result?: string }).result === 'rejected');
  assert.equal(rejected.length, 2);
  assert.deepEqual(rejected.map((message) => (message.payload as { currentRevision: number }).currentRevision), [0, 0]);
});

test('rateLimitsRuleMessagesPerPlayer', () => {
  const { room, handlers } = fixture();
  const player = fakeClient('player');
  let hookCalls = 0;
  room.onJoin(player as unknown as Client);
  room.replaceRules({ onMessage: () => { hookCalls++; } });
  const message = { event: 'game:ping', payload: { value: 1 } };

  handlers.acceptRuleMessage(player as unknown as Client, message);
  handlers.acceptRuleMessage(player as unknown as Client, message);

  assert.equal(hookCalls, 1);
  assert.deepEqual(player.messages.at(-1), {
    type: 'ruleMessageRejected',
    payload: { reason: 'rate-limit' },
  });
});

test('broadcastsAcceptedRevisionToJoiners', () => {
  const { room, handlers, broadcasts } = fixture();
  const publisher = fakeClient('publisher');
  const joining = fakeClient('joining');
  room.onJoin(publisher as unknown as Client);
  handlers.acceptClientScript(publisher as unknown as Client, {
    revision: 1,
    source: 'export default { onStart(ctx: BornEngineScriptContext) { ctx.log?.("hello"); } } satisfies BornEngineScriptBehavior;',
  });
  room.onJoin(joining as unknown as Client);

  const snapshot = joining.messages.find((message) => message.type === 'clientScriptSnapshot');
  assert.deepEqual(snapshot?.payload, room.getClientScriptSnapshot());
  assert.equal(room.getClientScriptSnapshot().revision, 1);
  assert.ok(room.getClientScriptSnapshot().javascript.includes('export default'));
  assert.ok(broadcasts.some((event) => event.type === 'clientScriptSnapshot'));
});

test('rejectsClientPositionWritesAndKeepsCanonicalMovementServerOwned', () => {
  const { room, handlers } = fixture();
  const player = fakeClient('player');
  room.onJoin(player as unknown as Client);
  const initial = room.state.players.get('player')!;
  const initialX = initial.x;
  handlers.acceptInput(player as unknown as Client, {
    sequence: 1, x: 1, y: 0, position: { x: 930, y: 40 },
  });
  assert.equal(player.messages.at(-1)?.type, 'inputRejected');
  assert.equal(initial.x, initialX);

  handlers.acceptInput(player as unknown as Client, { sequence: 1, x: 4, y: 0 });
  assert.equal(player.messages.at(-1)?.type, 'inputRejected');
  handlers.acceptInput(player as unknown as Client, { sequence: 1, x: 1, y: 0 });
  handlers.simulate();
  assert.ok(initial.x > initialX);
});

test('boundsAndRateLimitsInput', () => {
  const { room, handlers } = fixture();
  const player = fakeClient('player');
  room.onJoin(player as unknown as Client);
  handlers.acceptInput(player as unknown as Client, { sequence: 0, x: 1, y: 1 });
  assert.equal(player.messages.at(-1)?.type, 'inputAccepted');
  handlers.acceptInput(player as unknown as Client, { sequence: 1, x: 1, y: 0 });
  assert.equal((player.messages.at(-1)?.payload as { reason: string }).reason, 'rate-limit');
});

test('limitsRepeatedRejectionResponsesPerPlayer', async () => {
  const { room, handlers } = fixture();
  const player = fakeClient('player');
  room.onJoin(player as unknown as Client);

  for (let attempt = 0; attempt < 12; attempt++) {
    handlers.acceptInput(player as unknown as Client, {
      sequence: attempt,
      x: 1,
      y: 0,
      position: { x: 900, y: 20 },
    });
  }

  const firstWindow = player.messages.filter((message) => message.type === 'inputRejected');
  assert.equal(firstWindow.length, 1);
  assert.equal((firstWindow[0].payload as { reason: string }).reason, 'malformed');

  handlers.acceptClientScript(player as unknown as Client, {
    revision: 1,
    source: 'export default { onStart() { import("./other.js"); } };',
  });
  assert.deepEqual(
    player.messages.filter((message) => message.type === 'clientScriptResult')
      .map((message) => (message.payload as { reason: string }).reason),
    ['invalid-script'],
  );

  await new Promise((resolve) => setTimeout(resolve, 260));
  handlers.acceptInput(player as unknown as Client, {
    sequence: 20,
    x: 1,
    y: 0,
    position: { x: 900, y: 20 },
  });
  assert.equal(player.messages.filter((message) => message.type === 'inputRejected').length, 2);
});
