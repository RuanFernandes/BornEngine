---
title: Configuration
description: Inspect and set the defaults the BornEngine CLI uses for new projects.
section: CLI / Configuration
order: 25
---

Use the configuration group to make project creation predictable across shells:

```sh
bornengine config set package-manager pnpm
bornengine config get package-manager
bornengine config set engine-version 0.15.0
bornengine config list
```

`config set <key> <value>` writes a value, `config get <key>` reads one key, and `config list` prints the known configuration. The supported keys are `package-manager` and `engine-version`; the latter defaults to `latest` and sets the default release selected by `create`, `new`, and `init`. Explicit command flags take precedence.

The top-level `update` command checks whether a newer BornEngine CLI release is available and prints an installation command. It does not modify the engine dependency in your project:

```sh
bornengine update
```

To change the engine version used by the current project, use `bornengine upgrade [version]` or the `bornengine engine` commands. For example, `bornengine upgrade --latest` selects the newest stable engine release; it does not upgrade the CLI binary.
