# BornEngine Examples Modernization Implementation Plan

> **For implementation:** execute this plan in the approved `work/examples-api-refresh` worktree. Use the subagent-driven workflow for independent example groups after the plan is approved; integrate all work on this branch and resolve/check conflicts before opening a PR.

**Goal:** Bring every runnable program under `examples/` onto BornEngine's current API, add two local multiplayer samples with minimal Colyseus servers, and give maintainers a reliable way to build and test the examples.

**Design:** Keep each sample's original purpose while replacing Bloom-era imports, callback game loops, and obsolete package names with the current class-first `Game` lifecycle and BornEngine exports. Preserve diagnostic samples' low-level focus and Perry's host-scheduled embed loop. Add an authoritative 2D arena and a bounded room chat as separate, self-contained client/server examples. Centralize inventory, commands, and repeatable checks in `examples/README.md` and a validation tool.

**Stack:** BornEngine TypeScript API compiled with Perry; existing Rust/native engine backends; TypeScript + Colyseus for local multiplayer servers; Node test runner; npm lockfiles scoped to each server.

---

## Worktree and branch rules

- Work only in `/home/nullborne/Documentos/Bornengine/.worktrees/bornengine-examples-api-refresh`, branch `work/examples-api-refresh`, based on the current `origin/main`.
- Do not copy in, edit, or remove `MeuGame` or `BornEngine-ExampleGame`; do not modify `bornengine-cli`.
- Preserve `/home/nullborne/Documentos/Bornengine/BornEngine/pnpm-lock.yaml`, which is untracked in the original checkout and is outside this worktree.
- Do not retire the standalone `BornEngine-ExampleMultiPlayer` checkout or GitHub repository until both new multiplayer samples pass their client/server checks. After validation, perform the already-authorized local checkout and GitHub repository removal, then record the outcome for the final report.
- Do not add AI attribution to source files, docs, commits, PR text, or metadata.
- Keep engine changes narrowly scoped. If an example reveals a missing current API, first add a failing focused fixture, then implement the smallest API fix and cover it with the engine's appropriate test.

## Example inventory and ownership

Audit every directory at `examples/*/`, not just directories with `package.json`. Treat every existing runnable `.ts` entrypoint as a compile target. In particular, inspect all five `scene-graph/*.ts` programs and document whether each is a standalone sample, a shared module, or an intentionally host-driven entrypoint. Preserve the purpose and runtime assumptions of all 23 existing directories.

Organize the implementation work into four non-overlapping groups:

1. **2D games and scene gameplay:** `2d-platformer`, `2d-top-down`, `physics2d-tilemap`, `sprite-animation`, `pong`, `dungeon-crawl`, `isometric-rpg`, `space-blaster`, `voxel-sandbox`, plus any runnable 2D program discovered during the inventory.
2. **3D games and renderer diagnostics:** `bistro`, `intel-sponza`, `kart-racer`, `pbr-spheres`, `sponza`, `test-gltf-watch`, `test-scene-watch`, `test3d`, `world-viewer`, `renderer-test`, and runnable programs in `scene-graph`.
3. **Platform/integration samples:** `perry-embed`, `ui-smoke`, `colyseus-smoke`, and any remaining native/platform smoke entrypoints.
4. **New multiplayer samples:** `multiplayer-arena` and `multiplayer-chat`, each with an independent server and client.

Do not assume the tentative group list is exhaustive. The inventory audit determines the final entrypoint manifest and identifies generated binaries/assets to leave untouched.

## Task 1: Add an executable inventory and failing API audit

**Files:** `tools/validate-examples.mjs` (new), `package.json` (root script), `examples/README.md` (initial inventory).

1. Write the validator first with a committed manifest of runnable TypeScript entrypoints, targets, and intentional exceptions. Include all standalone `scene-graph` programs and special Perry/embed checks; avoid inferring entrypoints from file names alone.
2. Add static checks that fail on example-owned Bloom package aliases/imports and removed callback lifecycle patterns. Allow the documented upstream `BloomView` symbol only in the Perry embed boundary and allow low-level native calls only in explicitly listed diagnostic programs.
3. Add a command that compiles each manifest entrypoint against the local engine package using the repository's Perry toolchain. Write compiler outputs under an ignored build location or a system temporary directory; never emit binaries into tracked example directories.
4. Add root `examples:check` script that runs static audit and all configured Perry compiles, with per-entrypoint output and a nonzero exit on any failure. Provide a narrower `examples:check:static` mode for quick checks.
5. Run the new audit against the untouched examples and capture its expected failures. Confirm every finding maps to either a real outdated API/package name or a documented exception before migrating code.

**Acceptance:** The inventory is complete, the audit fails for known stale examples, exceptions are explicit and narrow, and temporary build products stay out of Git.

## Task 2: Migrate 2D gameplay and scene examples

**Files:** all runnable `.ts`, `package.json`, and README files in the 2D group listed above; only modify root catalog/validator in Task 1.

