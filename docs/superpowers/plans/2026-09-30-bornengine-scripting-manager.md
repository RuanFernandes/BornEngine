# BornEngine Scripting Manager Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the sandbox's imperative workbench with a React scripting manager, validate and broadcast client-script revisions through a dedicated Colyseus room, and provide a native Linux client for local playtesting.

**Architecture:** The React manager publishes TypeScript source to `ScriptingManagerRoom`, which validates and compiles it, assigns a revision, and broadcasts accepted code. Web and native game clients subscribe to that room separately from the authoritative gameplay room and hot-swap capability-limited QuickJS `ScriptComponent`s. Trusted server rules continue through the loopback development API.

**Tech Stack:** React, TypeScript, Vite, Monaco, Colyseus, Perry, BornEngine QuickJS scripting runtime, Node test runner, Playwright.

**Spec:** `docs/superpowers/specs/2026-09-30-bornengine-scripting-manager-design.md`

## Global Constraints

- Keep the workbench and Colyseus server inside `examples/scripting-sandbox/`; do not create a separate product or change the engine's public `Game` API.
- Use the exact room name `scripting-manager` for script publication and live updates. Game clients also join their gameplay room for authoritative multiplayer state.
- Do not add accounts, login, tokens, or publisher roles. This is an example project.
- Keep client scripts and server rules on separate execution paths. The manager room handles client scripts; server rules use the existing local server development API and hot-reload manager.
- Keep the game client independent of the React editor. Add a native Linux client that uses Perry, the native renderer, and the existing QuickJS scripting API so local testing does not require browser WebGPU. Retain the browser preview as an optional client for compatible systems.
- Keep the API bound to loopback and retain safe filename/path checks while removing its per-run development secret.
- Use the existing BornEngine TypeScript, Perry, Colyseus, and script-validation APIs; do not add an engine-wide WebView API.
- Preserve the user's untracked `pnpm-lock.yaml` in the primary checkout; make sandbox dependency changes only in the sandbox workspace lockfile.

## Review Focus

- Invalid or oversized TypeScript must leave the accepted revision unchanged and send no reload packet — Task 1 room tests.
- Two publishers using the same base revision must not silently overwrite one another — Task 1 stale-revision test.
- A late game client must receive the newest accepted snapshot and ignore older packets — Task 2 client and integration tests.
- A client's failed QuickJS replacement must leave its last working component active — Task 2 replacement test.
- Removing the development token must not weaken loopback binding or safe script-path handling — Task 3 API tests.

---

### Task 1: Separate script publishing into `ScriptingManagerRoom`

**Files:**
- Create: `examples/scripting-sandbox/server/src/rooms/ScriptingManagerRoom.ts`
- Create: `examples/scripting-sandbox/server/test/scripting-manager-room.test.ts`
- Modify: `examples/scripting-sandbox/server/src/app.config.ts`
- Modify: `examples/scripting-sandbox/server/src/rooms/SandboxRoom.ts`
- Modify: `examples/scripting-sandbox/server/test/sandbox-room.test.ts`
- Modify: `examples/scripting-sandbox/server/test/multiplayer.integration.test.ts`

**Interfaces:**
- `ScriptingManagerRoom` is registered under the Colyseus room name `scripting-manager` and stores `{ revision, source, javascript }` in memory.
- Clients send `publishClientScript` with `{ baseRevision: number, source: string }` and `requestClientScriptSnapshot` with an empty payload.
- The publishing client receives `clientScriptResult`: accepted includes the server-assigned `revision`; rejected includes `currentRevision`, a stable `reason`, and compiler diagnostics when present.
- Accepted code is broadcast as `clientScriptReload` with `{ revision, source, javascript }`; joining clients receive the current `clientScriptSnapshot` with the same fields.
- Every connected example client may publish. The room does not assign a publisher or execute guest code.
- `SandboxRoom` owns gameplay state and server rules only; it no longer stores scripts, assigns publishers, or sends script messages.

- [x] **Step 1: Write failing `ScriptingManagerRoom` contract tests.** Cover successful publish/reload/snapshot, invalid source and source over 64 KiB, malformed payload, stale `baseRevision`, snapshot request, and publication by a second client without a publisher role. Assert rejected input does not change the snapshot or broadcast `clientScriptReload`.
- [x] **Step 2: Run the focused server tests and verify the new tests fail because the room is not registered or implemented.**

Run: `pnpm --dir examples/scripting-sandbox/server test`

Expected: the new `scripting-manager-room.test.ts` assertions fail; existing server tests still execute.

- [x] **Step 3: Implement and register `ScriptingManagerRoom`.** Use `validateAndCompileClientScript`; reject malformed/stale requests with the current revision; increment the authoritative revision only after validation; retain the accepted snapshot in memory; send reload packets only for accepted source.
- [x] **Step 4: Remove script publishing, snapshots, publisher state, and publisher transfer from `SandboxRoom`; migrate the multiplayer integration test to publish and subscribe through `scripting-manager` while keeping movement assertions in `sandbox`.**
- [x] **Step 5: Run the complete server suite and verify all room and gameplay contracts pass.**

