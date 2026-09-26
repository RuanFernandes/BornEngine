---
title: Colyseus
description: Connect a game-owned Colyseus client to a room and manage its lifetime.
section: API / Colyseus
order: 37
---

A ColyseusClient belongs to one Game. Game.run polls networking callbacks automatically; custom embedded hosts can drive `runFrame()` or call `client.poll()` explicitly.

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

```ts
import { ColyseusClient, Game } from '@bornengine/engine';
const game = new Game();
const client = new ColyseusClient(game, 'ws://127.0.0.1:2567');
if (!client.isLoaded) console.error(client.error);
const room = await client.joinOrCreate('arena', { name: 'Player' });
console.log(room.roomId, room.sessionId);
```

Join methods return promises. They reject when the client is unavailable, matchmaking cannot start, or the server rejects the request.

For a native Perry game that uses `Game.run()`, use the callback form. It delivers the join result from the frame loop's network polling, without waiting for a Promise continuation inside the blocking native loop.

```ts
client.joinOrCreateWithCallbacks('arena', { name: 'Player' }, {
  onJoin(room) {
    console.log('joined', room.roomId, room.sessionId);
  },
  onError(error) {
    console.error('could not join', error.message);
  },
});
```

The method returns `false` if matchmaking could not be started. Once started, success or failure is reported through one of the callbacks.

## State and messages

Subscribe on the Room instance. Subscription methods return a function that removes that listener.

```ts
const unsubscribe = room.onStateChange((state) => {
  console.log('players', state.players);
});
room.onMessage('welcome', (message) => console.log(message));
room.send('move', { x: 1, y: 0 });
```

Use `onMessageAny`, `onDrop`, `onReconnect`, `onLeave`, and `onError` for lifecycle events. State is delivered as snapshots through the configured schema bridge.

## Connection lifecycle and cleanup

Dispose the client when leaving the owning Game; it also leaves its rooms and rejects pending joins. A Room can leave independently with `room.leave()`.

```ts
await room.leave();
client.dispose();
game.dispose();
```

Browser and native platform support depends on the Colyseus bridge included by the target build. Use a server endpoint reachable from that device rather than a developer-machine-only loopback address.
