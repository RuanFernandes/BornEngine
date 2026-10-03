# Native Build Performance Implementation Plan

> For agentic workers: REQUIRED SUB-SKILL: Use superpowers:executing-plans to carry out this plan task by task. Keep changes isolated to the BornEngine engine and bornengine-cli worktrees, and run the listed checks before claiming completion.

**Goal:** Make the first native compile understandable and later compiles faster through a shared Cargo cache, optional SQLite/QuickJS features, a development build profile, and explicit resource controls.

**Architecture:** The CLI owns native build policy. It supplies a per-user `CARGO_TARGET_DIR` only when the environment does not already set one, passes profile/job overrides to Perry's Cargo subprocess, and streams compiler output. The engine exposes opt-in Cargo features while preserving its Perry FFI surface with feature-disabled stubs. `bornengine cache warm` invokes Cargo for the project's installed engine and host target without compiling game TypeScript.

**Tech Stack:** Rust, Cargo, Perry, clap, `directories`, TypeScript/Perry FFI, Astro documentation.

**Approved spec:** [`../specs/2026-10-03-native-build-performance-design.md`](../specs/2026-10-03-native-build-performance-design.md)

**Repositories and worktrees:**

- Engine: `/home/nullborne/Documentos/Bornengine/.worktrees/bornengine-global-build-cache`, branch `work/global-build-cache`, based on current `origin/main`.
- CLI: create a clean worktree from current `bornengine-cli` `origin/main` after this plan is approved. Do not modify its existing main checkout.
- Preserve all pre-existing user changes and the unrelated untracked `pnpm-lock.yaml` in the parent workspace.

## Global constraints

- Keep Web/WASM behavior unchanged and preserve the current 2D/2.5D/3D mappings for models, image codecs, Jolt, and hot reload.
- Make `sqlite` and `scripting` opt-in for CLI-generated projects and native 2D defaults. Keep every TypeScript-declared FFI function available in both feature-enabled and disabled native builds.
- Do not change TypeScript API signatures. Feature-disabled calls must return an explicit unsupported/disabled result using the existing status/error channel.
- Honor caller-provided `CARGO_TARGET_DIR` and `CARGO_BUILD_JOBS`; only override jobs when `--jobs` is present. Do not impose a machine-wide job cap.
- Keep `bornengine build` optimized. `run` and `dev` use the fast incremental profile by default; `--release` opts into optimized run/dev builds.
- Do not compile the engine during CLI installation, bundle prebuilt platform artifacts in npm, or remove existing package-local targets.
- Do not add AI attribution to files or version-control metadata.

## Review focus

- Two projects share compatible Cargo artifacts, while explicit target-dir overrides remain untouched.
- Perry stdout and stderr stream while building, both pipes are drained without deadlock, and failure output remains actionable.
- A feature-off 2D build excludes `libsqlite3-sys` and `rquickjs-sys`; feature-on calls retain their behavior and all declared FFI symbols.
- `cache warm` selects the same manifest, native features, target cache, and profile as a normal build, and never compiles the game entrypoint.
- `--jobs` accepts only positive integers and has precedence over inherited `CARGO_BUILD_JOBS` only when supplied.
- The docs clearly distinguish first-build compilation from cache reuse and explain native feature selection.

## Task 1: Stream Perry compiler output and show elapsed build status

**Files:** CLI `src/process.rs`, `src/commands/build.rs`, `src/ui.rs`, `tests/process_contract.rs`, and focused command tests.

