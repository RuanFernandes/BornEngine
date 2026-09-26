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
bornengine new MyGame --package-manager npm --engine-version 0.6.0
bornengine build main.ts --name my-game --os linux
```

`new` is the non-interactive path. Scaffolding refuses to overwrite a populated or conflicting directory.

## The first source file

A `Game` owns the window and frame boundary. Separate simulation from rendering, and dispose the game when its loop stops:

```ts
import { Colors, Game } from '@bornengine/engine';

const game = new Game({
  window: { title: 'My Game', width: 800, height: 450 },
  targetFps: 60,
});

if (!game.isReady) console.error(game.error || 'Engine startup failed');

game.run({
  update(deltaTime) {
    // Update gameplay state in seconds.
  },
  render() {
    game.renderer.clear(Colors.SNOW);
    game.renderer.drawText('Hello, BornEngine!', { x: 190, y: 200 }, 20, Colors.DARKGRAY);
  },
  onStop: () => game.dispose(),
});
```

The engine opens and closes the drawing frame around the callbacks. The same pattern works on native and Web/WASM; the platform supplies the frame schedule.
