# BornEngine game systems implementation plan

## Integration map

The feature work is isolated in four worktrees based on `main` at `1e45c8a`:

1. Asset manager: `src/assets/**`, self-contained tests and docs. Integration
   adds the Game-owned `game.assets` property and package exports.
2. Physics2D and tilemaps: `src/physics2d/**` and `src/tilemap/**`, plus their
   tests and docs. Integration wires module exports and writes the combined
   sample.
3. Sprite performance and metrics: camera-aware 2D culling, current native
   batching improvements where beneficial, and public renderer diagnostics.
4. Developer inspector: integration branch adds `GameOptions.debug`, uses the
   existing `DebugUi`/Dear ImGui backend, and presents frame, scene, asset, and
   renderer data.

## Tasks

- [ ] Implement and commit AssetManager in its isolated worktree.
- [ ] Implement and commit portable PhysicsWorld2D and TileMap modules in
  their isolated worktree.
- [ ] Implement and commit evidence-based sprite culling/batching and renderer
  metrics in their isolated worktree.
- [ ] Implement Game-configured inspector and integrate the feature branches.
- [ ] Resolve API and renderer integration points, add a sample game and update
  API/guides navigation on the website.
- [ ] Run Perry compilation and focused runtime checks, Rust tests/checks,
  FFI validation, Web builds, and website checks supported by the environment.
- [ ] Request an independent review, address findings, create one PR against
  `main`, and attach it to this task.

## Shared implementation rules

- Preserve the root checkout's untracked `pnpm-lock.yaml`.
- Keep package/root exports and `src/core/game.ts` integration centralized.
- Keep existing 3D and sprite-animation APIs compatible.
- Do not publish or merge; the requested deliverable is a reviewable PR.
