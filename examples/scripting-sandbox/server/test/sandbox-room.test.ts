import assert from 'node:assert/strict';
import test from 'node:test';
import type { Client } from '@colyseus/core';
import { MovementInputThrottle } from '../src/protocol.js';
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

test('acceptsAStopInputAfterUnevenClientFrames', () => {
  const { room, handlers } = fixture();
  const player = fakeClient('player');
  room.onJoin(player as unknown as Client);
  const initialX = room.state.players.get('player')!.x;
  const throttle = new MovementInputThrottle();
  const originalNow = Date.now;
  let now = 1_000;
  let sequence = 0;
  Date.now = () => now;

  const update = (delta: number, x: number, y: number): boolean => {
    now += delta * 1_000;
    if (!throttle.update(delta, { x, y })) return false;
    handlers.acceptInput(player as unknown as Client, { sequence: sequence++, x, y });
    return true;
  };

  try {
    assert.equal(update(0.049, 1, 0), false);
    assert.equal(update(0.040, 1, 0), true);
    assert.equal(player.messages.at(-1)?.type, 'inputAccepted');
    handlers.simulate();
    const movedX = room.state.players.get('player')!.x;
    assert.ok(movedX > initialX);

    assert.equal(update(0.012, 0, 0), false);
    assert.equal(update(0.050, 0, 0), true);
    assert.equal(player.messages.at(-1)?.type, 'inputAccepted');
    handlers.simulate();
    assert.equal(room.state.players.get('player')!.x, movedX);
  } finally {
    Date.now = originalNow;
  }
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
