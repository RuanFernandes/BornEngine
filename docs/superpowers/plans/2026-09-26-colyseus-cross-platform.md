# Colyseus Cross-Platform Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` (recommended) or `superpowers:executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the existing Colyseus TypeScript client work on every BornEngine target: macOS, iOS, tvOS, visionOS, watchOS, Windows, Linux, Android, and Web.

**Architecture:** Keep `ColyseusClient` and `Room` as the TypeScript API. Link the pinned Native SDK C API on native targets where its source builds, add the necessary watchOS FFI path, and use the official TypeScript SDK behind the Web FFI bridge. Build and test with GitHub-hosted runners matching each target OS/toolchain.

**Tech Stack:** Rust/Cargo, Perry TypeScript FFI, Colyseus Native SDK 0.18.7, Zig 0.15.2, Node.js/tsx, `@colyseus/sdk`, wasm-pack, Xcode simulators, Android NDK/emulator, GitHub Actions.

**Spec:** `docs/superpowers/specs/2026-09-26-colyseus-cross-platform-design.md`

## Current Status (2026-09-26)

- The repository-owned fixture, native bridge, eight existing native SDK closures, Web SDK bridge, and watchOS FFI path are implemented.
- Local native integration passed on Linux x86_64; the official Web SDK smoke and adapter tests passed in Node. Simulator and emulator runtime behavior has not been tested.
- The GitHub build matrix covers 16 target triples, with new runner results pending. Only the original eight native SDK archives are currently bundled.
- The assembled WebAssembly build and simulator/emulator runtime harnesses remain outstanding; publish the platform matrix after the runner results arrive.

## Global Constraints

