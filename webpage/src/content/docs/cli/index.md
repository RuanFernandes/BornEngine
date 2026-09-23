---
title: BornEngine CLI
description: Create projects, compile targets, inspect the toolchain, and manage engine versions with bornengine.
section: CLI
order: 20
---

`bornengine` is a small Rust frontend to Perry. It creates a project, records an exact engine dependency and lockfile, and keeps platform decisions in the command you run.

## Command groups

- [Project commands](project/) — `create`, `new`, and `init`.
- [Build and run](build/) — `build`, `run`, `dev`, and `check`.
- [Diagnostics](diagnostics/) — `clean`, `doctor`, `info`, and `version`.
- [Engine versions](engine/) — the `engine` group plus `upgrade`.
- [Configuration](configuration/) — `config set|get|list` plus `update`.

## Target selection

Without `--os` or `--target`, the CLI asks Perry for its native host target. Friendly `--os` values include `linux`, `windows`, `macos`, `android`, `ios`, `web`, `tvos`, `watchos`, and `visionos`. `--target` passes an exact target advertised by the installed Perry compiler.

```sh
bornengine build main.ts --name my-game --os linux
bornengine build main.ts --target ios-simulator
```

`--os` and `--target` are mutually exclusive. Cross-compilation depends on the installed Perry and platform SDKs; the CLI does not silently substitute another target. `run` only accepts a native executable for the current host.

## Global habits

The repeatable `-v` / `--verbose` flag increases diagnostics. Run `bornengine doctor` before collecting a build failure, and use `bornengine info` when you need the resolved project, engine, Perry, and host details.
