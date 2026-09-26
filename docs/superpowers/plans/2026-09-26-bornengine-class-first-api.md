# BornEngine Class-First TypeScript API Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` (recommended) or `superpowers:executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace BornEngine's public function-and-handle TypeScript API with a context-bound class API, migrate its documentation and multiplayer demo, and integrate the current scene/audio/input work.

**Architecture:** `Game` owns the single active native runtime and exposes `Window`, `Renderer`, `InputSystem`, `AudioSystem`, and `SceneManager` instances. Resource and subsystem classes delegate to private per-module native-operation adapters; numeric handles remain internal. Public root and subpath barrels export classes, types, enums, and constants only.

**Tech Stack:** TypeScript compiled by Perry, Rust platform FFI, pnpm, Astro documentation site, Colyseus multiplayer example.

**Spec:** [`docs/superpowers/specs/2026-09-26-bornengine-class-first-api-design.md`](../specs/2026-09-26-bornengine-class-first-api-design.md)

## Global Constraints

- `Game` is the root context for one engine runtime. Native engine state is process-global today, so the implementation must document and enforce the one-active-runtime constraint.
- Services are reached from their owning context (`game.renderer`, `game.input`, `game.audio`, `game.scenes`). They do not depend on imported mutable module-level state.
- Engine resources are classes constructed with their owning `Game` and released with an idempotent `dispose()` method.
- Renderer methods are the canonical place for draw commands and render-pass state. Renderable resources also expose context-bound conveniences such as `texture.draw(...)`; these delegate to the owning renderer and do not duplicate renderer state.
- Native FFI declarations, handle registries, and raw handle conversion live behind private implementation modules and are not package exports.
- Public failures use `false`, `null`, `isLoaded`, `isReady`, or a queryable error string; no public call depends on catching a Perry-compiled exception.
- Remove the old public free-function API without compatibility aliases; set the engine package version to `0.6.0` from `0.5.1`.
- Do not edit the dirty `MeuGame` checkout. Migrate the clean `BornEngine-ExampleMultiPlayer` consumer.
- Preserve the binary native ABI unless a wrapper cannot otherwise express the approved API.
- Do not add tests or run test suites for this request. Preserve and adapt the existing tests that arrive with the approved feature-branch integration only when their imports must change.

## Review Focus

These high-risk behaviors receive focused source review in the owning tasks. No new tests are added or test suites run under the current request constraints.

- Failed resource load leaves `isLoaded` false, reports an inspectable error when available, and never releases handle zero as a real resource — Task 4.
- A resource or scene from another `Game` is rejected without crossing a native boundary — Tasks 2 and 6.
- Repeated `stop()`/`dispose()` releases native state once; orderly web stop and native close call `onStop` once — Task 2.
- Kinematic/static transforms synchronize before a physics step and dynamic transforms return afterward — Task 6.
- A class-only package import remains reachable from each documented subpath while native operation modules remain unreachable through package exports — Tasks 8 and 9.

## File Map

