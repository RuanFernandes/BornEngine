---
title: Diagnostics and cleanup
description: Check your setup with doctor, print version and project details, and remove the build output the CLI recorded.
section: CLI
order: 23
---

Four commands tell you what is installed and what the CLI created. `doctor` checks your setup. `info` and `version` print versions and project details. `clean` removes build output.

## Check your setup with doctor

Run `doctor` first when a build fails or before you ask for help:

```sh
bornengine doctor
```

It prints one line for each check and never stops at the first problem. The checks are:

- **Perry**, **Rust**, and **Cargo**: the CLI runs each program with `--version`.
- **Package manager**: pnpm, npm, or yarn. Inside a project, the CLI takes the manager from the `packageManager` field of `package.json`, then from a lockfile (`pnpm-lock.yaml`, `package-lock.json`, or `yarn.lock`), then from your [configuration](../configuration/). Outside a project it uses the configuration.
- **Target**: whether your Perry can build for your computer. This check runs only when Perry was found.
- **Linux libraries**: on Linux only, `pkg-config` and the `x11`, `xi`, and `alsa` development libraries.
- **Project files**: inside a project, the project name, the engine dependency, whether the engine is installed in `node_modules/`, the Perry native-library allowlist in `package.json`, and `main.ts` at the project root.

On a healthy Linux machine inside a project, the output looks like this. The version text depends on your installation:

```text
BornEngine Doctor

[OK] Perry: <output of perry --version>
[OK] Rust: <output of rustc --version>
[OK] Cargo: <output of cargo --version>
[OK] pnpm
[OK] native target
[OK] Linux development library: x11
[OK] Linux development library: xi
[OK] Linux development library: alsa
Project: /home/you/MyGame
[OK] Project metadata: my-game
[OK] Engine dependency: @bornengine/engine 0.18.2 (npm registry)
[OK] BornEngine package is installed
[OK] Perry native-library allowlist
[OK] Entry point: main.ts

Environment looks ready.
```

A line starts with `[OK]`, `[FAIL]`, `[WARN]`, or `[INFO]`. `doctor` exits with `1` when any line is `[FAIL]` and prints `Some checks need attention.` A `[WARN]` line, such as a missing `main.ts`, does not change the exit status. Outside a project, `doctor` prints an `[INFO]` line and skips the project checks.

These are the failures you are most likely to see:

| Line | What to do |
| --- | --- |
| `Perry was not found or could not be started` | Run `bornengine perry install`. See [Perry compiler](../perry/). |
| `Rust was not found or could not be started`, or the same for Cargo | Install Rust with rustup. See [Installation](../../getting-started/installation/). |
| `<manager> was not found in PATH` | Install Node.js, then the package manager. |
| `Perry cannot build for this host` | Your Perry does not list a target for this operating system and CPU. |
| `pkg-config is missing` or `Linux development library ... is missing` | Install the packages shown below the line: Debian and Ubuntu, or Fedora. |
| `BornEngine package is missing from node_modules` | Run your package manager's `install` command in the project. |
| `Perry allowlist is missing @bornengine/engine/*` | Add `"@bornengine/engine/*"` to `perry.allow.nativeLibrary` in `package.json`. Projects made by the CLI have it. |
| `No BornEngine dependency is declared in package.json` | Run `bornengine engine install`. |

`doctor` does not check Node.js itself, wasm-pack, Xcode, the Android SDK, or the Microsoft C++ Build Tools. [Installation](../../getting-started/installation/) lists commands that verify them.

## Print versions and project details

```sh
bornengine --version
bornengine version
bornengine info
```

`--version` prints only the CLI version, for example `bornengine 0.7.1`.

`version` prints the CLI version, the engine dependency when you are inside a project, and the Perry version:

```text
BornEngine CLI: 0.7.1
BornEngine Engine: @bornengine/engine 0.18.2
Perry: <output of perry --version>
```

`info` adds your operating system, the CPU architecture, the Rust version, and the project name. `Engine:` ends with where the dependency comes from: `npm registry`, `local path`, or `GitHub/Git`. Outside a project it prints `Project: none`. When Perry is missing, its line reads `Perry: not installed`.

```text
BornEngine CLI: 0.7.1
Host: linux (x86_64)
Perry: <output of perry --version>
Rust: <output of rustc --version>
Project: my-game
Engine: @bornengine/engine 0.18.2 (npm registry)
```

Neither command changes anything. When you report a problem, include the output of `info`, the first `[FAIL]` line from `doctor`, the target, and the exact command you ran.

## Remove build output with clean

```sh
bornengine clean
```

Run `clean` inside a project. Every time the CLI builds, it records the files it wrote in `.bornengine/builds/manifest.json`. `clean` deletes exactly those files, and then deletes folders that became empty. It covers the executables, the copied assets, and Perry object files that the CLI moved, in `.bornengine/builds/` and `.perry-dev/`. It prints `Removed N BornEngine build artifact(s).`, or `No BornEngine build artifacts were recorded.` when the list is empty. With `-v` it also prints the project folder.

`clean` never deletes your source files, `node_modules/`, lockfiles, or files you added to those folders yourself. It also does not touch the shared native cache or the Perry compilers. To free that space, see [Native build cache](../cache/) and [Perry compiler](../perry/). If the manifest lists a path outside the two build folders, `clean` stops with an error before it deletes anything.

## Next steps

- [Installation](../../getting-started/installation/) explains how to install the programs that `doctor` checks.
- [Troubleshooting](../../troubleshooting/) lists common failures and fixes.
- [Build and run](../build/) explains where build output goes.
