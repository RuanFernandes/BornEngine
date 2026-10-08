# BornEngine contributor guide

BornEngine is a class-first TypeScript game engine compiled by Perry. The public package is `@bornengine/engine`; its API entry point is `src/index.ts`. TypeScript in `src/` is compiled by Perry too, so compiler and FFI constraints apply to engine code as well as games.

## Runtime and ownership

- Subclass `Game` (`src/core/game.ts`) and implement `onStart`, `loop(deltaTime)`, `render`, and `onStop` as needed. `Game.run()` drives these hooks. `deltaTime` is in seconds. A standalone run disposes its resources after shutdown.
- `Game` owns the window, renderer, input, audio, scene manager, shared assets, scripting runtime, and optional debug inspector. Check `game.isReady` and `game.error` after construction.
- Call `this.scenes.update(deltaTime)` explicitly from `loop` when using scenes. The base `Game.render()` draws the current scene; an overriding `render()` calls `super.render()` where scene drawing should occur.
- `Scene` (`src/game/scene.ts`) owns its objects and components. `SceneManager.changeTo()` unloads the previous scene. `GameComponent.render(renderer)` is called automatically for active, enabled components in ascending `renderOrder`, with insertion order preserved on ties. `scene.camera2D` and `scene.viewport2D` configure the scene's 2D pass.
- Use `game.assets` for resources shared across scenes and `scene.assets` for resources released when that scene unloads. The factories in `src/assets/asset-manager.ts` load textures, fonts, audio, and models and create related resources. Do not introduce public `new Texture(game, ...)` examples. `scene.vfx` owns scene-level effects. Some contextual subsystems still take the owning game, including `new PhysicsWorld(game)` and `new ColyseusClient(game, endpoint)`.
- `GameOptions.renderMode` accepts `'2d'`, `'3d'`, or `'2.5d'`. The `2d` option selects the lightweight 2D renderer; the other options use the full scene renderer. This runtime choice is distinct from the native Cargo build profile.

## Source layout

| Path | Responsibility |
| --- | --- |
| `src/core/`, `src/game/`, `src/assets/` | Game lifecycle, renderer, scene and component ownership, assets |
| `src/sprites/`, `src/physics2d/`, `src/tilemap/`, `src/camera2d/`, `src/world2d/` | 2D gameplay, animation, particles, maps, and cameras |
| `src/models/`, `src/physics/`, `src/scene/` | 3D resources, physics, and scene graph |
| `src/colyseus/`, `src/scripting/`, `src/storage/` | Networking, sandbox scripts, and persistence |
| `native/shared/` | Rust engine implementation and shared FFI |
| `native/{linux,windows,macos,ios,tvos,visionos,android,watchos,web}/` | Platform crates and adapters |
| `native/web/bloom_glue.js`, `native/web/splice_game.py` | Bridge the Perry game WASM module to the engine WASM module and browser APIs |
| `package.json` | Perry native function manifest and package exports |
| `webpage/` | Astro documentation site |
| `examples/` | Games and integration samples using the local engine package |

The inherited `bloom_*` native symbol names and some Rust crate names are ABI names; they do not indicate the public TypeScript API.

## Build profiles and platform limits

In a CLI game project, choose `native_profile = "2d"`, `"2.5d"`, or `"3d"` under `[bornengine]` in `perry.toml`; `native_features` adds optional Cargo features such as `debug-ui`. The 2D profile omits Jolt and 3D model loading, 2.5D enables models without Jolt, and 3D enables both. The BornEngine CLI forwards these settings during `bornengine build`, `run`, and `dev`. Direct Perry and Cargo commands require their own feature selection. See `examples/colyseus-smoke/perry.toml` and `webpage/src/content/docs/cli/project.md` for checked examples. The shared crate's default features include 3D models, Jolt, MP3, image extras, and development hot reload (`native/shared/Cargo.toml`); use explicit Cargo features when measuring a smaller game build.

