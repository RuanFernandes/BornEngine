---
title: Build a multiplayer game with Colyseus
description: Connect a BornEngine client to an authoritative Colyseus server, synchronize players, send input, and handle disconnects.
section: Guides
order: 75
---

This guide builds a small online arena. The Colyseus server owns player positions, accepts movement input, and synchronizes a room snapshot to every connected BornEngine game. Run two game clients to see both players in the same room.

BornEngine exposes a focused Colyseus client API across native and Web/WASM builds. This walkthrough covers the supported surface; the [Colyseus API reference](../../api/colyseus/) lists the current methods and limitations.

## Setup

You need Node.js 20.9 or newer for the Colyseus server and a BornEngine CLI installation. Keep the server and game in separate folders. The server runs independently from each game client.

Create a minimal TypeScript Colyseus server in one terminal. When prompted, choose TypeScript and the minimal server preset:

```sh
npm create colyseus-app@latest ./arena-server
cd arena-server
npm start
```

The development server listens at `ws://127.0.0.1:2567` by default. Keep this terminal running.

In a second terminal, create a BornEngine game project:

```sh
bornengine new OnlineArena --package-manager npm
cd OnlineArena
npm install @bornengine/engine
```

Use a BornEngine package version that includes the `@bornengine/engine/colyseus` subpath. For another computer, phone, or hosted build, replace the local server address with a hostname reachable from that device.

## Colyseus server

Replace the generated room with a room that keeps a Schema player map. Clients send only a movement direction; the server clamps that input, advances positions on its timestep, and publishes the authoritative state.

Create `src/rooms/ArenaRoom.ts`:

```ts
import { Room, type Client } from 'colyseus';
import { MapSchema, Schema, type } from '@colyseus/schema';

type MoveInput = { x: number; y: number };

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

class PlayerState extends Schema {
  @type('string') name = '';
  @type('number') x = 480;
  @type('number') y = 270;
}

class ArenaState extends Schema {
  @type({ map: PlayerState }) players = new MapSchema<PlayerState>();
}

export class ArenaRoom extends Room {
  maxClients = 8;
  state = new ArenaState();
  private inputs = new Map<string, MoveInput>();

  messages = {
    move: (client: Client, payload: { x?: number; y?: number }) => {
      const rawX = typeof payload?.x === 'number' ? payload.x : 0;
      const rawY = typeof payload?.y === 'number' ? payload.y : 0;
      const x = clamp(rawX, -1, 1);
      const y = clamp(rawY, -1, 1);
      const length = Math.hypot(x, y);
      const scale = length > 1 ? 1 / length : 1;
      this.inputs.set(client.sessionId, { x: x * scale, y: y * scale });
    },
    get_player_count: () => ({ count: this.state.players.size }),
  };

  onCreate() {
    this.setTimestep((deltaTime) => {
      const seconds = Math.min(Math.max(deltaTime, 0), 50) / 1000;
      for (const [sessionId, input] of this.inputs) {
        const player = this.state.players.get(sessionId);
        if (!player) continue;
        player.x = clamp(player.x + input.x * 180 * seconds, 16, 944);
        player.y = clamp(player.y + input.y * 180 * seconds, 16, 524);
      }
    });
  }

  onJoin(client: Client, options: { name?: string } = {}) {
    const player = new PlayerState();
    const suppliedName = typeof options.name === 'string' ? options.name.trim() : '';
    player.name = suppliedName.length > 0 ? suppliedName.slice(0, 24) : 'Player';
    this.state.players.set(client.sessionId, player);
    this.inputs.set(client.sessionId, { x: 0, y: 0 });
  }

  onDrop(client: Client) {
    this.inputs.delete(client.sessionId);
    this.allowReconnection(client, 20);
  }

  onLeave(client: Client) {
    this.inputs.delete(client.sessionId);
    this.state.players.delete(client.sessionId);
  }
}
```

Register the room in the generated `src/app.config.ts`:

```ts
import { defineRoom, defineServer } from 'colyseus';
import { ArenaRoom } from './rooms/ArenaRoom.js';

export default defineServer({
  rooms: {
    arena: defineRoom(ArenaRoom),
  },
});
```

