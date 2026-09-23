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
bornengine engine install 0.4.16
bornengine engine use 0.4.16
bornengine engine use ../BornEngine
```

`engine current` reports the active source. `engine list` lists stable releases available from npm. `engine install [version]` installs/selects a stable release for the project; `engine update` refreshes the engine dependency; and `engine remove [version]` removes a project engine dependency. Check the active selection before removing a version.

## Local checkout versus release

Use a path with `engine use` while editing the engine. Switch back to a published release by passing its version. `BORNENGINE_PATH` can provide a default local checkout, but an explicit `--engine-path` wins.

## CLI upgrade

The top-level `upgrade` command manages the CLI itself:

```sh
bornengine upgrade
bornengine upgrade --latest
```

The separate `update` command only checks for a CLI release and prints an installation instruction. It never silently updates the binary.
