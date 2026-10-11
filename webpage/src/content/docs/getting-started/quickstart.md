---
title: Quickstart
description: Create a BornEngine project with the CLI, run the starter game, and read the file it generates.
section: Getting Started
order: 3
---

This page creates a project and runs the starter game. Finish [Installation](../installation/) first, so that `bornengine`, Perry, and Rust are available in your terminal.

## Create a project

Run the interactive command in the folder where you keep your projects:

```sh
bornengine create
```

The command asks four questions:

1. **Project name.** The name is also the name of the folder it creates.
2. **Game type.** Choose 2D, 2.5D, or 3D. 2D is the default. This choice sets the native profile in `perry.toml`, which decides which engine features the native build includes.
3. **Package manager.** Choose pnpm, npm, or yarn. The first option is the default unless your CLI configuration names another one.
4. **BornEngine version.** The CLI lists stable engine releases from the npm registry. The first release in the list is the default unless your configuration names another one.

When the questions are answered, the CLI creates the folder, writes the starter files, and installs the engine package with your package manager. `create` needs an interactive terminal. For scripts, use `bornengine new` instead, described below.

## Run the starter game

Move into the new folder and run the entry file:

```sh
cd MyGame
bornengine run main.ts
```

A window titled `BornEngine Game` opens with a dark background and a blue rectangle. Close the window to end the run.

The first run takes longer than later runs. The engine's native Rust library is compiled the first time for each combination of engine version, target, and feature set. The CLI keeps the compiled artifacts in a per-user cache, so later projects with the same setup reuse them. See [Native build cache](../../cli/cache/).

`run` builds a fast development executable. `bornengine build` builds an optimized one. Both write to `.bornengine/builds/<target>/<name>/`. See [Build and run](../../cli/build/).

## Read the starter file

`main.ts` is the entry file named in `perry.toml`. The CLI writes it like this:

```ts
import { Game } from "@bornengine/engine";

class StarterGame extends Game {
  private elapsed = 0;

  constructor() {
    super({ window: { width: 800, height: 450, title: "BornEngine Game" }, targetFps: 60 });
  }

  protected override onStart(): void {
    this.elapsed = 0;
  }

  protected override loop(deltaTime: number): void {
    this.elapsed += deltaTime;
  }

  protected override render(): void {
    this.renderer.clear({ r: 22, g: 26, b: 36, a: 255 });
    this.renderer.drawRectangle(
      { x: 300, y: 160, width: 200, height: 130 },
      { r: 72, g: 156, b: 220, a: 255 },
    );
  }
}

new StarterGame().run();
```

- `class StarterGame extends Game` is your application. The engine calls its methods; you do not call them yourself.
- `super({ ... })` passes the window size, the title, and a frame rate limit of 60 frames per second.
- `onStart()` runs once before the first frame. The starter resets a timer there.
- `loop(deltaTime)` runs every frame. `deltaTime` is the time since the previous frame in seconds. The starter adds it to `elapsed`.
- `render()` runs after `loop`. It clears the screen to a dark color, then draws the rectangle. The renderer does not clear the screen by itself.
- `new StarterGame().run()` creates the game and starts the loop.

The [game loop](../../concepts/game-loop/) page explains each step in detail. [Your first player](../first-player/) replaces the rectangle with a moving object.

## Build a native executable

Build for your current system with `--os`:

```sh
bornengine build main.ts --name my-game --os linux
```

Other `--os` values are listed in the [build and run](../../cli/build/) reference. The executable is written to `.bornengine/builds/<target>/<name>/` inside the project. See [Project structure](../project-structure/).

## Create a project without prompts

Use `new` in scripts or continuous integration. It takes the same choices as flags:

```sh
bornengine new MyGame --game-type 2d --package-manager npm --engine-version <version>
```

Omit `--engine-version` to use the default release. The flags and their defaults are listed in the [project commands](../../cli/project/) reference.

## Next steps

- [Your first player](../first-player/) builds a moving player object step by step.
- [Project structure](../project-structure/) explains each generated file.
- [CLI overview](../../cli/) lists every command.
