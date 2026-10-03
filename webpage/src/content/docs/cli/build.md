---
title: Build and run
description: Compile, launch, watch, or check a TypeScript entry file for a BornEngine target.
section: CLI / Build
order: 22
---

The build commands accept an entry file and an optional output name. `-n` is the alias for `--name`; `-o` is the alias for the friendly `--os` selector. Use `--target` when Perry exposes a target that needs an exact name.

```sh
bornengine build main.ts --name my-game --os linux
bornengine run main.ts
bornengine dev main.ts --watch
bornengine run main.ts --release --jobs 4
bornengine check main.ts --target web
```

`--os` and `--target` cannot be used together. The CLI accepts a friendly OS only when the installed Perry advertises the corresponding target. It does not silently fall back to another platform.

## Output and run behavior

Build artifacts live under `.bornengine/builds/`. Watch mode uses `.perry-dev/`, which Perry excludes from its source watcher. `run` launches only a native executable for the current host; Web and mobile commands are build-only and must follow their platform packaging flow.

Arguments after `--` are passed to the game:

```sh
bornengine run main.ts -- --level tutorial
```

## Native compile time and cache

The first native build for an engine version, Rust toolchain, target, and feature set still compiles its Rust dependencies. The CLI streams compiler output and writes compatible Cargo artifacts to a shared per-user cache, normally `<user-cache>/BornEngine/cargo-target`. Later projects can reuse them. Set `CARGO_TARGET_DIR` to use a different path, or inspect the active path with:

```sh
bornengine cache path
CARGO_TARGET_DIR=/mnt/fast-cache bornengine run main.ts
```

To populate the cache for the current project's installed engine and native profile without compiling the game's TypeScript entry point, run `bornengine cache warm`. It accepts `--release` and `--jobs N` like `run`.

`run` and `dev` use an incremental native development profile with Rust optimization level 1 by default. Add `--release` to either command for optimized native output. `build` is optimized by default. `--jobs N` controls Cargo's maximum parallel jobs on `build`, `run`, `dev`, and `cache warm`; values must be positive. When the flag is omitted, an inherited `CARGO_BUILD_JOBS` value is preserved, or Cargo chooses its own concurrency. CLI installation does not precompile engine artifacts.