1. For each existing game, add or adapt a small compile fixture/example subclass using the supported `Game` subclass hooks (`onStart`, `loop(deltaTime)`, `render`, `onStop`). Verify Perry compiles subclassing and hooks before rewriting that program; keep any test first and compile it to establish the expected failure.
2. Move per-frame game logic from legacy `game.run({ update, render, onStop })` callbacks into the class lifecycle. Update scene-owned games through `this.scenes.update(deltaTime)` exactly where their current design requires it and call `super.render()` when base scene drawing belongs in the frame.
3. Replace ad hoc `{x, y}` values with `Vector2D` wherever the current BornEngine API accepts 2D positions, directions, sizes, or velocities. Use current scene/components, sprite animation, physics2d, tilemap, camera, input, audio, asset, storage, and UI APIs when they suit each demo; do not add subsystems merely to showcase them.
4. Keep each game's recognizable mechanics, controls, deterministic setup, asset names, and intended entrypoint. Resolve asset paths from the documented launch directory.
5. Replace stale Bloom package names in each affected package manifest with `@bornengine/engine` local dependency and correct outdated instructions.
6. Compile each migrated entrypoint with Perry after its changes. For examples with pure logic or existing runtime smoke tests, run those tests too; for graphical examples in headless mode, compilation is the required check and note that the windowed experience was not launched.

**Acceptance:** Every 2D gameplay example compiles against BornEngine and uses the class-first lifecycle without changing its core gameplay.

## Task 3: Migrate 3D and renderer diagnostic examples

**Files:** runnable `.ts`, `package.json`, and README files in `bistro`, `intel-sponza`, `kart-racer`, `pbr-spheres`, `sponza`, `test-gltf-watch`, `test-scene-watch`, `test3d`, `world-viewer`, `renderer-test`, and runnable `scene-graph` programs.

1. Start with the existing diagnostic controls: inspect screenshot triggers, deterministic initialization, capture output paths, CLI/host assumptions, and each 3D sample's current rendering path. Add focused validation for any callback-to-hook conversion before applying it.
2. Convert runnable games to `Game` subclasses and current BornEngine package exports. Keep the current 3D renderer/model architecture intact; this is an API/lifecycle migration, not a 3D redesign.
3. Replace Bloom-only package names and imports, correcting `bloom-sponza` and `bloom-renderer-test` metadata while preserving public example directory names where scripts or paths may rely on them.
4. Preserve low-level native renderer/FFI access only in renderer diagnostic samples where it is essential to their purpose. Add an explicit validator allowlist for those accesses; all other examples must use current BornEngine exports.
5. Preserve Perry-required upstream symbols in `perry-embed` only; do not expose Bloom-only names in BornEngine-facing examples.
6. Perry-compile every entrypoint, including each standalone `scene-graph` demo. Keep generated 3D binaries, large model assets, and intentional capture outputs untouched unless the migration itself creates stale tracked files.

**Acceptance:** All 3D and diagnostics examples build with the current BornEngine package, retain their original diagnostic behavior and controls, and contain no unexplained Bloom imports or aliases.

## Task 4: Modernize platform and integration samples

**Files:** `examples/perry-embed/**`, `examples/ui-smoke/**`, `examples/colyseus-smoke/**`, and any platform-specific examples found in the inventory.

1. Convert `ui-smoke` and `colyseus-smoke/main.ts` to the current `Game` subclass lifecycle. Keep `colyseus-smoke/lifecycle-smoke.ts` as a lifecycle test and align its usage with the engine-owned Colyseus polling/cleanup behavior.
2. Preserve the existing math and lifecycle smoke tests, and first add/adjust assertions for current room ownership, disposal, and expected event ordering before changing implementation code.
3. Keep `perry-embed` on `Game.runFrame()` because Perry's host owns the frame schedule. Document the host contract and compile it with the embed-specific command/configuration already used by the repository.
4. Replace obsolete package aliases, stale imports, and misleading run instructions. Verify native surface ownership remains on BornEngine's current API, while the `BloomView` identifier remains only where the upstream Perry contract needs it.
5. Run every sample's existing test/build scripts and the corresponding Perry compile checks.

**Acceptance:** Special host/native assumptions remain intact and are documented; current integration smokes pass using BornEngine's class-first game API.

## Task 5: Add the authoritative multiplayer arena

**Files:** `examples/multiplayer-arena/client/**`, `examples/multiplayer-arena/server/**`, `examples/multiplayer-arena/README.md`.

1. Add server contract tests first. Test room creation/join, authoritative input validation and bounded movement, replicated positions keyed by session, player removal on leave, and two-client state visibility. Keep simulation deterministic and local.
2. Implement a minimal TypeScript Colyseus server with a small schema/state, localhost default bind, configurable host/port, bounded tick/input, input clamping, and clean server shutdown. The server is authoritative: clients submit intent, not position/state.
3. Add a Perry client using current `Game`, `ColyseusClient`, scene/input APIs, and BornEngine sprite systems where assets already exist; avoid requiring a hosted service or adding large art assets. Show connection/join errors and remote membership safely.
4. Add separate client and server manifests/lockfiles, exact install/build/run/test commands, and document LAN endpoint configuration. Confirm no dependency on `MeuGame`, the old multiplayer checkout, absolute machine paths, or unpublished engine packages.
5. Run the server tests with two clients (or the Colyseus test harness), Perry-compile the client against the worktree package, and run the whole example's documented check from its project root.

