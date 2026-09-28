# BornEngine game systems design

## Goal

Give BornEngine games a cohesive, class-first path for loading shared assets,
building 2D physics scenes and tilemaps, diagnosing render performance, and
inspecting a running game. Keep the public API usable from Perry-compiled
TypeScript and preserve the existing 3D and sprite-animation APIs.

## Decisions

### Assets

`Game` owns an `AssetManager` exposed as `game.assets`. The initial manager
caches `Texture` instances by exact input path and returns the same live
instance for repeated requests. Games can inspect, release, or clear cached
textures explicitly. Disposing an individual texture must not make the cache
return a dead instance. The manager releases its remaining assets during Game
shutdown. Loading stays synchronous to match the current native `Texture`
contract; asynchronous loaders can be introduced when the underlying loader
supports them on every target.

### 2D physics and tilemaps

Ship a portable TypeScript `PhysicsWorld2D` with fixed-step accumulation,
bounded substeps, gravity, dynamic/static/kinematic bodies, circle and axis-
aligned box shapes, collision filtering, overlap/raycast queries, and ordered
contact events. A tilemap is a `GameComponent` built from atlas frames; it draws
only visible cells, exposes its cells for tools, and can provide solid-cell
queries to 2D physics. The simulation is explicitly stepped and does not
silently replace the existing Jolt-backed 3D `PhysicsWorld`.

### Sprite performance and diagnostics

Measure the current native draw-list behavior before changing it. Preserve
stable scene insertion order for equal `renderOrder` values. Add camera-aware
visibility tests to renderer submission and expose lightweight per-frame
metrics that do not require per-frame string serialization. Web, watchOS, and
native targets must keep a consistent public API.

### Developer inspector

`new Game({ debug: { enabled: true } })` enables an engine-owned inspector
that submits windows through the existing `game.debugUi` Dear ImGui facade.
The inspector is opt-in and checks `debugUi.isAvailable()` at runtime, so it is
quiet on unsupported platforms and feature-off builds. Initial windows show
FPS/frame timing, current scene/object hierarchy, loaded texture count, and
available renderer metrics. The user may disable individual windows. The
ordinary game build keeps debug UI dependencies opt-in.

## Compatibility and constraints

- Keep existing `Texture(game, source)`, `models.Animation`, 3D physics, and
  game-loop APIs working.
- No `throw` from engine TypeScript paths compiled by Perry.
- Declare every new FFI in the package manifest, keep arity within Perry's
  limit, and keep all backends aligned if renderer metrics require FFI.
- No per-frame JSON or delimited-string parsing.
- Avoid shared root files in parallel feature work; integrate exports, Game
  wiring, docs navigation, and package version in one branch after the feature
  worktrees complete.

## Acceptance

- Common code can use `game.assets.loadTexture(path)` without constructing a
  `Texture` with a Game argument.
- 2D physics and tilemaps are exercised together in a documented example.
- Sprite submissions are culled by the active 2D camera, renderer statistics
  describe actual submitted work, and existing draw ordering remains stable.
- The opt-in inspector works through the existing Dear ImGui backend and is
  gated by the `Game` option.
- Perry/native and Web builds, Rust checks/tests, FFI validation, website docs
  checks, and an integration review pass before opening a PR.
