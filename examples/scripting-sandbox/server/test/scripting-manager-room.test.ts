import assert from 'node:assert/strict';
import test from 'node:test';
import type { Client } from '@colyseus/core';
import { ScriptingManagerRoom } from '../src/rooms/ScriptingManagerRoom.js';

interface FakeClient {
  sessionId: string;
  messages: { type: string; payload: unknown }[];
  send(type: string, payload: unknown): void;
}

type Handler = (client: Client, payload?: unknown) => void;

function fakeClient(sessionId: string): FakeClient {
  return {
    sessionId,
    messages: [],
    send(type, payload) { this.messages.push({ type, payload }); },
  };
}

function fixture() {
  const room = new ScriptingManagerRoom();
  const handlers = new Map<string, Handler>();
  const broadcasts: { type: string; payload: unknown }[] = [];
  Object.defineProperty(room, 'onMessage', {
    configurable: true,
    value(type: string, handler: Handler) { handlers.set(type, handler); },
  });
  Object.defineProperty(room, 'broadcast', {
    configurable: true,
    value(type: string, payload: unknown) { broadcasts.push({ type, payload }); },
  });
  room.onCreate();
  return { room, handlers, broadcasts };
}

function invoke(handlers: Map<string, Handler>, type: string, client: FakeClient, payload?: unknown): void {
  const handler = handlers.get(type);
  assert.ok(handler, `Expected ${type} to be registered.`);
  handler(client as unknown as Client, payload);
}

const validScript = `export default {
  update(_context: BornEngineScriptContext, _deltaTime: number) {},
} satisfies BornEngineScriptBehavior;`;

test('joins receive latest snapshot and may explicitly request it', () => {
  const { room, handlers } = fixture();
  const client = fakeClient('editor');

  room.onJoin(client as unknown as Client);
  assert.deepEqual(client.messages.at(-1), {
    type: 'clientScriptSnapshot',
    payload: { revision: 0, source: '', javascript: '' },
  });

  invoke(handlers, 'requestClientScriptSnapshot', client, {});
  assert.equal(client.messages.at(-1)?.type, 'clientScriptSnapshot');
});

test('accepts sequential publishes from any client and broadcasts the compiled revision', () => {
  const { room, handlers, broadcasts } = fixture();
  const first = fakeClient('first');
  const second = fakeClient('second');

  invoke(handlers, 'publishClientScript', first, { baseRevision: 0, source: validScript });
  invoke(handlers, 'publishClientScript', second, { baseRevision: 1, source: validScript });

  assert.deepEqual(first.messages.at(-1), {
    type: 'clientScriptResult',
    payload: { result: 'accepted', revision: 1 },
  });
  assert.deepEqual(second.messages.at(-1), {
    type: 'clientScriptResult',
    payload: { result: 'accepted', revision: 2 },
  });
  assert.deepEqual(broadcasts.map(({ type }) => type), ['clientScriptReload', 'clientScriptReload']);
  assert.equal(room.getClientScriptSnapshot().revision, 2);
  assert.equal(room.getClientScriptSnapshot().source, validScript);
  assert.match(room.getClientScriptSnapshot().javascript, /export default/);
});

test('rejects invalid and oversized scripts without replacing or broadcasting the accepted snapshot', () => {
  const { room, handlers, broadcasts } = fixture();
  const editor = fakeClient('editor');
  invoke(handlers, 'publishClientScript', editor, { baseRevision: 0, source: validScript });
  const snapshot = room.getClientScriptSnapshot();
  broadcasts.length = 0;

  invoke(handlers, 'publishClientScript', editor, {
    baseRevision: 1,
    source: 'export default { update(context: BornEngineScriptContext) { context.self.setPosition?.(0, 0, 0); } };',
  });
  invoke(handlers, 'publishClientScript', editor, {
    baseRevision: 1,
    source: `export default {};\n//${'x'.repeat(64 * 1024)}`,
  });

  assert.equal(room.getClientScriptSnapshot().revision, snapshot.revision);
  assert.equal(room.getClientScriptSnapshot().source, snapshot.source);
  assert.equal(broadcasts.length, 0);
  const results = editor.messages.filter((message) => message.type === 'clientScriptResult');
  assert.equal(results.filter((message) => (message.payload as { result: string }).result === 'rejected').length, 2);
  assert.ok(results.slice(-2).every((message) =>
    (message.payload as { diagnostics?: string[] }).diagnostics?.length,
  ));
});

test('rejects malformed and stale publishes with the current revision', () => {
  const { room, handlers, broadcasts } = fixture();
  const first = fakeClient('first');
  const stale = fakeClient('stale');
  invoke(handlers, 'publishClientScript', first, { baseRevision: 0, source: validScript });
  broadcasts.length = 0;

  invoke(handlers, 'publishClientScript', stale, { baseRevision: 0, source: validScript });
  invoke(handlers, 'publishClientScript', stale, { baseRevision: -1, source: validScript });

  assert.deepEqual(stale.messages.map(({ payload }) => payload), [
    { result: 'rejected', currentRevision: 1, reason: 'stale-revision' },
    { result: 'rejected', currentRevision: 1, reason: 'malformed' },
  ]);
  assert.equal(room.getClientScriptSnapshot().revision, 1);
  assert.equal(broadcasts.length, 0);
});
