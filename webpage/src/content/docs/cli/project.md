---
title: Project commands
description: Scaffold a new BornEngine project interactively, non-interactively, or in an existing directory.
section: CLI / Project
order: 21
---

## Interactive projects

```sh
bornengine create
```

`create` prompts for the project name, package manager, and stable engine version. It is intentionally interactive and does not take a project-name argument.

## Scriptable projects

```sh
bornengine new MyGame --package-manager npm --engine-version 0.4.16
```

Use `--pm` as the shorter package-manager flag, `-e` for `--engine-version`, and `--engine` for `--engine-path`. A local engine checkout is useful while developing BornEngine itself:

```sh
bornengine new EngineTest --engine-path ../BornEngine
```

The generated package uses the selected manager's dependency syntax: pnpm uses `link:`, while npm and Yarn use `file:` for a local checkout.

## Initialize a directory

```sh
bornengine init --package-manager pnpm
```

`init` adds a scaffold to an otherwise empty directory and only creates files that do not already exist. `new` refuses a populated target directory. Neither command overwrites existing files, and there is no `--force` flag.

The command reference below includes each option and the related setup path.
