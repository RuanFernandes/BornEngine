---
title: Architecture
description: See how the TypeScript API, the Perry compiler, the Rust platform crates, and the wgpu or browser backends fit together.
section: Reference
order: 80
---

BornEngine has four layers. Your game and the engine's TypeScript API sit on top. Perry, the compiler, turns that TypeScript into machine code and links it to Rust code. The Rust code talks to the operating system and the graphics hardware. The layers meet at one narrow point: a fixed list of native functions.

This page describes each layer, shows the code that follows one draw call from your game to the screen, and lists the rules that keep the layers in step. It is background reading. You do not need it to make a game, but it helps when you debug a build problem or read the engine's source.

## The layers

```text
Your game                    main.ts, scenes, components
   |  imports
@bornengine/engine           src/: Game, Renderer, Scene, Input, Audio, Assets ...
   |  calls native functions named bloom_*, listed in package.json
Perry                        compiles all the TypeScript ahead of time and links native code
   |  links
native/<platform>            window, input, audio, and host glue for one target (Rust)
   |  uses
native/shared                renderer, text, audio mixer, models, physics, GUI, database ... (Rust)
   |  draws through
wgpu                         Vulkan, OpenGL, Direct3D 12, Metal (or WebGPU in a browser)
```

Two targets bend this picture:

- **Web.** The Rust side becomes a second WebAssembly module, built by `wasm-pack`, that runs next to the WebAssembly module Perry makes from your game. A JavaScript file, `native/web/bloom_glue.js`, loads both and connects them to the browser. The browser supplies frame timing, input events, file fetching, and audio.
- **watchOS.** There is no wgpu renderer. The `native/watchos` crate turns draw calls into a list of commands, and a SwiftUI `Canvas` and a SceneKit view draw that list.

## The TypeScript API

The public API lives in `src/` and is exported from `@bornengine/engine` and from the subpaths listed in `package.json` under `exports`, such as `@bornengine/engine/storage`. It is built from classes. A `Game` owns the window, renderer, input, audio, scenes, assets, and scripting runtime for one run, and it frees them when the run ends. Scenes own their objects and scene-local assets. The [API shape](../../concepts/api-shape/) page explains the design from the game author's side.

Each TypeScript module that needs the native side declares the functions it calls, one `declare function bloom_*` per function. Game code does not call those functions, and native handles, the numbers that identify a texture or a sound inside Rust, stay private inside the classes. That is why your game code never sees an identifier such as `bloom_draw_rect`.

Perry compiles the engine's own TypeScript together with your game, so engine code follows the same language limits as game code. The package declares `"sideEffects": false`, so a module that does something only when it is loaded would be dropped from a build. Engine modules therefore do their setup inside functions and constructors.

## Perry

Perry is the compiler that turns TypeScript into a native program or a WebAssembly module ahead of time. The BornEngine CLI runs it for you with `perry compile`. Three things connect Perry to the engine:

- **The manifest.** `package.json` has a `perry.nativeLibrary` section that describes the native side: its module name, an ABI version, every function with its parameter and return types, and, for each target, which Rust crate and static library to use and which system libraries, frameworks, or `pkg-config` packages to link. An excerpt:

  ```json
  {
    "perry": {
      "nativeLibrary": {
        "module": "@bornengine/engine",
        "abiVersion": "0.5",
        "functions": [
          {
            "name": "bloom_draw_rect",
            "params": ["f64", "f64", "f64", "f64", "f64", "f64", "f64", "f64"],
            "returns": "void"
          }
        ],
        "targets": {
          "linux": {
            "crate": "native/linux/",
            "lib": "libbloom_linux.a",
            "libs": ["stdc++"],
            "pkgConfig": ["x11", "xi", "alsa"]
          },
          "web": { "prebuilt": "./native/web/pkg/" }
        }
      }
    }
  }
  ```

  The manifest lists 556 functions. Almost every parameter is a 64-bit float; a few are strings or 64-bit integers.
- **The allowlist.** A package that links native code into your program must be approved by your project. The CLI writes `"perry": { "allow": { "nativeLibrary": ["@bornengine/engine/*"] } }` into the `package.json` of every new game. Without it, Perry refuses to build.
- **The Rust build.** The first time you build for a target, Perry runs Cargo on that target's platform crate and links the static library it produces. When the CLI builds a native target, it also puts a small wrapper named `cargo` first on the `PATH`. The wrapper adds the Cargo features of your native profile (`2d`, `2.5d`, or `3d`) to the engine build and keeps Cargo's build files in a shared cache directory, so several projects can reuse them. A direct `perry compile` call has no wrapper, so the crate builds with its default features.

## The Rust crates

All native code lives under `native/`.

`native/shared` is the `bloom-shared` crate. It holds the code that does not depend on the target: the wgpu renderer, text rendering with `fontdue`, the audio mixer and decoders, textures, glTF model loading, the scene graph, particles, the Jolt-based 3D physics bindings, the egui-based GUI and the Dear ImGui inspector, the Colyseus client bridge, and the optional SQLite and QuickJS support. It also defines the macro `define_core_ffi!`, which writes the exported `bloom_*` functions once, so every platform crate gets the same ones.

Each platform crate adds what only that target can do:

