---
title: Colyseus
description: Connect BornEngine games to Colyseus multiplayer rooms through native and Web client bridges.
section: API / Networking
order: 44
---

BornEngine's `@bornengine/engine/colyseus` module gives TypeScript games one Colyseus room API across native targets and WebAssembly. Native builds link the [Colyseus Native SDK](https://github.com/colyseus/native-sdk); Web builds bundle the official `@colyseus/sdk` package. Both backends use the Colyseus room protocol and MsgPack message encoding.

The BornEngine API is a focused cross-platform façade, not a method-for-method implementation of every Colyseus SDK. It covers matchmaking, room state snapshots, string/numeric and binary messages, request/reply, lifecycle events, polling, explicit reconnection, and cleanup.

## Verified platform matrix

The table distinguishes SDK archive creation and engine linking from running the protocol smoke test against the repository's Colyseus server fixture. `Pending` means the available GitHub-hosted runner cannot execute that runtime target; it is not a support claim.

| Platform | Rust target(s) | Backend | Build | Runtime smoke | Network setup |
| --- | --- | --- | --- | --- | --- |
| Linux | `x86_64-unknown-linux-gnu`, `aarch64-unknown-linux-gnu` | Native SDK C | Passed | Passed on x86_64 and ARM64 | No extra app permission |
| macOS | `x86_64-apple-darwin`, `aarch64-apple-darwin` | Native SDK C | Passed | Passed on Apple Silicon; Intel runtime not tested | App Sandbox requires outgoing network client entitlement |
| Windows | `x86_64-pc-windows-msvc` | Native SDK C | Passed | Passed on x86_64 | No extra app permission |
| Android | `aarch64-linux-android`, `x86_64-linux-android` | Native SDK C | Passed: archive build and engine link for both ABIs | Passed on x86_64 API 35 emulator; ARM64 emulator smoke unavailable (`HVF_UNSUPPORTED`); physical-device runtime not tested | Add `android.permission.INTERNET` to the final app manifest |
| iOS | `aarch64-apple-ios`, `aarch64-apple-ios-sim`, `x86_64-apple-ios` | Native SDK C | Passed | Passed on ARM64 simulator; device and Intel simulator runtime not tested | Local-LAN access requires `NSLocalNetworkUsageDescription` and user approval |
| tvOS | `aarch64-apple-tvos`, `aarch64-apple-tvos-sim` | Native SDK C | Passed | Passed on simulator | No local-network privacy prompt on tvOS |
| visionOS | `aarch64-apple-visionos`, `aarch64-apple-visionos-sim` | Native SDK C | Passed | Passed on simulator | Local-LAN access requires `NSLocalNetworkUsageDescription` and user approval |
| watchOS | `aarch64-apple-watchos`, `aarch64-apple-watchos-sim` | Native SDK C with target-local FFI | Passed | Passed on watchOS simulator; device runtime not tested | Device runtime checks are pending |
| Web/WASM | `wasm32-unknown-unknown` | Official TypeScript SDK bundle | Passed | Passed against the fixture under Node.js; browser UI runtime not tested | Serve the generated package over HTTP or HTTPS |

For Android manifest, Apple sandbox, and Apple Local Network privacy details, see the [mobile](../../platforms/mobile/) and [Apple platform](../../platforms/apple/) guides. The Android ARM64 SDK archive builds and links successfully. CI skips its emulator smoke because the current GitHub-hosted macOS runner cannot initialize the ARM64 Android emulator (`HVF_UNSUPPORTED`); runtime on a physical Android ARM64 device remains unverified. Runtime results apply to the listed simulator, emulator, or host smoke environment and do not imply physical-device testing.

## Connect and join

Create a client with your server URL, then use one of the room matchmaking methods. Room join is asynchronous; the native callbacks are processed when the engine pumps frames.

