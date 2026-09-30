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
  Object.defineProperty(room, 'broadcast', {
    configurable: true,
    value() {},
  });
  return { room, handlers: room as unknown as InternalRoomHandlers };
}

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

  await new Promise((resolve) => setTimeout(resolve, 260));
  handlers.acceptInput(player as unknown as Client, {
    sequence: 20,
    x: 1,
    y: 0,
    position: { x: 900, y: 20 },
  });
  assert.equal(player.messages.filter((message) => message.type === 'inputRejected').length, 2);
});
