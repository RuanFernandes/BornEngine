---
title: Project commands
description: Scaffold a new BornEngine project interactively, non-interactively, or in an existing directory.
section: CLI / Project
order: 21
---

## Interactive projects

```sh
bornengine create
```

`create` prompts for the project name, game type, package manager, and stable engine version. Choose 2D, 2.5D, or 3D before selecting the package manager. It is intentionally interactive and does not take a project-name argument.

## Scriptable projects

```sh
bornengine new MyGame --game-type 2d --package-manager npm --engine-version 0.13.0
bornengine new MyGame --game-type 2d --native-features sqlite,scripting
```

`--game-type` accepts `2d`, `2.5d`, or `3d` and defaults to `2d`; `--kind` is an alias. The CLI records the selected profile in `[bornengine].native_profile` in `perry.toml`. `bornengine build`, `run`, and `dev` apply that profile only to BornEngine's native Cargo crate: 2D omits Jolt and 3D model loading, 2.5D enables models without Jolt, and 3D enables both. The `dev` command also enables native hot reload.

SQLite and embedded scripting are opt-in for native builds. Use `--native-features sqlite,scripting` when creating a project, or set `native_features = ["sqlite", "scripting"]` in the existing `[bornengine]` table. SQLite enables the native database backend. QuickJS scripting is enabled on supported targets; other targets keep the existing unsupported runtime stub, so check `game.scripting.isSupported` before offering script-driven content. The default profile does not compile the optional native SQLite or QuickJS dependencies. Web/WASM keeps its existing database and scripting behavior and is not pruned by the native profile.

Other Cargo features can be configured directly in `native_features` when using a custom engine build. Direct Perry commands do not read BornEngine's profile. Use `--pm` as the shorter package-manager flag, `-e` for `--engine-version`, and `--engine` for `--engine-path`. A local engine checkout is useful while developing BornEngine itself:

```sh
bornengine new EngineTest --engine-path ../BornEngine
```

The generated package uses the selected manager's dependency syntax: pnpm uses `link:`, while npm and Yarn use `file:` for a local checkout.

## Initialize a directory

```sh
bornengine init --game-type 2d --package-manager pnpm
```

`init` accepts the same `--game-type` values and defaults to 2D. It adds a scaffold to an otherwise empty directory and only creates files that do not already exist. `new` refuses a populated target directory. Neither command overwrites existing files, and there is no `--force` flag.

The command reference below includes each option and the related setup path.
