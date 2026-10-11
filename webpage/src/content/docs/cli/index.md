---
title: BornEngine CLI
description: Create projects, build and run games, check your setup, and manage engine and compiler versions with the bornengine command.
section: CLI
order: 20
---

`bornengine` is the command-line program (the CLI) for BornEngine games. It creates projects, builds and runs them, and records which engine version each project uses. It does not compile TypeScript itself. It calls [Perry](perry/), the compiler that turns your TypeScript into a native app, and it calls your package manager to install the engine package.

This page shows a typical session, lists the command groups, and describes what every command has in common.

## A typical session

```sh
bornengine doctor
bornengine create
cd MyGame
bornengine run main.ts
bornengine build main.ts
bornengine clean
```

- `doctor` checks Perry, Rust, your package manager, and the current project. See [Diagnostics](diagnostics/).
- `create` asks for a project name, a game type, a package manager, and an engine version. It writes the project and installs its dependencies. See [Project commands](project/).
- `run` compiles the game and starts it on your computer. The first run is slow because the engine's native library is compiled once. See [Build and run](build/) and [Native build cache](cache/).
- `build` compiles an optimized executable and does not start it.
- `clean` removes the build output that the CLI recorded.

## Command groups

| Page | Commands | Use it to |
| --- | --- | --- |
| [Project commands](project/) | `create`, `create server`, `new`, `init` | Start a project, or add the BornEngine files to an empty folder. |
| [Build and run](build/) | `build`, `run`, `dev`, `check` | Compile for a target, run on this computer, rebuild on changes, or test compatibility. |
| [Native build cache](cache/) | `cache path`, `cache warm` | Find or fill the shared cache of compiled engine code. |
| [Asset audit](assets/) | `assets validate`, `assets pack` | Check asset references and size budgets, or copy assets with a checksum manifest. |
| [Diagnostics](diagnostics/) | `doctor`, `info`, `version`, `clean` | Check your setup, print versions, or remove recorded build output. |
| [Perry compiler](perry/) | `perry install`, `perry path`, `perry list`, `perry clean` | Install and manage the compiler that builds your game. |
| [Engine versions](engine/) | `engine current`, `engine list`, `engine install`, `engine update`, `engine use`, `engine remove`, `upgrade` | See or change the engine version a project uses. |
| [Configuration](configuration/) | `config set`, `config get`, `config list`, `update` | Set defaults for new projects, or check for a new CLI release. |
| [Import maps](import/) | `import tiled` | Convert a Tiled map to a World2D document. |

## How the CLI finds your project

Most commands that work on a project search for its root. The root is the nearest folder, going upward, whose `package.json` declares the engine package `@bornengine/engine`. The CLI also recognizes the older `@bloomengine/engine` package. `build`, `run`, `dev`, and `check` start the search at the folder of the entry file and fall back to your current folder. `clean`, `doctor`, `info`, `version`, the `engine` commands, `upgrade`, `cache warm`, and `create server` start at your current folder.

This means you can run `bornengine clean` or `bornengine engine current` from any folder inside the project. `assets` and `import` do not search. They use the current folder, or the folder you pass, as the project root.

## Choose a target

Without `--os` or `--target`, the CLI passes no target to Perry, and Perry builds for the computer you are using.

```sh
bornengine build main.ts --name my-game --os linux
bornengine build main.ts --target ios-simulator
```

`--os` takes a friendly name: `linux`, `windows`, `macos`, `android`, `ios`, `tvos`, `watchos`, `visionos`, or `web`. `--target` takes the exact target name that Perry reports. You cannot use both in one command. The CLI compares the name with the targets your installed Perry lists and stops with an error if Perry does not list it. It never builds for another platform instead. `run` and `dev` accept only a target that can run on your computer. See [Choose a target](build/#choose-a-target) for the details.

## Options every command accepts

- `-v` or `--verbose` prints more detail. You can write it before or after the command name. It prints the commands the CLI starts, such as the `perry compile` line, passes `-v` to Perry, and shows which source line turned on an automatic native feature. Repeating it has no extra effect.
- `-h` or `--help` prints usage for the CLI or for one command, for example `bornengine build --help`.
- `-V` or `--version` prints the CLI version. The `version` command prints more. See [Diagnostics](diagnostics/).
- `--add-ai-docs <FILENAME>` writes the BornEngine guide for coding agents to `<FILENAME>.md` in the current folder. It cannot be combined with another command. Projects made by `create` and `new` already include `AGENTS.md`.

## Files and folders the CLI uses

| Location | Contents | How to remove it |
| --- | --- | --- |
| `.bornengine/builds/` in your project | Output of `build`, `run`, and `dev` without `--watch`, plus the list of files the CLI wrote | `bornengine clean` |
| `.perry-dev/` in your project | Output of `dev --watch` | `bornengine clean` |
| `<user cache>/BornEngine/cargo-target` | Shared cache of compiled engine code | Delete the folder. See [Native build cache](cache/). |
| `<user data>/bornengine/perry/` | Perry compilers installed with `perry install` | `bornengine perry clean` |
| `<user config>/bornengine/config.toml` | Settings written by `config set` | Delete the file |

On Linux, `<user cache>`, `<user data>`, and `<user config>` are `~/.cache`, `~/.local/share`, and `~/.config`, unless the matching `XDG_CACHE_HOME`, `XDG_DATA_HOME`, or `XDG_CONFIG_HOME` variable is set. On macOS they are `~/Library/Caches`, `~/Library/Application Support`, and `~/Library/Application Support`. On Windows, the cache is under `%LOCALAPPDATA%`, and data and configuration are under `%APPDATA%`.

## Exit status and errors

A command that succeeds exits with `0`. When the CLI itself fails, it prints `Error:` and the reason to standard error and exits with `1`. Commands that run another program pass its exit status through: `run` returns the game's exit status, `check` returns Perry's, and `new`, `init`, and the commands that change the engine dependency return the package manager's. `doctor` exits with `1` when a check fails, and `assets validate` exits with `1` when it finds an error.

## Next steps

- [Installation](../getting-started/installation/) installs the CLI, Perry, and the Rust toolchain.
- [Quickstart](../getting-started/quickstart/) creates a project and runs the starter game.
- [Project commands](project/) explains the files a new project contains and the native profile.
- [Build and run](build/) explains targets, output folders, and development builds.
- [Troubleshooting](../troubleshooting/) lists the checks to run when something fails.
