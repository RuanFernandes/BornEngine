---
title: Diagnostics and cleanup
description: Check the environment, inspect a project, print versions, and remove only tracked build artifacts.
section: CLI / Diagnostics
order: 23
---

Start with:

```sh
bornengine doctor
```

The doctor checks Perry, Rust, the package manager, the project, and host prerequisites. Fix the first failing check before chasing later errors. `bornengine info` prints the CLI, engine, Perry, project, and host details that matter in a support report; `bornengine version` prints the installed CLI version.

```sh
bornengine info
bornengine version
```

## Clean safely

```sh
bornengine clean
```

`clean` removes only files recorded in the CLI manifest, including generated build output. It does not delete source files, dependencies, or unrelated untracked files. If a dependency install failed, the generated source remains so you can retry with the selected package manager.

Use the repeatable `-v` / `--verbose` flag when the first diagnostic is not enough context.
