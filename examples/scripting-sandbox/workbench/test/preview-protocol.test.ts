import assert from 'node:assert/strict';
import test from 'node:test';
import { createPreviewBridge } from '../src/preview/frame-bridge.js';
import {
  isCurrentRoomCallback,
  PreviewRevisionGate,
  isPreviewRequest,
  isPreviewResponse,
} from '../src/preview/protocol.js';

const validRequests = [
  { type: 'preview:apply-client-script', revision: 1, javascript: 'export default {};' },
  { type: 'preview:publish-client-script', revision: 1, source: 'export default {};' },
  { type: 'preview:connect-room', endpoint: 'ws://127.0.0.1:2568', roomName: 'sandbox' },
  { type: 'preview:disconnect-room' },
];

test('acceptsValidApplyPublishAndRoomRequests', () => {
  for (const request of validRequests) assert.equal(isPreviewRequest(request), true);
  assert.equal(isPreviewResponse({ type: 'preview:ready', protocol: 1 }), true);
  assert.equal(isPreviewResponse({ type: 'preview:script-result', revision: 1, result: 'applied' }), true);
});

test('rejectsUnknownFieldsAndMalformedPayloads', () => {
  assert.equal(isPreviewRequest({ ...validRequests[0], origin: '*' }), false);
  assert.equal(isPreviewRequest({ type: 'preview:apply-client-script', revision: -1, javascript: '' }), false);
  assert.equal(isPreviewRequest({ type: 'preview:connect-room', endpoint: 'file:///etc/passwd', roomName: 'sandbox' }), false);
  assert.equal(isPreviewResponse({ type: 'preview:status', status: 'unexpected', extra: true }), false);
});

test('rejectsOversizedUtf8Source', () => {
  const source = '😀'.repeat(16_385);
  assert.equal(new TextEncoder().encode(source).byteLength > 64 * 1024, true);
  assert.equal(isPreviewRequest({ type: 'preview:publish-client-script', revision: 1, source }), false);
});

test('rejectsStaleRevision', () => {
  const gate = new PreviewRevisionGate();
  assert.equal(gate.accept(1), true);
  assert.equal(gate.accept(1), false);
  assert.equal(gate.accept(0), false);
  assert.equal(gate.accept(2), true);
});

test('resetsRoomScriptRevisionWhenSwitchingRooms', () => {
  const gate = new PreviewRevisionGate();
  gate.accept(18);
  (gate as unknown as { reset(revision: number): void }).reset(0);

  assert.equal(gate.revision, 0);
  assert.equal(gate.accept(1), true);
});

test('ignoresCallbacksFromAReplacedRoom', () => {
  const previousRoom = {};
  const activeRoom = {};
  assert.equal(isCurrentRoomCallback(4, 5, previousRoom, activeRoom), false);
  assert.equal(isCurrentRoomCallback(5, 5, previousRoom, activeRoom), false);
  assert.equal(isCurrentRoomCallback(5, 5, activeRoom, activeRoom), true);
});

test('requiresExactFrameAndOrigin', () => {
  const listeners = new Set<(event: MessageEvent) => void>();
  const hostWindow = {
    addEventListener: (_type: string, listener: (event: MessageEvent) => void) => listeners.add(listener),
    removeEventListener: (_type: string, listener: (event: MessageEvent) => void) => listeners.delete(listener),
  } as unknown as Window;
  const frameWindow = { postMessage: () => undefined } as unknown as Window;
  const frame = { contentWindow: frameWindow } as HTMLIFrameElement;
  const received: unknown[] = [];
  const bridge = createPreviewBridge(frame, 'http://localhost:4173', hostWindow, (message) => received.push(message));

  const dispatch = (source: MessageEventSource | null, origin: string) => {
    const event = { source, origin, data: { type: 'preview:ready', protocol: 1 } } as MessageEvent;
    for (const listener of listeners) listener(event);
  };

  dispatch(frameWindow, 'https://attacker.example');
  dispatch({} as Window, 'http://localhost:4173');
  assert.deepEqual(received, []);
  dispatch(frameWindow, 'http://localhost:4173');
  assert.deepEqual(received, [{ type: 'preview:ready', protocol: 1 }]);
  bridge.dispose();
  assert.equal(listeners.size, 0);
});