- Cover all nine platform keys declared by BornEngine in `package.json`.
- Keep one TypeScript-facing `ColyseusClient` and `Room` API.
- Keep behavior parity at the current BornEngine facade surface: matchmaking, state snapshots, JSON and binary messages, request/reply, lifecycle events, polling, reconnection entry point, and cleanup.
- Use the upstream C API where its artifact or source build works; use an official platform client adapter where required.
- A platform must not be reported as supported merely because its FFI stub compiles.
- Use native GitHub Actions runners for Windows and Apple toolchains; Docker is limited to Linux build environments and test services.
- Keep the Colyseus server fixture inside the BornEngine repository so CI does not depend on a sibling checkout.
- Test runtime-capable targets against the same server fixture; report a target as supported only after its platform smoke test passes.
- Cross-check protocol smoke scenarios against the official [Client SDK](https://docs.colyseus.io/sdk), [State Synchronization](https://docs.colyseus.io/state), and [Connection Lifecycle](https://docs.colyseus.io/sdk/connection) guides.
- Do not expand this work to every feature in every Colyseus SDK; keep the scope to the current BornEngine facade.

## Review Focus

- **Static archive closure and platform linker flags:** a target may compile while missing TLS, WebSocket, or system libraries at final link. Pin this with per-target link smoke builds in Tasks 3, 4, and 6.
- **Async callback and handle lifetime:** join, request completion, leave, and dispose can race and double-free callback state. Pin this with joined-room lifecycle assertions in Tasks 1 and 6.
- **State and payload decoding:** nested schema values, numeric message types, binary payloads, and request responses must retain their wire meaning. Pin this with server contract checks in Task 1 and the native/browser smoke tests in Tasks 5 and 6.
- **Web event-loop behavior:** promises, polling, callback dispatch, and disposal must work without native threads. Pin this with adapter unit tests and a browser server smoke test in Tasks 5 and 6.
- **Platform network policy:** Android app permissions and Apple sandbox settings can make a valid link fail at runtime. Pin this with simulator/emulator smoke tests in Task 6 and per-platform usage notes in Task 7.

---

### Task 1: Put the Colyseus test server and protocol contract in the repository

**Files:**
- Create: `tests/colyseus/server/package.json`
- Create: `tests/colyseus/server/package-lock.json`
- Create: `tests/colyseus/server/tsconfig.json`
- Create: `tests/colyseus/server/src/app.config.ts`
- Create: `tests/colyseus/server/src/index.ts`
- Create: `tests/colyseus/server/src/rooms/TestRoom.ts`
- Create: `tests/colyseus/server/src/smoke-test.ts`
- Create: `tests/colyseus/run-server-smoke.mjs`
- Create: `tests/colyseus/README.md`
- Modify: `examples/colyseus-smoke/README.md`

**Interfaces:**
- Consumes: the current test server implementation in the sibling workspace directory `colyseus-test-server`, the current client calls in `examples/colyseus-smoke/main.ts`, and the official Colyseus client/state/lifecycle guides.
- Produces: a repository-owned server on `127.0.0.1:2567`, room `test_room`, nested `players` state, string and numeric message handlers, byte payload capture, `request_sum`, `onDrop`/`allowReconnection` handling, and a runner that starts the server, waits for readiness, runs the official TypeScript client contract, then always stops the server.

- [x] **Step 1: Add the protocol contract smoke test** for initial/nested schema state, string and numeric message types, `echo`, `increment`, raw-byte payload capture, `request_sum`, and manual reconnect after `room.leave(false)`; the test exits nonzero on timeout or mismatch.
- [x] **Step 2: Run `node tests/colyseus/run-server-smoke.mjs`** and confirm it fails because the repository fixture/runner is not complete.
- [x] **Step 3: Move the existing server fixture into `tests/colyseus/server/`**, preserving its pinned dependency lockfile and adding the server-start/readiness/cleanup runner.
- [x] **Step 4: Run `npm ci --prefix tests/colyseus/server` and `node tests/colyseus/run-server-smoke.mjs`**; confirm all contract assertions pass.
- [x] **Step 5: Update the native smoke example instructions** to start the checked-in fixture rather than relying on a sibling directory.
- [x] **Step 6: Commit** as `test: add repository-owned Colyseus fixture`.

### Task 2: Add a shared native target resolver and reproducible SDK build tool

**Files:**
- Create: `native/shared/src/colyseus_targets.rs`
- Create: `tools/build-colyseus-sdk.sh`
- Create: `native/third_party/colyseus-sdk-src` (pinned source submodule, excluded from the npm runtime package)
- Modify: `.gitmodules`
- Modify: `native/shared/build.rs`
- Modify: `native/shared/src/lib.rs`
- Modify: `native/third_party/colyseus/VERSION.md`
- Modify: `native/third_party/colyseus/README.md`

**Interfaces:**
- Consumes: Cargo target metadata (`target_os`, `target_arch`, `target_abi`, `target_env`) and the pinned upstream Colyseus Native SDK commit recorded in `VERSION.md`.
- Produces: `artifact_for(target_os, target_arch, target_abi, target_env) -> Option<&'static str>` and a reproducible build command that writes a complete static dependency closure for a requested Rust target (`libcolyseus_bundled.a` on Unix-like targets, `colyseus_bundled.lib` on Windows/MSVC).

- [x] **Step 1: Add table-driven target resolver tests** covering the currently enabled Linux x86_64 GNU target, Linux ARM64 GNU, macOS x86_64/ARM64, Windows x86_64 MSVC, Apple device/simulator triples, Android triples, and an unsupported target.
- [x] **Step 2: Run `cargo test --release --manifest-path native/shared/Cargo.toml colyseus_target`** and confirm the new target cases fail before the resolver is implemented.
- [x] **Step 3: Add the pinned upstream source and `tools/build-colyseus-sdk.sh`**, using Zig 0.15.2 and `zig build -Dtarget="$TARGET" -Doptimize=ReleaseFast -Dexamples=false -Dskip-integration=true`; merge the upstream static dependencies into the engine archive while preserving their licenses.
- [x] **Step 4: Implement `artifact_for(...)`** in `native/shared/src/colyseus_targets.rs`, import that same module from `native/shared/build.rs`, and link the archive plus target-specific system libraries only when the archive exists.
- [x] **Step 5: Run the resolver test and regenerate Linux x86_64 GNU**; confirm `cargo test --release --manifest-path native/shared/Cargo.toml` and the existing `examples/colyseus-smoke` pass without changing current Linux behavior.
- [x] **Step 6: Commit** as `build: add reproducible Colyseus target artifacts`.

### Task 3: Enable desktop and iOS C SDK targets

**Files:**
- Create: `native/shared/tests/colyseus_artifact_coverage.rs`
- Create/update: `native/third_party/colyseus/lib/<rust-target>/libcolyseus_bundled.a` or `colyseus_bundled.lib`, plus license files
- Modify: `native/shared/build.rs`
- Modify: `native/shared/src/colyseus_targets.rs`
- Modify: `native/shared/src/colyseus.rs`

**Interfaces:**
- Consumes: Task 2's target resolver and archive builder.
- Produces: linked Colyseus C SDK closures for the existing BornEngine Linux, Windows, macOS, and iOS build targets, using the architecture variants already supported by the engine toolchain.

- [x] **Step 1: Add `colyseus_artifact_coverage` tests** that assert every Linux, Windows, macOS, and iOS target mapping resolves to an archive containing the complete dependency closure and license directory.
- [x] **Step 2: Run `cargo test --release --manifest-path native/shared/Cargo.toml colyseus_artifact_coverage`** and confirm it fails for targets whose archives are currently incomplete or absent.
- [x] **Step 3: Build the full static dependency closure for the target variants** using Task 2's pinned tool, including TLS/WebSocket dependencies and licenses; do not link the upstream `libcolyseus.a` alone.
- [x] **Step 4: Enable those archives in `native/shared/build.rs`** and keep the TypeScript FFI ABI unchanged.
- [x] **Step 5: Run `cargo test --release --manifest-path native/shared/Cargo.toml`, `cargo build --release --manifest-path native/linux/Cargo.toml`, `cargo build --release --manifest-path native/macos/Cargo.toml`, `cargo build --release --manifest-path native/windows/Cargo.toml`, and iOS device/simulator builds with `cargo build --release --manifest-path native/ios/Cargo.toml --target aarch64-apple-ios` and `cargo build --release --manifest-path native/ios/Cargo.toml --target aarch64-apple-ios-sim` on their matching runners.**
- [x] **Step 6: Run `npm pack --dry-run --json`** and verify the published package includes every required archive and license.
- [x] **Step 7: Commit** as `feat: enable Colyseus on desktop and iOS`.

### Task 4: Enable Android, tvOS, visionOS, and watchOS

**Files:**
- Create: `native/watchos/src/colyseus.rs`
- Create/update: `native/third_party/colyseus/lib/<rust-target>/libcolyseus_bundled.a` or `colyseus_bundled.lib`, plus license files
- Modify: `native/shared/build.rs`
- Modify: `native/shared/src/colyseus_targets.rs`
- Modify: `native/watchos/src/lib.rs`
- Modify: `native/watchos/src/ffi_stubs.rs`
- Modify: `package.json` native target link configuration
- Modify: `tools/validate-ffi.js`

**Interfaces:**
- Consumes: Task 2's resolver/archive builder, Task 3's native target link pattern, and the existing `bloom_colyseus_*` FFI signatures in `package.json`.
- Produces: a working backend for Android and all remaining Apple targets. Android/iOS-family crates use the shared FFI bridge; watchOS uses a target-local Rust bridge because its renderer crate does not link `bloom-shared`.

- [x] **Step 1: Extend `tools/validate-ffi.js` tests** to detect unsupported Colyseus stubs in watchOS and add target build assertions for Android, tvOS, visionOS, and watchOS.
- [x] **Step 2: Run `node tools/validate-ffi.js`** and confirm the new support checks fail on the current watchOS stubs and missing target archives.
- [ ] **Step 3: Build the SDK closure for each target from the pinned upstream source** and add target-specific link settings through the shared resolver.
- [x] **Step 4: Implement the watchOS Colyseus FFI functions** in `native/watchos/src/colyseus.rs`, decode/return strings using the watchOS Perry string ABI, and remove the generated no-op Colyseus stubs only after live implementations compile.
- [ ] **Step 5: Verify app-shell network requirements** for Android `INTERNET` permission and Apple sandbox outgoing-network entitlement. Perry owns the generated app shell, so record the exact settings in Task 7 documentation and make simulator/emulator smoke setup fail clearly when they are absent.
- [ ] **Step 6: Run `node tools/validate-ffi.js`, `cargo build --release --manifest-path native/android/Cargo.toml --target aarch64-linux-android`, `cargo build --release --manifest-path native/tvos/Cargo.toml --target aarch64-apple-tvos`, `cargo build --release --manifest-path native/tvos/Cargo.toml --target aarch64-apple-tvos-sim`, `cargo build --release --manifest-path native/visionos/Cargo.toml --target aarch64-apple-visionos`, `cargo build --release --manifest-path native/visionos/Cargo.toml --target aarch64-apple-visionos-sim`, `cargo +nightly build -Z build-std=std,panic_abort --release --manifest-path native/watchos/Cargo.toml --target aarch64-apple-watchos`, and `cargo +nightly build -Z build-std=std,panic_abort --release --manifest-path native/watchos/Cargo.toml --target aarch64-apple-watchos-sim` on matching runners. If the pinned SDK cannot build or run for a target after using its supported platform toolchain, stop at that target, record the concrete failure, and revise the backend choice before calling it supported.**
- [ ] **Step 7: Commit** as `feat: enable Colyseus on mobile and remaining Apple targets`.

### Task 5: Implement the Web backend with the official TypeScript SDK

**Files:**
- Create: `native/web/package.json`
- Create: `native/web/package-lock.json`
- Create: `native/web/colyseus_bridge.js`
- Create: `native/web/tests/colyseus_bridge.test.mjs`
- Modify: `native/web/bloom_glue.js`
- Modify: `native/web/build.sh`
- Modify: `package.json` package file allowlist

**Interfaces:**
- Consumes: current FFI names and signatures in `src/colyseus/index.ts` and `package.json`.
- Produces: `createColyseusBridge({ Client })`, returning the `bloom_colyseus_*` functions expected by Perry's Web FFI; the bridge queues asynchronous SDK callbacks and delivers them through `bloom_colyseus_poll`/`bloom_colyseus_next_event`.

- [x] **Step 1: Write Node tests** for matchmaking, state and message events, byte payloads, request/reply, leave, disposal, and polling order using an injected fake `Client`.
- [x] **Step 2: Run `node --test native/web/tests/colyseus_bridge.test.mjs`** and confirm the tests fail because no functional web bridge exists.
- [x] **Step 3: Add `@colyseus/sdk` 0.18.4 and the bundler dependencies** in `native/web/package.json`; implement the bridge in its own module rather than expanding `bloom_glue.js` with room lifecycle logic.
- [x] **Step 4: Replace the unavailable-web stubs in `buildFfiImports()`** with the bridge functions and bundle the SDK during `native/web/build.sh`.
- [ ] **Step 5: Run `npm ci --prefix native/web`, `node --test native/web/tests/colyseus_bridge.test.mjs`, `cargo check --manifest-path native/shared/Cargo.toml --target wasm32-unknown-unknown --no-default-features --features web`, and the WebAssembly build.**
- [ ] **Step 6: Commit** as `feat: add Colyseus browser transport`.

### Task 6: Run one Colyseus integration smoke across the platform matrix

**Files:**
- Create: `native/shared/tests/colyseus_integration.rs`
- Create: `tests/colyseus/run-native-smoke.mjs`
- Create: `tests/colyseus/run-web-smoke.mjs`
- Create: `tests/colyseus/platform-matrix.test.mjs`
- Create: `tests/colyseus/apple-smoke/` simulator host
- Create: `tests/colyseus/android-smoke/` emulator host
- Modify: `examples/colyseus-smoke/main.ts`
- Modify: `.github/workflows/test.yml`
- Modify: `tools/validate-ffi.js`

**Interfaces:**
- Consumes: Task 1's server fixture, Tasks 2–5's platform transports, and the current Rust and TypeScript APIs.
- Produces: a runtime smoke harness that joins `test_room`, receives its initial state, exchanges JSON and binary messages, checks request/reply, manually reconnects after an unconsented drop, leaves, and disposes the client on native, simulator/emulator, and Web targets.

- [ ] **Step 1: Add failing Rust integration assertions** for join/nested-state/string-and-numeric-message/bytes/request/manual-reconnect/leave/dispose against `ws://127.0.0.1:2567`; include pending-join and pending-request cleanup assertions. Add browser assertions for the same protocol behavior and a Node test that asserts all nine targets have CI coverage.
- [ ] **Step 2: Run `node --test tests/colyseus/platform-matrix.test.mjs`** and confirm it fails because the current workflow lacks Android and Apple simulator Colyseus jobs.
- [x] **Step 3: Implement shared native and browser smoke runners** that start the repository fixture, wait for readiness, run the requested platform harness, and clean up the server even on failure.
- [ ] **Step 4: Add Apple simulator and Android emulator hosts** that call the BornEngine FFI and exercise the same fixture contract; use `xcrun simctl`/`xcodebuild` and Android NDK/emulator tools on their native runners.
- [x] **Step 5: Extend `tools/validate-ffi.js`** to fail when a target's Colyseus surface is marked as a stub or its manifest arity differs; keep watchOS target-local functions in its explicit parity set.
- [ ] **Step 6: Extend `.github/workflows/test.yml`** with Linux, Windows, and macOS desktop runtime jobs; Android emulator jobs on Ubuntu; iOS/tvOS/visionOS/watchOS simulator jobs on macOS; and the WebAssembly/browser job. Reuse existing shared-cache and platform-build conventions.
- [ ] **Step 7: Run `node --test tests/colyseus/platform-matrix.test.mjs`, `node tools/validate-ffi.js`, and each platform smoke job**; require passing runtime smoke for every target before publishing it as supported.
- [ ] **Step 8: Commit** as `test: verify Colyseus across BornEngine targets`.

### Task 7: Publish the tested support matrix in the website documentation

**Files:**
- Create: `webpage/tests/colyseus-support.test.mjs`
- Modify: `webpage/src/content/docs/api/colyseus.md`
- Modify: `webpage/src/content/docs/platforms/apple.md`
- Modify: `webpage/src/content/docs/platforms/mobile.md`
- Modify: `webpage/src/content/docs/platforms/web-wasm.md`

**Interfaces:**
- Consumes: the tested target results from Task 6.
- Produces: one published target/architecture matrix that identifies the backend, required network settings, and whether build and runtime validation passed.

- [ ] **Step 1: Add documentation checks** in `webpage/tests/colyseus-support.test.mjs` for the nine target rows and required Android/macOS network configuration notes.
- [ ] **Step 2: Run `npm --prefix webpage test`** and confirm the new support-matrix assertions fail before the docs are updated.
- [ ] **Step 3: Update the Colyseus API and platform guides** to describe the TypeScript API, target backend, smoke-tested operations, and only the remaining verified limitations.
- [x] **Step 4: Run `npm --prefix webpage run check`, `npm --prefix webpage run build`, `npm --prefix webpage test`, and `npm --prefix webpage run validate:dist`.**
- [ ] **Step 5: Commit** as `docs: document Colyseus platform support`.

## Execution Notes

- The existing Linux x86_64 implementation is the baseline and must remain green after every task.
- The current Colyseus server lives outside the BornEngine Git repository; Task 1 removes that CI dependency by moving its fixture source under `tests/colyseus/server/`.
- The current engine CI already has native Linux, Windows, and macOS build jobs and a WebAssembly build job. Extend those jobs and add Android and Apple simulator coverage instead of creating a second unrelated workflow.
- The current Native SDK release archives for non-Linux targets are not complete link closures. Task 2 must produce and validate dependency-complete archives before Tasks 3 and 4 enable them.
- If target-specific source builds reveal that the upstream Native SDK does not support a BornEngine platform, report the exact blocker and revise the backend design before claiming full support.
