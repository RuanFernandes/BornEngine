---
title: Build and run
description: Compile, run, watch, and check a BornEngine game for your computer or for another target.
section: CLI
order: 22
---

Four commands take your game's entry file, usually `main.ts`. `build` compiles an optimized executable. `run` compiles a fast development build and starts it. `dev` does the same as `run`, and with `--watch` it restarts the game when your files change. `check` asks Perry whether your code can be compiled, without producing a binary. All four call [Perry](../perry/) and work inside a BornEngine project.

```sh
bornengine build main.ts --name my-game --os linux
bornengine run main.ts
bornengine dev main.ts --watch
bornengine run main.ts --release --jobs 4
bornengine check main.ts --target web
```

`--name`, or `-n`, sets the output name. `--os`, or `-o`, selects a friendly target name. `--target` selects an exact Perry target. `--jobs` limits parallel Cargo jobs. The command reference at the end of this page lists every option.

## What happens during a build

1. The CLI finds the project root and reads `package.json`. The file must declare the BornEngine engine package.
2. It runs `perry compile --help` to learn which targets your Perry supports, then resolves `--os` or `--target` against that list.
3. It validates your assets (see [Asset audit](../assets/)). An error stops the build. Warnings are not printed here. Run `bornengine assets validate` to see them.
4. It creates a new output folder under `.bornengine/builds/`.
5. It runs `perry compile` with the entry file and the output path. Compiler output streams to your terminal. The CLI also prints `Compiling...` and the time it took.
6. It copies your project assets next to the executable.
7. It records every file it wrote, so that `bornengine clean` can remove them. Files from a failed build are recorded too.

While Perry runs, the CLI puts a small `cargo` wrapper first on `PATH`. The wrapper calls your real Cargo. When Perry builds the engine's native library, the wrapper adds the features chosen by the [native profile](../project/#choose-a-native-profile). The wrapper lives in `.bornengine/tmp/` and is removed afterwards. If Cargo is not on your `PATH`, a native build stops with `Cargo was not found in PATH`.

## Build for a target

`build` always produces an optimized executable and never starts it:

```sh
bornengine build main.ts --name my-game --os linux
```

When it finishes, it prints the target, the entry file, and the path of the output. The output name is `--name` if you pass it. Otherwise it comes from the `name` in `package.json`, lowercased, with other characters replaced by hyphens, and from the entry file name if `package.json` has no name. A name may contain only letters, digits, `-`, `_`, and `.`. The CLI adds `.exe` for Windows targets and `.html` for Web targets.

Web and mobile outputs are build-only. Follow the platform guide to package or serve them: [Web and WASM](../../platforms/web-wasm/), [Mobile](../../platforms/mobile/), or [Apple platforms](../../platforms/apple/).

## Run on this computer

```sh
bornengine run main.ts
bornengine run main.ts -- --level tutorial
```

`run` builds a development executable, prints `Launching game...`, and starts it. The game process starts with the project root as its working directory, so a relative path such as `assets/player.png` resolves from the project folder. Everything after `--` goes to the game unchanged. `run` exits with the game's exit status.

`run` accepts only a target that can run on your computer: Linux on Linux, Windows on Windows, and macOS on macOS. A phone, a simulator, or a browser needs `build` and the steps in its platform guide.

## Develop with dev

`dev main.ts` is the same as `run main.ts` without program arguments. It builds, starts the game once, and exits when the game exits.

```sh
bornengine dev main.ts --watch
```

With `--watch`, `dev` hands the work to Perry's own watch mode. Perry rebuilds and restarts the game when a source file changes. The CLI also passes every folder that contains project assets, so a changed image or data file restarts the game too. Watch output goes to `.perry-dev/<name>/<timestamp>-<process id>-<n>/`, and Perry does not watch that folder. After a watch session, the CLI moves any new Perry object files (names ending in `_ts.o`, `_tsx.o`, `_mts.o`, or `_cts.o`) from the project root into that folder.

Development builds also turn on the engine's `hot-reload` feature. A running native game then reloads file-backed textures, sounds, music, and material shader files when they change on disk. Set the environment variable `BLOOM_NO_HOT_RELOAD=1` when you start the game to turn the watchers off. Optimized builds leave the feature out by default, and Web builds never watch files. See [Assets](../../api/assets/).

## Choose a target

Without `--os` or `--target`, the CLI passes no target to Perry, and Perry builds for your computer. With `--os`, the CLI passes the matching Perry target after it checks that your Perry lists it:

| `--os` value | Passed to Perry | Notes |
| --- | --- | --- |
| `linux` | `--target linux` | |
| `windows` | `--target windows` | |
| `macos` or `darwin` | no target | Perry's native macOS build. Only on a macOS host. |
| `android` | `--target android` | Build only. |
| `ios` | `--target ios` | Build only. |
| `tvos` | `--target tvos` | Build only. |
| `watchos` | `--target watchos` | Build only. |
| `visionos` | `--target visionos` | Build only. |
| `web` | `--target web` | Build only. The output is an HTML file. |

