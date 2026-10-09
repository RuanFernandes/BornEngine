# Developing BornEngine

This guide is for changes made inside the BornEngine engine repository. It describes where the runtime lives, how the TypeScript and native layers connect, and which checks to run for common changes.

## Runtime shape

BornEngine exposes a class-based TypeScript API from `src/index.ts`. Perry compiles that TypeScript to native targets. Rust implements platform rendering, input, audio, physics, storage, and other services; the TypeScript runtime calls those services through Perry's native-function manifest and platform adapters.

`Game` in `src/core/game.ts` owns the runtime services and their lifetime. Scenes own scene objects, components, and scene-scoped resources. Preserve these ownership boundaries when adding resources or systems so disposal and scene changes release the right handles.

## Source map

| Path | Responsibility |
| --- | --- |
| `src/index.ts` | Public root exports |
| `src/<domain>/` | TypeScript runtime APIs, generally grouped by feature; each public module has an `index.ts` |
| `src/core/`, `src/game/`, `src/assets/` | Game lifecycle, rendering/window services, scenes, components, and asset ownership |
| `src/sprites/`, `src/tilemap/`, `src/world2d/`, `src/physics2d/`, `src/camera2d/` | 2D animation, map data/runtime, physics, and cameras |
| `src/models/`, `src/scene/`, `src/physics/` | 3D resources, scene graph, and physics |
| `src/gui/`, `src/ui/`, `src/debug-ui/` | Retained game GUI, immediate-mode UI, and the optional engine inspector |
| `native/shared/src/` | Shared Rust implementation and FFI handlers |
| `native/{linux,windows,macos,ios,tvos,visionos,android,watchos,web}/` | Platform crates and host adapters |
| `native/web/bloom_glue.js`, `native/web/splice_game.py` | Browser host and the connection between the game WASM module and engine WASM module |
| `package.json` | Perry native-function manifest and npm package exports |
| `tests/`, `tools/` | Runtime contracts, integration fixtures, validators, and build tools |
| `examples/` | Real game projects used for API examples and compatibility checks |
| `webpage/` | Public documentation site source |

## Implementing a TypeScript API change

1. Find the owning feature folder under `src/` and follow nearby classes and tests.
2. Keep the public API in that feature's module. Export it from the feature `index.ts`, then from `src/index.ts` when it should be available at the package root. Add or update a `package.json` subpath export only when the project intends to expose a new import path.
3. Follow existing ownership and cleanup patterns. Game-wide resources belong to `game.assets` or a game service; scene-scoped resources should be released when their scene unloads.
4. Add or update a focused runtime harness under `tests/` and an example when the public usage needs a durable illustration.
5. Update the local API documentation and the corresponding public guide under `webpage/src/content/docs/` when user-visible behavior changes.

TypeScript in `src/` is compiled by Perry. Check the existing Perry-specific code in the module before introducing language features, callbacks, dynamic dispatch, or native payloads. Recoverable failures should follow the existing status/result/error patterns instead of relying on exceptions across native boundaries.

## Changing native behavior or FFI

Treat an FFI change as one contract shared by the TypeScript wrapper, the manifest, Rust, and platform targets:

1. Add or update the TypeScript wrapper in the owning module, usually beside its internal native calls.
2. Declare the function name, parameter types, and return type in `package.json` under `perry.nativeLibrary.functions`.
3. Implement the shared behavior in `native/shared/src/ffi_core/` or the relevant shared Rust module. Keep signatures and string ownership consistent with `native/shared/src/string_header.rs`.
4. Make every relevant platform crate export the declared function. Platforms with a reduced implementation must provide the intended stub or adapter; the web path may also require `native/web/bloom_glue.js` or its Rust adapter.
5. Run `node tools/validate-ffi.js` and the checks for the affected native target. The validator compares the Perry manifest with shared and platform exports.

