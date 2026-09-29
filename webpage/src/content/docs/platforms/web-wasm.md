---
title: Web / WASM
description: Compile BornEngine to browser WebAssembly with WebGPU, WebGL fallback, Web Audio, and Game lifecycle hooks.
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

class ExampleGame extends Game {
  protected override loop(deltaTime: number): void { updateGame(deltaTime); }

  protected override render(): void {
    this.renderer.clear(Colors.BLACK);
    this.renderer.drawRectangle({ x: 100, y: 100, width: 50, height: 50 }, Colors.RED);
  }
}

const game = new ExampleGame({ window: { title: 'Browser game', width: 800, height: 600 } });
game.run();
```

The same hooks run on native. Rendering uses WebGPU with WebGL fallback; audio uses Web Audio. A small JavaScript glue layer handles DOM events, asset fetching, and audio output.

## Assets and support

The served output contains project assets. Images support PNG, JPEG, BMP, and TGA; audio supports WAV and OGG; models use glTF/GLB; fonts use TTF/OTF. File helpers on `game.input` use browser storage. Current supported-browser details can vary with browser releases; consult the platform matrix before shipping.

The [2D game recipe](../../guides/2d-game/) uses the class-first frame loop and portable asset paths.

## SQLite persistence

`GameDatabase` runs SQLite inside a dedicated Web Worker. Persistent mode is the default. When the browser supports the required Origin Private File System (OPFS) access, the worker uses SQLite's OPFS backend; if that capability is unsupported, it stores a serialized SQLite image in IndexedDB. An OPFS database error or corruption is reported as an error and does not silently switch to a new empty backend.

BornEngine holds an exclusive Web Lock for each database identity so only one tab writes to it at a time. A successful transaction is acknowledged after its durable commit/snapshot completes. Quota limits and browser eviction policies still apply: successful storage is not a backup guarantee, and a browser may clear origin data. Handle `quota_exceeded`, `storage_error`, and `busy`, and offer `export()` for portable backups. `inMemory: true` selects volatile SQLite deliberately; it is not used as an automatic fallback.

See [Database and migrations](../../api/storage/) for schema, transaction, import/export, and data-safety details. The database is not encrypted; keep credentials in an appropriate platform secret store instead.
