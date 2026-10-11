---
title: Build a multiplayer game with Colyseus
description: Connect a BornEngine client to an authoritative Colyseus server, synchronize players, send input, and handle disconnects.
section: Guides
order: 75
---

This guide builds a small online arena. A Colyseus server owns every player's position and sends the room state to each connected BornEngine game. Each game sends only the direction its player wants to move. You write the server, connect a game to it, and run two copies of the game side by side.

Three terms you will see:

- **Colyseus** is a Node.js framework for multiplayer servers. One server hosts named rooms.
- A **room** is one match on the server. It holds the shared state, accepts messages from its clients, and runs the simulation.
- An **authoritative server** decides what happens. A client reports input and never reports a position.

The [Colyseus API reference](../../api/colyseus/) lists every client method. This guide shows how they fit together.

## Setup

You need:

- Node.js 22 or newer for the server.
- The BornEngine CLI and a game project. Follow the [Quickstart](../../getting-started/quickstart/) if you do not have one.

Create the game with `bornengine new OnlineArena`. Keep the server in a separate folder, because it is a plain Node.js project that runs on its own.

From inside a game project, `bornengine create server` can create that folder. It runs the Colyseus project generator in `server/` and writes `server/bornengine.server.json`, a small file that records which game the server belongs to. This guide writes the server by hand so that the code matches the Colyseus versions used by the repository samples: `@colyseus/core` 0.18 and `@colyseus/schema` 5.

## Colyseus server

Create a folder named `arena-server`. Its `package.json` lists the Colyseus packages:

```json
{
  "name": "arena-server",
  "version": "1.0.0",
  "private": true,
  "type": "module",
  "engines": {
    "node": ">=22"
  },
  "scripts": {
    "start": "tsx src/index.ts",
    "check": "tsc --noEmit"
  },
  "dependencies": {
    "@colyseus/core": "^0.18.18",
    "@colyseus/schema": "^5.0.35",
    "@colyseus/tools": "^0.18.7",
    "@colyseus/ws-transport": "^0.18.4"
  },
  "devDependencies": {
    "tsx": "^4.10.2",
    "typescript": "^5.0.4"
  }
}
```

Colyseus declares synchronized fields with the `@type()` decorator. TypeScript needs two settings for it, so `tsconfig.json` contains:

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "strict": true,
    "experimentalDecorators": true,
    "useDefineForClassFields": false,
    "skipLibCheck": true,
    "noEmit": true
  },
  "include": ["src"]
}
```

The room goes in `src/rooms/ArenaRoom.ts`. This is Node.js server code. It is not part of the game, so it is shown as plain text:

```text
import { Room, type Client } from '@colyseus/core';
import { MapSchema, Schema, type } from '@colyseus/schema';

const ARENA_WIDTH = 640;
const ARENA_HEIGHT = 480;
const PLAYER_RADIUS = 16;
const PLAYER_SPEED = 180;
const STEP_SECONDS = 1 / 20;
const RECONNECT_SECONDS = 20;

class PlayerState extends Schema {
  @type('string') name = '';
  @type('number') x = ARENA_WIDTH / 2;
  @type('number') y = ARENA_HEIGHT / 2;
}

class ArenaState extends Schema {
  @type({ map: PlayerState }) players = new MapSchema<PlayerState>();
}

interface Direction {
  x: number;
  y: number;
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function readDirection(payload: unknown): Direction | null {
  if (typeof payload !== 'object' || payload === null) return null;
  const { x, y } = payload as { x?: unknown; y?: unknown };
  if (typeof x !== 'number' || typeof y !== 'number') return null;
  if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
  const limitedX = clamp(x, -1, 1);
  const limitedY = clamp(y, -1, 1);
  const length = Math.hypot(limitedX, limitedY);
  if (length > 1) return { x: limitedX / length, y: limitedY / length };
  return { x: limitedX, y: limitedY };
}

export class ArenaRoom extends Room {
  maxClients = 8;
  state = new ArenaState();

  private readonly directions = new Map<string, Direction>();

