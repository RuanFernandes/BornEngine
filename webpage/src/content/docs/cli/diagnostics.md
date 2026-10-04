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

## Check package compatibility

`bornengine check` delegates compatibility analysis to the installed Perry compiler. Add `--check-deps` to scan installed packages used by the entry file, or add `--deep-deps` to scan the full installed dependency tree. Deep scanning requires `--check-deps`.

```sh
bornengine check main.ts --check-deps
bornengine check main.ts --check-deps --deep-deps --all
bornengine check main.ts --check-deps --strict
```

`--all` includes every Perry finding, including hints. `--strict` treats Perry warnings as errors. The CLI streams Perry's diagnostics and returns its exit status. A successful scan only describes what Perry can analyze statically; it does not guarantee runtime behavior on every platform or code path.
