---
title: Native build cache
description: Find, move, and pre-fill the shared Cargo cache that native BornEngine builds use.
section: CLI
order: 24
---

BornEngine's native engine is a Rust library. The first native build for a given engine version, target, Rust toolchain, and feature set compiles that library and its Rust dependencies, which can take a long time. To avoid repeating this for every project, the CLI points Cargo, Rust's build system, at one shared target directory. A target directory is where Cargo stores compiled output. Compatible builds from different projects reuse what is already there.

Installing the CLI does not compile anything, because the engine version, the target, and the features are not known until you build a project.

## Find the cache

```sh
bornengine cache path
```

The command prints the target directory that native builds use. By default it is `BornEngine/cargo-target` inside your user cache folder:

- Linux: `~/.cache/BornEngine/cargo-target`, or under `$XDG_CACHE_HOME` when that variable is set
- macOS: `~/Library/Caches/BornEngine/cargo-target`
- Windows: `%LOCALAPPDATA%\BornEngine\cargo-target`

`cache path` works outside a project too.

## Choose another location

Set `CARGO_TARGET_DIR` to use a different folder, for example a fast disk:

```sh
CARGO_TARGET_DIR=/mnt/fast-cache bornengine cache path
CARGO_TARGET_DIR=/mnt/fast-cache bornengine run main.ts
```

In PowerShell, set the variable first with `$env:CARGO_TARGET_DIR = 'D:\bornengine-cache'`.

An absolute value is used as written. A relative value is resolved against the project root, and `cache path` does the same when you run it inside a project. Outside a project it resolves against the current folder. This keeps the location stable even though Perry runs from the build output folder. The CLI does not move or delete `target` folders that already exist inside packages.

Web builds use a prebuilt engine module, so they do not use the cache.

## What gets reused

Cargo reuses a compiled artifact only when all of these match:

- the engine version, or the path of a local checkout
- the build target
- the Rust toolchain
- the build profile: the fast development profile of `run` and `dev`, or the optimized profile of `build`
- the set of native features

If you change the native profile or `native_features` in `perry.toml`, upgrade the engine, or update Rust, the next build compiles again. Two projects with the same engine version and the same profile share the cache. See [Project commands](../project/#choose-a-native-profile) for how the features are chosen.

## Warm the cache

`cache warm` compiles the engine's native library ahead of time, before you build a game:

```sh
bornengine cache warm
bornengine cache warm --release --jobs 4
```

Run it inside a project whose dependencies are installed. It runs `cargo build` for the engine's native crate for your computer's operating system, with the same target directory and the same features as `run` and `dev`, including `dev`, which turns on hot reload. With `--release`, it builds the optimized profile that `build` uses, without the development features. It prints the engine version, the profile, and the target directory when it starts, and `Native cache is ready.` when it succeeds.

It does not run Perry, compile your TypeScript, copy assets, or start the game. Use it when you want the slow step to happen at a time of your choosing, for example in a build image, or after you change the engine version.

`cache warm` has these requirements:

- The host must be Linux, Windows, or macOS. It builds for the host only.
- The project must use `@bornengine/engine`. The older `@bloomengine/engine` package is not supported.
- The engine must be installed in `node_modules/`. Otherwise the command stops with `install project dependencies first`.
- Cargo must be on your `PATH`.

## Limit parallel jobs

`--jobs N` sets `CARGO_BUILD_JOBS` for `cache warm`, `build`, `run`, and `dev`. N must be a positive integer. Without it, the CLI keeps a `CARGO_BUILD_JOBS` value from your environment, and Cargo chooses its own concurrency otherwise. The CLI sets no machine-wide limit. Lower the value on a computer that runs out of memory during the first build.

## Reclaim disk space

The CLI never deletes the shared cache. `bornengine clean` removes only build output recorded inside a project. To free the space, close any running builds and delete the folder that `cache path` prints. The next native build compiles the engine again.

## Next steps

- [Build and run](../build/) explains the development and optimized profiles.
- [Project commands](../project/) explains the native profile and the features that decide what is compiled.
- [Diagnostics](../diagnostics/) checks that Rust and Cargo are available.