  onCreate(): void {
    this.onMessage('input', (client, payload: unknown) => {
      const direction = readDirection(payload);
      if (direction === null) {
        client.send('inputRejected', { reason: 'invalid-input' });
        return;
      }
      if (this.state.players.has(client.sessionId)) {
        this.directions.set(client.sessionId, direction);
      }
    });

    this.onMessage('population', () => ({ count: this.state.players.size }));

    this.setSimulationInterval(() => this.simulate(), STEP_SECONDS * 1000);
  }

  onJoin(client: Client, options: { name?: unknown } = {}): void {
    const player = new PlayerState();
    const name = typeof options.name === 'string' ? options.name.trim().slice(0, 20) : '';
    player.name = name.length > 0 ? name : 'Player';
    this.state.players.set(client.sessionId, player);
    this.directions.set(client.sessionId, { x: 0, y: 0 });
  }

  onDrop(client: Client): void {
    this.directions.set(client.sessionId, { x: 0, y: 0 });
    this.allowReconnection(client, RECONNECT_SECONDS);
  }

  onLeave(client: Client): void {
    this.directions.delete(client.sessionId);
    this.state.players.delete(client.sessionId);
  }

  private simulate(): void {
    const distance = PLAYER_SPEED * STEP_SECONDS;
    this.state.players.forEach((player, sessionId) => {
      const direction = this.directions.get(sessionId);
      if (direction === undefined) return;
      player.x = clamp(player.x + direction.x * distance, PLAYER_RADIUS, ARENA_WIDTH - PLAYER_RADIUS);
      player.y = clamp(player.y + direction.y * distance, PLAYER_RADIUS, ARENA_HEIGHT - PLAYER_RADIUS);
    });
  }
}
```

The entry point goes in `src/index.ts`:

```text
import { defineRoom, defineServer } from '@colyseus/core';
import { listen } from '@colyseus/tools';
import { ArenaRoom } from './rooms/ArenaRoom.js';

const server = defineServer({
  rooms: {
    arena: defineRoom(ArenaRoom),
  },
});

await listen(server);
```

What the room does:

- `ArenaState` is the synchronized state. `players` is a map keyed by **session ID**, a string that Colyseus assigns to each connection.
- `onCreate` registers two message handlers and starts `simulate()`, which runs 20 times per second.
- The `input` handler checks the message and stores a direction. `readDirection` accepts only two finite numbers, limits each to the range -1 to 1, and shortens the vector to length 1. No client can move faster than `PLAYER_SPEED`, and no message can set a position.
- The `population` handler returns a value. When a client calls `request()`, that value is the reply. A plain `send()` ignores it.
- `onJoin` creates the player. Treat join options as untrusted input: the room trims the name and limits its length.
- `onDrop` runs when a connection breaks without a deliberate leave. `allowReconnection(client, 20)` keeps the player's seat for 20 seconds.
- `onLeave` removes the player when the client leaves, and when the reconnection time runs out.

Start the server:

```sh
cd arena-server
npm install
npm start
```

It prints `Listening on http://localhost:2567`. The port comes from the `PORT` environment variable and defaults to 2567. The server accepts connections on every network interface of the machine, so other devices on your network can reach it. Block the port in a firewall if you do not want that.

## BornEngine client

`ColyseusClient` connects one `Game` to a Colyseus server. Create it once the game is ready, for example in `onStart()`, and give it the server address. Then join a room by its registered name:

```ts
import { ColyseusClient, Colors, Game } from '@bornengine/engine';

const SERVER_URL = 'ws://127.0.0.1:2567';

class ConnectGame extends Game {
  private client: ColyseusClient | null = null;
  private status = 'Connecting...';

  protected override onStart(): void {
    const client = new ColyseusClient(this, SERVER_URL);
    if (client.error !== null) {
      this.status = 'Network error: ' + client.error;
      return;
    }
    this.client = client;

    const started = client.joinOrCreateWithCallbacks('arena', { name: 'Explorer' }, {
      onJoin: (room) => {
        this.status = 'Joined room ' + room.roomId + ' as ' + room.sessionId;
      },
      onError: (error) => {
        this.status = 'Could not join: ' + error.message;
      },
    });
    if (!started) this.status = 'Could not start the join request.';
  }

  protected override render(): void {
    this.renderer.clear(Colors.DARKBLUE);
    this.renderer.drawText(this.status, { x: 16, y: 16 }, 18, Colors.WHITE);
  }

  protected override onStop(): void {
    if (this.client !== null) this.client.dispose();
    this.client = null;
  }
}

new ConnectGame({ window: { title: 'Connect', width: 640, height: 480 } }).run();
```

Check `client.error` right after construction. It is not `null` when the client could not be created, for example because the address is malformed or the build has no Colyseus support.

The join methods come in pairs. The `WithCallbacks` form reports through callbacks, and the form without the suffix returns a Promise:

| Callback form | Promise form | What it does |
| --- | --- | --- |
| `joinOrCreateWithCallbacks(name, options, callbacks)` | `joinOrCreate` | Joins a room with a free seat, or creates one. |
| `createWithCallbacks` | `create` | Always creates a new room. |
| `joinWithCallbacks` | `join` | Joins an existing room and fails if there is none. |
| `joinByIdWithCallbacks(roomId, options, callbacks)` | `joinById` | Joins one specific room. |
| `reconnectWithCallbacks(token, callbacks)` | `reconnect` | Rejoins with a reconnection token. |

On native builds `Game.run()` is a plain blocking loop, so Promise continuations and timers do not run while the game plays. Code after `await client.joinOrCreate(...)` would wait until the game ends. Use the callback forms in code that runs during play. They report from the network poll that the game performs every frame. On a Web build the browser drives the frames, so both forms work.

The options object is sent as JSON to the server's `onJoin`. The address needs a scheme: `ws://`, `wss://`, `http://`, or `https://`.

## Game loop

The game polls the network once per frame, before `loop()`. Join, state, message, and request callbacks all run from that poll, on the same thread as your game code and inside the frame. If a callback throws, the game stops and `game.error` holds the message. Keep callbacks short and let them store data for `loop()` and `render()` to use.

`room.state` is a plain object copy of the server state. A `MapSchema` arrives as an object keyed by the map's keys, and the room above keys `players` by session ID. Each state change delivers a complete new snapshot to `onStateChange`. There are no per-field callbacks, and the cost of every change grows with the size of the whole state, so keep replicated state small.

When `onJoin` runs, `room.state` can still be `null` or empty because the first snapshot may arrive a moment later. Read it once, then keep listening with `onStateChange`.

Sending input works the other way. Do not change `room.state` and expect the server to follow. Send the direction the player wants, at a steady rate. A steady rate keeps the server's copy fresh even if one message is lost, and the room above stops a player who disconnects. `room.send()` does nothing while the room is not connected, so check `room.isConnected` first.

This class holds the latest snapshot, sends input 20 times per second, and draws every player. The local player is green:

```ts
import { Colors, Key } from '@bornengine/engine';
import type { InputSystem, Renderer, Room } from '@bornengine/engine';

const SEND_INTERVAL = 0.05;
const PLAYER_SIZE = 32;

interface PlayerSnapshot {
  name: string;
  x: number;
  y: number;
}

interface ArenaSnapshot {
  players?: Record<string, PlayerSnapshot>;
}

export class ArenaSession {
  private room: Room<ArenaSnapshot> | null = null;
  private snapshot: ArenaSnapshot | null = null;
  private sinceLastInput = 0;

  attach(room: Room<ArenaSnapshot>): void {
    this.room = room;
    this.snapshot = room.state;
    room.onStateChange((state) => {
      this.snapshot = state;
    });
  }

  update(deltaTime: number, input: InputSystem): void {
    const room = this.room;
    if (room === null || !room.isConnected) return;

    this.sinceLastInput += deltaTime;
    if (this.sinceLastInput < SEND_INTERVAL) return;
    this.sinceLastInput = 0;

    let x = 0;
    let y = 0;
    if (input.isKeyDown(Key.LEFT) || input.isKeyDown(Key.A)) x -= 1;
    if (input.isKeyDown(Key.RIGHT) || input.isKeyDown(Key.D)) x += 1;
    if (input.isKeyDown(Key.UP) || input.isKeyDown(Key.W)) y -= 1;
    if (input.isKeyDown(Key.DOWN) || input.isKeyDown(Key.S)) y += 1;
    room.send('input', { x, y });
  }

  draw(renderer: Renderer): void {
    const room = this.room;
    const players = this.snapshot === null ? undefined : this.snapshot.players;
    if (room === null || players === undefined) return;

    const ids = Object.keys(players);
    for (let index = 0; index < ids.length; index++) {
      const player = players[ids[index]];
      const color = ids[index] === room.sessionId ? Colors.LIME : Colors.SKYBLUE;
      const left = player.x - PLAYER_SIZE / 2;
      const top = player.y - PLAYER_SIZE / 2;
      renderer.drawRectangle({ x: left, y: top, width: PLAYER_SIZE, height: PLAYER_SIZE }, color);
      renderer.drawText(player.name, { x: left, y: top - 20 }, 16, Colors.WHITE);
    }
  }
}
```

The client never creates `GameObject`s for Schema entries on its own. This class draws straight from the snapshot. A larger game keeps one scene object per session ID instead: it creates the object when an ID first appears, moves it on every snapshot, and removes it when the ID disappears. `examples/multiplayer-arena/client/main.ts` shows that approach.

The player moves only after the server confirms, so over a slow connection the square lags behind the keys. Interpolating between snapshots, or predicting the local player, hides that. This guide does neither.

## Messages and request/reply

`room.send(type, payload)` sends a message. The type is a string or a number, and the payload must be JSON-compatible. `room.onMessage(type, callback)` receives messages from the server and returns a function that removes the listener. `room.onMessageAny(callback)` receives every type. `room.sendBytes(type, bytes)` sends raw bytes when you need a binary payload.

A plain `send()` has no reply. When the client needs an answer, use a request. The server handler for that message type returns the reply value, and `request()` or `requestWithCallbacks()` delivers it:

```ts
import type { Room } from '@bornengine/engine';

interface Population {
  count: number;
}

export function readPopulation(room: Room, onCount: (count: number) => void): boolean {
  return room.requestWithCallbacks<Population>('population', null, {
    onSuccess: (population) => onCount(population.count),
    onError: (error) => console.error('Population request failed: ' + error.message),
  }, { timeout: 3000 });
}

export function watchRejections(room: Room): () => void {
  return room.onMessage<{ reason: string }>('inputRejected', (message) => {
    console.log('The server rejected an input message: ' + message.reason);
  });
}
```

`requestWithCallbacks()` returns `false` and calls `onError` when the room is not connected or the request cannot be sent. The `timeout` option is in milliseconds and defaults to 10000. A request that gets no answer in time fails with `Colyseus request timed out`. If the server handler rejects on purpose, `error.name` is `rejected` and `error.reason` holds the value it gave. A server error, or a message type the room does not handle, also arrives in `onError`.

Register a server handler for every message type the client sends. By default a Colyseus room closes the connection of a client that sends a type it has no handler for. The room above registers `input` and `population` for that reason.

## Reconnection and cleanup

A connection can break during a match. Four room events report what happens:

- `onDrop(code, reason)` runs when the connection breaks without a deliberate leave.
- `onReconnect()` runs when the connection is back. The room object and the session ID stay the same.
- `onLeave(code, reason)` runs when the client has left the room.
- `onError(error)` runs when the room reports an error after joining. A failed join goes to the `onError` callback you passed to the join method instead.

Between a drop and a reconnect, `room.isConnected` is `false` and `room.reconnectionPending` shows whether a reconnect is under way. `send()` does nothing in that time, and a request fails at once with `Colyseus room is not connected.`

After a drop, the Colyseus SDK tries to reconnect on its own, and by default it makes up to 15 attempts. BornEngine does not expose the reconnection settings. The attempts can only work while the server holds the seat, which the room above does with `allowReconnection(client, 20)`. When the 20 seconds pass, the room calls `onLeave` and removes the player.

Every joined room has a `reconnectionToken`. If you lose the room object, give the token to `reconnectWithCallbacks()`. The token works only while the server still holds the seat. A successful reconnect returns a new `Room` object, so register your listeners on it again:

```ts
import type { ColyseusClient, Room } from '@bornengine/engine';

export function rejoin(client: ColyseusClient, token: string, onRoom: (room: Room) => void): boolean {
  return client.reconnectWithCallbacks(token, {
    onJoin: onRoom,
    onError: (error) => console.error('Could not rejoin: ' + error.message),
  });
}
```

When the game ends, dispose the client in `onStop()`, as the examples in this guide do. `client.dispose()` leaves every room the client joined, fails any join or request still waiting, and releases the native client. The game also disposes clients that are still registered when it shuts down. To leave one room while the game keeps running, call `room.leave()` and react in `room.onLeave()`. `leave()` returns a Promise, but on native builds the callback is the dependable signal.

## Platform networking

- **Address:** Use `ws://127.0.0.1:2567` only when the game and server run on the same machine. On a phone, an emulator, or another computer, `127.0.0.1` and `localhost` point to that device. Use an address it can reach, such as `ws://192.168.1.20:2567`.
- **Secure connections:** Use `wss://` for a server on the Internet. A Web build served over HTTPS must use `wss://`, because browsers block plain WebSocket connections from secure pages.
- **What the native client reads:** It uses the scheme, host, and port of the address. The port defaults to 2567 for `ws://` and `http://` and to 443 for `wss://` and `https://`. A path, a query string, and a fragment are ignored. Colyseus authentication and HTTP helpers, and per-field Schema callbacks, are not part of the BornEngine client.
- **Build support:** Native builds use the Colyseus C SDK. Web builds use the Colyseus JavaScript SDK. The CLI turns on the `multiplayer` native feature when your TypeScript imports `@bornengine/engine/colyseus`, or imports `ColyseusClient` or `Room` from `@bornengine/engine`. Set `auto_native_features = false` under `[bornengine]` in `perry.toml` to stop that detection, or list `multiplayer` in `native_features` to turn it on yourself:

