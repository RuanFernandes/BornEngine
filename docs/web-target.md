# Web/WASM target

This note documents the Web build pipeline for maintainers. For game-facing setup and platform limits, see the [Web/WASM guide](../webpage/src/content/docs/platforms/web-wasm.md).

## Build pipeline

The target combines two WebAssembly modules: Perry compiles game TypeScript, and `wasm-pack` builds the BornEngine Rust Web crate. `native/web/bloom_glue.js` initializes the engine module, installs browser input and audio bridges, and starts the game module.

```sh
./native/web/build.sh --dev path/to/game/main.ts
cd dist/web && python3 -m http.server 8080
```

The default output directory is `dist/web`. `--dev` skips `wasm-opt` for faster iteration; release mode is the default and applies size optimization. Use `--output DIR` to choose another output directory.

## Runtime requirements

The browser schedules frames for `Game.run()` and provides DOM input, asset fetching, and Web Audio. Rendering requires both the WebGPU API and a usable adapter. The current bootstrap fails with an actionable status message when no adapter is available; it does not fall back to WebGL, even though the `wgpu` dependency includes a WebGL feature.

The published Web engine is a prebuilt WASM package. BornEngine CLI Rust profiles such as `2d`, `2.5d`, and `3d` affect native Rust builds only; they do not remove code from the published Web artifact.

## Assets and persistence

Use `game.assets` for resources shared across scenes and `scene.assets` for scene-lifetime resources. The build packages project assets with the Web output; keep paths project-relative. Current formats include PNG/JPEG/BMP/TGA images, WAV/OGG audio, glTF/GLB models, and TTF/OTF fonts. MP3 decoding is not supported on Web.

`GameDatabase` uses SQLite in a dedicated Web Worker per open database. Persistent mode uses OPFS when its required access capabilities are available and an IndexedDB SQLite snapshot backend when OPFS is unsupported. Browser quota and eviction still apply; offer `export()` for portable backups and handle `quota_exceeded` and `storage_error` results. `inMemory: true` explicitly selects volatile storage.

See the [platform guide](../webpage/src/content/docs/platforms/web-wasm.md) and [storage API](../webpage/src/content/docs/api/storage.md) for the complete game-facing behavior.