- `src/core/game.ts` — `GameOptions`, `GameLoopCallbacks`, runtime ownership, loop, and shutdown.
- `src/core/context.ts` — private runtime/context contract used while context-bound services are built before the concrete `Game` facade.
- `src/core/window.ts` — `WindowOptions`, window lifecycle, embedding, resize, fullscreen, title, and window state.
- `src/core/renderer.ts` — renderer frame boundary, drawing methods, cameras, and renderer-owned state.
- `src/core/index.ts` — public core barrel for the new class API and its public types/constants.
- `src/core/internal.ts` — existing window, input, and frame FFI operations used only by engine implementation code.
- `src/input/input-system.ts` — game-bound input polling, injected host input, clipboard, dialogs, and platform queries.
- `src/input/input-action-map.ts` and `src/input/action-map-state.ts` — integrate the feature branch's action-map behavior with `InputSystem`.
- `src/textures/texture.ts`, `src/textures/image-data.ts`, `src/textures/render-texture.ts`, `src/textures/internal.ts` — texture/image resources and private operations.
- `src/text/font.ts`, `src/text/internal.ts` — font resource and private text operations.
- `src/models/model.ts`, `src/models/material.ts`, `src/models/animation.ts`, `src/models/internal.ts` — model/material/animation resources and private operations.
- `src/audio/audio-system.ts`, `src/audio/sound.ts`, `src/audio/music.ts`, `src/audio/sound-manager.ts`, `src/audio/internal.ts` — device/mixer service, resources, manager, and private operations.
- `src/scene/scene-graph.ts`, `src/scene/scene-node.ts`, `src/scene/internal.ts` — retained renderer graph and node ownership.
- `src/game/game-scene.ts`, `src/game/scene.ts`, `src/game/scene-manager.ts`, `src/game/adapters/` — game context binding and lifecycle/adapter integration.
- `src/physics/physics-world.ts`, `src/physics/rigid-body.ts`, `src/physics/colliders.ts`, `src/physics/joint.ts`, `src/physics/internal.ts` — physics objects and private handle operations.
- `src/world/` — `WorldData`/`WorldInstance` ownership and class methods; data-only helpers may be static.
- `src/vfx/`, `src/mobile/`, `src/ui/`, `src/debug-ui/`, `src/colyseus/` — context-bound classes/services and public barrels.
- `src/math/`, `src/shapes/`, `src/core/types.ts` — value classes, static collision helpers, camera/color/data types.
- `src/index.ts`, `package.json` — root and subpath export policy, package version, and private native manifest boundary.
- `README.md`, `docs/design-api.md`, `docs/game-objects.md`, `docs/physics.md`, `webpage/src/content/docs/` — class-first narrative and examples.
- `webpage/src/data/navigation.ts`, `webpage/src/data/docs-coverage.mjs`, `webpage/tests/docs-coverage.test.mjs` — documentation navigation and coverage metadata; update existing checks without adding new tests.
- `BornEngine-ExampleMultiPlayer/MeuGameMultiplayer/` — client, package metadata/lockfile, existing patch, and README.

## Implementation Tasks

### Task 1: Integrate the approved scene, audio, and input work

**Files:**
- Merge `origin/feature/game-scenes-audio-input` into the `feature/oop-api` worktree created from `origin/main`.
- Resolve overlapping changes in `package.json`, `src/index.ts`, `src/audio/index.ts`, `src/game/adapters/scene-node-component.ts`, `src/game/index.ts`, and docs pages.
- Preserve the feature branch's scene manager, `InputActionMap`, `SoundManager`, web/native audio implementations, and existing test files.

**Interfaces:**
- Consumes: current `origin/main` at `542e7bb` and `origin/feature/game-scenes-audio-input` at `bb6433b`.
- Produces: one engine worktree containing both histories and the feature behavior, ready for facade changes.

- [x] **Step 1: Merge the approved feature branch**

Run: `git merge --no-ff origin/feature/game-scenes-audio-input`

- [x] **Step 2: Resolve API/docs overlaps in favor of feature behavior and this spec**

Keep functional scene/input/audio additions. Mark old flat-API docs for replacement in Task 9; do not preserve claims that users should call free functions.

- [x] **Step 3: Inspect the merged diff and existing local status**

Confirm the merge did not touch the original engine checkout's untracked lockfile or the `MeuGame` repository.

- [x] **Step 4: Commit the integrated feature**

Use a technical message such as `feat: integrate scenes audio and input services`.

### Task 2: Add the internal game context and `Window`

**Files:**
- Create `src/core/context.ts`, `src/core/window.ts`, and `src/core/internal.ts`.
- Modify `src/core/types.ts` and internal imports from `src/core/index.ts`.

**Interfaces:**
- Produces an internal `GameContext` contract for readiness, stable context identity, resource registration, and service ownership checks.
- Produces `Window` operations for close, resize, title, fullscreen, platform-native attachment, and open/size queries. The concrete `Game` facade is assembled in Task 8 after its services exist.
- Consumes existing `bloom_*` operations through `src/core/internal.ts`; does not add new native FFI symbols.

- [x] **Step 1: Move core native operations behind `src/core/internal.ts`**

Keep internal names/types private to package exports. Update internal engine imports from the public core barrel to this adapter before replacing that barrel.

- [x] **Step 2: Implement the internal one-runtime context contract**

Track one active native context, an inspectable ready/error state, a stable identity, and owned resources. Reject a second active runtime through a false readiness result and error text; do not throw.

- [x] **Step 3: Implement `Window` as a context-owned facade**

Delegate operations to the core adapter. Return `false` on failed surface attachment, and keep externally driven rendering bound to the same `Game` services.