  ```toml
  [bornengine]
  native_profile = "2d"
  native_features = ["multiplayer"]
  ```

- **Android:** The final app manifest needs `android.permission.INTERNET`.
- **macOS:** An app that uses App Sandbox needs the `com.apple.security.network.client` entitlement.
- **iOS and visionOS:** Connecting to a server on your local network needs an `NSLocalNetworkUsageDescription` entry in `Info.plist`, and the player must approve the Local Network prompt. A server on the Internet does not need either.
- **Promises:** On native builds, use the callback forms during play, as described in [BornEngine client](#bornengine-client).

The [Colyseus API reference](../../api/colyseus/) has the verified platform matrix. The [Mobile](../../platforms/mobile/) and [Apple](../../platforms/apple/) pages show the manifest and entitlement entries.

## Complete example

Save this file as `main.ts` in the game project. It contains the `ArenaSession` class from the game loop section and the connection code from the client section. Start the server, run `bornengine run main.ts` in two terminals, and move with the arrow keys or WASD. Each window shows both squares, and your own square is green.

```ts
import { ColyseusClient, Colors, Game, Key } from '@bornengine/engine';
import type { InputSystem, Renderer, Room } from '@bornengine/engine';

const SERVER_URL = 'ws://127.0.0.1:2567';
const SEND_INTERVAL = 0.05;
const PLAYER_SIZE = 32;

interface PlayerSnapshot {
  name: string;
  x: number;
  y: number;
}

interface ArenaSnapshot {
  players?: Record<string, PlayerSnapshot>;
}

class ArenaSession {
  private room: Room<ArenaSnapshot> | null = null;
  private snapshot: ArenaSnapshot | null = null;
  private sinceLastInput = 0;

  attach(room: Room<ArenaSnapshot>): void {
    this.room = room;
    this.snapshot = room.state;
    room.onStateChange((state) => {
      this.snapshot = state;
    });
  }

  update(deltaTime: number, input: InputSystem): void {
    const room = this.room;
    if (room === null || !room.isConnected) return;

    this.sinceLastInput += deltaTime;
    if (this.sinceLastInput < SEND_INTERVAL) return;
    this.sinceLastInput = 0;

    let x = 0;
    let y = 0;
    if (input.isKeyDown(Key.LEFT) || input.isKeyDown(Key.A)) x -= 1;
    if (input.isKeyDown(Key.RIGHT) || input.isKeyDown(Key.D)) x += 1;
    if (input.isKeyDown(Key.UP) || input.isKeyDown(Key.W)) y -= 1;
    if (input.isKeyDown(Key.DOWN) || input.isKeyDown(Key.S)) y += 1;
    room.send('input', { x, y });
  }

  draw(renderer: Renderer): void {
    const room = this.room;
    const players = this.snapshot === null ? undefined : this.snapshot.players;
    if (room === null || players === undefined) return;

    const ids = Object.keys(players);
    for (let index = 0; index < ids.length; index++) {
      const player = players[ids[index]];
      const color = ids[index] === room.sessionId ? Colors.LIME : Colors.SKYBLUE;
      const left = player.x - PLAYER_SIZE / 2;
      const top = player.y - PLAYER_SIZE / 2;
      renderer.drawRectangle({ x: left, y: top, width: PLAYER_SIZE, height: PLAYER_SIZE }, color);
      renderer.drawText(player.name, { x: left, y: top - 20 }, 16, Colors.WHITE);
    }
  }
}

class OnlineArena extends Game {
  private client: ColyseusClient | null = null;
  private readonly session = new ArenaSession();
  private status = 'Connecting...';

  constructor() {
    super({ window: { title: 'Online arena', width: 640, height: 480 }, targetFps: 60 });
  }

  protected override onStart(): void {
    const client = new ColyseusClient(this, SERVER_URL);
    if (client.error !== null) {
      this.status = 'Network error: ' + client.error;
      return;
    }
    this.client = client;

    const started = client.joinOrCreateWithCallbacks<ArenaSnapshot>('arena', { name: 'Explorer' }, {
      onJoin: (room) => this.watch(room),
      onError: (error) => {
        this.status = 'Could not join: ' + error.message;
      },
    });
    if (!started) this.status = 'Could not start the join request.';
  }

  protected override loop(deltaTime: number): void {
    this.session.update(deltaTime, this.input);
  }

  protected override render(): void {
    this.renderer.clear(Colors.DARKBLUE);
    this.session.draw(this.renderer);
    this.renderer.drawText(this.status, { x: 16, y: 16 }, 18, Colors.WHITE);
  }

  protected override onStop(): void {
    if (this.client !== null) this.client.dispose();
    this.client = null;
  }

  private watch(room: Room<ArenaSnapshot>): void {
    this.session.attach(room);
    this.status = 'Connected as ' + room.sessionId;
    room.onDrop((code, reason) => {
      this.status = 'Connection lost (' + code + '): ' + reason;
    });
    room.onReconnect(() => {
      this.status = 'Reconnected';
    });
    room.onError((error) => {
      this.status = 'Room error: ' + error.message;
    });
    room.onLeave((code, reason) => {
      this.status = 'Left the room (' + code + '): ' + reason;
    });
    room.onMessage<{ reason: string }>('inputRejected', (message) => {
      this.status = 'The server rejected an input message: ' + message.reason;
    });
  }
}

new OnlineArena().run();
```

If a window shows `Could not join`, check that the server is running and that `SERVER_URL` points to it.

## Next steps

- Read the [Colyseus API reference](../../api/colyseus/) for every client method and the verified platform matrix.
- Read [Game loop](../../concepts/game-loop/) for the order in which the game runs each frame.
- Open `examples/multiplayer-arena` for a larger version of this game. It validates a sequence number on every input message, limits the message rate on the server, and keeps one scene object per player. `examples/multiplayer-chat` shows room membership and bounded messages.
- Add authentication and rules to your room before you publish it. Treat join options and every message as untrusted input, and set `maxMessagesPerSecond` on the room: it is unlimited by default, and Colyseus disconnects a client that sends more.
- Read the [Colyseus documentation](https://docs.colyseus.io/) for rooms, state synchronization, and reconnection on the server side.
