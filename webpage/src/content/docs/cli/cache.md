---
title: Native build cache
description: Inspect and warm the shared Cargo cache used by native BornEngine builds.
section: CLI / Cache
order: 24
---

The CLI uses one Cargo target directory for compatible native builds from different BornEngine projects. By default, it is `<user-cache>/BornEngine/cargo-target`; Cargo fingerprints still separate engine versions, target triples, Rust toolchains, profiles, and feature sets.

```sh
bornengine cache path
CARGO_TARGET_DIR=/mnt/fast-cache bornengine cache path
```

Absolute `CARGO_TARGET_DIR` values are preserved. Relative values are anchored to the project root for native builds and `cache warm`, so they resolve to the same directory even when Perry runs from its build-output directory; `cache path` resolves a relative value from the current directory. The CLI does not delete or relocate package-local target directories. The first build for a missing version, target, toolchain, or feature combination still compiles its dependencies; later compatible builds reuse cached artifacts.

## Warm a project build

After installing a project's dependencies, `cache warm` compiles the selected BornEngine native engine/profile directly with Cargo. It does not run Perry, compile the TypeScript entry point, package assets, or launch the game.

```sh
bornengine cache warm
bornengine cache warm --release --jobs 4
```

Without `--release`, the warm operation uses the same fast incremental Cargo development profile as `run` and `dev`. `--release` warms optimized artifacts. Cargo can reuse artifacts only when the project's engine version, host target, feature set, Rust toolchain, and build profile match.

## Job limits

Pass `--jobs N` to `cache warm`, `build`, `run`, or `dev` to set `CARGO_BUILD_JOBS`. The value must be a positive integer. When omitted, an inherited `CARGO_BUILD_JOBS` value remains in effect; otherwise Cargo chooses its own concurrency. The CLI does not impose a machine-wide job limit.

`run` and `dev` use Rust optimization level 1 with incremental compilation by default to shorten iteration time. Add `--release` to either command for optimized output. `build` remains optimized. Installing the CLI does not compile engine artifacts because the target project, engine version, and features are not known until a game project is selected.
