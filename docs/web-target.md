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

For a loading screen, build an explicit group and inspect its progress and entry results:

```typescript
const group = game.assets.createGroup('level-1');
if (group !== null) {
  group.addTexture('assets/player.png');
  group.addSound('assets/jump.wav');
  const state = await group.load(); // 'ready' or 'failed'
  console.log(state, group.progress, group.entries);
}
```

Groups keep asset references and report each failure; `AssetManager` and `AudioSystem` own and dispose the resources.

## Audio

The Game owns one AudioSystem and its Sound/Music resources:

```typescript
const sound = game.audio.loadSound("assets/click.wav");
if (sound.isLoaded) sound.play();
```

The JS glue connects Web Audio output to the engine mixer. `Game.run()` advances streamed music and Colyseus callbacks automatically.

For 2D sources, `game.audio.listener2D` follows the active `Scene` camera target and rotation. Attach `AudioEmitter2D` to a `GameObject` in the World2D XY plane; the emitter maps `(x, y)` to the audio `(x, 0, y)` plane and passes its distance settings to the existing spatial voice. Emitters share the Sound asset and stop only their own voice when disabled or destroyed.

```typescript
import { AudioEmitter2D, GameObject } from '@bornengine/engine';

const sound = game.audio.loadSound('assets/waterfall.wav');
const source = new GameObject({ position: { x: 40, y: 12, z: 0 } });
source.addComponent(new AudioEmitter2D(sound, game.audio.listener2D, { looping: true }));
scene.add(source);
```

## Save data

Use `createGameStorage` for user settings and saves. It keeps each app/slot/key in a dedicated, versioned `localStorage` record; a single `setItem` replaces each record atomically.

```typescript
import { createGameStorage } from '@bornengine/engine';

const storage = createGameStorage('com.example.game', 'profile-1');
const saved = storage.write('settings', { music: 0.7, sfx: 0.9 });
const loaded = storage.read<{ music: number; sfx: number }>('settings');
if (loaded.ok && loaded.value !== null) {
  console.log(loaded.value.music);
}
```

The built-in persistent-storage adapter is implemented for Web. It reports `unsupported` on macOS, Windows, Linux, Android, iOS, tvOS, visionOS, and watchOS; `game.input.writeFile`, `readFile`, and `fileExists` are low-level asset/file APIs, not a cross-platform user-save API. JSON-safe World2D documents can be stored directly, or custom serialized JSON can be stored as a string. Store `WorldData.serialize(document)` as a string so 3D world data uses its custom serializer.

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
