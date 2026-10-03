---
title: Quickstart
description: Create a BornEngine project and run a class-first TypeScript game.
section: Getting Started
order: 3
---

## Interactive setup

The quickest first project uses the interactive `create` flow:

```sh
bornengine create
# Enter MyGame when prompted
cd MyGame
bornengine run main.ts
```

`create` asks for the project name, game profile, package manager, and stable engine version from npm. It writes the starter files and a BornEngine native Rust profile in `perry.toml`, installs the selected engine package, and creates the package-manager lockfile. Choose 2D, 2.5D, or 3D based on the rendering and physics features your game needs. Use `bornengine build`, `run`, or `dev` to apply that profile to the native Rust build.

## Scriptable setup

For repeatable scripts or CI, use `new`:

```sh
bornengine new MyGame --game-type 2d --package-manager npm --engine-version 0.14.0
bornengine build main.ts --name my-game --os linux
```

`new` is the non-interactive path. `--game-type` accepts `2d`, `2.5d`, or `3d` and defaults to `2d`; it writes `[bornengine].native_profile` in `perry.toml`. The BornEngine CLI applies that profile when it builds the engine's native Rust crate. The Web target currently uses a prebuilt WASM package, so its artifact is not reduced by this setting. Scaffolding refuses to overwrite a populated or conflicting directory.

The first native build for an engine version, target, Rust toolchain, or feature set still compiles its dependencies. The CLI streams compiler output and keeps compatible Cargo artifacts in a shared per-user cache for later projects. `run` and `dev` use a faster incremental profile by default; `build` is optimized. See [build and run](../../cli/build/) for `--release`, job limits, and `bornengine cache warm`.

## The first source file

A `Game` subclass owns the application lifecycle. Put startup, simulation, and rendering on the same class, then call `run()` to start the platform loop. The class-driven lifecycle disposes the Game after `onStop`:

```ts
import { Colors, Game, Texture } from '@bornengine/engine';

class MyGame extends Game {
  private player: Texture | null = null;

  constructor() {
    super({
      window: { title: 'My Game', width: 800, height: 450 },
      targetFps: 60,
    });
    if (!this.isReady) console.error(this.error || 'Engine startup failed');
  }

  protected override onStart(): void {
    this.player = this.assets.loadTexture('assets/player.png');
    if (this.player === null || !this.player.isLoaded) {
      console.error(this.player?.error || 'Unable to load player texture.');
    }
  }

  protected override loop(deltaTime: number): void {
    // Update gameplay state in seconds.
  }

  protected override render(): void {
    this.renderer.clear(Colors.SNOW);
    if (this.player !== null && this.player.isLoaded) this.player.draw({ x: 190, y: 200 });
  }
}

new MyGame().run();
```

The engine opens and closes the drawing frame around your hooks. The same pattern works on native and Web/WASM; the platform supplies the frame schedule. `run()` resolves after `onStop()` and resource cleanup. Inspect `game.error` after it resolves when handling a runtime failure.
