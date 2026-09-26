---
title: Web / WASM
description: Compile BornEngine to browser WebAssembly with WebGPU, WebGL fallback, Web Audio, and Game callbacks.
section: Platforms / Web
order: 54
---

## Build

Install [wasm-pack](https://rustwasm.github.io/wasm-pack/installer/) and build from the repository root:

```sh
cargo install wasm-pack
./native/web/build.sh --dev main.ts
cd dist/web && python3 -m http.server 8080
```

Open `http://localhost:8080`. The `--dev` profile skips `wasm-opt` for faster iteration. For a shipping build, use `--release`; it is also the default profile. Choose another output directory with `--output DIR`.

## Game loop and browser APIs

Browsers cannot let game code block the main thread. `Game.run()` hands frame scheduling to the browser and calls update before render:

```ts
import { Colors, Game } from '@bornengine/engine';

const game = new Game({ window: { title: 'Browser game', width: 800, height: 600 } });
game.run({
  update(deltaTime) { updateGame(deltaTime); },
  render() {
    game.renderer.clear(Colors.BLACK);
    game.renderer.drawRectangle({ x: 100, y: 100, width: 50, height: 50 }, Colors.RED);
  },
  onStop: () => game.dispose(),
});
```

The same callbacks run on native. Rendering uses WebGPU with WebGL fallback; audio uses Web Audio. A small JavaScript glue layer handles DOM events, asset fetching, and audio output.

## Assets and support

The served output contains project assets. Images support PNG, JPEG, BMP, and TGA; audio supports WAV and OGG; models use glTF/GLB; fonts use TTF/OTF. File helpers on `game.input` use browser storage. Current supported-browser details can vary with browser releases; consult the platform matrix before shipping.

The [2D game recipe](../../guides/2d-game/) uses the class-first frame loop and portable asset paths.