`--target` passes an exact name to Perry. The CLI recognizes `linux`, `windows`, `macos`, `android` and `android-*` names, `ios`, `ios-simulator`, `tvos`, `tvos-simulator`, `watchos`, `watchos-simulator`, `visionos`, `visionos-simulator`, `wearos`, `web`, and `wasm`. It also accepts any other name your Perry lists, and treats it as a build-only target. Use `--target` for names that have no `--os` value, such as simulators.

`--os` and `--target` conflict, and the command stops if you pass both. If your Perry does not list the target, the error names the targets it does list. The CLI never builds for a different platform instead. Cross builds depend on Perry and on the SDKs and linkers on your machine. The CLI only checks the target name.

## Development and optimized builds

The first native build of an engine version, target, and feature set compiles the engine's Rust code. That takes a while, and the result is kept in a shared cache. See [Native build cache](../cache/).

| Command | Rust optimization | Extra engine features |
| --- | --- | --- |
| `build` | Optimized | None |
| `run` and `dev` | Level 1, with incremental compilation | `hot-reload` and `dev` |
| `run --release` and `dev --release` | Optimized | None |

These settings apply to Cargo's build of the engine's native library. `build` has no `--release` option because it is always optimized.

`--jobs N` sets the maximum number of parallel Cargo jobs for `build`, `run`, `dev`, and `cache warm`. N must be a positive integer. Without `--jobs`, the CLI keeps a `CARGO_BUILD_JOBS` value from your environment, and Cargo chooses its own concurrency otherwise.

## Output folders

Every `build`, `run`, and `dev` (without `--watch`) creates a new folder. Old folders stay until you run `bornengine clean`:

```text
.bornengine/
  builds/
    manifest.json
    linux/
      my-game/
        <timestamp>-<process id>-<n>/
          my-game
          assets.manifest.json
          assets/
            player.png
```

The folder under `builds/` is the target: `linux`, `windows`, `macos`, or the exact Perry target such as `web`. The executable sits next to a copy of your assets and their manifest, the same files that `assets pack` writes. `manifest.json` lists every file the CLI created, and `clean` uses it. Both `.bornengine/` and `.perry-dev/` are in the `.gitignore` that `create`, `new`, and `init` write.

## Check a game with Perry

```sh
bornengine check main.ts
bornengine check main.ts --check-deps
bornengine check main.ts --check-deps --deep-deps --all
bornengine check main.ts --check-deps --strict
```

`check` runs Perry's compatibility check on the entry file for the selected target and shows Perry's output. On success it prints `Perry check completed successfully.`, and it exits with Perry's exit status. It does not validate assets or build native code.

- `--check-deps` asks Perry to scan the installed packages that your entry file imports.
- `--deep-deps` scans the whole installed dependency tree. It requires `--check-deps`.
- `--all` includes every Perry finding, including hints.
- `--strict` makes Perry treat warnings as errors.

Perry reports what it can see in your code and in package declarations. A clean result does not prove that every code path works on every platform. A warning is a finding to review, not proof that a package cannot run.

## Windows linkers

On 64-bit Windows, the CLI sets `PERRY_LLD_LINK` and `CARGO_TARGET_X86_64_PC_WINDOWS_MSVC_LINKER` for the programs it starts. Each variable keeps the value you set. If only one is set, the other copies it. If neither is set and `lld-link.exe` is on your `PATH`, both use `lld-link.exe`.

## Common errors

| Message | Cause and fix |
| --- | --- |
| `could not find a BornEngine project; run this command inside a project` | No parent folder of the entry file or the current folder has a `package.json` that declares the engine. Run the command inside the project. |
| `does not declare a BornEngine dependency` | The `package.json` has no engine dependency. Run `bornengine engine install`. |
| `entry file does not exist` | The path is wrong. It is relative to your current folder. |
| ``could not start `perry`; make sure it is installed and on PATH`` | Perry is missing. Run `bornengine perry install`. |
| `installed Perry does not advertise target` | Your Perry does not support the target. The message lists the targets it does support. |
| `cannot be run on the current` | You used `run` or `dev` with a target for another system. Use `build`. |
| `macOS builds require a macOS host` | `--os macos` works only on a Mac. |
| `Cargo was not found in PATH` | Install Rust. See [Installation](../../getting-started/installation/). |
| `asset validation failed` | The asset audit found an error. See [Asset audit](../assets/). |
| `output name must be a simple file name` | `--name` contains characters other than letters, digits, `-`, `_`, and `.`. |

## Next steps

- [Native build cache](../cache/) explains why the first native build is slow and how to prepare it ahead of time.
- [Asset audit](../assets/) explains the checks that run before every build.
- [Diagnostics](../diagnostics/) checks your setup when a build fails for an unclear reason.
- [Platforms](../../platforms/) lists what each target needs and what it cannot do.