Web builds use two WASM modules: Perry game code and the Rust web engine, joined by `native/web/bloom_glue.js`. The browser supplies frame scheduling, input, asset fetching, and audio. `native/web/build.sh` assembles the site; `--dev` skips optimization and `--release` is the optimized default. Serve the result over HTTP. See `docs/web-target.md` for build and browser details.

Platform support varies by subsystem. QuickJS scripting is compiled on Linux and Web; other native targets expose the scripting FFI through stubs (`native/shared/Cargo.toml`). The optional Dear ImGui inspector requires the `debug-ui` feature on supported desktop targets. watchOS uses its own rendering adapters rather than the shared wgpu renderer. Check the relevant platform and API guides before describing a capability as universally available.

## Perry and FFI rules

- Declare every new native function in `package.json` under `perry.nativeLibrary.functions`. Keep signatures and exports aligned in the shared Rust FFI, platform crates, Web glue, and watchOS adapters. Run `node tools/validate-ffi.js` after any FFI change.
- Keep FFI calls within Perry's supported argument count. For larger or variable payloads, use a bounded scratch protocol with reset, push, and submit operations; see `src/storage/game-database.ts` and `native/shared/src/database/ffi.rs`. Avoid passing TypeScript arrays as raw native pointers.
- Use the Perry string ABI in `native/shared/src/string_header.rs`. Incoming native string pointers require the safety contract documented there; returned strings use its allocator. Do not build string headers by hand.
- Avoid parsing packed numeric strings on a per-frame FFI path. Use numeric return values or a typed scratch protocol. Perry-specific workarounds already used in `src/core/internal.ts` and `src/models/internal.ts` should be checked before changing those paths.
- Keep recoverable errors in `error`, status, or result values on Perry-compiled paths. Check resource ownership and disposal when adding a new class or native handle.

## Verified commands

Run from the repository root unless a command changes directory. Install each package's dependencies before its npm commands.

```bash
node tools/validate-ffi.js
npm run typecheck
npm run lint
npm run format:check
npm run test:unit
npm run test:harnesses
npm run test:tools
npm run test:runtime
npm run test:scripting
npm run examples:check:static
npm test
npm run examples:check
cargo test --release --manifest-path native/shared/Cargo.toml
cargo clippy --release --no-deps --manifest-path native/shared/Cargo.toml -- -D warnings
cargo check --manifest-path native/shared/Cargo.toml --target wasm32-unknown-unknown --no-default-features --features web
./native/web/build.sh --release path/to/game/main.ts
npm run check --prefix webpage
npm test --prefix webpage
npm run build --prefix webpage
npm run validate:dist --prefix webpage
```

Node `>=22.18` is required (`engines` in `package.json`). Perry is installed from `devDependencies` (`@perryts/perry`), so `npm install` provides the pinned compiler. `npm test` is the aggregate: `typecheck`, `lint`, `test:unit`, `test:harnesses`, `test:tools`, `test:runtime`, `test:scripting`, then `examples:check:static`. `format:check` (Biome, configured in `biome.jsonc`) is not part of `npm test`; CI runs it separately. `typecheck` covers `src/` and `types/` only.

`test:harnesses` runs `tests/game-runtime/harnesses.json` through `tools/run-ts-harnesses.mjs`. Entries marked `"ci": true` are skipped locally and run in CI with `--include-ci`. Entries with a `"disabled"` reason are reported as `SKIP` and counted as disabled. `world2d-format.ts` is disabled under Perry 0.5.1520 (runtime SIGSEGV); remove its marker when the Perry pin moves to a fixed version.

`npm run examples:check` invokes Perry compilation for example entrypoints and runs the multiplayer server tests; it is substantially heavier than `examples:check:static`. Web builds require `wasm-pack` and the WASM Rust target. Graphical/native smoke tests require a suitable display and GPU backend. CI requirements and target-specific build commands live in `.github/workflows/test.yml`.