**Acceptance:** Two local clients see server-authoritative movement and cleanup; invalid inputs are rejected/clamped; client compilation and server tests pass independently.

## Task 6: Add the room chat/messaging multiplayer example

**Files:** `examples/multiplayer-chat/client/**`, `examples/multiplayer-chat/server/**`, `examples/multiplayer-chat/README.md`.

1. Add server contract tests first for room join/leave, server-authored membership, message size and rate/bounds, message broadcast ordering, and rejected malformed payloads.
2. Implement a minimal independent Colyseus server with a bounded message schema, authoritative member list, localhost default, configurable endpoint, and orderly shutdown. Never accept client-authored session membership or broadcast unvalidated unbounded text.
3. Add a BornEngine client demonstrating connect/join/send/receive, current room lifecycle callbacks, member list, and visible connection/reconnect/leave failures using `Game` subclass hooks.
4. Keep its package manifest and lockfile separate from the arena server. Include exact commands for local use and a short protocol description.
5. Run chat contract tests with two clients, Perry-compile the client against the current local engine, and execute the documented example check.

**Acceptance:** Two clients exchange bounded validated messages, server membership is authoritative, leave cleanup is correct, and all server/client checks pass locally.

## Task 7: Finish catalog, validation, and examples CI

**Files:** `examples/README.md`, `tools/validate-examples.mjs`, `package.json`, `.github/workflows/test.yml` only if CI integration fits the current workflow.

1. Complete the catalog for every existing and new example: purpose, platform requirements, project root, entrypoint, assets, and copyable build/run/test commands.
2. Finish the root validator manifest and static rules based on the completed migrations. Ensure each TypeScript entrypoint is covered exactly once unless a multi-target/multi-entrypoint declaration is explicit.
3. Include both multiplayer server checks in `examples:check`, with bounded timeouts and readable per-sample reporting. A server crash or hanging process must fail with cleanup, not strand CI.
4. Integrate the check in CI only if Perry is installed/available in a suitable existing job; avoid duplicating a costly native build matrix. Keep graphical samples compile-checked, and run deterministic server logic tests in CI.
5. Run static audit first and deliberately test its stale Bloom/import detection with a temporary untracked probe that is removed immediately; test that valid `BloomView` and diagnostic allowlist cases remain accepted.

**Acceptance:** One documented root command audits and verifies the complete example set with clear failures; all documented individual project commands work from their stated directories.

## Task 8: Full verification, review, and integration

1. Run `node tools/validate-examples.mjs --static` and the root `examples:check` across every inventoried Perry entrypoint.
2. Run all existing example smoke scripts, the arena and chat server integration tests, and the Colyseus protocol/lifecycle tests. Run repository checks affected by any engine API fix; do not claim a GUI session was tested if only compilation ran.
3. Run `git diff --check`, inspect changed package names/imports, check for stale Bloom aliases outside the explicit Perry/native exceptions, check for generated binaries/asset churn, and verify the worktree contains no user-owned files.
4. Review the consolidated diff against the approved design and acceptance criteria. Resolve all subagent/worktree changes onto `work/examples-api-refresh`; rerun the complete affected validation after conflict resolution.
5. Only after both new multiplayer examples pass, remove the standalone `BornEngine-ExampleMultiPlayer` local checkout and delete its GitHub repository as previously authorized. Do not delete any other repository or checkout.
6. Commit with technical messages only, publish a pull request targeting `main`, attach it to this task, and wait for required CI checks. Merge after required checks pass, following the user's existing authorization. This is expected to be an examples-only change, so do not create an unnecessary npm release or site deployment; if implementation requires an engine package or website change, include that impact in the review before publishing it.

**Final acceptance checklist:**

- Every runnable program in all existing `examples/` directories appears in the audit manifest and compiles with the current BornEngine/Perry toolchain.
- No stale Bloom-only package aliases/imports remain in example-owned code except an explicit Perry embed symbol or essential diagnostic boundary.
- Existing game/diagnostic intent, capture controls, assets, and Perry embed frame ownership are preserved.
- Both new multiplayer projects contain independent, tested minimal Colyseus servers and Perry clients; arena state is server-authoritative and chat input is bounded/validated.
- Catalog instructions and individual working-directory commands match the checked-in files.
- `MeuGame`, `BornEngine-ExampleGame`, `bornengine-cli`, and the original-checkout untracked `pnpm-lock.yaml` remain unchanged.
- All stated checks pass after integration, or any environment-only limitation is clearly reported without claiming success.
