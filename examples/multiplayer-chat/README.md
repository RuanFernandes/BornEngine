# Multiplayer room chat

A small 2D room chat with a separate Colyseus server. The client lets you type
and edit a message, sends it on **Enter**, and shows server-authored membership
and recent messages. Press **Esc** to leave the room.

The server assigns every member's session key and bounded display name. It
accepts only trimmed, non-empty messages up to 240 characters, rejects control
characters and malformed payloads, rate-limits each member to four messages
per second, and stamps the sender identity before broadcasting.

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

The server listens on `127.0.0.1:2569` by default. `npm test` starts an isolated
temporary server and connects two real Colyseus SDK clients, then checks member
join/leave, server-owned sender identity, text validation, broadcast order, and
rate limits.

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
BornEngine CLI. Start another client in a separate process to exchange messages.

## Connect over a LAN

Start the server on the host machine with `HOST=0.0.0.0 PORT=2569 npm start`.
In `client/main.ts`, change `SERVER_URL` to the host's LAN address, for example
`ws://192.168.1.20:2569`, then rebuild and run each client. Keep the port open
in the host firewall.

## Server contract

Clients send `{ text }`; fields such as `name` and `sessionId` are ignored.
Room membership is keyed by the server-issued Colyseus session ID and removed
when that session leaves. The server assigns increasing message IDs in room
order, broadcasts only validated text, and returns bounded rejection reasons
to the sender.
