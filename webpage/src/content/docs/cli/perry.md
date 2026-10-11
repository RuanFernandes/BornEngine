---
title: Perry compiler
description: Install, locate, list, and remove the Perry compiler that BornEngine builds use.
section: CLI
order: 25
---

Perry is the compiler that turns your TypeScript into a native program. Every `bornengine build`, `run`, `dev`, and `check` calls it. The `bornengine perry` commands download a copy of Perry from a BornEngine release and keep track of the copies on your computer, so you do not have to install Perry by hand.

```sh
bornengine perry install
bornengine perry path
bornengine perry list
bornengine perry clean --dry-run
```

## Install Perry

```sh
bornengine perry install
bornengine perry install --release v0.16.1
```

`install` downloads the Perry build for your computer from a release of the BornEngine repository on GitHub. Without `--release` it uses the latest release. Release tags look like `v0.18.2` and follow the engine version numbers. Releases older than `v0.16.1` have no Perry archive. For such a tag, the command stops with an error that names the missing file.

The command does these steps:

1. It asks the GitHub API for the release.
2. It downloads `perry-SHA256SUMS.txt` and the archive for your operating system and CPU.
3. It computes the SHA-256 checksum of the archive. If it differs from the listed one, the command stops with `checksum mismatch` and installs nothing.
4. It extracts the archive to its own folder for that tag and makes that release the current one.

On success it prints `Installed Perry <tag> at <path>`, and the Perry commit when the archive records one. Installing the same tag again replaces the old copy.

Archives are published for these computers:

| Computer | Archive |
| --- | --- |
| Linux, x86-64 | `perry-linux-x86_64.tar.gz` |
| macOS, Intel | `perry-macos-x86_64.tar.gz` |
| macOS, Apple silicon | `perry-macos-aarch64.tar.gz` |
| Windows, x86-64 | `perry-windows-x86_64.zip` |

On any other combination, such as Linux on ARM64, the command stops with `no Perry archive is published for` and the name of your system. Install Perry another way and point the CLI at it, as described in [Use your own Perry](#use-your-own-perry). The command also needs a `tar` program: the one on your `PATH` on Linux and macOS, and `tar.exe` from the Windows `System32` folder on Windows.

The copies live in a `bornengine/perry/` folder inside your user data folder:

- Linux: `~/.local/share/bornengine/perry/`, or under `$XDG_DATA_HOME` when that variable is set
- macOS: `~/Library/Application Support/bornengine/perry/`
- Windows: `%APPDATA%\bornengine\perry\`

Each release has its own folder, such as `v0.18.2/perry/`. A small file named `current` records the tag that builds use. The `BORNENGINE_RELEASES_API` environment variable replaces the GitHub API address that `install` queries, for example to use a mirror.

## Find the compiler

```sh
bornengine perry path
```

`path` prints the compiler that builds will run. The CLI picks the first of these:

1. The file named by the `BORNENGINE_PERRY` environment variable, when it is not empty.
2. The current managed install.
3. `perry` on your `PATH`. In this case `path` prints the plain word `perry`.

`path` does not check that the file exists, so it prints `perry` even when nothing is installed. Run `bornengine doctor` or `bornengine version` to see that Perry starts and which version it is. The managed copy is not added to your `PATH`. Typing `perry` in a terminal does not start it, unless you installed another Perry yourself. Use `bornengine perry path` to see where it is.

## List and remove installs

```sh
bornengine perry list
bornengine perry clean --dry-run
bornengine perry clean
```

`list` prints one release tag per line, sorted by name, and marks the current one with `(current)`. When nothing is installed it tells you to run `perry install`. A Perry that is only on your `PATH` is not listed.

`clean` removes every managed release except the current one, and any download that was interrupted. `--dry-run` prints `Would remove <path>` for each folder and deletes nothing. The real run prints `Removed <path>`, or `Nothing to remove.` when there is nothing to remove. `clean` never touches the current install, the file named by `BORNENGINE_PERRY`, or a Perry on your `PATH`.

There is no command that makes an older installed release current again. Run `bornengine perry install --release <tag>`, which downloads it again and makes it current.

## Use your own Perry

Two settings let you use a Perry that `bornengine perry install` did not download:

- Set `BORNENGINE_PERRY` to the full path of a Perry executable. It wins over the managed install.
- Install Perry with its own [installation guide](https://docs.perryts.com/getting-started/installation.html) and make `perry` available on your `PATH`. The CLI uses it only when no managed copy is installed and `BORNENGINE_PERRY` is not set.

The managed copy comes from the BornEngine release. A Perry from another source can behave differently, so use the managed copy unless your computer has no archive or you need a specific build. For a managed copy, the CLI also sets `PERRY_RUNTIME_DIR` to the folder of the executable, unless you set it yourself. On Windows, Perry does not look for its runtime libraries beside the executable.

## If an install fails

| Message | What to do |
| --- | --- |
| `no Perry archive is published for` | Your operating system and CPU have no archive. Use your own Perry. |
| `the BornEngine release has no asset named` | The tag has no Perry archive. Use `v0.16.1` or newer. |
| `checksum mismatch for` | The download was damaged. Run the command again. |
| `could not GET` | The CLI could not reach GitHub. Check your network connection and try again. |
| `could not run tar to extract the Perry archive` | Install a `tar` program. |
| `invalid release tag` | A tag may contain letters, digits, `.`, `-`, and `_`, and cannot start with a dot. |

## Next steps

- [Installation](../../getting-started/installation/) installs Perry together with the other prerequisites.
- [Diagnostics](../diagnostics/) shows whether the CLI can start Perry.
- [Build and run](../build/) explains how builds use the compiler and its target list.
