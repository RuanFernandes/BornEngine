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
bornengine config list
```

`config set <key> <value>` writes a value, `config get <key>` reads one key, and `config list` prints the known configuration. These defaults are used by interactive scaffolding; explicit command flags take precedence.

The top-level `update` command is related to releases, not project configuration:

```sh
bornengine update
```

It checks for a newer CLI release and prints the command needed to install it. It does not self-update. Use `bornengine upgrade [version]` when you want the CLI upgrade flow.
