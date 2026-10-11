---
title: Project commands
description: Create a BornEngine project interactively, from a script, or in an empty folder, and choose its native build profile.
section: CLI
order: 21
---

A BornEngine project is a TypeScript package with a few extra files for the native build. Three commands create one: `create` asks you questions, `new` takes everything as arguments, and `init` writes the files into the folder you are already in. A fourth command, `create server`, adds a Colyseus multiplayer server to an existing project.

`create`, `new`, and `init` end by running your package manager's `install` command, so the engine package is in `node_modules/` when they finish.

## Create a project with questions

```sh
bornengine create
```

`create` asks four questions:

1. **Project name.** This is also the name of the new folder.
2. **Game type.** 2D, 2.5D, or 3D. The default is 2D. The answer sets the native profile, described in [Choose a native profile](#choose-a-native-profile).
3. **Package manager.** pnpm, npm, or yarn. The list starts on the manager in your [configuration](../configuration/), which is pnpm unless you changed it.
4. **BornEngine version.** The stable releases of `@bornengine/engine` from the npm registry, newest first. The list starts on your configured version if it is published, and on the newest release otherwise.

`create` needs an interactive terminal. In a script it stops with a message that points to `new`. It does not ask about optional native features. Add those with `new --native-features` or by editing `perry.toml`.

## Create a project from a script

```sh
bornengine new MyGame --game-type 2d --package-manager npm --engine-version 0.18.2
```

`new` creates the folder `MyGame` in the current directory. The folder may already exist if it is empty. If it contains files, the command stops and changes nothing.

- The name must be a single folder name. It cannot contain `/`, `\`, `:`, `*`, `?`, `"`, `<`, `>`, or `|`. It cannot be `.` or `..`, cannot end with a space or a dot, and cannot be a reserved Windows device name such as `con` or `com1`.
- `--game-type` is `2d` (the default), `2.5d`, or `3d`. `--kind` is an alias.
- `--package-manager` is `pnpm`, `npm`, or `yarn`. `--pm` is an alias. Without it, the CLI uses the manager from your configuration. The manager must be on your `PATH`, or the command stops before it writes anything.
- `--engine-version`, or `-e`, is an exact stable version such as `0.18.2`, or `latest`. Version ranges and prereleases are rejected. Without it, the CLI uses the version from your configuration, which is `latest` unless you changed it.
- `--native-features` takes `sqlite`, `scripting`, or both, separated by a comma.
- `--engine-path`, or `--engine`, points at a local engine checkout instead of a published version. See [Use a local engine checkout](#use-a-local-engine-checkout).

## Initialize the current folder

```sh
mkdir MyGame
cd MyGame
bornengine init --game-type 2.5d --package-manager pnpm
```

`init` writes the same files into the current folder. It takes no project name. The folder name becomes the project name and must follow the same rules as for `new`. All other options work as they do for `new`.

If any file that `init` would create already exists, it stops with `project file already exists` and writes nothing. It never overwrites a file, and it has no option to force that. `init` does not write `AGENTS.md`.

## What the CLI writes

| File | Contents |
| --- | --- |
| `package.json` | A private package named after the project, the engine pinned to an exact version, and the setting that lets Perry link the engine's native library. |
| `perry.toml` | The project name, the entry file `main.ts`, and the `[bornengine]` table with the native profile. |
| `main.ts` | A small `Game` subclass that opens an 800 by 450 window and draws a rectangle. |
| `.gitignore` | `node_modules/`, `.perry-cache/`, `.perry-dev/`, `.bornengine/`, `target/`, and `dist/`. |
| `README.md` | The commands that run and build the game. |
| `AGENTS.md` | A guide to the engine's API conventions. `create` and `new` write it. `init` does not. |

The package name is the project name in lowercase, with a hyphen between words that start with a capital letter. `MyGame` becomes `my-game`. Characters that a package name cannot contain become hyphens. [Project structure](../../getting-started/project-structure/) describes each file.

For `bornengine new MyGame --game-type 2d`, `package.json` looks like this:

```json
{
  "name": "my-game",
  "private": true,
  "version": "0.1.0",
  "dependencies": {
    "@bornengine/engine": "0.18.2"
  },
  "perry": {
    "allow": {
      "nativeLibrary": [
        "@bornengine/engine/*"
      ]
    }
  }
}
```

And `perry.toml` looks like this:

```toml
[project]
name = "my-game"
entry = "main.ts"

[bornengine]
native_profile = "2d"
```

The CLI does not read the `[project]` table. It takes the entry file from the command line. It writes the `[bornengine]` table only when the engine package is `@bornengine/engine`.

## Choose a native profile

BornEngine's native library is Rust code that Cargo, Rust's build system, compiles the first time you build. Some parts of it are optional, and a 2D game does not need most of them. The profile tells the CLI which optional parts to compile in. Its value is `native_profile` in the `[bornengine]` table of `perry.toml`:

| Profile | Cargo features | What the native build includes |
| --- | --- | --- |
| `2d` | `mp3` | PNG images and MP3 audio. No 3D model loading, no Jolt physics, and no image formats other than PNG. |
| `2.5d` | `mp3`, `models3d`, `image-extras` | Adds 3D model loading and the JPEG, BMP, TGA, HDR, and DDS image formats. No Jolt physics. |
| `3d` | `mp3`, `jolt`, `models3d`, `image-extras` | Adds Jolt 3D physics. |

You choose the profile when you create the project, and you can change it later by editing `perry.toml`. The profile is a build setting. It is separate from the `renderMode` option you pass to `Game`, which selects the renderer at run time.

How the CLI applies the profile:

- `build`, `run`, and `dev` pass the selected features to the Cargo build of the engine's native library. This covers every native target: desktop, Android, and the Apple platforms. It happens only when `@bornengine/engine` is installed in `node_modules/`.
- Direct `perry compile` and `cargo build` commands do not read the `[bornengine]` table. Build through `bornengine` so that the profile is applied.
- Web/WASM builds use a prebuilt engine module, so the profile does not change them.
- If `perry.toml` or `native_profile` is missing, the CLI uses `2d`. Any other value stops the build with `unknown BornEngine native profile`.
- Projects made by early CLI versions may have a `[native-library."@bornengine/engine"]` table with a `features` list instead. The CLI still reads it when `native_profile` is absent: `jolt` selects 3D, `models3d` selects 2.5D, and anything else selects 2D.

## Add native features

`native_features` adds Cargo features on top of the profile:

```toml
[bornengine]
native_profile = "2.5d"
native_features = ["sqlite", "scripting"]
```

Feature names may contain letters, digits, `-`, and `_`. Cargo reports an error for a name that the engine's native library does not define. Common choices:

- `sqlite` compiles the native SQLite backend that `GameDatabase` uses. Without it, native database operations return `unsupported`. See [Database and migrations](../../api/storage/).
- `scripting` compiles the QuickJS runtime for sandboxed scripts. Check `game.scripting.isSupported` before you rely on it, because not every target has a runtime. See [Embedded scripting](../../api/scripting/).
- `image-extras` adds JPEG, BMP, TGA, HDR, and DDS image loading to a 2D project. The `2d` profile decodes PNG only.
- `debug-ui` adds the optional debug inspector. It exists only in the Linux, macOS, and Windows native builds. See [Runtime debugging](../../guides/debugging/).

The `--native-features` option of `new` and `init` accepts only `sqlite` and `scripting`. It writes them to `native_features` for you.

The CLI also turns on two features by itself, so code you do not use is not linked:

- `multiplayer`, the Colyseus client, when a TypeScript file imports `@bornengine/engine/colyseus`, or imports `ColyseusClient` or `Room` from `@bornengine/engine`.
- `dialogs`, the native file pickers, when a TypeScript file calls `openFileDialog` or `saveFileDialog`.

The CLI reads the `.ts`, `.tsx`, `.mts`, and `.cts` files in the project. It skips `node_modules`, `dist`, `build`, hidden folders, and `.d.ts` files. Run `bornengine build main.ts -v` to see the file and line that turned on each feature. If the installed engine does not define a detected feature, the CLI skips it and prints a warning that names the file and line. To turn detection off, set `auto_native_features = false` in the `[bornengine]` table. To force a feature on, list it in `native_features`.

The final feature list is the profile features, then the detected features, then `native_features`. `run` and `dev` also add `hot-reload` and `dev`. See [Build and run](../build/).

## Use a local engine checkout

To develop the engine and a game side by side, point a project at a clone of the engine repository:

```sh
git clone https://github.com/RuanFernandes/BornEngine
bornengine new EngineTest --engine-path ../BornEngine
```

The CLI writes a `link:` dependency for pnpm, or a `file:` dependency for npm and yarn, with a path relative to the project. The `name` in the checkout's `package.json` must be `@bornengine/engine` or `@bloomengine/engine`, and the checkout and the project must be on the same drive.

Set the `BORNENGINE_PATH` environment variable to make a checkout the default for `create`, `new`, and `init`. An explicit `--engine-path` wins over the variable. While the variable is set, the CLI ignores `--engine-version` and the configured version. To switch an existing project between a checkout and a release, use `bornengine engine use`. See [Engine versions](../engine/).

## If dependency installation fails

The project files stay on disk. The CLI prints `Project files are in <folder>; dependency installation failed.` and exits with the package manager's status. Fix the cause, such as a network error, and run `<manager> install` inside the folder.

## Create a Colyseus server

Run this inside a BornEngine project:

```sh
bornengine create server
bornengine create server services/game-server --package-manager pnpm
```

The command runs the Colyseus project generator in the folder you name, or in `server/` by default. From the project root, it runs `<manager> create colyseus-app@latest <folder>` for npm and pnpm, and `yarn create colyseus-app <folder>` for Yarn. The folder must be a new or empty directory inside the project. It cannot be the project root, and the path cannot pass through a symbolic link. `--package-manager`, or `--pm`, overrides the manager from your configuration.

When the generator succeeds, the CLI writes `bornengine.server.json` in the server folder:

```json
{
  "format": "bornengine.server",
  "version": 1,
  "provider": "colyseus",
  "clientProjectRoot": ".."
}
```

`clientProjectRoot` is the relative path from the server folder back to the game project. For `services/game-server` it is `../..`. If the generator fails, the CLI writes no marker and exits with the generator's status. If the generator succeeds but the marker cannot be written, the server stays in place and the error message asks you to create the marker by hand.

See [Multiplayer with Colyseus](../../guides/multiplayer/) for the game and server code, and [JSON blueprints](../../guides/blueprints/) for how the marker is used.

## Next steps

- [Quickstart](../../getting-started/quickstart/) runs the project you just created.
- [Project structure](../../getting-started/project-structure/) explains each file and folder.
- [Build and run](../build/) compiles the game for a target.
- [Engine versions](../engine/) changes the engine version of an existing project.
- [Configuration](../configuration/) sets the default package manager and engine version.
