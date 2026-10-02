# Multiplayer arena

A small 2D networked arena. Each client sends only a movement direction and a
monotonic input sequence. The Colyseus room clamps that direction, advances
players at a fixed 20 Hz step, and replicates positions under server-issued
session IDs. Client messages cannot set a player's position.

The client uses BornEngine's `Game` lifecycle, `Scene`, `GameObject`, input,
`Vector2D`, and scene component rendering. It draws simple shapes, so the sample
does not need art assets or a hosted service.

## Requirements

- Node.js 22 or newer for the server tests and server runtime.
- The BornEngine CLI and Perry for the native client.

## Start the local server

From this directory, in one terminal:

```sh
cd server
npm ci
npm test
npm start
```

The server listens on `127.0.0.1:2568` by default. `npm test` starts its own
temporary server and connects two real Colyseus SDK clients; it does not need
the separately running server from `npm start`.

## Build and run two clients

In another terminal:

```sh
cd client
npm ci
npm run compile:check
bornengine run main.ts
```

`npm run compile:check` compiles Perry object files without linking native engine
libraries. Use `bornengine run main.ts` to launch the sample with the installed
BornEngine CLI. Open a second client in a separate process to see replicated
movement. Use **WASD** or the **arrow keys** to move; the local player is green
and other players are blue.

## Connect over a LAN

Start the server on the host machine with `HOST=0.0.0.0 PORT=2568 npm start`.
In `client/main.ts`, change `SERVER_URL` to the host's LAN address, for example
`ws://192.168.1.20:2568`, then rebuild and run each client. Keep the port open
in the host firewall.

## Server contract

`input` messages contain `{ x, y, sequence }`. The server rejects malformed
axes and stale sequences, clamps each axis, normalizes diagonal input to a unit
vector, and limits the message rate. Movement and world bounds are applied on
the server. Join options only set a bounded display name; the server creates
and removes map entries using each authenticated Colyseus session ID.
