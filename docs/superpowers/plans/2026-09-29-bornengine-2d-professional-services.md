# BornEngine 2D Production Services and Runtime Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` to run independent workstreams in dedicated worktrees. Keep a progress ledger per workstream. The user previously requested parallel worktrees and one final integration branch per repository.

**Goal:** Deliver the approved class-first standalone lifecycle, portable SQLite/typed ORM, reliable 2D slope/platform/CCD collisions, and asset auditing in the existing CLI, integrated with the prior approved 2D production work.

**Architecture:** `Game.run()` owns standalone lifecycle and reports completion asynchronously. `GameDatabase` has one typed TypeScript API over native SQLite and a worker-based SQLite WASM backend. `PhysicsWorld2D` gains static segments/convex shapes, one-way surfaces, and opt-in continuous collision handling without replacing its fixed-step solver. `bornengine assets validate` grows configurable deterministic diagnostics; it remains the only CLI.

**Spec:** `docs/superpowers/specs/2026-09-29-bornengine-2d-professional-services-design.md`.

**Repositories:** `BornEngine` and `bornengine-cli`; produce separate integration branches and PRs because they are separate Git repositories.

## Integration setup

Create the review branches from current release branches, without changing either existing integration branch:

1. In `BornEngine`, create `integrate/2d-professional` from `main` at `9046522` (`v0.10.0`), then merge the earlier `integrate/2d-production` branch. Resolve conflicts against current `main` on this new branch and run baseline checks before parallel feature tasks start.
2. In `bornengine-cli`, create `integrate/2d-professional` from `main` at `d54171d` (`v0.2.0`), then merge the earlier `integrate/2d-production` branch. Resolve conflicts on this new branch and run the CLI baseline checks.
3. Create independent task worktrees from these integration commits. Commit each complete workstream. Merge completed worktree branches into the matching integration branch in the dependency order below, reviewing each merge diff.

Keep the original `BornEngine` checkout's untracked `pnpm-lock.yaml` byte-for-byte and unstaged. Use the configured Git author. Do not merge into shared `main`, publish npm, or deploy the website during implementation.

## Global implementation constraints

- Follow `AGENTS.md` and the approved specification. TypeScript under `src/` is compiled by Perry: validate inputs, return typed status results, keep dynamic subclass receivers intact, and do not introduce reachable `throw` paths.
- No compatibility overload for `Game.run(callbacks)` or `GameStorage`; there are no current shipped games that need either one.
- Preserve the 3D renderer, model and skeletal animation API, existing tilemap/world2D file formats, and existing 2D public behavior unless an explicit regression fixture covers a corrected bug.
- Freeze the database TypeScript API and FFI request/response protocol in a compile-only Perry fixture before splitting database native and Web implementations. Keep `package.json` FFI manifest entries, Rust/Web/watchOS symbols, scratch buffer protocols, and argument counts aligned.
- Add regression fixtures before implementation for each public behavior. Keep physics ordering and database statuses deterministic; don't use wall-clock performance assertions.
- Keep the CLI repository independent and use the same fixture paths/diagnostic codes in its tests and the BornEngine docs.

## Workstream A: canonical Game lifecycle

**Worktree branch:** `work/game-run-lifecycle`
**Files:** Modify `src/core/game.ts`, `src/core/index.ts`, `src/index.ts`, `tests/game-runtime/game-subclass-lifecycle.ts`, `tests/game-runtime/perry-compat.ts`, the root README and standalone snippets under `docs/`, `webpage/`, and `examples/`. Modify the CLI starter in `bornengine-cli/src/project.rs` in the CLI workstream.

1. Add lifecycle fixtures first: hook order, one-time `onStart`/`onStop`, completion promise settlement after cleanup, stop/dispose idempotence, hook failures recorded through `Game.error`, subclass `render()` calling `super.render()`, and embedded `runFrame()` still driving callbacks.
2. Remove the `run(callbacks)` overload. Make `run()` return a completion `Promise<void>` on all targets; resolve after `onStop()` and resource cleanup on normal shutdown and failure. Preserve native blocking behavior internally and Web asynchronous frame scheduling. Store lifecycle errors in `Game.error` rather than rethrowing through Perry TypeScript.
3. Keep a clearly named embedded-frame callback type for `runFrame(deltaTime, callbacks)` only; keep its Boolean continuation result and host-owned scheduler contract.
4. Search with `rg -n 'game\\.run\\(' docs webpage examples README.md` and migrate every standalone example and snippet, including 3D examples, to a `Game` subclass. Retain callbacks only in explicitly embedded `runFrame()` documentation.
5. Run `perry run macos tests/game-runtime/game-subclass-lifecycle.ts` and strict Perry checks for the lifecycle and public API fixtures. Compile migrated representative 2D and 3D examples.

