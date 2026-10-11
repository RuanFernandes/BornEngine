---
title: Project structure
description: What each file in a new BornEngine project does, which folders the CLI creates, and where build output goes.
section: Getting Started
order: 5
---

A BornEngine project is a normal TypeScript package with a few extra files for the native build. This page describes what `bornengine create` writes, and what appears later as you build and run the game.

## Files in a new project

| File | Purpose |
| --- | --- |
| `main.ts` | The entry file. It contains your `Game` subclass and the `new ...().run()` call. |
| `package.json` | The package name, the engine dependency, and the `perry` setting that lets the native build use the engine's native library. |
| `perry.toml` | Build settings. `entry` names the entry file. The `[bornengine]` table holds `native_profile`, and optionally `native_features`. |
| `.gitignore` | Keeps generated folders out of version control: `node_modules/`, `.perry-cache/`, `.perry-dev/`, `.bornengine/`, `target/`, and `dist/`. |
| `README.md` | The run and build commands for the project. |
| `AGENTS.md` | The BornEngine guide for AI coding agents. `create` and `new` write it. `init` does not. |

`perry.toml` for a 2D project looks like this:

```toml
[project]
name = "my-game"
entry = "main.ts"

[bornengine]
native_profile = "2d"
```

The profile is `2d`, `2.5d`, or `3d`. It is chosen when you create the project, and you can change it later in this file. The profile decides which engine modules the native build includes. The [project commands](../../cli/project/) reference lists the options that affect the profile.

## Folders you add

The starter does not include an `assets/` folder. Create one next to `main.ts` for images, sounds, fonts, and models:

```text
MyGame/
  assets/
    player.png
  main.ts
  perry.toml
  package.json
```

Paths in your code are relative to the project folder, such as `assets/player.png`. See [Assets](../../concepts/assets/) for the rules.

If you use an asset manifest, `bornengine.assets.json`, the CLI validates it and reports missing files. See the [asset audit](../../cli/assets/) reference.

## Folders the CLI creates

These folders appear when you build or run. You do not create them by hand.

| Folder | Created by | Contents |
| --- | --- | --- |
| `node_modules/` | Your package manager | Installed packages, including the engine. |
| `.bornengine/builds/<target>/<name>/<stamp>/` | `bornengine build`, `bornengine run`, and `bornengine dev` | The executable for each build. Each build gets its own `<stamp>` folder. |
| `.perry-dev/<name>/` | `bornengine dev --watch` | Executables for the watch mode. |

The CLI records the files it writes into `.bornengine/`, so `bornengine clean` removes only what it created. See [Build and run](../../cli/build/) and [Native build cache](../../cli/cache/).

## Changing the engine version

The engine version is the dependency in `package.json`. To change it, use the engine commands instead of editing the file by hand. `bornengine engine update` moves to the latest stable release, and `bornengine upgrade` upgrades the current project's engine dependency. The [engine versions](../../cli/engine/) reference lists the full set of commands.

## Using a local engine checkout

To develop the engine and a game side by side, point a project at a local checkout with `--engine-path`. `bornengine new` and `bornengine init` accept the flag. The CLI then writes a `link:` dependency for pnpm or a `file:` dependency for npm and yarn, with a path relative to the project.

## Next steps

- [Quickstart](../quickstart/) creates a project and runs it.
- [Your first player](../first-player/) edits `main.ts` into a small game.
- [Build and run](../../cli/build/) explains the build targets and options.
