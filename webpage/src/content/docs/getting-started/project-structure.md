---
title: Project structure
description: Understand the files the BornEngine CLI creates and the directories used during builds.
section: Getting Started
order: 4
---

A newly scaffolded project is intentionally small. The entry file is yours; the generated package metadata tells Perry how to compile it and the package manager how to resolve the engine.

```text
MyGame/
├── main.ts                 # game entry point
├── package.json            # engine dependency and project scripts
├── <lockfile>              # npm, pnpm, or Yarn resolution
├── assets/                 # textures, sounds, fonts, models, worlds
└── perry.native.json       # generated native-library allowlist
```

The exact generated files can vary with the selected package manager and Perry version. Use `bornengine info` to inspect the resolved project and toolchain instead of assuming a global engine install.

## Generated build directories

- `.bornengine/builds/` contains build artifacts recorded by the CLI.
- `.perry-dev/` contains watch-mode output and is excluded from the source watcher.
- `clean` removes only files recorded in the CLI manifest. It does not delete dependencies, source files, or unrelated untracked files.

## Assets

Keep runtime assets under the project directory so the platform build can package them. Native and mobile targets resolve files from their application bundle; Web/WASM copies the `assets/` directory into the served output. See [assets as a concept](../concepts/assets/) and the [Web/WASM guide](../platforms/web-wasm/) for path behavior.

## Local engine development

Projects normally use a published exact engine version. For engine work, point a project at a checkout:

```sh
bornengine new EngineTest --engine-path ../BornEngine
bornengine engine use ../BornEngine
```

An explicit `--engine-path` takes precedence over `BORNENGINE_PATH`. The package manager uses `link:` for pnpm and `file:` for npm/Yarn, while the checkout's package name controls the generated import and Perry allowlist.