**Commit:** `feat: make subclass game lifecycle canonical`

## Workstream B: freeze the GameDatabase API and FFI contract

**Worktree branch:** `work/database-contract`
**Depends on:** None. Complete before splitting the native and Web implementations.

**Files:** Add `src/storage/game-database.ts`, `src/storage/schema.ts`, `src/storage/query.ts`, `src/storage/migrations.ts`, and compile-only `tests/game-runtime/game-database-types.ts`; replace `src/storage/game-storage.ts` and `src/storage/create-game-storage.ts`; update `src/storage/index.ts`, `src/index.ts`, and root `package.json` with the agreed database FFI names and arities only.

1. Add a Perry compile-only fixture proving inferred row types, schema descriptors, supported filter types, migration definitions, transaction callbacks, typed result codes, export/import bytes, and Promise composition.
2. Implement explicit table/column descriptors for integer, real, text, blob, and boolean; infer row fields from nullable/not-null/default/primary-key rules. Validate names, columns, types, keys, indexes, migration versions, and unknown query fields before FFI calls.
3. Specify typed CRUD/filter/order/limit, transactions with rollback on failure, versioned migrations, database export/import, stable result statuses, and lifecycle states (`new`, `open`, `closed`). All operations are Promises resolving typed result objects; invalid API inputs do not throw.
4. Define the bounded FFI operation set and scratch-buffer wire format for requests, query results, and binary transfers. Freeze this before the native and Web worktrees start; do not expose arbitrary SQL.
5. Replace `GameStorage` exports but leave native/Web implementation for their respective tasks. Do not leave a compatibility alias.
6. Run `perry check --strict --target macos tests/game-runtime/game-database-types.ts` and add the contract fixture to `perry-compat.ts`.

**Commit:** `feat: define typed game database API`

## Workstream C: native SQLite and app-data storage

**Worktree branch:** `work/game-database-native`
**Depends on:** Workstream B's frozen TypeScript/FFI contract; parallel with Workstreams D and E.

**Files:** Modify `native/shared/Cargo.toml`, `native/shared/src/lib.rs`, `native/shared/src/ffi_core/mod.rs`, and `native/shared/src/ffi_core/assets.rs` only to move/remove old GameStorage FFI if applicable; add `native/shared/src/database.rs` and `native/shared/src/ffi_core/database.rs`; modify per-platform app-data hooks, `native/watchos/Cargo.toml`, `native/watchos/src/lib.rs`, `native/watchos/src/ffi_stubs.rs`, and `native/watchos/gen_stubs.js`.

1. Add native Rust tests first for open/close/reopen, CRUD bindings, constraints, migration atomicity, transaction rollback, busy handles, blob round-trips, export/import, app-ID/path validation, and storage failures.
2. Add a pinned bundled SQLite core to `bloom-shared` and a per-platform application-data directory provider. Keep connection state per handle, close deterministically, and translate engine/database failures to frozen status codes without logging user payloads.
3. Implement all declared native FFI symbols within Perry's argument limit. Use validated scratch buffers for schema/query payloads and binary import/export; align with the FFI contract from Workstream B.
4. Implement watchOS storage in its independent crate instead of leaving database calls as stubs. Use the app container and verify the WatchOS app build/smoke path.
5. Implement atomic database export/import. Validate the SQLite image and schema version, close active handles, stage the new image, then atomically replace storage so a failed import keeps the previous database readable.
6. Run `node tools/validate-ffi.js`, `cargo fmt --manifest-path native/shared/Cargo.toml -- --check`, `cargo test --release --manifest-path native/shared/Cargo.toml`, the shared Web-feature check, and available native Apple/Windows/Linux/Android target builds. Record watchOS CI evidence.

**Commit:** `feat: add native SQLite game database`

## Workstream D: Web/WASM SQLite worker and persistent fallback

**Worktree branch:** `work/game-database-web`
**Depends on:** Workstream B's frozen TypeScript/FFI contract; parallel with Workstreams C and E.

**Files:** Modify `native/web/bloom_glue.js`, `native/web/src/lib.rs`, `native/web/build.sh`, and `native/web/package.json`; add the pinned SQLite WASM worker/bootstrap and `native/web/tests/sqlite_database.test.mjs`; update Web build-output validation if required.