Run: `pnpm --dir examples/scripting-sandbox/server test`

Expected: PASS, including validation, snapshots, no-role publishing, and server-authoritative movement.

- [x] **Step 6: Commit `feat: add scripting manager room`.**

### Task 2: Connect browser and native game clients to script revisions

**Files:**
- Create: `examples/scripting-sandbox/native-client/package.json`
- Create: `examples/scripting-sandbox/native-client/main.ts`
- Create: `examples/scripting-sandbox/native-client/assets/particle.png`
- Modify: `examples/scripting-sandbox/pnpm-workspace.yaml`
- Modify: `examples/scripting-sandbox/workbench/src/preview/entry.ts`
- Modify: `examples/scripting-sandbox/workbench/src/preview/protocol.ts`
- Modify: `examples/scripting-sandbox/workbench/src/preview/game-bridge.ts`
- Create: `examples/scripting-sandbox/workbench/test/scripting-manager-client.test.ts`
- Covered: `examples/scripting-sandbox/server/test/multiplayer.integration.test.ts` (included with Task 1)
- Modify: `tools/validate-examples.mjs`

**Interfaces:**
- The browser preview connects to `sandbox` for movement and to `scripting-manager` for accepted snapshots and reloads, using its existing game-owned `ColyseusClient`.
- The native Linux `SandboxClientGame extends Game` joins both rooms, renders server-owned player positions, and attaches the latest accepted guest module through BornEngine `ScriptComponent`.
- Both clients accept only safe, strictly newer revisions and replace the current script only after a candidate component has loaded successfully. A failure keeps the previous component active.
- `native-client/package.json` exposes `compile:check` using Perry `--target linux --no-link`; `tools/validate-examples.mjs` includes `examples/scripting-sandbox/native-client/main.ts` in its explicit Perry entrypoint inventory.

- [x] **Step 1: Add failing client tests for newest-revision gating, late-join snapshot application, and retaining the previous script when a replacement component fails.**
- [x] **Step 2: Run the focused client tests and verify they fail before wiring the new room.**

Run: `pnpm --dir examples/scripting-sandbox/workbench test`

Expected: the new client cases fail because the preview still receives script packets through `SandboxRoom` and has no manager-room subscription.

- [x] **Step 3: Update the browser preview to join `scripting-manager` and apply only `clientScriptSnapshot` and `clientScriptReload` packets; keep movement and player state on `sandbox`.**
- [x] **Step 4: Add a Perry-native Linux game client that draws the multiplayer scene, joins both rooms, applies script snapshots/reloads with `ScriptComponent`, and accepts `--endpoint` for local server selection.**
- [x] **Step 5: Extend the real-client server integration test to verify the manager room sends an accepted revision to current clients and a current snapshot to a late joiner, while `sandbox` continues to own player movement.**
- [x] **Step 6: Add the native client to the Perry example inventory and run browser unit tests, the integration test, and the Perry compile check.**
- [x] **Step 7: Commit `feat: connect sandbox clients to live scripts`.**

Run: `pnpm --dir examples/scripting-sandbox/workbench test`  
Run: `pnpm --dir examples/scripting-sandbox/server test`  
Run: targeted `pnpm --dir examples/scripting-sandbox native:check`

Expected: PASS; the native Linux client compiles without linking and both Colyseus rooms keep separate responsibilities.

### Task 3: Convert the workbench to React and simplify local server editing

**Files:**
- Create: `examples/scripting-sandbox/workbench/src/main.tsx`
- Create: `examples/scripting-sandbox/workbench/src/App.tsx`
- Create: `examples/scripting-sandbox/workbench/src/components/ClientScriptEditor.tsx`
- Create: `examples/scripting-sandbox/workbench/src/components/ServerRulesEditor.tsx`
- Create: `examples/scripting-sandbox/workbench/src/components/SandboxDocs.tsx`
- Create: `examples/scripting-sandbox/workbench/src/scripting-manager/connection.ts`
- Modify: `examples/scripting-sandbox/workbench/index.html`
- Modify: `examples/scripting-sandbox/workbench/src/main.ts`
- Modify: `examples/scripting-sandbox/workbench/src/styles.css`
- Modify: `examples/scripting-sandbox/workbench/src/editor/server-workspace.ts`
- Modify: `examples/scripting-sandbox/workbench/package.json`
- Modify: `examples/scripting-sandbox/workbench/tsconfig.json`
- Modify: `examples/scripting-sandbox/workbench/scripts/check-types.mjs`
- Modify: `examples/scripting-sandbox/workbench/e2e/workbench.spec.ts`
- Modify: `examples/scripting-sandbox/workbench/playwright.config.ts`
- Modify: `examples/scripting-sandbox/server/src/sandbox/dev-script-api.ts`
- Modify: `examples/scripting-sandbox/server/src/sandbox/runtime.ts`
- Modify: `examples/scripting-sandbox/server/src/index.ts`
- Modify: `examples/scripting-sandbox/server/test/dev-script-api.test.ts`
- Modify: `examples/scripting-sandbox/scripts/dev.mjs`

