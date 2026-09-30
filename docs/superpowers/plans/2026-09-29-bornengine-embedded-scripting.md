# BornEngine Embedded Scripting Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a capability-limited embedded JavaScript behavior runtime to BornEngine with a native and Web/WASM vertical slice, CLI validation/packaging, diagnostics, and documentation.

**Architecture:** `Game.scripting` owns context-bound script modules. Each `ScriptComponent` uses a separate QuickJS-NG runtime through Rust, receives a restricted `ScriptContext`, and returns queued host commands that BornEngine applies after guest execution. The existing `bornengine` CLI validates and packages self-contained JavaScript modules.

**Tech Stack:** TypeScript/Perry, Rust, `rquickjs` 0.14 (QuickJS-NG), WebAssembly, existing Rust `bornengine-cli`, Node contract harness, Astro docs.

**Spec:** `docs/design/scripting-runtime-v1.md`

## Global Constraints

- Guest JavaScript receives no host `Game`, native handles, filesystem, process, network, workers, or dynamic module loading.
- Each guest script has its own runtime heap and configurable memory, stack, and interrupt-check limits.
- Guest failures stay local to the script and never cross Perry FFI as exceptions or panic the game.
- Every native operation is declared in `package.json`; native, Web/WASM, and watchOS stub surfaces match the manifest and Perry argument limits.
- Native/WASM compilation success is not a claim that every mobile or watch target is supported; unsupported targets report that state safely.
- Do not modify the untracked user `pnpm-lock.yaml`, the Navigation2D worktree, or unrelated repositories beyond the existing `bornengine-cli` integration specified here.
- Use the configured Git identity only; add no AI attribution to artifacts or version-control metadata.

## Review Focus

- Infinite loops or deeply recursive code must return control without terminating the host game — Task 1 runtime tests.
- One script exhausting memory or mutating globals must not exceed its limit or leak state into another script — Task 1 tests.
- A denied capability must be absent and guest code must not change its host `GameObject` — Task 3 contract tests.
- Guest transform and particle commands must be bounded, ordered, and applied only after a synchronous guest hook succeeds — Task 3 tests and review fixes.
- Malformed, missing, or escaping script package paths must fail validation without writing outside the package/output roots — Task 4 tests.

---

### Task 1: Embedded JavaScript runtime

**Files:**
- Create: `native/shared/src/scripting.rs`
- Modify: `native/shared/Cargo.toml`, `native/shared/Cargo.lock`, `native/shared/src/lib.rs`
- Test: Rust unit tests in `native/shared/src/scripting.rs`

**Interfaces:**
- Produces `ScriptVm::new(limits, permissions)`, `load(source)`, `start(context)`, `update(context, dt)`, `drain_commands()`, `error()`, `memory_used()`, and `dispose()`. `ScriptLimits` carries `max_memory_bytes`, `max_stack_bytes`, and `max_interrupt_checks`; `ScriptPermissions` has explicit `log`, `self_read`, `self_transform_write`, and `self_particles_emit` booleans.
- A loaded module is an ES module whose default export is an object of optional `onStart`, `update`, and `onDestroy` functions.
- Commands are a typed enum for log, self transform changes, and particle bursts; one VM cannot inspect another VM's globals or commands.

- [x] Write Rust runtime tests covering persistent state, invalid modules, denied capabilities, heap isolation, interruption, memory exhaustion, command ordering, and hook validation.
- [x] Run the focused tests and verify the new tests fail before implementation.
- [x] Implement `ScriptVm` with `rquickjs` 0.14, no standard library modules or loader, one heap per VM, and a resettable interrupt budget per guest callback.
- [x] Run focused tests and build the shared crate for native and `wasm32-unknown-unknown`; the full native suite passes with `image-extras` enabled.
- [x] Measure a linked Web artifact against the pre-change build. The raw WebAssembly output grew from 14,721,170 bytes to 16,395,691 bytes (+1,674,521 bytes, about 11.4%); `wasm-pack` applies the release `wasm-opt -Oz` pass separately.
- [x] Commit as `feat: embed capability-limited JavaScript runtime` (`3be9e75`).

### Task 2: FFI and platform bindings

**Files:**
- Create: `native/shared/src/ffi_core/scripting.rs`
- Modify: `native/shared/src/ffi_core/mod.rs`, `native/web/src/lib.rs`, `native/web/src/scripting_ffi.rs`, `native/watchos/src/ffi_stubs.rs`, `package.json`, and Cargo lockfiles for every native crate that depends on `bloom-shared`
- Test: `tools/validate-ffi.js` and the shared Rust tests

**Interfaces:**
- Produces `bloom_script_supported`, `bloom_script_create`, `bloom_script_load`, `bloom_script_start`, `bloom_script_update`, `bloom_script_dispose`, `bloom_script_command_count`, `bloom_script_command_kind`, `bloom_script_command_number`, `bloom_script_command_text`, `bloom_script_clear_commands`, `bloom_script_status`, `bloom_script_error`, `bloom_script_memory_used`, and `bloom_script_destroy`; no function has more than six arguments.
- String inputs use the existing Perry `StringHeader` helper on native and `&str` wrappers on Web. Numeric command data uses separate typed getters; no packed per-frame text parsing.
- Unsupported platform stubs return status 0 and a stable unsupported error without panicking.

