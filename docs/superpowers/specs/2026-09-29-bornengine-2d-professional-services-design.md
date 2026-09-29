# BornEngine 2D Production Services and Runtime Design

**Date:** 2026-09-29
**Status:** Proposed for specification review
**Repositories:** `BornEngine` and `bornengine-cli`

## Goal

Make the 2D development and shipping path feel cohesive across the engine, browser and native runtimes, and the existing CLI. Developers should write game lifecycle code in a `Game` subclass, store structured game data in a portable SQLite database through a small typed ORM, and get useful physics and asset validation without building those systems themselves. Players should get reliable saves and predictable collisions.

This work extends the previously approved 2D production foundation. It keeps the existing 2D camera, scene, tilemap, input, audio, sprite, and CLI foundations. It does not expand 3D.

## Baseline and integration

- Engine base: `main` at `9046522` (`v0.10.0`).
- CLI base: `main` at `d54171d` (`v0.2.0`).
- The engine already has a subclass-driven `Game` lifecycle, but also exposes callback-based `Game.run(callbacks)` and many docs and examples still use it.
- The current 2D production integration branch adds the previously approved camera, tilemap/physics, World2D, shipping-services, Vector2D, sample, and documentation work. Its `GameStorage` design predates the SQLite decision in this spec and is replaced by `GameDatabase` below.
- Keep the BornEngine and CLI repositories separate. Produce one review branch and PR per repository, with shared fixtures and matching documentation. Sync the work with the current `main` baselines before opening the PRs. Preserve the untracked `BornEngine/pnpm-lock.yaml` in the original checkout.
- Do not merge to `main`, publish npm, or deploy the site as part of implementation. Prepare reviewable, locally verified PRs first.

## 1. Canonical `Game` subclass lifecycle

Standalone games use the `Game` subclass as their entry point:

```ts
class Undertale extends Game {
  protected onStart(): void {
    // Load the initial scene and prepare game state.
  }

  protected loop(deltaTime: number): void {
    // Advance gameplay state.
  }

  protected render(): void {
    super.render();
    // Draw optional game-specific overlays after the scene.
  }

  protected onStop(): void {
    // Release game-owned state before shutdown completes.
  }
}

const game = new Undertale({ window: { title: 'Undertale', width: 800, height: 450 } });
await game.run();
```

Decisions:

- `Game.run()` is the only standalone lifecycle API. Remove the callback overload and migrate standalone examples, docs, and the CLI's starter template to subclass hooks.
- Make `run()` return a completion `Promise<void>` that resolves once shutdown and `onStop()` finish. Native execution may remain blocking internally; Web execution resolves after the frame loop ends. Runtime failures continue to be reported through the existing `Game.error`/readiness conventions instead of introducing thrown errors from Perry-compiled TypeScript.
- Catch lifecycle-hook failures, store a useful message in `Game.error`, and complete shutdown once. The completion promise resolves after shutdown even on failure; callers inspect `game.error` after awaiting it.
- Keep `runFrame()` for embedded hosts that own their own frame scheduler. Its callback contract becomes explicitly named for embedded usage and is not shown as a general standalone alternative.
- Preserve hook order and `super.render()` as the point where subclasses include automatic scene rendering.
- There are no current game projects that need callback-based `Game.run()` compatibility. Do not retain a compatibility overload.

## 2. Portable SQLite and typed ORM

Replace `GameStorage` with `GameDatabase`, an engine-owned SQLite API backed by the same schema and query contract on native and Web/WASM platforms.

### Public model

