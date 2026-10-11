---
title: Colyseus
description: Connect a game-owned Colyseus client to a room, exchange state and messages, and manage the connection lifetime.
section: API
order: 37
---

Colyseus is a multiplayer server framework. A `ColyseusClient` connects one `Game` to a Colyseus server, joins rooms, and delivers each room's state and messages to your code. The client belongs to its `Game`, and `Game.run()` polls the network once per frame, before `loop()`. A host that drives frames itself with `runFrame()` gets the same polling, or can call `client.poll()` or `room.poll()` directly.

`ColyseusClient` and `Room` come from `@bornengine/engine`. They are also available from `@bornengine/engine/colyseus`.

Native builds need the `multiplayer` native feature. The BornEngine CLI turns it on when your source imports `ColyseusClient` or `Room` from `@bornengine/engine`, or imports anything from `@bornengine/engine/colyseus`. To choose features yourself, set `auto_native_features = false` under `[bornengine]` in `perry.toml`. Without the feature, `client.isLoaded` is `false` and `client.error` explains why. The verified platform matrix at the end of this page shows the status of each target.

## Connect and join

Create the client with the `Game` and a server address. Native builds accept addresses that start with `ws://`, `wss://`, `http://`, or `https://`. Without a port they use 2567 for `ws` and `http` and 443 for `wss` and `https`. Use an address that the device can reach: `127.0.0.1` points at the device itself, not at your development machine.

```ts
import { ColyseusClient, Colors, Game, Key } from '@bornengine/engine';
import type { Room } from '@bornengine/engine';

class ArenaGame extends Game {
  private client: ColyseusClient | null = null;
  private room: Room | null = null;
  private statusText = 'connecting';

  protected override onStart(): void {
    const client = new ColyseusClient(this, 'ws://127.0.0.1:2567');
    if (!client.isLoaded) {
      this.statusText = client.error ?? 'Multiplayer is unavailable';
      return;
    }
    this.client = client;

    const started = client.joinOrCreateWithCallbacks('arena', { name: 'Player' }, {
      onJoin: (room) => {
        this.room = room;
        this.statusText = 'joined ' + room.roomId + ' as ' + room.sessionId;
      },
      onError: (error) => {
        this.statusText = 'join failed: ' + error.message;
      },
    });
    if (!started) this.statusText = 'could not start matchmaking';
  }

  protected override loop(_deltaTime: number): void {
    const room = this.room;
    if (room !== null && room.isConnected && this.input.isKeyPressed(Key.SPACE)) room.send('jump');
  }

  protected override render(): void {
    this.renderer.clear(Colors.BLACK);
    this.renderer.drawText(this.statusText, { x: 12, y: 12 }, 18, Colors.WHITE);
  }

  protected override onStop(): void {
    if (this.client !== null) this.client.dispose();
  }
}

new ArenaGame({ window: { title: 'Arena', width: 640, height: 360 }, targetFps: 60 }).run();
```

There are five ways to join, each with a promise form and a callback form:

| Promise form | Callback form | What it does |
| --- | --- | --- |
| `joinOrCreate(roomName, options)` | `joinOrCreateWithCallbacks(roomName, options, callbacks)` | Joins an open room of that name, or creates one. |
| `create(roomName, options)` | `createWithCallbacks(roomName, options, callbacks)` | Creates a new room. |
| `join(roomName, options)` | `joinWithCallbacks(roomName, options, callbacks)` | Joins an existing room of that name. |
| `joinById(roomId, options)` | `joinByIdWithCallbacks(roomId, options, callbacks)` | Joins the room with that ID. |
| `reconnect(token)` | `reconnectWithCallbacks(token, callbacks)` | Rejoins a room with the `reconnectionToken` that the room gave you. |

`options` is any JSON-serializable object. The server receives it when you join.

Use the callback forms in a native game. `Game.run()` is a blocking loop, and on native Linux it does not run promise continuations yet, so a promise join does not report back while the game runs. A callback form delivers `onJoin` or `onError` from the frame loop's network polling. It returns `false` when matchmaking could not start. Then `onError` has already been called with the reason.

The promise forms work where the host runs promise continuations, such as the browser. They reject when the client is unavailable, matchmaking cannot start, or the server refuses the join.