- [x] Add manifest and Rust macro-surface checks that fail when a new scripting operation is missing or has the wrong arity.
- [x] Implement guarded native and Web/WASM wrappers over the same Rust runtime API; add watchOS safe stubs and explicit availability/status reporting.
- [x] Run `node tools/validate-ffi.js`, the full shared Rust suite with `image-extras`, and a `wasm32-unknown-unknown` shared-crate build. The native Web crate's no-default-features build remains blocked by its existing unconditional 3D references.
- [x] Commit as `feat: expose scripting runtime across FFI backends` (`8c6d679`).

### Task 3: Game-owned scripting API

**Files:**
- Create: `src/scripting/index.ts`, `src/scripting/script-runtime.ts`, `src/scripting/script-component.ts`, `src/scripting/internal.ts`, `tests/game-runtime/script-component.ts`, `tests/game-runtime/script-component-harness.cjs`
- Modify: `src/core/game.ts`, `src/core/index.ts`, `src/game/index.ts`, `src/index.ts`, `package.json`

**Interfaces:**
- Produces `game.scripting`, `ScriptRuntime`, `ScriptComponent extends GameComponent`, `ScriptPermission`, `ScriptContext`, `ScriptLimits`, and `ScriptStatus`.
- `new ScriptComponent(game.scripting, source, options?)` attaches a default-exported guest module to one `GameObject`; options default to no permissions and bounded runtime limits.
- `ScriptContext` exposes only the granted `log`, read-only own-object identity/transform, transform-command, and emitter-burst APIs. It never exposes `Game` or other objects.
- `ScriptComponent.dispose()` releases its owned VM safely before or after scene attachment.

- [x] Write Perry-compatible contract tests for denied APIs, transform command order, attached-emitter burst, error isolation, detach/dispose, and game-context ownership.
- [x] Run the new Node contract test and confirm it fails before adding the API.
- [x] Implement the Game-owned service/component API, command drain/application, context-resource cleanup, root/subpath exports, and complete FFI declarations.
- [x] Run the contract test, Perry compile smoke fixture, and FFI validation.
- [x] Commit as `feat: add game-owned JavaScript script components`.

### Task 4: Existing CLI script package commands

**Files:**
- Modify: `bornengine-cli/src/cli.rs`, `bornengine-cli/src/commands/mod.rs`, `bornengine-cli/src/lib.rs`
- Create: `bornengine-cli/src/commands/scripts.rs`
- Test: `bornengine-cli/tests/script_package_contract.rs`
- Repository: existing `bornengine-cli` project in its own worktree based on its current remote `main`.

**Interfaces:**
- Produces `bornengine script check [--manifest <path>]` and `bornengine script pack --output <directory> [--manifest <path>]`.
- The package manifest `bornengine.script.json` uses `format: "bornengine-script-v1"`, `apiVersion: 1`, a relative `.js`/`.mjs` `entry`, and a sorted unique `permissions` list. Pack output is deterministic and contains the manifest, declared regular entry file, and an ownership marker that verifies their hashes before replacement.

- [x] Write `script_check_accepts_valid_package`, `script_check_rejects_unknown_api_or_permission`, `script_check_rejects_missing_and_escaping_entry`, `script_pack_contains_only_the_declared_entry`, and `script_pack_is_deterministic` tests.
- [x] Run focused CLI tests and verify expected failures before implementation.
- [x] Implement strict path validation, schema validation, and staged/collision-safe deterministic packaging, following existing asset-pack safety patterns.
- [x] Run focused CLI tests and `cargo test` for the CLI repository (134 tests pass); `cargo fmt --all -- --check` also passes.
- [x] Commit as `feat: validate and package script modules` (`1f81bf1`).

### Task 5: Diagnostics, documentation, and example

**Files:**
- Modify: `src/core/game.ts`, `src/debug-ui/game-inspector.ts`, `webpage/src/content/docs/api/index.md`, `webpage/src/content/docs/guides/index.md`
- Create: `webpage/src/content/docs/api/scripting.md`, `examples/scripted-actor/`

**Interfaces:**
- The optional `Game.debug` inspector reports script status, current error, memory use, and last callback cost when the scripting runtime is available.
- The example uses the CLI package format and demonstrates self movement, denied capability behavior, and a particle burst through an attached `ParticleEmitter2D`.

- [x] Add an example smoke fixture that parses the guest module, checks the package/API shape, verifies that Perry embeds the canonical guest source, and compile the host example.
- [x] Implement the configurable script inspector panel, API and CLI docs, security/authority limitations, supported target matrix, package workflow, and runnable example.
- [x] Run the example fixture, `node tools/validate-ffi.js`, the shared native and Web/WASM runtime checks, CLI tests and command smoke, plus the website check, tests, build, and distribution validation. Default native platform linking remains unavailable because the JoltPhysics submodule is missing from this checkout.
- [x] Commit as `docs: document BornEngine scripting sandbox` (engine worktree).

### Review fixes

- [x] Add bounded, non-executing syntax validation to CLI check and pack; reject static imports, re-exports, and dynamic imports.
- [x] Add deterministic ownership proof to packed output and refuse replacement after missing, modified, linked, or untracked content.
- [x] Reject Promise-returning hooks, discard failed-hook commands, and preserve bounded guest exception message and stack details.
- [x] Report support only on validated Linux native and Web/WASM targets; retain unsupported native FFI exports and watchOS stubs.
- [x] Keep failed ScriptComponents in Game ownership for Inspector diagnostics until disposal; assert denial against the actual `ctx.self` API.
