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

`create` asks for the project name, package manager, and stable engine version from npm. It writes the starter files, installs the selected engine package, and creates the package-manager lockfile.

## Scriptable setup

For repeatable scripts or CI, use `new`:

```sh
bornengine new MyGame --package-manager npm --engine-version 0.8.0
bornengine build main.ts --name my-game --os linux
```

`new` is the non-interactive path. Scaffolding refuses to overwrite a populated or conflicting directory.

## The first source file

A `Game` subclass owns the application lifecycle. Put startup, simulation, and rendering on the same class, then call `run()` to start the platform loop. The class-driven lifecycle disposes the Game after `onStop`:

```ts
import { Colors, Game, Texture } from '@bornengine/engine';

class MyGame extends Game {
  private readonly player: Texture;

  constructor() {
    super({
      window: { title: 'My Game', width: 800, height: 450 },
      targetFps: 60,
    });
    if (!this.isReady) console.error(this.error || 'Engine startup failed');
    this.player = new Texture(this, 'assets/player.png');
  }

  protected override onStart(): void {
    // Initialize game-specific systems.
  }

  protected override loop(deltaTime: number): void {
    // Update gameplay state in seconds.
  }

  protected override render(): void {
    this.renderer.clear(Colors.SNOW);
    if (this.player.isLoaded) this.player.draw({ x: 190, y: 200 });
  }
}

new MyGame().run();
```

The engine opens and closes the drawing frame around your hooks. The same pattern works on native and Web/WASM; the platform supplies the frame schedule. `run()` resolves after `onStop()` and resource cleanup. Inspect `game.error` after it resolves when handling a runtime failure.
