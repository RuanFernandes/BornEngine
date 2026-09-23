---
title: Getting Started
description: Install the BornEngine toolchain, create a project, and learn the shape of the generated game.
section: Getting Started
order: 1
---

BornEngine projects are ordinary TypeScript projects with a native compiler path behind them. The companion `bornengine` CLI creates the project files, records the engine dependency, and keeps build artifacts isolated from your source.

## The shortest route

1. Read [what to install](installation/), including the platform-specific requirements.
2. Run the [quickstart](quickstart/) to create `MyGame` and launch it on the current host.
3. Open [project structure](project-structure/) when you want to add assets or understand generated files.

The CLI is a standalone Rust binary. Game projects additionally use Perry, a package manager, Rust/Cargo, and the native or cross-compilation tools for the target you select.

## Choose a target

- For a first native build, use the host default and run `bornengine run main.ts`.
- For a named target, use `--os` for a friendly platform name or `--target` for the exact Perry target.
- For Web/WASM, use the repository's `native/web/build.sh` flow and `runGame()` rather than a blocking loop.
- For Apple and Android, install the platform SDKs before selecting their Perry target.

The [CLI reference](../cli/) explains the flags and safety rules; the [platform guides](../platforms/) explain what each target can actually run.