Keep Perry's native argument-count limits in mind. Use the bounded scratch-buffer pattern for larger or variable-length payloads; do not pass TypeScript arrays as native pointers. See `src/storage/game-database.ts` and `native/shared/src/database/ffi.rs` for an established example.

## Platform and profile notes

- A game's `renderMode` selects the runtime rendering path. The native Cargo profile is chosen separately through `[bornengine].native_profile` in a game project's `perry.toml`.
- The BornEngine CLI forwards the selected `2d`, `2.5d`, or `3d` feature profile during `build`, `run`, and `dev`. Direct Perry or Cargo invocations need explicit feature selection.
- QuickJS scripting is available on Linux and Web; other native targets currently expose the scripting FFI through stubs.
- The optional Dear ImGui inspector requires the `debug-ui` feature on supported desktop targets.
- The retained GUI currently has no watchOS rendering, input, or event support. This is temporary; future work is planned for that platform.
- Web output consists of a Perry game module and a Rust engine module joined by the browser host glue. Use `native/web/build.sh` to assemble a runnable web output.

Check the platform-specific guide and Cargo feature list before describing a capability as available everywhere.

## Development checks

Run commands from the engine repository root. Select checks based on the changed surface; the full native and cross-platform workflows require additional platform tools and can take substantially longer.

### Toolchain

Node `>=22.18` is required (`engines` in `package.json`). Perry is built from the commit pinned in `perry.source.json`, not installed from npm. Run `npm run perry:setup` after `npm install`; it needs LLVM 22 with `LLVM_SYS_221_PREFIX` set and rustup. Set `PERRY_BIN` to use another binary.

### TypeScript correctness

```sh
npm run typecheck
npm run lint
npm run format:check
npm run test:unit
npm run test:harnesses
npm run test:tools
npm test
```

- `typecheck` runs `tsc -p tsconfig.json` over `src/` and `types/`.
- `lint` and `format:check` run Biome (`biome.jsonc`) over `src` and `types`.
- `test:unit` runs `tests/*.test.mjs` with the Node test runner.
- `test:harnesses` runs the TypeScript harnesses listed in `tests/game-runtime/harnesses.json` through `tools/run-ts-harnesses.mjs`, each with the `node` or `perry` runner named in its entry. Entries with `"ci": true` are skipped locally and run in CI with `--include-ci`. Entries with a `"disabled"` reason are reported as `SKIP` and counted as disabled. `world2d-format.ts` is disabled under Perry 0.5.1520 (runtime SIGSEGV); remove its marker when the Perry pin moves to a fixed version.
- `test:tools` tests the harness runner itself.

`npm test` is the aggregate: `typecheck`, `lint`, `test:unit`, `test:harnesses`, `test:tools`, `test:runtime`, `test:scripting`, then `examples:check:static`. `format:check` is not part of `npm test`; CI runs it separately.

### TypeScript runtime and examples

```sh
npm run test:runtime
npm run test:scripting
npm run examples:check:static
npm run examples:check
```

`examples:check:static` runs the example validator without compiling every Perry entrypoint. `examples:check` performs the broader example compilation and multiplayer server checks.

### Native Rust and FFI

```sh
node tools/validate-ffi.js
cargo test --release --manifest-path native/shared/Cargo.toml
cargo clippy --release --no-deps --manifest-path native/shared/Cargo.toml -- -D warnings
```

For a Web-target Rust check, install the `wasm32-unknown-unknown` target and run:

```sh
cargo check --manifest-path native/shared/Cargo.toml --target wasm32-unknown-unknown --no-default-features --features web
```

### Web output and website

```sh
./native/web/build.sh --release path/to/game/main.ts
npm run check --prefix webpage
npm test --prefix webpage
npm run build --prefix webpage
npm run validate:dist --prefix webpage
```

The Web build requires `wasm-pack` and the Rust WebAssembly target. Native Linux builds require the system development packages listed in the root `AGENTS.md`.
