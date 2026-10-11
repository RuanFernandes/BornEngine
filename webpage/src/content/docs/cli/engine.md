---
title: Engine versions
description: Inspect, install, select, update, and remove the engine dependency of a project.
section: CLI
order: 24
---

Each project pins the exact engine version it uses in `package.json`, and your package manager records the resolved packages in a lockfile. The CLI does not install an engine for the whole computer. The `engine` commands and `upgrade` edit the dependency of the project you are in and then run your package manager's `install` command, which updates `node_modules/` and the lockfile. The CLI and the engine have separate version numbers.

```sh
bornengine engine current
bornengine engine list
bornengine engine install 0.18.2
bornengine engine update
bornengine engine use ../BornEngine
bornengine engine remove
```

Run these commands inside the project, or in any folder below its root.

## See what a project uses

`engine current` prints the package name and version from `package.json`, and where the dependency comes from:

```text
@bornengine/engine 0.18.2
Source: npm registry
```

The source is `npm registry` for a version number, `local path` for a `link:` or `file:` dependency, and `GitHub/Git` for a `github:` or `git+` dependency.

`engine list` asks the npm registry for the published releases and prints each stable version with its package name, newest first. Prereleases are not listed. Both commands change nothing.

## Change the version

Four commands select a release from the registry:

| Command | Result |
| --- | --- |
| `engine install <version>` | Selects that version. |
| `engine install` | Selects the latest stable version. It ignores the `engine-version` setting in your [configuration](../configuration/). |
| `engine update` | Selects the latest stable version. |
| `upgrade [version]` | The same as `engine install`. `upgrade --latest` selects the latest version, and you cannot combine `--latest` with a version. |

A version must be an exact stable release, such as `0.18.2`, or the word `latest`. Version ranges such as `^0.18.0` and prereleases are rejected. The CLI writes the exact version to `package.json`, without a range prefix.

If the project already uses the selected version, the CLI prints `BornEngine dependency is already <package> <version>` and does nothing else. Otherwise it removes any engine entry from `dependencies`, `devDependencies`, and `optionalDependencies`, adds the new one to `dependencies`, and prints `Updated BornEngine: <old> -> <new>`, or `Added BornEngine:` when there was none. Then it runs the package manager's `install` command. The command exits with the package manager's status.

The CLI takes the package manager from the `packageManager` field of `package.json`, then from a lockfile, then from your configuration. The manager must be on your `PATH`.

## Registry and older package

The CLI looks for versions of `@bornengine/engine` first. If the version you ask for is not published under that name, it falls back to `@bloomengine/engine`, the older package name, so projects made for that package keep working. `engine list` uses the older package only if the new one has no versions. Both package names count as an engine dependency. Native profile settings in `perry.toml` apply only to `@bornengine/engine`.

## Use a local checkout

While you work on the engine itself, point a project at your clone:

```sh
bornengine engine use ../BornEngine
bornengine engine use 0.18.2
```

`engine use` treats its argument as a folder when a folder with that name exists. Otherwise it treats the argument as a version. The folder must contain a `package.json` named `@bornengine/engine` or `@bloomengine/engine`. The CLI writes a `link:` dependency for pnpm, and a `file:` dependency for npm and yarn, with a path relative to the project root. Pass a version number to switch back to a published release. `new` and `init` take a checkout through `--engine-path`. See [Project commands](../project/#use-a-local-engine-checkout).

## Remove the engine

```sh
bornengine engine remove
bornengine engine remove 0.18.2
```

`remove` deletes the engine entry from `package.json` and runs the package manager's `install` command. If you pass a version, it must equal the version now in `package.json`, or the command refuses. A project without an engine dependency prints `This project has no BornEngine dependency.` and exits with `0`. After removal, `build` and `run` stop with an error such as `does not declare a BornEngine dependency` until you run `engine install` again.

## After you change the version

- The first native build compiles the engine again, because the cache is keyed by engine version. See [Native build cache](../cache/), or run `bornengine cache warm`.
- Read the [migration notes](../../reference/migration/) for changes that can break your code.
- Run `bornengine doctor` to confirm that the new package is installed.
- Commit `package.json` and the lockfile together.

`upgrade` and `engine update` change the engine of one project. To check whether a newer CLI exists, use `bornengine update`, described in [Configuration](../configuration/).

## Next steps

- [Project commands](../project/) creates projects with a chosen engine version.
- [Configuration](../configuration/) sets the default engine version for new projects.
- [Migration](../../reference/migration/) lists API changes between engine versions.
