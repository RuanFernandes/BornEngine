---
title: Quickstart
description: Create a BornEngine project interactively or from a script, then build and run the first game.
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

For a repeatable shell script or CI job, use `new`:

```sh
bornengine new MyGame --package-manager npm --engine-version 0.4.16
bornengine build main.ts --name my-game --os linux
```

`new` is the non-interactive path. `--pm` is an alias for `--package-manager`; `-e` aliases `--engine-version`; and `--engine` aliases `--engine-path` for a local engine checkout. Scaffolding refuses to overwrite a populated or conflicting directory. There is intentionally no `--force` option.

## What `run` does

With no target flag, the CLI uses Perry's native host target. `run` builds and launches a native executable for the current host. It does not launch Web or mobile output; those targets are build-only and use their platform workflow.

For development rebuilds, use:

```sh
bornengine dev main.ts --watch
```

Watch output lives in `.perry-dev/`. Normal build output lives under `.bornengine/builds/`.

## The first source file

Use `runGame()` when the same code should work on native and Web/WASM:

```ts
import { initWindow, runGame, clearBackground, drawText, Colors } from '@bornengine/engine';

initWindow(800, 450, 'My Game');

runGame(() => {
  clearBackground(Colors.SNOW);
  drawText('Hello, BornEngine!', 190, 200, 20, Colors.DARKGRAY);
});
```

Native-only games can also use the explicit `while (!windowShouldClose())` loop. Browsers cannot run a blocking loop, so Web/WASM projects should use `runGame()`.
