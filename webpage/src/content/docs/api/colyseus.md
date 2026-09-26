---
title: Colyseus
description: Connect a game-owned Colyseus client to a room and manage its lifetime.
section: API / Colyseus
order: 37
---

A ColyseusClient belongs to one Game. Game.run polls networking callbacks automatically; custom embedded hosts can drive `runFrame()` or call `client.poll()` explicitly.

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
