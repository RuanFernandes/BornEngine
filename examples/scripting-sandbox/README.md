# BornEngine Scripting Sandbox

A local scripting workspace for BornEngine games. It combines a React and Monaco editor, built-in sandbox documentation, a Colyseus scripting manager, trusted server-rule hot reload, and both browser and Perry-native game clients.

This example lives in the BornEngine repository and resolves the engine source from this checkout. It does not depend on or publish the production npm package.

## Requirements

- Node.js `>=22.12.0` and pnpm `12.5.1`.
- Rust, `wasm-pack`, and the WebAssembly target used by `native/web/build.sh` for the optional browser preview.
- Perry and the BornEngine native Linux prerequisites to build the native client.
- Chromium installed through Playwright for the browser end-to-end tests.

Install the workspace dependencies from this directory:

```sh
pnpm install
```

## Start the scripting workspace

```sh
pnpm dev
```

This builds the optional browser game preview, starts the Colyseus server and serves the React workbench at `http://127.0.0.1:5173`. Stop the local processes with `Ctrl+C`.

The **Client script** view edits code that runs in an isolated QuickJS runtime in each game client. **Run** applies a script to the current preview. **Share script** sends the TypeScript source to the `scripting-manager` room; the server validates and compiles it, assigns a revision, then broadcasts the accepted script to connected clients. Invalid scripts do not replace the latest accepted revision.

The workbench stores each browser's draft locally and supports import and export. Shared scripts are held in room memory and reset when the room or server is recreated. Anyone connected to this example's scripting manager can publish a script, so use it only with people you trust.

The **Sandbox docs** view explains the client scripting API and server/client boundary. The game preview is optional: if WebGPU is unavailable, the editor and room connection still work, and the native client can provide the game window.

To use another local BornEngine checkout, set `BORNENGINE_ENGINE_PATH` to a path relative to this directory:

```sh
BORNENGINE_ENGINE_PATH=/path/to/BornEngine pnpm dev
```

By default, the example resolves the engine source two directories above this folder. That checkout provides the TypeScript API, the browser renderer, and the native client bindings.

## Native multiplayer client

In another terminal, compile and start the Linux game client:

```sh
pnpm --dir native-client build
pnpm --dir native-client start -- --endpoint ws://127.0.0.1:2568
```

Open a second terminal and start another client with the same endpoint. Both clients receive authoritative player positions from the `sandbox` room and validated live scripts from the `scripting-manager` room. Keep the React workbench open, connect it to the same endpoint, then use **Share script** to update both native clients.

The native client can also be compiled without linking or launching a window:

```sh
pnpm native:check
```

See [native-client/README.md](./native-client/README.md) for the client-specific commands.

## Multiplayer rooms and server rules

The `sandbox` room validates movement input and owns player state. Client scripts cannot authoritatively change multiplayer positions. The separate `scripting-manager` room validates shared client TypeScript, increments revisions only for accepted code, sends the current snapshot to new clients, and broadcasts hot reloads.

The **Server rules** view is available in the local development workbench. It edits files under `server/scripts/` and applies successful changes to active rooms after a short debounce. The server stages rules before swapping them, so a failed update leaves the last working rules active.

Server rules are trusted developer code, not player scripts. Their development API is disabled outside development and binds only to loopback. It has no login, token, or origin check because this is a local example; do not expose the development server to an untrusted network or use the server-rule editor for player-submitted code. File names, paths, file types, and source size are still validated.

## Checks and builds

```sh
pnpm check                 # Type-check the server and workbench against the local engine API
pnpm test                  # Run server, workbench, and dev-script tests
pnpm e2e                   # Run the Playwright workbench suite
pnpm build:workbench       # Build and verify the production workbench
pnpm native:check          # Compile-check the Perry Linux client
pnpm native:build          # Build the native Linux client
pnpm build                 # Build the browser preview and production workbench
```

From the BornEngine repository root, `npm run examples:check` also compiles the native client as part of the Perry example inventory.