- [x] **Step 4: Review startup failure, context identity, and repeated window close**

Confirm each case by tracing the state transitions in `GameContext` and `Window`; do not add or run tests.

- [x] **Step 5: Commit the context and window facade**

Use `feat: add game context and window facade`.

### Task 3: Convert renderer, input, and frame-scoped operations

**Files:**
- Create `src/core/renderer.ts` and `src/input/input-system.ts`.
- Modify `src/core/index.ts`, `src/input/index.ts`, `src/input/input-action-map.ts`, and `src/input/action-map-state.ts`.
- Move old operation implementations into private `src/core/internal.ts` or `src/input/internal.ts` modules.

**Interfaces:**
- Produces `Renderer.clear(color)`, `drawTexture(texture, position, options?)`, shape/text/model draw methods, `begin2D/end2D`, `begin3D(camera)/end3D`, screenshot and profiler instance methods.
- Produces `InputSystem` polling, character/text, gamepad, touch, injected-input, clipboard, dialogs, platform capability methods, and `createActionMap(options?)`.
- Consumes `GameContext` ownership checks and private internal operation modules from Task 2. Public service constructors are narrowed to `Game` in Task 8.

- [ ] **Step 1: Extract frame and renderer operations from the public core module**

Keep `beginDrawing/endDrawing` under `Game.run`; expose camera/render-mode and draw operations only through `Renderer` methods.

- [ ] **Step 2: Implement `Renderer` methods with `Game` ownership checks**

For resource arguments, reject disposed or foreign-game instances without issuing native calls. Keep the `renderer` as the source of render-pass state.

- [ ] **Step 3: Move input and host-injection methods to `InputSystem`**

Bind `InputActionMap` to the same system; preserve mapping, edge detection, dead zones, and injected-input semantics from the integrated branch.

- [ ] **Step 4: Replace public core/input exports with class/type/enum barrels**

Retain `Key`, `MouseButton`, `Platform`, `Colors`, and public option/result types as values/types. Do not re-export operation functions.

- [ ] **Step 5: Commit renderer and input services**

Use `feat: add renderer and input services`.

### Task 4: Convert graphics resources and renderer scene graph

**Files:**
- Create the resource files listed under textures, text, models, and scene in the File Map.
- Modify `src/textures/index.ts`, `src/text/index.ts`, `src/models/index.ts`, `src/scene/index.ts`, and renderer methods from Task 3.
- Adapt existing internal consumers that currently import public loader/unloader functions.

**Interfaces:**
- Produces context-bound `Texture`, `RenderTexture`, `ImageData`, `Font`, `Model`, `Material`, `Mesh`, and `Animation` classes with `isLoaded`/`error` as applicable and idempotent `dispose()`.
- Produces `Texture.draw(position, options?)` as a convenience delegating to the owning `Renderer`; full drawing and render-pass APIs remain on `Renderer`.
- Produces `SceneGraph` and `SceneNode` instance methods for node hierarchy, transforms, materials, lighting, visibility, picking, post-processing, and disposal.
- Consumes `GameContext`, `Renderer`, and private per-module native adapters. Public resource constructors are narrowed to `Game` in Task 8.

- [ ] **Step 1: Extract resource loaders and handle operations into private module adapters**

Keep each resource module's native calls adjacent to that module and inaccessible through `package.json` exports.

- [ ] **Step 2: Implement texture, image, render-texture, font, and model ownership**

Construct with the owning `Game`; expose dimensions/metadata as properties, `isLoaded`/`error`, and safe idempotent `dispose()`.

- [ ] **Step 3: Implement materials, meshes, animations, and renderer scene nodes**

Move compile/load/configure/draw/update/destroy operations onto their instances or `Renderer`. Keep raw numeric handles private.

- [ ] **Step 4: Route scene components through resource instances**

Update `SceneNodeComponent` and related adapters to hold typed resources, not a public handle. Preserve borrowed/owned semantics and transform synchronization.

- [ ] **Step 5: Commit graphics resource classes**

Use `feat: add context-owned graphics resources`.

### Task 5: Convert audio service and resource lifecycle

**Files:**
- Create `src/audio/audio-system.ts`, `src/audio/sound.ts`, `src/audio/music.ts`, and `src/audio/internal.ts`.
- Modify `src/audio/index.ts`, `src/audio/sound-manager.ts`, `src/game/adapters/audio-source-component.ts`, and `src/game/index.ts`.
- Preserve native/web/watchOS audio implementation files and FFI declarations from the feature integration.