Restart the server after changing its room. `setTimestep()` runs the simulation on the server; clients never submit a final position that other players must trust. Keep server validation and any game rules in this room.

## BornEngine client

Create one `ColyseusClient` for the game session, then join the room by its registered name. `joinOrCreate()` is the usual choice for a public match: it joins an available room or creates one. `create()`, `join()`, `joinById()`, and `reconnect()` are also available.

```ts
import { ColyseusClient, Game } from '@bornengine/engine';

const game = new Game({ window: { title: 'Online Arena', width: 960, height: 540 } });
const client = new ColyseusClient(game, 'ws://127.0.0.1:2567');
const joining = client.joinOrCreate('arena', { name: 'Player One' });

joining.then(
  (room) => console.log('joined room', room.roomId, room.sessionId),
  (error) => console.error('could not join arena', error.message),
);
```

Room joins return promises for web games and async hosts that yield to the event loop. Perry's native `Game.run()` is blocking, so use `joinOrCreateWithCallbacks()` there; its result is delivered from the frame loop's network polling. An embedded host should drive `game.runFrame()` to advance the same services.

## Game loop

Colyseus synchronizes room state from the server. BornEngine converts supported Schema values into plain TypeScript objects; a `MapSchema` such as `players` arrives as an object keyed by each player's `sessionId`. Listen for snapshots with `room.onStateChange()` or read the latest value from `room.state`.

Send player intent using `room.send()`. Do not change `room.state` locally and expect the server to accept it. For this arena, the client sends a direction when keyboard input changes; the server simulates movement and clamps players to the arena bounds.

## Messages and request/reply

Use `room.onMessage(type, callback)` to receive a server message and `room.send(type, payload)` to send a JSON-compatible payload. Message types can be strings or numbers. The server may return a value from a matching message handler when the client needs a reply:

```ts
room.onMessage('match-started', (message: { round: number }) => {
  console.log('round', message.round);
});
room.send('ready', { loadout: 'scout' });

const population = await room.request<{ count: number }>('get_player_count', null, {
  timeout: 3_000,
});
console.log('players in room', population.count);
```

The `get_player_count` handler in `ArenaRoom.messages` returns the value used by that request. A normal `send()` is fire-and-forget. `sendBytes()` sends raw bytes from the client; receive them on the server with `onMessageBytes()` when a binary payload is useful.

The Colyseus client does not automatically create BornEngine `GameObject`s or scene nodes for Schema entries. Keep a local view map keyed by `sessionId`: create a view when a player appears in a snapshot, update it from the latest state, and remove it when the player leaves. See the [Game API](../../api/game/) and [Scene API](../../api/scene/) for object and node lifecycles.

## Reconnection and cleanup

Use `onDrop`, `onReconnect`, `onError`, and `onLeave` to update connection UI and gameplay. The server's `onDrop()` calls `allowReconnection()` to hold the player's seat for 20 seconds. For an explicit reconnect after an app restart, save the joined room's `reconnectionToken` and pass it to `client.reconnect(token)`. A successful manual reconnect returns a new room object, so register listeners again.

```ts
room.onDrop((code, reason) => {
  console.log('connection interrupted', code, reason);
});
room.onReconnect(() => console.log('connection restored'));
room.onError((error) => console.error(error.message));
room.onLeave((code, reason) => console.log('room closed', code, reason));

const token = room.reconnectionToken;
client.reconnect(token).then((rejoined) => {
  console.log('rejoined room', rejoined.roomId);
  rejoined.onStateChange((state) => console.log('restored players', state.players));
});
```

When the game session ends, leave the room and dispose its client. Keep the game loop pumping callbacks until an asynchronous `leave()` finishes; a custom loop should call `client.poll()` while it waits.

```ts
await room.leave();
client.dispose();
```

## Platform networking

The Promise returned by room requests and leave operations needs the event loop to yield. Do not await it inside a native blocking Game.run callback; use an async host that yields or call client.poll() from an external loop while waiting.