1. Add worker bridge fixtures first for open/request/result ordering, multiple database handles, worker failure, invalid payloads, abort/shutdown, and busy locks.
2. Package the pinned official SQLite WASM build and dedicated worker through the existing build pipeline. Do not require COOP/COEP headers for the primary OPFS SyncAccessHandle pool VFS.
3. Route FFI database requests through worker request IDs and typed result polling using the frozen scratch-buffer contract; don't block the browser UI thread or pass raw query results every frame.
4. Persist with OPFS when supported. When unavailable, keep the SQLite connection in the worker and atomically commit serialized database snapshots to IndexedDB before resolving a write. Make volatile in-memory mode explicit; return a storage error instead of silently using it for persistent databases.
5. Hold an origin/database writer lock for both backends and return `busy` for another writer. Surface IndexedDB quota failures and browser storage denial as typed statuses.
6. Verify database export/import byte parity, migration rollback, reopen persistence, worker termination, and root FFI/Web symbol parity. Keep database worker/WASM artifacts out of user asset packs.
7. Run the Node worker/glue tests, `cargo check --manifest-path native/web/Cargo.toml --target wasm32-unknown-unknown`, the existing Web build pipeline, and an actual browser persistence smoke test on available Chromium and WebKit/Firefox runners. Record any unavailable browser check.

**Commit:** `feat: add persistent Web SQLite backend`

## Workstream E: deterministic slopes, one-way platforms, and CCD

**Worktree branch:** `work/physics2d-collisions`
**Files:** Modify `src/physics2d/physics-body-2d.ts`, `src/physics2d/physics-world-2d.ts`, `src/physics2d/character-body-2d.ts`, and `src/physics2d/index.ts`; add `tests/game-runtime/physics2d-slopes.ts`, `tests/game-runtime/physics2d-one-way.ts`, and `tests/game-runtime/physics2d-ccd.ts`; update physics API docs after the public shape is stable.

1. Add fixtures before implementation for convex polygon validation/winding, segment edge contacts, ascending/descending ramps, one-way landings and underside pass-through, opt-in CCD tunneling prevention, layers/masks, and repeatable contact ordering.
2. Add immutable static segment and convex polygon shapes with validated finite local vertices. Reject fewer than three polygon vertices, degenerate edges/area, non-convex/self-intersecting points, and invalid segment endpoints safely.
3. Add stable narrow-phase contacts between supported dynamic box/circle bodies and static segment/convex surfaces. Keep dynamic polygon-vs-polygon out of scope. Normalize normals and tie-breaking so contact/event order remains deterministic.
4. Add one-way surface settings with explicit outward normal and tolerance. Decide collisions from prior-side position and approach velocity so upward-moving bodies pass through and downward-moving bodies land from above.
5. Add an opt-in CCD mode/threshold for fast dynamic bodies. Use swept tests against supported static surfaces during each fixed step, resolve at the earliest hit, and integrate remaining time without tunneling. Keep the ordinary discrete path for bodies that do not opt in.
6. Extend `CharacterBody2D.moveAndSlide()` and floor/wall/ceiling normals to use the new surface contacts. Check negative coordinates, corners, zero velocity, and `Vector2D` value behavior.
7. Run `perry run macos` for all three physics fixtures and existing `character-body-2d.ts`, `physics2d-broadphase.ts`, `physics2d-tilemap.ts`, and `tilemap-chunks.ts`; compile a platformer example using a slope, one-way platform, and fast projectile.

**Commit:** `feat: add deterministic 2d slopes and continuous collision`

## Workstream F: existing CLI asset audit

**Repository/worktree branch:** `bornengine-cli`, `work/assets-audit`; depends on Workstream A's frozen standalone `Game` API for the generated starter.
**Files:** Modify `src/cli.rs`, `src/commands/mod.rs`, `src/commands/assets.rs`, `src/project.rs`, `Cargo.toml`/`Cargo.lock` only if a bounded metadata parser is needed, `tests/asset_pack_contract.rs`, add `tests/asset_validation_report.rs`, and update `README.md`.

