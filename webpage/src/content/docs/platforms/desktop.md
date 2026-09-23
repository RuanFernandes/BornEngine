---
title: Desktop
description: Build BornEngine games for macOS, Windows, and Linux native hosts.
section: Platforms / Desktop
order: 51
---

Desktop builds use the native host target by default:

```sh
bornengine build main.ts
bornengine run main.ts
```

Friendly selectors are `--os macos`, `--os windows`, and `--os linux`. Use `--target` when you need a specific Perry target. `run` requires the resulting native executable to match the current host, while `build` can cross-compile only when Perry and the platform toolchain support it.

## Linux

The CLI documents these Debian/Ubuntu development packages:

```sh
sudo apt install pkg-config libx11-dev libxi-dev libasound2-dev
```

They provide the minimum X11/XI and ALSA headers for the Linux backend. Other distributions need their equivalent package names.

## macOS and Windows

macOS builds require a macOS host because the native target uses Apple's toolchain and Metal. Windows builds need the Perry setup plus the C++/LLVM components requested by the installed compiler; the [Microsoft C++ Build Tools](https://visualstudio.microsoft.com/visual-cpp-build-tools/) page is the official starting point.

When a target is rejected, run `perry compile --help` on that machine. The installed compiler's advertised target list is the source of truth.
