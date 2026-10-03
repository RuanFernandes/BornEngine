---
title: Engine versions
description: Inspect, install, select, update, and remove the engine dependency used by a project.
section: CLI / Engine
order: 24
---

Projects use an exact stable engine dependency. The CLI does not install a machine-global engine; it changes the project dependency and its lockfile.

```sh
bornengine engine current
bornengine engine list
bornengine engine install 0.13.0
bornengine engine use 0.13.0
bornengine engine use ../BornEngine
```

`engine current` reports the active source. `engine list` lists stable releases available from npm. `engine install [version]` installs/selects a stable release for the project; `engine update` selects the latest stable engine release; and `engine remove [version]` removes a project engine dependency. Check the active selection before removing a version. The top-level `bornengine upgrade [version]` is a shortcut for changing the project's engine dependency, not the CLI binary.

## Local checkout versus release

Use a path with `engine use` while editing the engine. Switch back to a published release by passing its version. This command accepts the checkout path as a positional source; `BORNENGINE_PATH` and `--engine-path` are for `new` and `init` scaffolding, as described in [Project commands](../project/).

## Check for a CLI update

The top-level `update` command checks GitHub releases and prints the command for installing a newer CLI version. It does not modify the installed binary:

```sh
bornengine update
```

Use `bornengine upgrade [version]` for the engine dependency in your current game project.