1. Add process-runner tests first. Cover stdout and stderr appearing before child exit, preservation of both streams in the returned result, a non-zero exit retaining diagnostics, and a child that fills both pipes without hanging.
2. Run the focused CLI tests and confirm the new cases fail against the current captured-only runner.
3. Implement a streaming captured runner that spawns Perry with piped stdout/stderr, drains both concurrently on reader threads, writes each stream to its matching terminal stream, joins readers, and returns an `Output` with the captured bytes and exit status.
4. Replace the spinner-only compile wrapper with a build status that does not erase compiler output and reports elapsed time. Keep a non-interactive/plain-terminal presentation readable. Print the command before spawning when `--verbose` is enabled.
5. Route `build`, `run`, `dev`, and cache warm compiler work through the visible-output path. Preserve `ensure_success` diagnostics and avoid printing captured output a second time after it has already streamed.
6. Run process and build-contract tests; commit as `fix: stream native compiler output`.

## Task 2: Gate native SQLite and QuickJS behind engine features

**Files:** Engine `native/shared/Cargo.toml`, `native/shared/src/lib.rs`, database/scripting implementation and stubs, `native/watchos/Cargo.toml`, `native/watchos/src/lib.rs`, platform `native/*/Cargo.toml` manifests, and Rust feature-contract tests.

1. Add feature-contract tests before implementation. Assert feature-disabled database and scripting calls return explicit disabled results while the declared database/scripting FFI symbols remain present; assert the current enabled implementations remain selected when features are enabled.
2. Run the focused Rust tests and verify they expose the current unconditional SQLite/QuickJS dependency graph and missing database feature-off path.
3. Make `rusqlite` optional behind `sqlite`; make `rquickjs` optional behind `scripting`. Preserve target restrictions for QuickJS and existing unsupported-target behavior. Gate database and scripting modules with the features and route disabled modules to interface-compatible stubs.
4. Implement the database stub from the existing public protocol and stable `__bloom_ffi_database!` macro. It must return the established `Unsupported` status/error through the same scratch/result protocol and export the same symbols; do not add or remove TypeScript FFI declarations.
5. Treat watchOS as a SQLite-capable special case: its crate includes the shared database source directly and owns its database FFI wrappers, so gate both the optional dependency and module/wrappers there and provide matching disabled stubs. Do not classify watchOS as unsupported for SQLite.
6. Add `sqlite`/`scripting` feature forwarding only to platform manifests that support those implementations. Keep QuickJS unsupported-target stubs and Web/WASM behavior unchanged. Preserve all existing model/Jolt mappings.
7. Validate both dependency graph and behavior: Linux 2D with no optional features excludes `libsqlite3-sys` and `rquickjs-sys`; adding each feature restores its dependency. Run shared Rust tests and native manifest checks for supported and stub platforms, including watchOS's feature-off and feature-on paths where the toolchain permits.
8. Run `node tools/validate-ffi.js` from the engine root and commit as `feat: make sqlite and scripting native features optional`.

## Task 3: Add the shared Cargo cache and `bornengine cache` commands

**Files:** CLI `src/cargo_profile.rs`, new `src/commands/cache.rs`, `src/commands/mod.rs`, `src/cli.rs`, `src/lib.rs`, focused tests, plus CLI help/docs and engine CLI documentation.

1. Add unit tests for cache-root resolution: use `BaseDirs::cache_dir()/BornEngine/cargo-target` when unset, preserve `CARGO_TARGET_DIR` verbatim when set, and report the effective path. Cover unavailable cache-directory errors.
2. Add command/parser tests for `bornengine cache path` and `bornengine cache warm`, including running `path` outside a BornEngine project and useful errors for `warm` without an installed engine or native host target.
3. Add native-target resolution tests mapping the supported current hosts to their `native/<platform>/Cargo.toml` manifests and rejecting Web/WASM warm requests with an actionable explanation.
4. Set the resolved target directory in the Cargo proxy environment only when the parent process did not set it. Ensure Perry's Cargo proxy sees it for `build`, `run`, `dev`, and warm operations.
5. Implement `cache path` to display either the environment override or the resolved default. Implement `cache warm` to read project engine version/profile/features, invoke Cargo directly for the installed engine's current native target, use the shared cache, and avoid Perry/TypeScript entrypoint compilation. Use the same fast/release profile and job settings as the caller selected for normal build commands.
6. Add integration coverage with a fake Cargo executable/fixture manifest proving warm uses the selected manifest, feature list, target dir, profile, and job count, and that it does not call Perry.
7. Run focused CLI tests and commit as `feat: reuse a global native cargo cache`.

