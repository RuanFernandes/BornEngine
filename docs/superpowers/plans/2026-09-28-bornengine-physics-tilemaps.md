# BornEngine Physics and Tilemap Scale

For agentic workers: REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development`. Work in a clean worktree from BornEngine `main` at `e320b869`, branch `work/physics2d-tilemaps`; use a dedicated progress ledger.

## Goal

Make existing 2D maps and arcade/platform physics scale predictably without replacing the engine's current solver.

## Architecture

Use a deterministic uniform-grid broadphase for pair generation and spatial queries, a fixed chunk size for tile traversal, and a high-level `CharacterBody2D` facade over the existing `PhysicsWorld2D`. Keep stable contact order by body creation id. Retain per-cell collision information as the source of truth.

## Tech Stack

Perry-compatible TypeScript, existing `PhysicsWorld2D` and `Tilemap`, fixture-driven runtime tests, current Astro API docs.

## Spec

Implement broadphase, query acceleration, chunked drawing and dirty invalidation, collision-region aggregation, and a character movement API. Preserve existing constructor and query behavior.

## Global Constraints

No native FFI or physics dependency. Do not change current collision response for pairs the broadphase returns. Do not merge different custom partial collision rectangles. Negative world coordinates and cells on grid boundaries must be handled consistently.

## Review Focus

Pair/query results match the brute-force reference; deterministic ordering survives body movement and disposal; dirty cells invalidate exactly their owning chunks; offscreen chunks skip cell iteration; merging reduces shape count while preserving the exact covered union; character movement reliably reports floor, wall, and ceiling.

---

### Task 1: Spatial broadphase, chunked tilemaps, and character movement

**Files:** Modify `src/physics2d/physics-world-2d.ts`, `src/physics2d/physics-body-2d.ts`, `src/physics2d/index.ts`, `src/tilemap/tilemap.ts`, `src/tilemap/index.ts`, and root `src/index.ts`. Add `src/physics2d/character-body-2d.ts`, `tests/game-runtime/physics2d-broadphase.ts`, `tests/game-runtime/tilemap-chunks.ts`, and `tests/game-runtime/character-body-2d.ts`. Update `webpage/src/content/docs/api/physics2d.md` and `webpage/src/content/docs/api/tilemap.md`.

1. Add deterministic tests first: compare broadphase pairs and all four public queries to a brute-force oracle across seeded layouts; exercise filters, negative cells, large bodies, movement, activation, and disposal. Add map tests for chunk boundaries, set/fill invalidation, camera culling, and collision-union coverage. Add character tests for floor/wall/ceiling, slopes limited to the supported axis-aligned shapes, corners, zero input, and fixed-step use.
2. Implement a uniform-grid candidate collector. Rebuild/update only changed body memberships, deduplicate pairs, sort candidate pairs by body id, then run the existing narrowphase and contact dispatch unchanged. Route raycast/overlap through conservative candidate cells while preserving result ordering and layer/sensor filtering. Expose deterministic candidate counters for tests/benchmarks.
3. Change `Tilemap` to retain row-major cell identity while indexing fixed-size chunks. `setTile` marks one chunk dirty; `fill` updates all chunks. Render first culls chunk bounds, then visits non-empty cells only inside visible chunks. Preserve renderer stats and transforms.
4. Add `Tilemap.getSolidRegions()` that merges full-cell solid rectangles with identical collision semantics, and leaves partial/custom rectangles unmerged. Verify pixel/float bounds and union equivalence against `getSolidTiles()`.
5. Add `CharacterBody2D extends GameComponent` around the current world and a kinematic box body. Its fixed-step `moveAndSlide(velocity, dt)` exposes stable `velocity`, `isOnFloor`, `isOnWall`, `isOnCeiling`, and contact normals; it must fail safely when the world/component is detached or invalid. Document that it is a 2D arcade controller, not a full rigid-body replacement.
6. Run all new runtime fixtures using the repository's Perry harness, then engine TypeScript/API checks and the relevant page checks. Run a deterministic sparse/dense map and 100/1,000-body benchmark command, recording operation counts and elapsed results without time-based CI gates. Commit `feat: scale 2d physics and tilemaps`.
