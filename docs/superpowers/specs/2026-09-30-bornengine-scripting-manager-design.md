# BornEngine Scripting Manager Design

**Date:** 2026-09-30
**Status:** Proposed for review
**Repository:** `BornEngine`, under `examples/scripting-sandbox/`

## Goal

Turn the scripting sandbox workbench into a React-based management app for a BornEngine game example. The app provides Monaco, built-in sandbox documentation, and script publishing. A dedicated Colyseus room named `scripting-manager` receives client-script edits, validates and compiles them, then broadcasts accepted revisions so connected game clients can hot-reload them.

## Decisions

- Convert the existing `workbench/` UI to React instead of adding a second Monaco application.
- Keep the workbench and Colyseus server inside `examples/scripting-sandbox/`; do not create a separate product or change the engine's public `Game` API.
- Use the exact room name `scripting-manager` for script publication and live updates. Game clients also join their gameplay room for authoritative multiplayer state.
- Do not add accounts, login, tokens, or publisher roles. This is an example project.
- Keep client scripts and server rules on separate execution paths. The manager room handles client scripts; server rules use the existing local server development API and hot-reload manager.
- Keep the game client independent of the React editor. Add a native Linux client that uses Perry, the native renderer, and the existing QuickJS scripting API so local testing does not require browser WebGPU. Retain the browser preview as an optional client for compatible systems.

## React management app

The current `workbench/` becomes the Scripting Manager. Preserve the existing Vite development/build entry points and the Monaco editor features while moving the page composition and UI state into React components.

The app includes:

- A Client Script editor with Monaco TypeScript diagnostics, local draft recovery, and publish status.
- A Server Rules editor for creating and editing server-side example scripts through the local development API.
- A Sandbox Docs view describing the guest API, script lifecycle, supported hooks, multiplayer update flow, server-rule API, and local run commands.
- A connection/status area showing Colyseus connection state, accepted server revision, validation diagnostics, and connected/applied client revisions when available.

Client source changes are compiled locally for immediate editor feedback. The server remains the authority for acceptance: the app sends the TypeScript source, and only an accepted server response can lead to a room-wide reload event.

## `scripting-manager` room and protocol

Add a dedicated `ScriptingManagerRoom` registered by the example server under `scripting-manager`. It stores the latest accepted client-script source and compiled JavaScript in memory for the lifetime of the room.

The protocol uses server-assigned, monotonically increasing revisions:

1. The manager sends `publishClientScript` with the candidate source and its last observed revision.
2. The room rejects malformed or stale requests. It runs the existing server-side TypeScript validation and compilation, including the existing size, syntax, module-loading, and allowed-export checks.
3. For invalid scripts, the room replies only to the publishing client with `clientScriptResult: rejected` and diagnostics. It does not replace the accepted snapshot or notify game clients.
4. For a valid script, the room increments the revision, stores the source and emitted JavaScript, acknowledges the publisher, and broadcasts `clientScriptReload` with the accepted revision and code to all connected clients.
5. A newly joined manager or game client can request the current `clientScriptSnapshot` and apply that revision before gameplay continues.

The React manager joins `scripting-manager` to publish source and display server results. Each game client joins the same room to receive snapshots and reload packets, in addition to its gameplay room. The native Linux client is a separate Perry-built executable and uses the local Colyseus endpoint. The manager room does not execute client code on the server.

Clients ignore revisions older than their active revision. They create and validate a replacement `ScriptComponent` before swapping it in. If the replacement fails to initialize, that client retains its last working script and reports a local diagnostic; other clients continue independently.

## Server-side scripts

Server rules are trusted example code and do not travel through `scripting-manager` or to player clients. The React Server Rules editor uses the existing loopback development API to create, edit, and delete example rule files. The server validates and stages the candidate generation, initializes it for active rooms, and swaps the generation only after successful initialization. A failure keeps the last working generation active.

Remove the per-run secret requirement from this example's local development API. Keep the API bound to loopback and retain its safe filename/path checks so the UI can edit the example's `server/scripts/` directory without login or tokens.

## Scope and limits

- The app is a local developer tool for one shared example game; no account system, role model, hosted matchmaking, persistence, or multi-project workspace is added.
- The gameplay Colyseus room remains responsible for authoritative movement and game state. `scripting-manager` is responsible only for accepted client-script snapshots and hot-reload packets.
- The manager remains a React web app. This work does not implement a native desktop shell or an embedded system WebView. The native Linux game client runs in its own native window and is not hosted inside the manager page.
- Server rules remain separate from untrusted/shared client scripts.

## Acceptance criteria

1. The current workbench runs as a React app and still builds under the existing sandbox `pnpm` scripts.
2. The manager displays Monaco, useful sandbox documentation, current room status, server validation results, and the accepted script revision.
3. An invalid client script is rejected with diagnostics and does not change the accepted revision or reach clients.
4. A valid client script advances the server revision and is broadcast to manager and game clients; new clients can request and apply the latest snapshot.
5. Game clients hot-reload accepted revisions without regressing to older code, and a local apply failure preserves their previous working script.
6. Server-rule edits continue through the local development API and preserve its last-good hot-reload behavior, without requiring a login or per-run secret.
7. The native Linux game client renders and executes updates without relying on a browser WebGPU adapter.
8. Existing multiplayer game state, client script capability limits, and per-browser draft recovery remain intact.
