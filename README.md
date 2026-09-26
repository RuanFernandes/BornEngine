# BornEngine

<p align="center">
  <img src="webpage/public/brand/bornengine-mark.png" alt="BornEngine mark" width="96">
</p>

**Native games from TypeScript.**

Write TypeScript. Ship native games — and now the web too.
BornEngine compiles your game to Metal, DirectX 12, Vulkan, OpenGL, and WebGPU — one codebase for every platform.

> **Inspired by [raylib](https://github.com/raysan5/raylib).** BornEngine models its public
> API on raylib's — in our view one of the best API designs in gamedev. BornEngine is an
> independent implementation, not a port — [how BornEngine relates to raylib »](#how-bornengine-relates-to-raylib)

> **Fork notice:** BornEngine is an independently maintained fork of the original
> [Bloom Engine](https://github.com/Bloom-Engine/engine). Bloom Engine remains the
> upstream project; this repository continues under the BornEngine name and is not
> affiliated with or endorsed by Bloom Engine's maintainers. The upstream MIT license
> and copyright notice are preserved in [LICENSE](LICENSE).

## Install

```bash
npm install @bornengine/engine
```

Or with your preferred package manager:

```bash
bun add @bornengine/engine
pnpm add @bornengine/engine
yarn add @bornengine/engine
```

The npm package ships the TypeScript API and the engine's Rust sources. Platform-specific Jolt static libraries come from the separate `@bornengine/jolt-prebuilt` dependency; building Jolt from source requires the `native/third_party/JoltPhysics` Git submodule. Normal builds use the prebuilt package, so there's no separate native download step.

You'll also need:

- **Perry** — the TypeScript AOT compiler that turns your game into a native binary or WASM module. It also drives the engine's native build.
- **Rust toolchain** ([rustup.rs](https://rustup.rs)) — Perry invokes Cargo to compile the engine's platform crate the first time you build for each target.
- For web builds only: [wasm-pack](https://rustwasm.github.io/wasm-pack/installer/) (`cargo install wasm-pack`).

## Quick Start

```typescript
import { Colors, Game } from "@bornengine/engine";

const game = new Game({
  window: { title: "My Game", width: 800, height: 450 },
  targetFps: 60,
});

if (!game.isReady) console.error(game.error || "Could not start BornEngine");

game.run({
  update(deltaTime) {
    // Update gameplay state here.
  },
  render() {
    game.renderer.clear(Colors.SNOW);
    game.renderer.drawText("Hello, BornEngine!", { x: 190, y: 200 }, 20, Colors.DARKGRAY);
  },
  onStop() {
    game.dispose();
  },
});
```

`Game` owns the window, frame lifecycle, renderer, input, audio, scenes, and resources created for that runtime. The engine begins and ends each frame around your callbacks. Call `dispose()` when the game shuts down; it is safe to call more than once.

### Web-Compatible Pattern

The same `Game.run()` callback API works on native and Web/WASM. The platform drives the frame schedule, so keep simulation changes in `update(deltaTime)` and drawing in `render()`:

```typescript
import { Colors, Game } from "@bornengine/engine";

const game = new Game({ window: { title: "My Game", width: 800, height: 450 } });

game.run({
  update(deltaTime) {
    // deltaTime is elapsed seconds since the previous frame.
  },
  render() {
    game.renderer.clear(Colors.SNOW);
    game.renderer.drawText("Runs on native and web", { x: 190, y: 200 }, 20, Colors.DARKGRAY);
  },
  onStop: () => game.dispose(),
});
```

Build for web:

```bash
./native/web/build.sh --dev main.ts
cd dist/web && python3 -m http.server 8080
```

Use `--release` (the default) for optimized builds.

## Features

- **Class-first TypeScript API** — A `Game` owns its renderer, input, audio, scenes, and disposable resources. ([API design](docs/design-api.md), [game objects](docs/game-objects.md))
- **True native** — Compiles to Metal, DirectX 12, Vulkan, OpenGL, and WebGPU via wgpu.
- **Ship everywhere** — macOS, Windows, Linux, iOS, tvOS, Android, and Web from one codebase.
- **Unified 2D/3D** — Shapes, textures, text, 3D models, and audio in one engine.
- **Explicit lifecycle** — Separate update and render callbacks, inspect startup/resource errors, and dispose owned state deliberately.

## How BornEngine relates to raylib

BornEngine is inspired by [raylib](https://github.com/raysan5/raylib), especially its focus on clear, approachable game APIs. BornEngine presents a class-first TypeScript surface: a `Game` owns its services and resources, while the implementation keeps its native boundary explicit and data-oriented.

That's where the relationship ends. **BornEngine's implementation is entirely independent —
it does not link against, embed, or call raylib.** BornEngine compiles TypeScript directly to
native code via Perry, our LLVM-based AOT compiler, and renders through wgpu (Metal,
DirectX 12, Vulkan, OpenGL, WebGPU). It is not a port or a binding — just an engine that
admires raylib's API design. Thanks to
[Ramon Santamaria (@raysan5)](https://github.com/raysan5) and the raylib community for
setting the bar. ([design overview](docs/design-api.md))

## Modules

| Module | Import | Description |
|--------|--------|-------------|
| **Core** | `@bornengine/engine/core` | Game, window, game loop, timing |
| **Input** | `@bornengine/engine/input` | Keyboard, mouse, gamepad, action maps |
| **Game** | `@bornengine/engine/game` | GameObjects, components, transforms, scenes, and native-handle adapters ([docs](docs/game-objects.md)) |
| **Shapes** | `@bornengine/engine/shapes` | 2D drawing + collision detection |
| **Textures** | `@bornengine/engine/textures` | Image loading, sprite batching |
| **Text** | `@bornengine/engine/text` | TTF/OTF font loading and rendering |
| **Audio** | `@bornengine/engine/audio` | Sound effects + music streaming |
| **Models** | `@bornengine/engine/models` | 3D model loading (glTF, OBJ), skeletal animation |
| **Math** | `@bornengine/engine/math` | Vectors, matrices, quaternions, easing |
| **Scene** | `@bornengine/engine/scene` | Retained scene graph, frame callbacks, lighting |
| **Physics** | `@bornengine/engine/physics` | Jolt-backed rigid + soft bodies, character, vehicles ([docs](docs/physics.md)) |
| **VFX** | `@bornengine/engine/vfx` | GPU particle systems + decals |
| **World** | `@bornengine/engine/world` | `.world.json` loading, validation, instantiation ([docs](docs/world-format.md)) |
| **Mobile** | `@bornengine/engine/mobile` | Virtual joystick/buttons, touch-input helpers |
| **UI** | `@bornengine/engine/ui` | Game-owned interface rendering |
| **Debug UI** | `@bornengine/engine/debug-ui` | Runtime diagnostics and inspection |
| **Colyseus** | `@bornengine/engine/colyseus` | Multiplayer rooms and state updates |

## Platforms

| Platform | Graphics API | Input |
|----------|-------------|-------|
| macOS | Metal | Keyboard + mouse |
| Windows | DirectX 12 | Keyboard + mouse |
| Linux | Vulkan / OpenGL | Keyboard + mouse |
| iOS | Metal | Touch + gamepad |
| tvOS | Metal | Siri Remote + gamepad |
| watchOS | SwiftUI Canvas (2D) + SceneKit (3D) | Digital Crown + taps ([docs](docs/watchos-target.md)) |
| Android | Vulkan / OpenGL ES | Touch + gamepad |
| **Web** | **WebGPU / WebGL** | **Keyboard + mouse + touch + gamepad** |

## Architecture

```
src/                  TypeScript API
  core/               Window, input, game loop
  game/               GameObjects, components, transforms, adapters
  shapes/             2D shapes + collision
  textures/           Image loading, sprites
  text/               Font rendering
  audio/              Sound + music
  models/             3D models
  math/               Vectors, matrices, easing

native/               Rust implementations
  shared/             Cross-platform core (wgpu, fontdue, gltf)
  macos/              Metal + AppKit + Core Audio
  ios/                Metal + UIKit + Core Audio
  tvos/               Metal + UIKit + GCController
  windows/            DirectX 12 + Win32 + WASAPI
  linux/              Vulkan/OpenGL + X11 + ALSA
  android/            Vulkan/OpenGL ES + NativeActivity + AAudio
  web/                WebGPU/WebGL + Canvas + Web Audio (WASM)

examples/
  pong/               Complete working example (~170 lines)
```

## Runtime ownership

Create one `Game` for the active runtime. Stateful resources are constructed with that owner, keep their native handles private, and expose lifecycle state directly:

~~~typescript
import { Game, Model, Texture, Vec3 } from "@bornengine/engine";

const game = new Game({ window: { title: "Adventure", width: 1280, height: 720 } });
const hero = new Texture(game, "assets/hero.png");
const world = new Model(game, "assets/world.glb");
const spawn = new Vec3(0, 1, -4);

if (!hero.isLoaded) console.error(hero.error);
if (!world.isLoaded) console.error(world.error);
~~~

Value types such as vectors, colors, rectangles, and camera descriptions stay lightweight. `Game.dispose()` releases any still-owned runtime resources.

## Fullscreen

Configure the initial window on Game construction and toggle it through the owning window service:

~~~typescript
import { Game, Key } from "@bornengine/engine";
const game = new Game({ window: { title: "My Game", width: 800, height: 450, fullscreen: true } });
game.run({
  update() { if (game.input.isKeyPressed(Key.F11)) game.window.toggleFullscreen(); },
  render() {},
  onStop: () => game.dispose(),
});
~~~

The initial window dimensions are restored when leaving fullscreen where the platform supports it.

## Skeletal Animation

BornEngine supports GPU-accelerated skeletal animation from glTF/GLB models. The pipeline uses four-bone linear blend skinning and a 128-joint uniform buffer.

~~~typescript
import { Animation, Colors, Game, Model } from "@bornengine/engine";

const game = new Game({ window: { title: "Animation Demo" } });
const character = new Model(game, "assets/models/character.glb");
const animation = new Animation(game, "assets/models/character.glb");

 game.run({
  update(deltaTime) {
    if (animation.isLoaded) animation.update(deltaTime, { x: 0, y: 0, z: 0 });
  },
  render() {
    game.renderer.clear(Colors.SKYBLUE);
    if (character.isLoaded) character.draw(game.renderer, { x: 0, y: 0, z: 0 });
  },
  onStop: () => game.dispose(),
});
~~~

Create animation resources with their Game, play a clip with `animation.play(index)`, and update them before drawing. See the [skeletal animation guide](docs/skeletal-animation.md) for the Blender export pipeline.

## Built with the original Bloom Engine

**[Bloom Jump](https://apps.apple.com/us/app/bloom-jump/id6761447092)** was released under the original Bloom Engine name before this fork continued as BornEngine. It remains a historical Bloom-branded release, not a BornEngine-branded game. It's a free retro pixel platformer with five hand-crafted levels, 60 FPS, and an original chiptune soundtrack, built from one TypeScript codebase.

- [App Store](https://apps.apple.com/us/app/bloom-jump/id6761447092) — iOS, macOS, tvOS, and visionOS
- [App Store (watchOS)](https://apps.apple.com/us/app/bloom-jump-watch/id6779528549) — Apple Watch
- [Google Play](https://play.google.com/store/apps/details?id=com.bloom.jump) — Android

## BornEngine links

- [Source repository](https://github.com/RuanFernandes/BornEngine)
- [npm package](https://www.npmjs.com/package/@bornengine/engine)
- [Documentation](docs/)
- [Website and guides](https://ruanfernandes.github.io/BornEngine/)
- [BornEngine CLI](https://github.com/RuanFernandes/bornengine-cli)