- A `GameDatabase` instance is configured with a validated `appId`, database name, explicit table schemas, and versioned migrations. Constructing it does not open storage; callers explicitly `await database.open()` before starting gameplay.
- `open()`, CRUD operations, `transaction()`, `export()`, `import()`, and `close()` use one asynchronous TypeScript result contract on all targets. Operations resolve typed result values with stable status codes; invalid schemas, missing storage, quota errors, migration errors, corrupt files, and closed handles do not throw from engine TypeScript.
- Define tables with explicit typed column descriptors. Support SQLite integer, real, text, blob, and boolean columns; primary keys, auto-increment, not-null, unique, defaults, and indexes. TypeScript row types are inferred from the supplied schema. Do not use decorators, runtime reflection, or arbitrary class serialization.
- Provide typed insert, select, find-by-primary-key, update, delete, ordering, limits, and comparison/boolean filters. Identifiers come only from the declared schema and are safely quoted; user values always use bound parameters. No arbitrary SQL string API is required for the first release.
- Provide transactions with automatic rollback on failed operations and durability completion before success is reported. Migrations run in order inside transactions, record their applied versions, reject duplicate or backwards versions, and preserve the previous schema/data if a migration fails. Migration helpers cover table/column/index changes and typed data transformations without opening an arbitrary SQL escape hatch.
- Provide binary database export/import for user-owned backups and saves. Import validates the SQLite file and schema version before atomically replacing the stored database. The engine does not add cloud synchronization.
- Namespace persistent files by app ID and database name. Document that SQLite data is not an encrypted secret store.

### Backends and lifecycle

- Native targets use a pinned SQLite core through the Rust shared/native layer and an application-data location appropriate to each supported platform, including Apple platforms, Android, Windows, Linux, and watchOS.
- Web/WASM uses the official SQLite WASM build in a dedicated worker. Prefer the OPFS SyncAccessHandle pool VFS where available. When OPFS is unavailable, keep SQLite in the worker's memory and persist serialized database snapshots to IndexedDB after each committed transaction; the operation resolves only after the IndexedDB write commits. An in-memory-only database is available only when explicitly requested. Never silently downgrade a persistent database to volatile storage.
- Follow SQLite's worker and persistence constraints when packaging the browser backend: [SQLite WASM persistence](https://sqlite.org/wasm/doc/trunk/persistence.md) and [SQLite WASM worker API](https://sqlite.org/wasm/doc/trunk/api-worker1.md).
- Web artifacts (worker and SQLite WASM) are packaged by the existing build flow. Browser storage unavailability and quota errors are surfaced as typed results.
- The browser backend owns one worker/connection per open database. A cross-tab lock prevents concurrent writers; a second writer for the same app/database reports a stable `busy` result. This rule applies to the IndexedDB fallback as well; there is no silent last-writer-wins behavior. Native SQLite locking follows SQLite's transaction semantics.
- Browser storage remains subject to origin quota and browser/user eviction policies. The engine reports storage failures and never claims that browser saves are immune to clearing site data.
- Add all native function declarations to `package.json`; preserve Perry's FFI arity and string/scratch-buffer rules. Keep Web glue, Rust shared code, platform implementations, watchOS stubs/implementation, and the manifest in parity. Do not serialize query results as per-frame packed text.
- Keep the existing no-throw rule for TypeScript compiled by Perry. The ORM validates descriptors before sending operations to a backend and translates SQLite/native errors into stable result statuses without exposing SQL values in diagnostic text.

### Required database behavior

- Reopen a database and recover committed data on every supported platform.
- Roll back writes on failed transactions and report success only after persistence is complete.
- Apply migrations exactly once and leave the prior database readable if a migration fails.
- Preserve `null`, booleans, numbers, UTF-8 text, and binary blobs through typed round trips.
- Reject unsafe app IDs, invalid schemas, unknown columns, unsupported schema versions, malformed import bytes, and stale/closed handles before mutation.
- Allow save slots to be modeled as typed records and demonstrate save/load/export/import in the sample.

## 3. 2D collision reliability

Extend the existing deterministic fixed-step `PhysicsWorld2D` and `CharacterBody2D`; do not replace the solver or add rotational rigid-body physics in this milestone.

- Add static segment/convex-polygon collision shapes suitable for slopes and ramps. Collision extraction from tilemaps may emit these shapes where authored tile collision data supports them.
- Add one-way platforms with documented normal/tolerance and previous-position rules. Bodies moving upward through the platform do not collide with its underside.
- Add continuous collision detection for configured fast-moving bodies to prevent tunneling through thin static surfaces. Provide a clear opt-in threshold or body setting and keep the normal discrete path for ordinary bodies.
- Preserve fixed-step determinism, layer/mask filtering, stable contact ordering, character floor/wall/ceiling reporting, and existing box/circle behavior.
- No joints, angular inertia, dynamic-dynamic polygon solver, or replacement physics backend in this milestone.