- Use `ws://127.0.0.1:2567` only when the game and server share the same machine. A phone or emulator needs a host address that it can reach; `localhost` on that device points back to the device.
- Use `wss://` for a production server, and for Web/WASM games served over HTTPS.
- Android apps need `android.permission.INTERNET` in the final manifest.
- Sandboxed macOS apps need the outgoing network client entitlement. iOS and visionOS need Local Network privacy configuration when connecting to a server on the same LAN.
- The current BornEngine façade uses the endpoint's scheme, host, and port. Custom URL paths, query parameters, Colyseus Auth/HTTP utilities, and fine-grained Schema callbacks are not exposed yet.

See the [Colyseus API reference](../../api/colyseus/), [mobile guide](../../platforms/mobile/), and [Apple guide](../../platforms/apple/) before building for a device.

## Complete example

Put this client in `main.ts`. Start the Colyseus server, run two copies of the game, and use the arrow keys in either window. The server keeps movement and player positions authoritative; each client draws the latest room snapshot.

```ts
import { ColyseusClient, Colors, Game, Key } from '@bornengine/engine';
import type { Room } from '@bornengine/engine';

interface PlayerSnapshot {
  name: string;
  x: number;
  y: number;
}

interface ArenaSnapshot {
  players: Record<string, PlayerSnapshot>;
}

const game = new Game({ window: { title: 'Online Arena', width: 960, height: 540 } });
const client = new ColyseusClient(game, 'ws://127.0.0.1:2567');
let currentRoom: Room<ArenaSnapshot> | null = null;
let snapshot: ArenaSnapshot | null = null;
let status = 'Connecting to arena...';
let lastInputX = 2;
let lastInputY = 2;

client.joinOrCreateWithCallbacks<ArenaSnapshot>('arena', { name: 'Player One' }, {
  onJoin(room) {
    currentRoom = room;
    snapshot = room.state;
    status = 'Connected';
    room.onStateChange((state) => { snapshot = state; });
    room.onDrop((code, reason) => { status = 'Reconnecting (' + code + '): ' + reason; });
    room.onReconnect(() => {
      status = 'Reconnected';
      lastInputX = 2;
      lastInputY = 2;
    });
    room.onError((error) => { status = error.message; });
    room.onLeave((code, reason) => { status = 'Left room (' + code + '): ' + reason; });
  },
  onError(error) { status = 'Join failed: ' + error.message; },
});

game.run({
  update() {
    const room = currentRoom;
    if (room === null || !room.isConnected) return;
    let inputX = 0;
    let inputY = 0;
    if (game.input.isKeyDown(Key.LEFT)) inputX -= 1;
    if (game.input.isKeyDown(Key.RIGHT)) inputX += 1;
    if (game.input.isKeyDown(Key.UP)) inputY -= 1;
    if (game.input.isKeyDown(Key.DOWN)) inputY += 1;
    if (inputX !== lastInputX || inputY !== lastInputY) {
      room.send('move', { x: inputX, y: inputY });
      lastInputX = inputX;
      lastInputY = inputY;
    }
  },
  render() {
    game.renderer.clear({ r: 18, g: 24, b: 34, a: 255 });
    game.renderer.drawText(status, { x: 24, y: 20 }, 18, Colors.WHITE);
    if (snapshot === null) return;
    for (const sessionId of Object.keys(snapshot.players)) {
      const player = snapshot.players[sessionId];
      const isLocal = currentRoom !== null && sessionId === currentRoom.sessionId;
      const color = isLocal ? Colors.LIME : { r: 90, g: 170, b: 255, a: 255 };
      game.renderer.drawRectangle({ x: player.x - 16, y: player.y - 16, width: 32, height: 32 }, color);
      game.renderer.drawText(player.name, { x: player.x - 28, y: player.y - 38 }, 16, Colors.WHITE);
    }
  },
  onStop() {
    client.dispose();
    game.dispose();
  },
});
```


## Next steps

- Add room authentication and server-side validation for identities and game rules. Treat join options and all messages as untrusted client input.
- Add interpolation or client prediction for smoother motion over higher-latency connections; this guide keeps movement server-driven to show the synchronization path first.
- Read the [Colyseus API reference](../../api/colyseus/) for every method exposed by BornEngine, and the official [Room](https://docs.colyseus.io/room), [State Synchronization](https://docs.colyseus.io/state), and [reconnection](https://docs.colyseus.io/room/reconnection) guides for server-side features.
