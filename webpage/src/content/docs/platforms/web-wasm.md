---
title: Web / WASM
description: Compile BornEngine to browser WebAssembly with WebGPU, WebGL fallback, Web Audio, and a non-blocking game loop.
section: Platforms / Web
order: 54
---

## Build

Install [wasm-pack](https://rustwasm.github.io/wasm-pack/installer/) with the command documented by BornEngine, then build from the repository root:

```sh
cargo install wasm-pack
./native/web/build.sh --dev main.ts
cd dist/web && python3 -m http.server 8080
```

Open `http://localhost:8080`. The `--dev` profile skips `wasm-opt` to shorten iteration time. For a shipping build, use `./native/web/build.sh --release main.ts`; release is also the default when no profile is specified and runs `wasm-opt -Oz` once through `wasm-pack`.

Choose another output directory with `--output`. Relative paths are resolved from the directory where you run the command:

```sh
./native/web/build.sh --dev --output build/web main.ts
```

The script compiles the game with `perry --target wasm` and assembles the engine package and game into the selected output directory.

## Game loop and browser APIs

Browsers cannot run a blocking `while` loop. Use `runGame()`:

```ts
runGame((dt) => {
  clearBackground(Colors.BLACK);
  drawRect(100, 100, 50, 50, Colors.RED);
});
```

Rendering uses WebGPU with WebGL fallback; audio uses Web Audio. Game and engine rendering both run in WebAssembly, with a small JavaScript glue layer for DOM events, asset fetching, and audio output.

## Assets and support

The served output contains project assets. Images support PNG, JPEG, BMP, and TGA; audio supports WAV and OGG; models use glTF/GLB; fonts use TTF/OTF. File helpers use `localStorage` on the web. Chrome 113+, Firefox 141+, and Edge 113+ have the documented WebGPU path; Safari uses its available WebGPU/WebGL support.

The [2D game recipe](../../guides/2d-game/) uses the non-blocking `runGame()` loop and relative asset paths that work with this browser build.
