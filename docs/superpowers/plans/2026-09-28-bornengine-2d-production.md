# BornEngine 2D Production Integration

- **Date:** 2026-09-28
- **Status:** Approved for implementation
- **Repositories:** `BornEngine` and `bornengine-cli`

For agentic workers: REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` to execute each independent plan in an isolated worktree. Keep a progress ledger for each plan. Integrate into one review branch per repository; do not merge to `main` or publish from this task.

## Goal

Implement the approved 2D production foundation: scale tilemaps and physics, improve camera and viewport workflows, define portable 2D content, extend the existing CLI for Tiled import and asset packaging, and fill common game-shipping gaps. Add runnable examples, API documentation, regression fixtures, and CI checks.

## Architecture

- Keep the existing class-first `Game`, `Scene`, `GameObject`, and `GameComponent` API and preserve the 3D stack.
- Build on existing `PhysicsWorld2D`, `Tilemap`, `InputActionMap`, `AssetManager`, and `AudioSystem`; do not replace working subsystems without benchmark evidence.
- Keep runtime gameplay behavior in TypeScript. Serialized `.world2d.json` content contains stable data and factory-resolved component descriptors, never executable code.
- The CLI remains in its separate repository. Its Tiled importer and asset packer target the exact schema and fixtures committed in BornEngine.
- Each workstream gets an isolated worktree. The final branches are `integrate/2d-production` in BornEngine and `integrate/2d-production` in `bornengine-cli`.

## Tech Stack

TypeScript compiled by Perry; Rust only for existing engine/platform boundaries that cannot be expressed with supported filesystem primitives; Rust CLI using Clap, serde, and a bounded XML parser; Astro documentation; deterministic Perry/runtime and Rust contract fixtures.

## Spec

The binding product decisions and acceptance criteria are in `docs/superpowers/specs/2026-09-28-bornengine-2d-production-design.md`. This execution is divided into these independently reviewable plans:

1. `2026-09-28-bornengine-physics-tilemaps.md`
2. `2026-09-28-bornengine-camera-presentation.md`
3. `2026-09-28-bornengine-world2d-runtime.md`
4. `2026-09-28-bornengine-cli-tiled-assets.md` (saved in the CLI repository)
5. `2026-09-28-bornengine-shipping-services.md`
6. `2026-09-28-bornengine-samples-docs-integration.md`

## Global Constraints

- Base engine work on `main` at `e320b869` (release `0.9.0`), not historical feature branches. Preserve the untracked `BornEngine/pnpm-lock.yaml` byte-for-byte and do not stage it.
- Keep the current `Texture`, 3D model/animation APIs, and WorldData v2 stable. New 2D data uses a separate versioned schema.
- Respect Perry's language/runtime subset. Keep FFI names/arity aligned with `package.json` and every backend. Avoid adding FFI when existing native APIs suffice.
- TypeScript public constructors and loaders use the existing safe-failure convention (`error`, `null`, `false`, empty query result); do not throw on bad authored content.
- Avoid flaky wall-clock performance assertions. Use deterministic counts and include opt-in benchmark commands/results.
- No full visual editor, 2D lighting/shaders, navigation/pathfinding, 3D expansion, or in-process asset hot swap in this milestone.
- Preserve existing user changes; use the Git author identity already configured. Commits describe technical changes only.
- Do not merge to shared `main`, push, create a release, publish npm, or deploy the site in this task.

## Review Focus

- Broadphase never misses contacts/queries and preserves stable ordering under movement, filters, attach/removal, and disabled bodies.
- Chunk culling and invalidation do not change tile rendering or tile coordinates; merged collision output covers exactly the union of eligible cell rectangles.
- Character movement reports floor/wall/ceiling correctly at negative coordinates, corners, and zero velocity, and documents its fixed-step contract.
- Camera, viewport, parallax, and pointer conversion use the same transform for all window aspect ratios and window resizes.
- Runtime/CLI schema, external tileset resolution, transforms, tile flip flags, and diagnostic paths match byte-for-byte contract fixtures.
- Asset groups, persistent storage, action maps, and 2D audio have deterministic disposal, ownership, error, and platform behavior.
- Every new public API is exported from its subpath and package root and has docs plus a clean project example.

---

## Worktree and Integration Sequence

### Task 1: Physics and tilemaps

Follow `2026-09-28-bornengine-physics-tilemaps.md`. Branch: `work/physics2d-tilemaps`. Run its Perry fixtures, Rust/shared checks only if FFI is introduced, and docs checks. Commit the finished task.

### Task 2: Camera and presentation

Follow `2026-09-28-bornengine-camera-presentation.md`. Branch: `work/camera-presentation`. Run camera, viewport, and input conversion fixtures plus a Perry example build. Commit the finished task.

### Task 3: Versioned world2D runtime

Follow `2026-09-28-bornengine-world2d-runtime.md`. Branch: `work/world2d-runtime`. Freeze the public JSON contract and fixture before the CLI importer starts; run validation, migration, round-trip, and loader fixtures. Commit the finished task.

### Task 4: CLI Tiled import and assets

Follow the CLI plan in `bornengine-cli`. Branch: `work/tiled-assets`. Consume the frozen BornEngine schema fixture. Run all CLI contract tests and deterministic pack/import golden tests. Commit the finished task.

### Task 5: Shipping services

Follow `2026-09-28-bornengine-shipping-services.md`. Branch: `work/shipping-services`. Keep persistence scoped to an app-owned namespace and reuse the current platform file I/O layer where supported. Run lifecycle/platform fixtures. Commit the finished task.

### Task 6: Samples, docs, and integration

Follow `2026-09-28-bornengine-samples-docs-integration.md`. Branch: `work/2d-production-integration`. Merge the completed BornEngine work branches into this branch in dependency order, resolve and review all conflicts, add both representative samples, finish API/guides/CLI docs, and coordinate fixture parity across the separate CLI repo.

## Final Verification

Engine: `node tools/validate-ffi.js`; `cargo fmt --check`; `cargo test --release --manifest-path native/shared/Cargo.toml`; `cargo check --manifest-path native/shared/Cargo.toml --no-default-features --features web`; WatchOS CI check; Perry fixtures/samples on the locally available target; `cd webpage && npm run check && npm test && npm run build && npm run validate:dist`.

CLI: `cargo fmt --all -- --check`; `cargo clippy --locked --all-targets --all-features -- -D warnings`; `cargo test --locked --all-targets --all-features`; `cargo build --locked --release`.

Record unrun platform checks and why. Ask for review only after the integration branches are complete and locally verified; do not publish or merge to `main`.