1. Extend existing contract fixtures for static world references, dynamic references, exclusions, orphan reports, invalid media headers, file/total byte limits, image dimension/pixel limits, configuration validation, JSON determinism, path traversal, and symlink safety.
2. Add a versioned project manifest `bornengine.assets.json` for explicitly dynamic paths, exclusions, orphan severity, and default budgets. Use project-relative safe paths/globs. CLI flags override manifest settings. With no new configuration, preserve existing validation failures, exit behavior, and pack inventory; new audit findings are warnings only.
3. Return a structured report of stable diagnostic codes, relative paths, measured values, and limits. Keep deterministic ordering. Human output stays actionable; `--json` writes only the stable JSON report for machine consumers.
4. Identify references only from supported World2D/Tiled data plus declared dynamic paths; never claim to resolve arbitrary TypeScript expressions. Warn for known unreferenced assets by default and let projects promote warnings to errors.
5. Probe recognized image/audio signatures and image dimensions; diagnose invalid headers, mismatched extensions, unreadable files, per-file limits, aggregate bytes, maximum image dimensions, and aggregate image pixels. Do not fully decode/transform/rewrite packed assets.
6. Keep `assets pack`, `build`, `run`, and `dev --watch` using the same safe inventory. Ensure configured error-level diagnostics fail build before publishing a pack; advisory diagnostics do not change default builds.
7. Update Clap help, README, CLI generated `main.ts` to use a `Game` subclass, and project creation tests. Preserve the deterministic pack manifest format unless an independently justified format-version change is required.
8. Run `cargo fmt --all -- --check`, `cargo clippy --locked --all-targets --all-features -- -D warnings`, `cargo test --locked --all-targets --all-features`, and `cargo build --locked --release`.

**Commit:** `feat: expand asset validation diagnostics`

## Workstream G: docs, sample, and final integration

**Worktree branch:** `work/2d-professional-docs`
**Depends on:** Workstreams A–F have merged into their integration branches and their exported APIs are stable.

**Files:** Update `webpage/src/content/docs/api/core.md`, retain `webpage/src/content/docs/api/storage.md` as the stable URL while rewriting it for `GameDatabase`, update `api/physics2d.md`, `platforms/web-wasm.md`, other affected platform pages, `guides/2d-game.md`, `guides/2d-production-workflow.md`, `concepts/game-loop.md`, `reference/migration.md`, the website root sample, and `examples/2d-platformer/` docs/source. Update the relevant pages under `webpage/src/content/docs/cli/` and `bornengine-cli/README.md`.

1. Create one complete example using a `Game` subclass that awaits `GameDatabase.open()` before `run()`, uses typed migration/save/load transactions, uses a sloped static platform and a one-way platform, and exports/imports a save. After `await game.run()`, close the database and handle statuses explicitly.
2. Remove all public docs and examples for `GameStorage` and standalone callback-based `run`; document `runFrame()` as an embedding-only API and document the `Game.run()` completion/error contract.
3. Document the SQLite schema/CRUD/filter/transaction/migration APIs, stable result statuses, native app-data locations, worker/OPFS and IndexedDB behavior, quota/eviction limits, single-writer rule, export/import, and unsupported secret-storage use.
4. Document physics shape restrictions, one-way normal/tolerance rules, CCD opt-in behavior, fixed-step limits, and collision ordering.
5. Update homepage/editor code examples to match the new lifecycle API. Add an API migration table stating that callback `Game.run()` and `GameStorage` are removed.
6. Merge the completed task commits into the integration branches, resolve conflicts manually, audit changed public exports and FFI declarations, and run the full final suite.
7. Open one PR for BornEngine and one for bornengine-cli, attach both to this task, and report all platform/browser checks. Do not merge, release, publish, or deploy until the user reviews the PRs and explicitly asks for that step.

**Commit:** `docs: document database and 2d collision workflows`

## Verification gate

Engine final checks:

```sh
node tools/validate-ffi.js
cargo fmt --manifest-path native/shared/Cargo.toml -- --check
cargo test --release --manifest-path native/shared/Cargo.toml
cargo check --manifest-path native/shared/Cargo.toml --no-default-features --features web --target wasm32-unknown-unknown
```

Also run the affected Perry fixtures and example builds, Web/WASM worker tests and full Web build, available Apple/Windows/Linux/Android target builds, watchOS smoke/CI, and website checks from Workstream F. Website: `cd webpage && npm run check && npm test && npm run build && npm run validate:dist`.

CLI final checks:

```sh
cargo fmt --all -- --check
cargo clippy --locked --all-targets --all-features -- -D warnings
cargo test --locked --all-targets --all-features
cargo build --locked --release
```

Record exact tool output for failed/unavailable platform checks; no check is waived silently.