| Crate | Window and host | Graphics | Audio |
| --- | --- | --- | --- |
| `native/linux` | X11 through Xlib | wgpu with Vulkan or OpenGL | ALSA |
| `native/windows` | Win32 | wgpu with Direct3D 12 or Vulkan | WASAPI |
| `native/macos` | AppKit | wgpu with Metal | Core Audio |
| `native/ios` | UIKit | wgpu with Metal | Core Audio |
| `native/tvos` | UIKit | wgpu with Metal | Core Audio |
| `native/visionos` | UIKit | wgpu with Metal | Core Audio |
| `native/android` | An `ANativeWindow` from the Android app | wgpu with Vulkan or OpenGL | Oboe |
| `native/watchos` | A SwiftUI app (Swift files in the crate) | Draw list replayed by SwiftUI and SceneKit | `AVAudioPlayer` through Swift |
| `native/web` | A canvas element, through `bloom_glue.js` | wgpu with WebGPU | Web Audio through `bloom_glue.js` |

The desktop and mobile crates build as static libraries; the Android crate also builds as a dynamic library, and the Web crate builds as a WebAssembly module. Optional features, such as `jolt` (3D physics), `models3d` (glTF models), `sqlite`, `scripting`, and `debug-ui`, are Cargo features of these crates.

## One call, end to end

This game draws a rectangle every frame:

```ts
import { Colors, Game } from '@bornengine/engine';

class Example extends Game {
  protected override render(): void {
    this.renderer.clear(Colors.DARKBLUE);
    this.renderer.drawRectangle({ x: 100, y: 100, width: 50, height: 50 }, Colors.RED);
  }
}

new Example().run();
```

The call to `drawRectangle` travels through these layers:

1. `Renderer.drawRectangle(bounds, color)` in `src/core/renderer.ts` checks that the renderer is ready and calls `drawRect`.
2. `drawRect(x, y, width, height, color)` in `src/shapes/internal.ts` calls the declared native function `bloom_draw_rect` with eight numbers: four for the rectangle and four color channels.
3. Perry emitted a call to the symbol `bloom_draw_rect` and linked it against the platform crate.
4. In every native crate, `bloom_draw_rect` comes from `define_core_ffi!` in `native/shared/src/ffi_core/draw.rs`. It runs inside a guard that logs a Rust panic and returns, instead of letting the panic cross into compiled TypeScript, and then calls `Renderer::draw_rect` in `native/shared/src/renderer/draw2d.rs`.
5. `draw_rect` adds a quad to the frame's batch of 2D vertices. The batch reaches the GPU through wgpu when the frame ends.

On Web, `native/web/src/lib.rs` exports its own `bloom_draw_rect` with `#[wasm_bindgen]` and calls the same renderer code. On watchOS, `native/watchos/src/lib.rs` implements `bloom_draw_rect` by adding a rectangle command to the draw list.

The frame itself is driven by the platform. On desktop, `Game.run()` blocks in a loop that begins a frame, runs your hooks, and ends the frame. In a browser, the page calls the loop once per animation frame. On iOS, tvOS, and visionOS, UIKit owns the main thread and, with Perry's `ios-game-loop` feature, the game loop runs on a second thread. On watchOS, the SwiftUI shell schedules the frames. Inside a frame, the order is the same everywhere: the renderer begins the frame, input updates, frame services run (GUI and networking among them), audio updates, on-screen controls update, `loop(deltaTime)` runs, `render()` runs, the GUI draws, and the debug inspector draws. A host that owns a native view can instead create the game with an embedded window and call `runFrame()` itself.

## Rules at the boundary

- **Simple values.** Calls carry numbers and strings. Engine code avoids passing TypeScript objects or arrays across the boundary. The classes turn their state into numbers before a call and read numbers or strings back.
- **Perry's string layout.** Strings use the layout Perry defines, implemented in `native/shared/src/string_header.rs`. Engine code must not build string headers by hand.
- **Scratch buffers for large payloads.** Perry limits how many arguments a call may take. A larger or variable payload is sent as a series of small calls: reset a buffer, push values into it, then submit. `GameDatabase` and mesh updates work this way.
- **No exceptions across the line.** Recoverable failures are reported as values, such as `isLoaded`, `error`, or a result status, because a thrown exception cannot cross the boundary safely.
- **One list, checked in CI.** Every platform crate must export every manifest function with the same number of parameters. `node tools/validate-ffi.js` checks this for the macOS, Linux, Windows, Android, iOS, tvOS, and watchOS crates and for the Web module. It does not check visionOS, and it lists a small set of known Web gaps (see [Web / WASM](../../platforms/web-wasm/)).
- **Inherited names.** BornEngine continues the Bloom Engine project, so the native functions begin with `bloom_` and some crates are named `bloom-*`. These are internal names and do not appear in the public API.

## Where things live

| Path | What it holds |
| --- | --- |
| `src/` | The TypeScript API, one folder per area (`core`, `game`, `assets`, `input`, `audio`, `sprites`, `physics2d`, and so on). |
| `package.json` | The package exports and the `perry.nativeLibrary` manifest. |
| `native/shared/` | Target-independent Rust code and the shared native function definitions. |
| `native/<platform>/` | One crate per target: `linux`, `windows`, `macos`, `ios`, `tvos`, `visionos`, `android`, `watchos`, and `web`. |
| `native/web/` | The Web crate, the JavaScript glue, and the `build.sh` script. |
| `native/third_party/` | Jolt physics and the Colyseus native library. |
| `tools/validate-ffi.js` | The check that every crate matches the manifest. |
| `examples/` | Games that use the local engine package. |

## Next steps

- [API shape](../../concepts/api-shape/) explains the class-first design.
- [Game loop](../../concepts/game-loop/) describes the hooks inside a frame.
- [Platforms](../../platforms/) lists the targets and what each one needs.
- [Web / WASM](../../platforms/web-wasm/) covers the browser build in detail.
- [Migration](../migration/) maps the old function API to the classes.