## 4. Extend existing CLI asset validation

Build on `bornengine assets validate`; do not create another CLI or change the deterministic pack format unnecessarily.

- Report known unreferenced files beneath supported asset roots using references found in supported `.world2d.json` files, Tiled-imported data, and an explicit project asset manifest. Do not claim certainty for computed/dynamic asset paths. Allow projects to configure exclusions and explicitly declared dynamic paths.
- Inspect recognized image and audio formats and report unreadable/corrupt files, suspicious extensions, oversized individual assets, texture dimensions, and aggregate byte/pixel budgets.
- Make budgets and orphan behavior configurable from CLI flags and project configuration. Default checks should preserve current validate behavior; orphan and budget checks are advisory unless configured as errors.
- Emit stable human-readable diagnostics and machine-readable JSON containing relative paths, diagnostic codes, measured values, and configured limits. Keep output deterministic across operating systems.
- Reuse asset roots, path-safety rules, symlink checks, and asset-pack summaries already implemented. `assets pack`, generated build artifacts, and watch behavior continue to consume the validated inventory.
- Update CLI help, docs, project starter template, and shared examples. No second CLI.

## Documentation, samples, and release readiness

- Migrate every standalone example and website snippet from `game.run({ update, render })` to a `Game` subclass. Keep 3D APIs unchanged while migrating their game-loop entry points.
- Add a 2D sample that demonstrates subclass lifecycle, typed database schemas and migrations, transactional save/load/export/import, slopes and one-way platforms, and a high-speed CCD body.
- Update the BornEngine API pages, 2D guides, storage/platform support matrix, migration guide, CLI docs, and website home code sample. Explain Web worker/storage behavior and its limitations without overpromising browser persistence guarantees.
- Record platform test coverage for every engine-supported target. A target must not be called supported for persistence unless its open/write/close/reopen path is verified.
- Keep the previous approved production sample and docs work integrated with these changes so one engine PR presents a coherent feature set. The CLI remains a separate PR with matching fixtures.

## Verification and acceptance

### Game lifecycle

- Standalone hooks execute in order, `run()` completion resolves once after `onStop()`, stop/dispose are idempotent, subclass `render()` can call `super.render()`, and `runFrame()` remains usable by an embedded host.
- Search shows no standalone examples/docs/CLI starter using the removed callback overload; callback contracts appear only on the embedded API.

### Database

- Schema inference and CRUD fixtures compile with Perry; Rust/shared tests cover SQL semantics, constraints, migration rollback, transactions, corrupt/imported database handling, and backup round-trips.
- Web/WASM worker tests cover OPFS reopen, IndexedDB fallback reopen, quota/storage failure, serialized snapshot durability, and worker shutdown. Native CI covers all available platform builds and at minimum one reopen test per backend family.
- FFI manifest validation passes; all declared functions exist in Rust/Web/watchOS implementations with permitted arity and payload handling.

### Physics and CLI

- Deterministic fixtures cover ascending/descending slopes, edge contacts, one-way pass-through from below, landing from above, CCD tunneling prevention, layers/masks, fixed-step variance, and stable contact ordering.
- CLI golden tests cover static references, dynamic-path declarations, orphans/exclusions, corrupt formats, per-file and aggregate budgets, JSON diagnostics, cross-platform determinism, and safe handling of symlinks.

### Integration

- Native shared release tests, Perry runtime fixtures, Web/WASM build, locally available platform builds, CLI all-target tests, and website check/test/build/dist-validation all pass.
- Any unavailable CI target is reported explicitly. No merge to `main`, npm publication, or website deployment occurs before review of the finished PRs.

## Out of scope

- 3D renderer/model/physics changes.
- A visual editor, cloud save service, multiplayer database synchronization, SQL decorators/reflection, or arbitrary user-authored SQL.
- Full dynamic polygon rigid-body simulation, rotation, joints, or a third-party physics replacement.
- Static analysis that claims to resolve arbitrary dynamically computed asset paths.
