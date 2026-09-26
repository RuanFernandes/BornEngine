# Colyseus integration fixture

This repository-owned server and client contract exercise BornEngine's Colyseus transport against the official TypeScript SDK. The fixture runs on `127.0.0.1:2567` by default and exposes `test_room` with nested `players` state, string and numeric message handlers, binary payload capture, request/reply, and reconnection handling.

## Run the contract

```sh
npm ci --prefix tests/colyseus/server
node tests/colyseus/run-server-smoke.mjs
```

Set `PORT` to use another local port. The runner starts the server, waits for its TCP listener, runs the protocol contract, and stops the server even when the test fails.

The contract follows the official [Client SDK](https://docs.colyseus.io/sdk), [State Synchronization](https://docs.colyseus.io/state), [Connection Lifecycle](https://docs.colyseus.io/sdk/connection), and [Reconnection](https://docs.colyseus.io/room/reconnection) guides.

## Native and platform smoke

The same Rust FFI contract is also available as a small test crate that links the platform's bundled Native SDK archive:

```sh
node tests/colyseus/run-native-smoke.mjs
```

The test covers join and nested state, string and numeric messages, binary payloads, request/reply, token-based reconnect, leave, disposal, and cleanup of pending joins and requests. CI runs it directly on Linux, Windows, and macOS; Android targets run the test executable in an emulator, and iOS/tvOS/visionOS/watchOS simulator targets install and run the same executable in a simulator app. Android uses `adb reverse` so the device can reach the fixture at `127.0.0.1:2567`.

Device-only Apple targets and simulator architectures without a matching hosted simulator are build/link validated. The workflows do not label those targets runtime-tested.

## Web smoke

The browser bridge smoke runs against the assembled `colyseus_bridge.bundle.js` in Node's WebSocket environment:

```sh
npm ci --prefix native/web
npm ci --prefix tests/colyseus/server
native/web/node_modules/.bin/esbuild native/web/colyseus_bridge.entry.js \
  --bundle --format=esm --platform=browser --target=es2022 \
  --outfile=/tmp/colyseus_bridge.bundle.js
COLYSEUS_BRIDGE_MODULE=/tmp/colyseus_bridge.bundle.js \
  node tests/colyseus/run-server-smoke.mjs tests/colyseus/web-bridge-smoke.mjs
```