**Interfaces:**
- Produces `AudioSystem` at `game.audio`, with device/mixer/bus/listener methods and `loadSound`/`loadMusic` methods returning `Sound`/`Music` instances.
- Produces `Sound.play/stop/dispose` and `Music.play/stop/update/dispose`; named `SoundManager` stays a class and receives the same owning context.
- Consumes resource identity and ownership rules from Tasks 2 and 4. `Game` constructs the public audio facade in Task 8.

- [ ] **Step 1: Move audio FFI operations behind `src/audio/internal.ts`**

Preserve existing native/web/watchOS operations and feature-branch mixer behavior.

- [ ] **Step 2: Implement `AudioSystem`, `Sound`, and `Music` methods**

Bind every live handle to one `Game`; expose load errors and make stop/dispose idempotent.

- [ ] **Step 3: Bind `SoundManager` and `AudioSourceComponent` to the audio context**

Preserve buses, voice tracking, cooldown/randomization, staged loading, component ownership, and shared-device lifetime semantics.

- [ ] **Step 4: Replace public audio function exports with class/type/constant barrels**

Retain bus constants and public option types. No direct `loadSound`, `playSound`, or device function exports remain.

- [ ] **Step 5: Commit audio classes**

Use `feat: add game-owned audio resources`.

### Task 6: Convert gameplay scenes, physics, and world resources

**Files:**
- Modify `src/game/game-scene.ts`, `src/game/scene.ts`, `src/game/scene-manager.ts`, `src/game/adapters/`, and `src/game/index.ts`.
- Create the physics class files listed in the File Map and private `src/physics/internal.ts`.
- Modify `src/physics/index.ts`, `src/world/`, and their internal call sites.

**Interfaces:**
- Produces `GameScene(game)`, with `SceneManager` owned by `game.scenes`; preserve scene transition hooks, `own()`, and object/component lifecycle behavior.
- Produces `PhysicsWorld(game, options)`, `RigidBody`, collider classes, and `Joint`; methods own create/configure/query/step/sync operations.
- Produces `WorldData` and `WorldInstance` classes for load/validate/instantiate/save operations; static methods are reserved for pure-data transforms.
- Consumes `GameContext`, resource classes, `GameObject`, and adapters from earlier tasks. Public scene/physics constructors are narrowed to `Game` in Task 8.

- [ ] **Step 1: Bind GameScene, Scene, and SceneManager to one Game**

Reject foreign-game attachment; keep the current lifecycle callback order, stable snapshots, scene-scoped disposal, and explicit update sequence.

- [ ] **Step 2: Implement PhysicsWorld/body/collider/joint ownership**

Keep `step`, queries, collider operations, and joint operations on the owning class instances. Keep world/body/collider/joint handles private.

- [ ] **Step 3: Adapt physics components and document synchronization order in code API**

Ensure static/kinematic transforms sync before the caller's `PhysicsWorld.step(dt)` and dynamic transforms sync back afterward; preserve caller-controlled stepping.

- [ ] **Step 4: Bind serialized world and prefab operations to objects**

Keep serialized data interoperable as DTOs; `WorldInstance.dispose()` releases runtime resources without changing the on-disk format.

- [ ] **Step 5: Commit scene, physics, and world classes**

Use `feat: add game-owned scene and physics APIs`.

### Task 7: Convert remaining math, shapes, VFX, mobile, UI, debug UI, and multiplayer APIs

**Files:**
- Modify `src/math/index.ts`, `src/shapes/index.ts`, `src/vfx/index.ts`, `src/mobile/index.ts`, `src/ui/`, `src/debug-ui/`, and `src/colyseus/index.ts`.
- Update their internal consumers and `src/index.ts`.

**Interfaces:**
- Produces value classes `Vec2`, `Vec3`, `Vec4`, `Quat`, and `Matrix4`; `Collision` contains static pure collision methods.
- Produces context-bound `VirtualJoystick`, `VirtualButton`, `TouchControls`, VFX resource classes, `game.ui`, and `game.debugUi`.
- Produces `new ColyseusClient(game, serverUrl)`, which registers its polling update with its owning `Game`; `dispose()` unregisters it. `Room` stays a client-owned class, and `pumpColyseusClients` is removed from public exports.