```ts
import { ColyseusClient } from '@bornengine/engine';
import type { Game, Room } from '@bornengine/engine';

async function joinArena(game: Game): Promise<Room | null> {
  const client = new ColyseusClient(game, 'ws://127.0.0.1:2567');
  if (!client.isLoaded) return null;
  try {
    return await client.joinOrCreate('arena', { name: 'Player' });
  } catch (error) {
    console.error('Could not join:', error);
    return null;
  }
}
```

After a join, `room.roomId`, `room.sessionId`, and `room.reconnectionToken` hold the room's identity. `room.isConnected` is `true` while the connection is up.

## Request and reply

A request sends a message and waits for the value that the server's message handler returns. `room.request()` returns a promise. `requestWithCallbacks()` delivers the reply from the frame loop's network polling, so use it in a native game:

```ts
import type { Room } from '@bornengine/engine';

function askScore(room: Room): void {
  room.requestWithCallbacks<number>('get_score', null, {
    onSuccess: (score) => console.log('score', score),
    onError: (error) => console.error('request failed:', error.message),
  }, { timeout: 3_000 });
}
```

The callback method returns `false` when the room is disconnected or the request could not be sent. `onError` receives the reason. A request that gets no reply within `timeout` milliseconds (10,000 by default) calls `onError` with `Colyseus request timed out` and cancels the native request. If the server's handler rejects the request, the error has `name` set to `'rejected'` and the server's payload in `reason`.

## State and messages

Subscribe on the `Room` instance. Every `on...` method returns a function that removes that listener.

```ts
import type { Room } from '@bornengine/engine';

interface ArenaState {
  players: Record<string, { x: number; y: number }>;
}

function watchArena(room: Room<ArenaState>): () => void {
  const stopState = room.onStateChange((state) => {
    console.log('players', Object.keys(state.players).length);
  });
  const stopWelcome = room.onMessage('welcome', (message: { text: string }) => {
    console.log(message.text);
  });
  room.send('move', { x: 1, y: 0 });
  return () => {
    stopState();
    stopWelcome();
  };
}
```

- `room.state` is a snapshot, a plain object copied from the server's state. It is `null` until the first state arrives, and each update replaces it with a new snapshot. A `MapSchema` on the server, such as a map of players, arrives as an object keyed by the same keys. Change the shared state by sending messages, not by editing the snapshot. `onStateChange` runs with each new snapshot.
- `send(type, message)` sends a message to the server. `type` is a string or a number, and `message` is any JSON-serializable value. `sendBytes(type, bytes)` sends a `Uint8Array` or number array as raw bytes. Both do nothing while the room is not connected.
- `onMessage(type, callback)` receives messages of one type. `onMessageAny(callback)` receives every message with its type. A numeric type arrives as a number.
- `onDrop(callback)` runs when the connection drops. `onReconnect(callback)` runs when it comes back, and `reconnectionPending` is `true` while a reconnect is under way. `onLeave(callback)` runs when the room closes, with a code and a reason. `onError(callback)` receives errors from a joined room.

The generic parameter on `Room<TState>` and on the join methods only types `room.state`. The engine does not check it against the server.

## Connection lifecycle and cleanup

A client owns its rooms and any pending joins. Dispose the client when you leave multiplayer. Disposing it rejects pending joins with `Colyseus client was disposed.`, fails pending requests with `Colyseus room was disposed`, and frees the native client. The `Game` also disposes every client that is still alive when it shuts down.

A room can leave on its own with `room.leave()`. It returns a promise that resolves after the leave completes, or at once if the room is not connected. In a native game, listen with `onLeave` instead of waiting on the promise:

```ts
import type { ColyseusClient, Room } from '@bornengine/engine';

function leaveArena(client: ColyseusClient, room: Room): void {
  room.onLeave((code, reason) => {
    console.log('left the room', code, reason);
    client.dispose();
  });
  room.leave();
}

function watchConnection(room: Room): void {
  room.onDrop(() => console.warn('connection lost'));
  room.onReconnect(() => console.log('connection restored'));
  room.onError((error) => console.error(error.message));
}
```

`leave()` tells the server that the player left on purpose. `leave(false)` closes the connection as an unconsented leave instead: `onDrop` runs, and you can rejoin with `reconnect(token)` if your server holds the seat. Read `room.reconnectionToken` before you leave if your game supports resuming.

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

## Next steps

- [Multiplayer with Colyseus](../../guides/multiplayer/) builds a small networked game step by step.
- [Mobile platforms](../../platforms/mobile/) and [Apple platforms](../../platforms/apple/) list the permissions that network access needs.
- [Game loop](../../concepts/game-loop/) explains the frame order that polling follows.