## Task 4: Add fast development builds, job controls, and project feature selection

**Files:** CLI `src/cli.rs`, `src/commands/mod.rs`, `src/commands/build.rs`, `src/cargo_profile.rs`, `src/project.rs`, `src/commands/project.rs`, `src/commands/create.rs`, `tests/cli_contract.rs`, `tests/native_profile_contract.rs`, `tests/project_contract.rs`, and command docs.

1. Add parser/config tests first for `run --release`, `dev --release`, positive `--jobs N` on build/run/dev/cache warm, rejection of zero/negative jobs, and `new --native-features sqlite,scripting`. Confirm existing invocations still parse unchanged.
2. Add project-generation tests for no optional features by default, selected feature serialization in `[bornengine].native_features`, validation of supported feature names, and correct combination with each existing 2D/2.5D/3D profile.
3. Implement development profile environment overrides for `run` and `dev` using opt-level 1 plus Cargo incremental compilation; `--release` removes those overrides and selects optimized output. Keep `build` optimized by default. Ensure Perry's `perry dev` build also receives the selected mode.
4. Implement `--jobs` as a positive integer and set `CARGO_BUILD_JOBS` only when supplied. With no CLI option, preserve any inherited environment value and Cargo's own scheduling.
5. Add `--native-features` to project creation and write the validated choices to the generated `perry.toml`; document that SQLite and embedded scripting are opt-in native capabilities and do not alter Web/WASM behavior.
6. Apply profile/job/cache environment consistently to `build`, `run`, `dev`, and `cache warm`; do not leak development overrides into optimized `build` or `run --release`.
7. Run CLI parser, project-generation, native-profile, and process tests; commit as `feat: add fast native development build options`.

## Task 5: Document the workflow and verify the cross-repository build matrix

**Files:** Engine webpage CLI build/configuration docs and API storage/scripting/platform docs; CLI project/build/help docs; any current docs index links that need updating; acceptance tests or CI jobs where required by the existing workflow.

1. Update docs for first-build behavior, global cache location and override, `cache path`, `cache warm`, the meaning of fast versus release builds, `--jobs`, and opt-in native `sqlite`/`scripting` features. State that the CLI does not compile artifacts during installation.
2. Add the `bornengine new --native-features sqlite,scripting` example and describe unsupported QuickJS platforms and unchanged Web/WASM behavior.
3. Run all CLI tests and formatting/lint checks from the CLI worktree. Run engine shared Rust tests, FFI manifest validation, and Cargo feature-tree checks for 2D default/off, SQLite on, scripting on, and existing 3D profile.
4. Run native build smoke checks for Linux and all available platform checks. Add or update CI coverage for the supported feature matrix if current CI does not exercise feature-off compilation; do not claim unavailable Apple/watchOS toolchains passed.
5. Run the website checks: `npm run check`, `npm test`, `npm run build`, and `npm run validate:dist` from `webpage`.
6. Run one Perry native smoke build for the current host, then a second compatible project/build to confirm Cargo reuses the shared cache. Verify compiler lines appear before process completion and that `cache warm` leaves the game output untouched.
7. Review combined engine/CLI diffs, ensure no package or lockfile churn is unrelated, and record exact check results and any unavailable platform limitations.

## Completion criteria

- All five tasks are implemented and committed in their respective worktrees with no user changes overwritten.
- Focused and full available test suites pass; Rust feature trees prove unused SQLite/QuickJS are absent from default native 2D builds.
- `bornengine cache warm` and repeat-build cache reuse are demonstrated for an installed project.
- Website and CLI documentation match actual behavior.
- The work is ready for review/integration; publishing remains governed by the already authorized release flow and must wait for all required checks.
