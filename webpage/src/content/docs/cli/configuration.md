---
title: Configuration
description: Set the default package manager and engine version for new projects, review the environment variables the CLI reads, and check for a new CLI release.
section: CLI
order: 25
---

The CLI keeps two settings in a file in your user configuration folder. They are the defaults for the commands that create projects. The `config` commands read and write them. This page also lists the environment variables the CLI reads and explains `update`, which checks for a new CLI release.

```sh
bornengine config list
bornengine config set package-manager npm
bornengine config get package-manager
bornengine config set engine-version 0.18.2
```

## The two settings

| Key | Values | Default | Used by |
| --- | --- | --- | --- |
| `package-manager` | `pnpm`, `npm`, or `yarn` | `pnpm` | `create`, `new`, `init`, and `create server`; also `doctor` when it cannot find a manager in the project |
| `engine-version` | `latest`, or an exact stable version such as `0.18.2` | `latest` | `create`, `new`, and `init` |

You may write a key with a hyphen or an underscore. `config list` prints the current values:

```text
package-manager = pnpm
engine-version = latest
```

`config set <key> <value>` prints `Set <key> = <value>`. `config get <key>` prints only the value. Any other key stops with `unsupported configuration key`. The CLI checks values before it saves them. A package manager name is not case-sensitive and is stored in lowercase. An engine version must be `latest` or an exact stable semantic version: ranges, prereleases, and build metadata are rejected, and the file is left unchanged.

These settings are defaults, and an option on the command line wins over them. To choose the engine for a new project, `create`, `new`, and `init` use the first of these that is set:

1. `--engine-path` on the command line.
2. The `BORNENGINE_PATH` environment variable. It wins over `--engine-version` too.
3. `--engine-version` on the command line.
4. The `engine-version` setting, which is `latest` unless you changed it.

Commands that change an existing project, such as `engine install` and `upgrade`, do not read `engine-version`. They choose the package manager from the project first: the `packageManager` field of `package.json`, then a lockfile. They fall back to the `package-manager` setting only when the project names none.

## The configuration file

`config set` creates the file the first time. Without the file, the CLI uses the defaults. The file lives here:

- Linux: `~/.config/bornengine/config.toml`, or under `$XDG_CONFIG_HOME` when that variable is set
- macOS: `~/Library/Application Support/bornengine/config.toml`
- Windows: `%APPDATA%\bornengine\config.toml`

It is plain TOML with underscores in the key names:

```toml
package_manager = "npm"
engine_version = "0.18.2"
```

You can edit it by hand. If you save a package manager the CLI does not know, a bad version, or invalid TOML, every command that loads the file fails with a message that names it, and that includes `config` itself. Fix the value or delete the file.

## Environment variables

| Variable | Read by | Effect |
| --- | --- | --- |
| `BORNENGINE_PATH` | `create`, `new`, `init` | The path of a local engine checkout, used instead of a published engine version. |
| `BORNENGINE_PERRY` | Every command that runs Perry | The full path of the Perry executable to use. |
| `BORNENGINE_RELEASES_API` | `perry install` | Replaces the GitHub API address that is queried for Perry releases. |
| `CARGO_TARGET_DIR` | Native builds, `cache path`, `cache warm` | The folder for compiled engine code. See [Native build cache](../cache/). |
| `CARGO_BUILD_JOBS` | Native builds, `cache warm` | The number of parallel Cargo jobs when you do not pass `--jobs`. |
| `PERRY_RUNTIME_DIR` | Managed Perry | The folder with Perry's runtime libraries. The CLI sets it for a managed copy unless you already did. |
| `PERRY_LLD_LINK` and `CARGO_TARGET_X86_64_PC_WINDOWS_MSVC_LINKER` | Builds on 64-bit Windows | The linker for Perry and for Cargo. See [Build and run](../build/). |
| `BORNENGINE_CLI_CACHE_DIR` | The npm launcher | The folder where the launcher keeps the downloaded CLI binary. |
| `BLOOM_NO_HOT_RELOAD` | A running development build of your game | Set it to `1` to turn off the file watchers. |

## Check for a new CLI release

```sh
bornengine update
```

`update` prints the version you run and asks GitHub for the latest release of the CLI repository. When a newer version exists, it prints the command that installs it: `npm install --global @bornengine/cli`. When you are current, it says so. If GitHub cannot be reached, or no release exists, it says so and prints the same command. It always exits with `0`, and it never changes the installed program.

If you installed the CLI with Cargo, run your `cargo install` command again instead of the one that `update` prints. See [Installation](../../getting-started/installation/).

`update` is about the CLI program. To change the engine version of a project, use `bornengine upgrade` or the `engine` commands. See [Engine versions](../engine/).

## Next steps

- [Project commands](../project/) use these defaults to create projects.
- [Engine versions](../engine/) changes the engine of an existing project.
- [Perry compiler](../perry/) explains `BORNENGINE_PERRY` and the managed copies.
