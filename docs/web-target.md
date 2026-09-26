# Web/WASM Target

BornEngine games can run in the browser via WebAssembly. The web target uses WebGPU (with WebGL fallback) for rendering and Web Audio API for sound.

## Architecture

```
Game.ts ─(perry --target wasm)──> game WASM  (game logic, base64-embedded
                                      │       in Perry's self-contained HTML)
                                      │ FFI imports ("ffi" namespace)
                                      ▼
                               bloom_glue.js  (bridges both WASM modules)
                                      │
                                      │ wasm-bindgen calls
                                      ▼
                               bloom_web.wasm  (BornEngine rendering in WASM)
                                      │
                                      ▼
                              Browser: <canvas> + WebGPU + Web Audio + DOM Events
```

Both game logic and rendering run in WebAssembly. A thin JS glue layer (`native/web/bloom_glue.js`, spliced into Perry's self-contained HTML by `splice_game.py`) bridges the two modules, handles DOM events, asset fetching, and audio output.

## Building

### Prerequisites

- [wasm-pack](https://rustwasm.github.io/wasm-pack/installer/): `cargo install wasm-pack`
- [Perry compiler](../../perry/perry): built from source

### Quick Build

```bash
./native/web/build.sh --dev path/to/game/main.ts
```

This runs:
1. `wasm-pack build --dev` to compile `native/web/` → `pkg/bloom_web_bg.wasm` + `pkg/bloom_web.js` bindings without running `wasm-opt`
2. `perry main.ts --target wasm` to compile game TypeScript → WASM
3. Assembles output directory at `dist/web/`

For a shipping build, use `./native/web/build.sh --release path/to/game/main.ts`.
Release runs `wasm-opt -Oz` once through `wasm-pack`; `--release` is also the
default profile. Relative `--output DIR` paths are resolved from the directory
where the command is run.

### Serve Locally

```bash
cd dist/web
python3 -m http.server 8080
# Open http://localhost:8080
```

## Game Loop

Browsers own frame scheduling, so a game should use the same callback-based `Game.run()` lifecycle as native targets:

```typescript
import { Colors, Game } from "@bornengine/engine";

const game = new Game({ window: { title: "My Game", width: 800, height: 600 } });
game.run({
  update(deltaTime) { updateGameplay(deltaTime); },
  render() {
    game.renderer.clear(Colors.BLACK);
    game.renderer.drawRectangle({ x: 100, y: 100, width: 50, height: 50 }, Colors.RED);
  },
  onStop: () => game.dispose(),
});
```

The engine calls update before render, opens and closes the drawing frame, and uses the browser animation-frame scheduler. A blocking `while` loop is not supported on web.

## Asset Loading

Create assets with their owning Game, inspect load failures, and keep their paths relative to the project:

```typescript
import { Font, Game, Model, Texture } from "@bornengine/engine";

const game = new Game();
const texture = new Texture(game, "assets/player.png");
const sound = game.audio.loadSound("assets/jump.wav");
const model = new Model(game, "assets/scene.glb");
const font = new Font(game, "assets/font.ttf", 20);
```

Supported formats:
- **Images**: PNG, JPEG, BMP, TGA
- **Audio**: WAV, OGG (MP3 not supported on web)
- **Models**: glTF, GLB
- **Fonts**: TTF, OTF

Textures own their filtering configuration through `texture.setFilter(mode)`. Post-processing belongs to the Game renderer, for example `game.renderer.setVignette(strength, softness)`. Asset loading, filtering, and renderer settings are scoped to their owning Game.

## Audio

The Game owns one AudioSystem and its Sound/Music resources:

```typescript
const sound = game.audio.loadSound("assets/click.wav");
if (sound.isLoaded) sound.play();
```

The JS glue connects Web Audio output to the engine mixer. `Game.run()` advances streamed music and Colyseus callbacks automatically.

## File I/O

`game.input.writeFile`, `readFile`, and `fileExists` use browser storage on web:

```typescript
game.input.writeFile("save.json", JSON.stringify(gameState));
if (game.input.fileExists("save.json")) {
  const data = game.input.readFile("save.json");
}
```

## Platform Detection

```typescript
import { Game, Platform } from "@bornengine/engine";
const game = new Game();
if (game.input.getPlatform() === Platform.WEB) {
  // Apply a browser-specific presentation choice.
}
```

## Browser Support

- **Chrome 113+**: WebGPU (best performance)
- **Firefox 141+**: WebGPU
- **Safari**: WebGPU in Technology Preview; WebGL fallback available
- **Edge 113+**: WebGPU

The wgpu backend supports both WebGPU and WebGL. WebGL is used automatically as a fallback on browsers without WebGPU support.

## How It Works

### String Handling

Perry WASM uses NaN-boxed values internally, but Perry's runtime wraps the entire `ffi` namespace with `wrapFfiForI64`, which decodes each NaN-boxed argument to a plain JS value before the glue is called. The glue therefore receives ordinary JS strings and simply routes them to BornEngine's `_str` variants via wasm-bindgen — there is no manual NaN-boxing or decoding in the glue.

### Two-Module WASM

Perry compiles game TypeScript to one WASM module. BornEngine's Rust backend compiles to a second WASM module via wasm-pack. The JS glue:
1. Loads bloom_web.wasm and extracts all `bloom_*` exports
2. Wraps every export as an FFI import, passing values straight through (Perry's `wrapFfiForI64` has already decoded them)
3. Overrides string- and asset-param functions to route them to their `_str`/`_bytes` variants
4. Boots Perry WASM with these imports under the `"ffi"` namespace

### Shared Code

About two-thirds of BornEngine's Rust code is in `native/shared/` — the renderer, audio mixer, text renderer, model loader, scene graph. This code compiles identically for native and WASM. Only the platform layer (~3300 lines across `native/web/src/`: `lib.rs`, `input_ffi.rs`, `material_ffi.rs`, `physics_ffi.rs`, `render_settings.rs`) is web-specific.