**Interfaces:**
- `ScriptingManagerConnection.connect(endpoint: string): Promise<void>`, `publish(source: string): void`, `onStatus(listener): unsubscribe`, and `dispose(): void` own the manager room connection. The service publishes the latest accepted `baseRevision` and receives targeted `clientScriptResult` messages.
- `App` presents Client Script, Server Rules, and Sandbox Docs views. The client editor keeps Monaco diagnostics and local draft recovery; the server editor keeps safe file CRUD and last-good hot reload.
- `Server Rules` continues to call the loopback `__dev/server-scripts` API. No per-run secret, token header, or origin check is required; the API remains disabled outside development and rejects non-loopback binding and unsafe paths.
- Add React, React DOM, their TypeScript types, and `@colyseus/sdk` to the workbench package; configure TSX with `react-jsx` and keep existing Vite worker handling for Monaco.

- [x] **Step 1: Add failing Playwright checks for React shell rendering, Monaco sizing and diagnostics, built-in sandbox docs, publishing accepted code through `scripting-manager`, and server-rule editing without a token.**
- [x] **Step 2: Run the focused Playwright cases and verify the new assertions fail against the current imperative workbench or token-protected server API.**

Run: `pnpm --dir examples/scripting-sandbox/workbench e2e`

Expected: the new app/docs/publish cases fail before the React UI and room connection exist; server rule tests still run against the existing API behavior.

- [x] **Step 3: Implement the React app and `ScriptingManagerConnection`; preserve current Monaco compiler, local client draft, server-rule workspace, preview frame bridge, and layout behavior behind React components.**
- [x] **Step 4: Remove per-run secret generation and token/origin checks from the local server-rule development flow; update `DevScriptApi`, `startSandboxDevRuntime`, `scripts/dev.mjs`, and tests while preserving loopback and safe-path restrictions.**
- [x] **Step 5: Run the workbench check, unit tests, Playwright end-to-end suite, server tests, and workbench production build.**

Run: `pnpm --dir examples/scripting-sandbox check`  
Run: `pnpm --dir examples/scripting-sandbox test`  
Run: `pnpm --dir examples/scripting-sandbox e2e`  
Run: `pnpm --dir examples/scripting-sandbox build:workbench`

Expected: PASS; valid edits get a server revision, invalid edits show diagnostics without broadcasting, and server rules hot-reload without login or token configuration.

- [x] **Step 6: Commit `feat: build React scripting manager`.**

### Task 4: Document local workflow and verify the full example

**Files:**
- Create: `examples/scripting-sandbox/native-client/README.md`
- Modify: `examples/scripting-sandbox/README.md`
- Modify: `examples/README.md`
- Modify: `examples/scripting-sandbox/package.json`
- Modify: `examples/scripting-sandbox/pnpm-lock.yaml`
- Modify: `.github/workflows/test.yml`

**Interfaces:**
- `pnpm dev` starts the local Colyseus server and React manager on loopback without generating or passing an auth token.
- The native client exposes `pnpm --dir native-client compile:check`, `build`, and `start`; its README instructions explain how to open multiple clients against `ws://127.0.0.1:2568`.
- The top-level sandbox scripts continue to offer `check`, `test`, `e2e`, and `build`; CI installs the frozen workspace lockfile and checks the manager, server, and native example compile.

- [x] **Step 1: Update the sandbox and examples catalog docs to describe React/Monaco, built-in docs, `scripting-manager`, no-login local use, independent gameplay and script rooms, server-rule reload, and the native Linux client.**
- [x] **Step 2: Add native-client commands to the sandbox package scripts and include the package in the workspace; the workspace lockfile was updated with Task 2.**
- [x] **Step 3: Update the sandbox CI job to run `pnpm check`, `pnpm test`, and `pnpm build:workbench`; rely on the Linux `examples:check` workflow for Perry compilation of the native client.**
- [x] **Step 4: Run the complete sandbox suite and a local two-client smoke: start `pnpm dev`, launch two native clients, publish a valid script and observe both reload, then publish invalid TypeScript and confirm the accepted revision and working client behavior remain unchanged.**

Run: `pnpm --dir examples/scripting-sandbox check`  
Run: `pnpm --dir examples/scripting-sandbox test`  
Run: `pnpm --dir examples/scripting-sandbox e2e`  
Run: `pnpm --dir examples/scripting-sandbox build`  
Run: `pnpm --dir examples/scripting-sandbox native:check`  
Run: `npm run examples:check:static`

Expected: PASS; the native preview renders without browser WebGPU, client scripts update only after server validation, and server-owned movement remains authoritative.

The CI job also runs `npm run examples:check`, including the full Perry entrypoint inventory. The local full inventory was stopped after the static audit and 9 of 33 example compilations passed; the remaining builds were unrelated demos and the sequential run occupied two CPU cores for several minutes. Confirm the full inventory through PR CI.

- [x] **Step 5: Commit `docs: document the scripting manager workflow`.**
