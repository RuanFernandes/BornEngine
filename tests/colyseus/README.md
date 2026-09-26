# Colyseus integration fixture

This repository-owned server and client contract exercise BornEngine's Colyseus transport against the official TypeScript SDK. The fixture runs on `127.0.0.1:2567` by default and exposes `test_room` with nested `players` state, string and numeric message handlers, binary payload capture, request/reply, and reconnection handling.

## Run the contract

```sh
npm ci --prefix tests/colyseus/server
node tests/colyseus/run-server-smoke.mjs
```

Set `PORT` to use another local port. The runner starts the server, waits for its TCP listener, runs the protocol contract, and stops the server even when the test fails.

The contract follows the official [Client SDK](https://docs.colyseus.io/sdk), [State Synchronization](https://docs.colyseus.io/state), [Connection Lifecycle](https://docs.colyseus.io/sdk/connection), and [Reconnection](https://docs.colyseus.io/room/reconnection) guides.
