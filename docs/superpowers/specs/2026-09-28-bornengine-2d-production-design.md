# BornEngine 2D Production Foundation

**Date:** 2026-09-28
**Status:** Approved for implementation
**Repositories:** `BornEngine` and `bornengine-cli`

## Goal

Make BornEngine a dependable, code-first TypeScript engine for shipping polished 2D games. The engine should make common work comfortable for developers while giving players consistent presentation, responsive controls, and reliable runtime behavior.

Keep the existing class-first API and build on the current `Game`, `Scene`, `GameObject`, and `GameComponent` model. Improve 2D workflows without moving effort into 3D. Reuse the existing `bornengine-cli`; do not create a second CLI.

## Current baseline

BornEngine already provides Game-owned resources, scenes and components, sprite sheets/renderers/animation/state machines, 2D particle emitters, camera culling and renderer stats, a fixed-step 2D solver, atlas-backed tilemaps, action maps, audio and UI, and an optional Dear ImGui inspector. The CLI already creates, builds, runs, watches, checks, and diagnoses BornEngine projects.

The current 2D solver is documented for simple arcade and platform games and supports axis-aligned boxes and circles. It has no polygon shapes, continuous collision detection, joints, or rotational body dynamics. Tilemaps scan their grid while rendering, and applications create physics colliders from tile data themselves. The existing serialized `WorldData` format is primarily for 3D content. These limits define the first targets for this proposal.

## Product and architecture decisions

### Code-first workflow with optional visual tools

Keep gameplay authoring in TypeScript as the primary workflow. Establish stable, versioned 2D scene/map data and import support first. This gives the CLI and future editor a durable contract and lets game developers continue to define custom behavior through `Game` and component subclasses.

Do not build a full visual editor in this milestone. Keep the data model editor-friendly so a small 2D scene/tilemap editor can be added later without owning runtime behavior.

### Improve the existing solver before replacing it

Retain the current `PhysicsWorld2D` API where possible, add a character-movement component and improve broadphase/collision handling, then use repeatable benchmarks and representative games to decide whether another solver backend is needed. Do not add a second physics dependency without evidence that the improved solver cannot meet the project's 2D targets.

### Keep the CLI as a separate project

The CLI remains in its own repository. It will consume the same 2D data-format fixtures as BornEngine and provide asset/map validation, Tiled import, and deterministic packaging/build integration. Git cannot combine commits from the two repositories into one branch, so the result will be one integration branch per repository, with matching feature names and linked verification notes.

## Workstreams

### 1. Tilemap and 2D physics scale

- Add chunked tilemap storage/render traversal so offscreen chunks are skipped before visiting every cell; update only chunks affected by edits.
- Add collision extraction that combines compatible adjacent solid cells into fewer static shapes while preserving custom tile collision rectangles.
- Add a `CharacterBody2D`-style component/API for common platform movement, collision queries, and floor/wall/ceiling results.
- Add a broadphase for body pairs and queries. Keep deterministic contact ordering and existing safe-failure conventions.
- Establish benchmark fixtures for large sparse/dense maps and increasing body counts before choosing data structures and target budgets.

### 2. Camera and 2D presentation

- Add reusable camera behavior for follow, smoothing, dead zones, world bounds, zoom constraints, and shake while retaining the low-level `Camera2D` record.
- Add logical/virtual resolution and viewport scaling modes for pixel-perfect scaling and letterboxing across window sizes and aspect ratios.
- Add a parallax background component that participates in scene ordering and camera transforms.
- Ensure input screen/world conversion uses the same viewport and camera transforms as rendering.

### 3. Versioned 2D content and CLI workflow

- Define the `*.world2d.json` document format for tilemaps, layers, camera settings, transforms, asset references, and registered built-in components. Keep arbitrary gameplay code out of serialized data; provide stable identifiers for built-in content and an extension point for game-owned component factories.
- Define migration and validation behavior: reject unsupported future versions, report actionable path/field diagnostics, and preserve supported fields when loading and saving.
- Add Tiled TMX/TSX import to the existing `bornengine-cli`, converting orthogonal tile layers, image tilesets, tile flip flags, object-layer collision rectangles, and supported typed properties into the documented BornEngine format. Diagnose unsupported Tiled features with file/layer context instead of silently dropping them.
- Add asset/reference validation and deterministic asset-manifest/pack generation to the CLI's existing project/build workflow. Asset changes in `dev --watch` trigger the existing rebuild/restart path; this milestone does not promise in-process hot swapping.
- Share format and import fixtures between repositories so the importer, runtime loader, validator, and documentation agree on the contract.

### 4. Game shipping services

- Generalize asset loading into explicit preload groups with readiness, failure details, and progress; preserve existing resource ownership and disposal rules.
- Add development-only asset reload support through the existing CLI watch workflow. Packaged builds must never depend on development file watchers.
- Add a small, versioned persistent settings/save API rooted in platform-appropriate user data storage. Keep gameplay save schemas owned by each game.
- Make action maps exportable/importable as stable data for settings screens and rebinding, preserving keyboard, mouse, gamepad, and touch support.
- Add an `AudioEmitter2D` component and 2D listener helper using the existing audio voices and mix controls, with XY positioning, camera-relative panning, and distance attenuation. Do not create a parallel audio mixer.

### 5. Verification and examples

- Add runtime tests for tile chunk invalidation/culling, collision aggregation, character movement, camera/viewport coordinate agreement, content-format migration/diagnostics, asset loading/reload lifecycle, saved settings, input rebinding, and 2D audio spatial behavior.
- Add a platformer and a top-down sample demonstrating the class-first API, project tooling, scene/map content, input, camera, audio, and resource lifecycle.
- Keep native, Web/WASM, Apple/mobile, and Windows/Linux/macOS CI behavior aligned for the APIs that are supported on each target.
- Update API docs, 2D guides, CLI docs, and migration notes as each public API lands.

## Not included in this milestone

- Improvements to 3D rendering, models, or 3D physics.
- A full visual editor, built-in art/animation authoring, or plugin marketplace.
- 2D lighting/material/shader authoring or navigation/pathfinding. These can follow after the production baseline and target genres are clearer.
- A replacement physics engine before the performance/behavior benchmarks justify one.
- Genre-specific gameplay such as inventories, quests, combat, or networking systems.

## Integration and acceptance

Implement independent workstreams in isolated worktrees after agreeing on public API and file-format contracts. Keep a final integration branch in `BornEngine` and a separate one in `bornengine-cli`; cross-repository changes must use identical fixtures and coordinated release notes. Do not merge either integration branch into `main` or publish releases as part of this implementation request.

The milestone is ready for review when:

1. Large tilemaps avoid full-grid per-frame traversal for offscreen/unchanged chunks, and collision extraction substantially reduces body count without changing covered collision results.
2. Character movement, viewport scaling, camera transforms, and screen/world input conversion have deterministic tests and runnable examples.
3. Tiled TMX/TSX import, format validation/migration, and packaged asset manifests work from a clean generated project using the existing CLI.
4. Loading, save/settings, rebinding, and spatial audio lifecycles have platform checks and failure diagnostics.
5. The platformer and top-down examples build and run on the supported CI targets, documentation passes the website checks, and the integration branches are clean and reviewable.
