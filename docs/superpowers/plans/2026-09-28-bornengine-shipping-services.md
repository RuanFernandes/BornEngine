# BornEngine 2D Game Shipping Services

For agentic workers: REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development`. Work in a clean worktree from BornEngine `main` at `e320b869`, branch `work/shipping-services`; use a dedicated progress ledger.

## Goal

Provide dependable, small APIs for asset readiness, per-user saves/settings, input rebinding, and spatial 2D audio while reusing BornEngine's resource and audio lifecycle.

## Architecture

Extend `AssetManager` with explicit, game-owned preload groups and structured status. Add `GameStorage` with a versioned app namespace and atomic save/replace behavior using supported platform user-data storage. Give `InputActionMap` stable export/import data. Add `AudioEmitter2D` and a 2D listener helper as wrappers over `Sound`, `SoundVoice`, and `AudioSystem`; do not add a second audio mixer.

## Tech Stack

Perry-compatible TypeScript, existing `bloom_stage_*`/asset operations, the platform filesystem bridge only where already safe, existing audio FFI, native/runtime fixture tests, and engine API docs.

## Spec

`AssetGroup` reports `state`, progress, result/error per entry, supports texture/sound/music and explicit dispose, and never double-disposes assets owned elsewhere. `GameStorage` exposes namespaced `read/write/remove/exists` for JSON-safe data, returns result objects, and scopes data to an app ID + slot. Input bindings round-trip key, mouse, gamepad, and touch. `AudioEmitter2D` spatializes XY sources through existing 3D voices with a single shared listener, attenuation, and pan.

## Global Constraints

No packaged build may rely on watchers or working-directory-relative save paths. Do not claim unsupported persistent storage on a target. FFI additions require `package.json` manifest parity across desktop, mobile, Web, and watchOS and no more than Perry's argument limit; prefer the current file/audio bridge when its behavior meets the contract. Preserve existing public asset/audio APIs.

## Review Focus

Prove ownership and disposal through repeated load/failure/destroy; monotonic progress and cancellation semantics; app-ID path safety and atomicity; no secret/config data leakage in diagnostics; backward-compatible input map bindings; 2D attenuation/pan independent of emitter creation order; listener selection across active scene switches.

---

### Task 1: Preload groups, settings storage, input rebinding data, and 2D audio

**Files:** Modify `src/assets/asset-manager.ts`, `src/assets/index.ts`, `src/input/input-action-map.ts`, `src/input/index.ts`, `src/audio/audio-system.ts`, `src/audio/sound.ts`, `src/audio/index.ts`, `src/core/game.ts`, `src/core/index.ts`, root `src/index.ts`, `package.json`, and FFI/platform files only if a tested gap requires them. Add `src/assets/asset-group.ts`, `src/storage/game-storage.ts`, `src/storage/index.ts`, `src/audio/audio-emitter-2d.ts`, `tests/game-runtime/asset-group.ts`, `tests/game-runtime/game-storage.ts`, `tests/game-runtime/input-action-map-serialization.ts`, and `tests/game-runtime/audio-emitter-2d.ts`. Update docs for asset management, input, audio, storage, and platform support.

1. Add fixtures first for mixed asset success/failure, progress monotonicity, duplicate paths, scene/game disposal, storage namespace/path traversal attempts, atomic replacement failure, storage targets without support, serialization of every binding family, deserialization errors, audio panning/attenuation, listener switch, and emitter stop/dispose.
2. Implement `AssetGroup` and group lifecycle over current texture manager and staged audio loading. Share already-owned cached assets; document exactly which side owns `release`/`dispose`.
3. Implement `GameStorage` only over a verified app-data location per supported platform. Use a versioned envelope and atomic write where the platform API permits; unsupported targets return a clear `unsupported` result. Keep save payload typing generic to the game. Never fall back to content/working-directory paths for user saves.
4. Add `InputActionMap.toData()` and `loadData()` for stable data, validate atomically before replacing current bindings, and reset edge state after rebinding so held inputs do not synthesize press/release events.
5. Implement `AudioEmitter2D extends GameComponent` using existing voice positions and one explicit/scene camera-derived listener. Verify lifecycle, active/paused states, and that it does not allocate another mixer/device.
6. Run fixtures on each locally available engine target, audit every FFI symbol with `node tools/validate-ffi.js` if FFI changed, then run shared Rust, Web/WASM, watchOS CI checks as applicable. Update per-platform docs with verified matrix. Commit `feat: add game shipping services`.
