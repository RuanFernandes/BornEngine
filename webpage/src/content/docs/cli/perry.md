---
title: Perry compiler
description: Install, locate, list, and remove the Perry compiler that BornEngine builds use.
section: CLI / Perry
order: 25
---

BornEngine builds use the Perry TypeScript compiler. `bornengine perry install` downloads the build for your platform from a BornEngine GitHub release, checks its SHA-256 against the release's `perry-SHA256SUMS.txt`, and stores it in a directory for that release under your user data directory:

- Linux: `~/.local/share/bornengine/perry/`
- macOS: `~/Library/Application Support/bornengine/perry/`
- Windows: `%APPDATA%\bornengine\perry\`

```sh
bornengine perry install
bornengine perry install --release v0.16.1
bornengine perry path
bornengine perry list
bornengine perry clean --dry-run
bornengine perry clean
```

Without `--release`, `install` uses the latest release. Installing a release makes it current, and `list` marks the current install. `clean` removes every other installed release and interrupted downloads; `--dry-run` prints what would be removed without deleting anything.

`bornengine perry path` shows the compiler builds run. The CLI resolves it in this order: the `BORNENGINE_PERRY` environment variable, the current managed install, then `perry` on `PATH`. Run `bornengine doctor` after installing to confirm the result.
