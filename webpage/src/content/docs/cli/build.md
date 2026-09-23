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
bornengine check main.ts --target web
```

`--os` and `--target` cannot be used together. The CLI accepts a friendly OS only when the installed Perry advertises the corresponding target. It does not silently fall back to another platform.

## Output and run behavior

Build artifacts live under `.bornengine/builds/`. Watch mode uses `.perry-dev/`, which Perry excludes from its source watcher. `run` launches only a native executable for the current host; Web and mobile commands are build-only and must follow their platform packaging flow.

Arguments after `--` are passed to the game:

```sh
bornengine run main.ts -- --level tutorial
```
