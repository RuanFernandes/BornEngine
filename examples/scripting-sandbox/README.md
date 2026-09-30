# BornEngine Scripting Sandbox

A browser-based scripting playground for BornEngine. It combines Monaco, a live BornEngine WebAssembly preview, isolated client scripts, and an optional Colyseus multiplayer room with hot-reloaded server rules.

The example lives in the BornEngine repository so it always builds against the engine source in this checkout. It does not publish or depend on the production npm package.

## Requirements

- Node.js `>=22.12.0` and pnpm `12.5.1`.
- Rust, `wasm-pack`, and the WebAssembly target required by `native/web/build.sh`.
- Chromium installed through Playwright for browser end-to-end tests.

From this directory, install the example workspace dependencies:

```sh
pnpm install
```

## Run the playground

```sh
pnpm dev
```

This builds the local BornEngine WebAssembly renderer, starts the Colyseus server, and serves the workbench at `http://127.0.0.1:5173`. Stop all local services with `Ctrl+C`.

To build against a different local BornEngine checkout, set `BORNENGINE_ENGINE_PATH` to a path relative to this directory:

```sh
BORNENGINE_ENGINE_PATH=/path/to/BornEngine pnpm dev
```

By default, the example resolves the BornEngine source two directories above this folder. The same checkout supplies the WebAssembly renderer, TypeScript API types, and Vite bundle.

## Client scripts

Use the **Client** editor to write TypeScript behavior for the running preview. Monaco reports TypeScript diagnostics before a script runs or is published. The game executes guest behavior in BornEngine's QuickJS-backed `ScriptComponent`; the sandbox API exposes only the local game context, logging, and local particle effects.

Client source shared with a room is kept in memory by the Colyseus server. Each browser stores its own draft in local storage and can import or export it as JSON. The server validates and compiles submitted source, rejects imports and dynamic module loading, and limits source files to 64 KiB. Client scripts cannot authoritatively change multiplayer positions.

## Multiplayer and server rules

Open a second browser tab and connect both tabs to the same room at `ws://127.0.0.1:2568`. Clients send movement intent; the room validates it and owns player positions. The sample integration tests connect two actual Colyseus clients and verify that they observe the same server-computed state.

The **Server rules** editor is available only through the local development server. It edits `server/scripts/` and applies successful TypeScript changes after a short debounce. Existing rooms and state continue running during reload. If a candidate script fails to compile or initialize, the last working rules stay active.

Server rules are trusted developer code, not untrusted player code. The development editor API binds to loopback, requires a per-run secret, checks the workbench origin, and restricts writes to safe TypeScript files under `server/scripts/`. Do not expose this API to a public network or run player-submitted code with it.

## Checks and builds

```sh
pnpm check       # TypeScript-check server, workbench, and local engine API usage
pnpm test        # Resolver, server, and workbench unit/integration tests
pnpm e2e         # Playwright tests, including a running WebAssembly preview
pnpm build       # WebAssembly renderer and production workbench
```

The preview bundles its TypeScript game as browser JavaScript and uses BornEngine's native WebAssembly renderer and FFI bridge. This keeps the sample on the same browser runtime as the engine without sending the entire game module graph through Perry's WebAssembly compiler.