- [ ] **Step 1: Convert math data and pure calculations to value classes/static helpers**

Ensure adapters flatten values to primitive numbers before calling internal FFI and retain documented coordinate conventions.

- [ ] **Step 2: Convert shapes and collision operations**

Move drawing methods to `Renderer` and pure collision queries to `Collision` static methods.

- [ ] **Step 3: Convert mobile, VFX, UI, and debug UI state to game-owned instances**

Remove module-level mutable command/state objects from the package surface.

- [ ] **Step 4: Integrate multiplayer client pumping with Game lifecycle**

Preserve join/leave/reconnect/state callbacks and explicit client disposal. Avoid a global polling function.

- [ ] **Step 5: Commit remaining class services**

Use `feat: convert remaining engine services to classes`.

### Task 8: Assemble `Game` and enforce the class-only package boundary

**Files:**
- Create `src/core/game.ts`.
- Modify `src/index.ts`, `src/core/index.ts`, all public `src/*/index.ts` barrels, and `package.json`.
- Update existing source tests and Perry compatibility fixtures only where imports/types have changed; add no tests.

**Interfaces:**
- Produces `GameOptions { window: WindowOptions; targetFps?: number }` and `GameLoopCallbacks { update(dt: number): void; render(): void; onStop?: () => void }`.
- Produces `Game`, implementing `GameContext`, with `window`, `renderer`, `input`, `audio`, and `scenes`; `isReady`, `isRunning`, and `error`; `run(callbacks): void`, `stop(): void`, and `dispose(): void`.
- Narrows public service/resource constructors from internal `GameContext` to the concrete `Game` type.
- Produces root/subpath exports containing classes, types, enums, and immutable constants only.
- Produces package version `0.6.0`.
- Keeps `perry.nativeLibrary.functions` as implementation metadata; it is not a TypeScript runtime export.

- [ ] **Step 1: Assemble the public `Game` facade**

Construct `Window`, `Renderer`, `InputSystem`, `AudioSystem`, and `SceneManager` on the same context; implement `run`, `stop`, and idempotent `dispose` as specified.

- [ ] **Step 2: Narrow context-bound constructors to `Game`**

Keep `GameContext` internal. Ensure application-facing resource, scene, physics-world, and service constructors receive the concrete `Game` instance.

- [ ] **Step 3: Audit every public export and import path**

Search package root exports, package `exports`, subpath barrels, and internal imports for function-shaped operations or public raw handles.

- [ ] **Step 4: Replace barrels and export-map targets with class facades**

Keep the existing module subpath names while ensuring each resolves only to its class/type/constant barrel. Do not expose `src/internal` paths.

- [ ] **Step 5: Update package metadata to `0.6.0`**

Preserve the native-function manifest and dependency declarations unless a class facade requires a named FFI addition.

- [ ] **Step 6: Adapt existing test/source fixtures to new imports without adding cases**

Keep feature-branch test behavior intact; migrate imports, constructors, and cleanup calls to the class surface.

- [ ] **Step 7: Review public exports and private FFI reachability**

Use source searches and `package.json` inspection; do not run tests or add new tests.

- [ ] **Step 8: Commit class-only export boundary**

Use `refactor: publish class-first TypeScript API`.

### Task 9: Migrate BornEngine README, website docs, and internal examples

**Files:**
- Replace `docs/design-api.md` and `webpage/src/content/docs/concepts/api-shape.md`.
- Rewrite `README.md`, `docs/game-objects.md`, `docs/physics.md`, API pages, getting-started pages, guides, platform snippets, and `webpage/src/content/docs/reference/migration.md`.
- Update `webpage/src/data/navigation.ts` and `webpage/src/data/docs-coverage.mjs`.
- Update all public examples under `webpage/src/content/docs/`, plus source-level samples.
- Update only existing docs coverage tests to match the new page inventory.

**Interfaces:**
- All examples import classes/services from `@bornengine/engine` or the documented class-only subpath barrels.
- The root quickstart and website quickstart use the same `Game` / `GameLoopCallbacks` lifecycle from Task 2.
- Migration reference maps old function calls to instance/class methods with no compatibility aliases.

- [ ] **Step 1: Replace the flat-function API design rationale**