```ts
import { ColyseusClient, type Room } from '@bornengine/engine/colyseus';

const client = new ColyseusClient('ws://localhost:2567');
const join = client.joinOrCreate<{ counter: number }>('battle', {
  name: 'Player One',
});

const result: { room?: Room<{ counter: number }>; error?: Error } = {};
join.then((value) => { result.room = value; }, (error) => { result.error = error; });

// If the engine loop has not started yet, pump callbacks until matchmaking completes.
const deadline = Date.now() + 10_000;
while (result.room === undefined && result.error === undefined && Date.now() < deadline) {
  client.poll();
  await new Promise<void>((resolve) => setTimeout(resolve, 5));
}
if (result.error !== undefined) throw result.error;
const room = result.room;
if (room === undefined) throw new Error('Timed out joining Colyseus room');

console.log(room.roomId, room.sessionId);
console.log('initial counter:', room.state?.counter);
```

`joinOrCreate`, `create`, `join`, `joinById`, and `reconnect` return `Promise<Room<TState>>`. Pass room join options as a plain object. Both `ws://` and `wss://` endpoints are accepted; ports default to `2567` and `443` respectively. The façade uses the scheme, host, and port; custom endpoint paths, query parameters, and the SDK's auth/HTTP helpers are not exposed yet.

When using `runGame()` or the normal frame loop, `beginDrawing()` automatically calls `pumpColyseusClients()`. The sample above shows manual polling for a join that happens before the game loop starts. If a host drives a custom loop, call `client.poll()` or the room's `poll()` while waiting for room events:

```ts
const pending = client.joinOrCreate('battle');
while (!windowShouldClose()) {
  client.poll();
  // Continue the host's frame work.
}
```

## State and messages

The room exposes the latest decoded state snapshot through `room.state`. `onStateChange` runs when the server synchronizes state. The current bridge converts supported Colyseus schema values to ordinary TypeScript objects; it does not expose the JavaScript SDK's schema instances or fine-grained `Callbacks` API.

```ts
room.onStateChange((state) => {
  console.log('counter:', state.counter);
});

room.onMessage('player-moved', (message: { x: number; y: number }) => {
  console.log(message.x, message.y);
});

room.send('move', { x: 12, y: 4 });
room.send(0, { jump: true });
```

`send()` serializes JSON-compatible values for the Native SDK's MsgPack encoder. Numeric and string message types are supported. `sendBytes()` accepts a `Uint8Array` or `number[]` and sends raw bytes. `onMessageAny()` receives every message together with its type. Listener registration methods return a function that removes that listener.

## Request and response

Use `request()` when the server's message handler returns a value or rejection:

```ts
try {
  const profile = await room.request<{ displayName: string }>(
    'get-profile',
    { userId: 42 },
    { timeout: 5_000 },
  );
  console.log(profile.displayName);
} catch (error) {
  console.error('request failed', error);
}
```

The timeout defaults to 10 seconds. Rejected server requests become errors with `name === 'rejected'` and a `reason` field. Callbacks are delivered by the same poll mechanism as room events.

## Connection lifecycle and cleanup

Use lifecycle listeners to react to drops, reconnections, errors, and leaving a room. `reconnectionToken` can be passed to `client.reconnect()` when the application chooses to reconnect explicitly.

```ts
room.onDrop((code, reason) => console.log('connection dropped', code, reason));
room.onReconnect(() => console.log('reconnected'));
room.onError((error) => console.error(error));
room.onLeave((code, reason) => console.log('left room', code, reason));

await room.leave();
client.dispose();
```

Dispose each client when its owner is finished. A scene or game shutdown hook is a good place to leave its room and dispose its client.

## Current surface and limits

The BornEngine façade exposes matchmaking, basic message send/receive, binary send, request/reply, room state snapshots, lifecycle events, polling, and explicit reconnection. It does not currently expose Colyseus Auth/HTTP utilities, schema change callbacks, input channels, prediction/reconciliation helpers, latency measurement, or every setting from the C SDK.

For protocol details and the complete SDK reference, see the official [Client SDK](https://docs.colyseus.io/sdk), [State Synchronization](https://docs.colyseus.io/state), and [Connection Lifecycle](https://docs.colyseus.io/sdk/connection) documentation.
