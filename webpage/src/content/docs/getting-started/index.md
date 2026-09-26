---
title: Getting Started
description: Install the BornEngine toolchain, create a project, and learn the Game lifecycle.
section: Getting Started
order: 1
---

BornEngine projects are TypeScript projects compiled to native or Web/WASM targets. The `bornengine` CLI creates project files and records the engine dependency.

## The shortest route

1. Read [what to install](installation/), including platform requirements.
2. Follow the [quickstart](quickstart/) to create a project and launch it.
3. Review [project structure](project-structure/) before adding assets or shared modules.

The CLI is a Rust binary. Game projects additionally use Perry, a package manager, Rust/Cargo, and target-specific tools.

## Choose a target

- For a first native build, use `bornengine run main.ts` on the current host.
- For a named target, use `--os` for a friendly platform name or `--target` for the Perry target.
- For Web/WASM, use the `native/web/build.sh` flow and `Game.run()`; the browser owns frame scheduling.
- For Apple and Android, install the platform SDKs before selecting their Perry target.

The [CLI reference](../cli/) explains build flags; the [platform guides](../platforms/) describe target behavior.