Document the `Game` ownership model, renderer/services/resources, explicit disposal, Perry-compatible failure behavior, and single-runtime constraint.

- [ ] **Step 2: Migrate quickstarts and examples by subsystem**

Update application, 2D/3D rendering, textures, models, audio, input, gameplay scenes, physics, world loading, mobile, UI, VFX, and multiplayer examples.

- [ ] **Step 3: Write the 0.5-to-0.6 migration reference**

Include old-to-new mappings for each module and a short description of changed ownership/disposal behavior.

- [ ] **Step 4: Reconcile navigation and docs coverage metadata**

Ensure each documented public module matches the package export map and no stale API page points to free functions.

- [ ] **Step 5: Search public docs and source examples for removed API calls**

Review matches for `initWindow`, `runGame`, `beginDrawing`, `loadTexture`, `createPhysicsWorld`, `stepPhysics`, and other old operation exports; keep native FFI names only in internal implementation documentation where needed.

- [ ] **Step 6: Commit documentation migration**

Use `docs: migrate guides to class-first API`.

### Task 10: Migrate the clean multiplayer example

**Files:**
- Create a second worktree for `BornEngine-ExampleMultiPlayer` from its `origin/main` under the existing workspace `.worktrees` directory.
- Modify `MeuGameMultiplayer/main.ts`, `README.md`, `package.json`, `pnpm-lock.yaml`, and the existing engine patch.
- Preserve the Colyseus server and client-side `player-sync` behavior.

**Interfaces:**
- The example uses `Game`, `Renderer`, `InputSystem`/`InputActionMap`, `SceneManager`, `GameObject`, scene adapters, `Model`, and `ColyseusClient` instances.
- The example package points to an immutable engine API revision using the repository's pinned-dependency policy; do not invent a commit hash or commit an absolute local path.

- [ ] **Step 1: Create an isolated worktree for the clean multiplayer repository**

Start from its current `origin/main`; leave the original demo checkout untouched.

- [ ] **Step 2: Rewrite the game entry point around `Game` and its services**

Remove `initWindow`, direct input/scene/render free-function calls, and top-level Colyseus pumping. Keep the same arena, authoritative server input, local/remote player state, and HUD.

- [ ] **Step 3: Update demo docs and dependency metadata**

Document the new engine API and set the engine pin only to a real immutable revision available from the configured remote; keep any existing Colyseus patch applicable to that revision. If the engine change has not been published to a resolvable remote revision, leave the pin/lockfile for that exact step and report the release dependency rather than committing an unpublished SHA or a local path.

- [ ] **Step 4: Review dependency/lock consistency and user-state preservation**

Inspect the manifest and lockfile references. Confirm the original demo checkout and all dirty `MeuGame` files are unchanged.

- [ ] **Step 5: Commit the example migration**

Use `feat: migrate multiplayer example to class-first API`.

### Task 11: Final source review and handoff

**Files:**
- No product files beyond any targeted corrections found during review.

**Interfaces:**
- Consumes all outputs from Tasks 1–10.
- Produces a concise summary of changed API areas, worktree locations, unresolved release-pin dependency (if the immutable engine revision is not yet available), and explicit verification limits.

- [ ] **Step 1: Compare public exports, docs examples, and consumer imports to the spec**

Review root/subpath export barrels and search docs/sample code for obsolete free-function calls.

- [ ] **Step 2: Confirm preserved working-tree state**

Inspect the original engine checkout and `MeuGame` status without changing their dirty files; inspect the original multiplayer checkout remains clean.

- [ ] **Step 3: Report worktree branches, commits, migration coverage, and unrun verification**

Do not claim tests or builds passed; no test suites are run under the current request constraints.

---

## Handoff Notes

- Engine implementation worktree: `/home/nullborne/Documentos/Bornengine/.worktrees/bornengine-oop-api` on `feature/oop-api`.
- Source base: `origin/main`; Task 1 integrates `origin/feature/game-scenes-audio-input`.
- Original engine checkout: `/home/nullborne/Documentos/Bornengine/BornEngine`; preserve its untracked `pnpm-lock.yaml`.
- Dirty consumer checkout: `/home/nullborne/Documentos/Bornengine/MeuGame`; do not edit its listed local changes.
- Clean multiplayer checkout: `/home/nullborne/Documentos/Bornengine/BornEngine-ExampleMultiPlayer`; migrate in a separate worktree.
