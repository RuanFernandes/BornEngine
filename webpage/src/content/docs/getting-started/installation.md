---
title: Installation
description: Set up the BornEngine CLI, Perry, package manager, Rust toolchain, and platform dependencies.
section: Getting Started
order: 2
---

## What you need

| Goal | Required setup |
| --- | --- |
| Read docs or examples | A browser; Git only if you clone the repository |
| Install the CLI | Rust and Cargo through [rustup](https://rustup.rs/) |
| Build a native game | CLI, Perry, Rust/Cargo, one package manager, and the host backend/linker |
| Build Web/WASM | Native setup plus [wasm-pack](https://rustwasm.github.io/wasm-pack/installer/) |
| Build Apple targets | macOS and [Xcode](https://developer.apple.com/xcode/) |
| Build Android | Perry's Android target plus [Android Studio](https://developer.android.com/studio/install) and its SDK/NDK |

The CLI itself is Rust-based and does not require Node.js. Game projects do use Node.js and a package manager to install `@bornengine/engine`.

## Install the CLI and compiler

Install the CLI from its companion repository:

```sh
cargo install --git https://github.com/RuanFernandes/bornengine-cli
npm install -g @perryts/perry
```

BornEngine projects default to pnpm, but npm and Yarn are supported:

```sh
npm install --global pnpm
corepack enable
```

The first command installs pnpm. `corepack enable` makes the package-manager shims available for Yarn on Node installations that include Corepack. Choose one manager for a project; installing all three is not required.

## Verify the setup

Run the checks that match the work you want to do:

```sh
rustc --version
cargo --version
perry --version
bornengine --version
node --version
npm --version
bornengine doctor
```

If you use pnpm or Yarn, verify that manager instead of treating every package manager as required. `bornengine doctor` checks the compiler, Rust, package manager, project, and host prerequisites and is the best first diagnostic when a build fails.

## Official installation guides

- [Rust installation](https://www.rust-lang.org/tools/install) and [rustup](https://rustup.rs/)
- [Node.js downloads](https://nodejs.org/en/download) and [npm installation](https://docs.npmjs.com/downloading-and-installing-node-js-and-npm)
- [pnpm installation](https://pnpm.io/installation)
- [Yarn installation](https://yarnpkg.com/getting-started/install)
- [Perry installation](https://docs.perryts.com/getting-started/installation.html)
- [wasm-pack installation](https://rustwasm.github.io/wasm-pack/installer/)
- [Xcode](https://developer.apple.com/xcode/)
- [Android Studio](https://developer.android.com/studio/install)
- [Microsoft C++ Build Tools](https://visualstudio.microsoft.com/visual-cpp-build-tools/)

## Native Linux headers

On Debian or Ubuntu, the minimum Linux backend set documented by the CLI is:

```sh
sudo apt install pkg-config libx11-dev libxi-dev libasound2-dev
```

Other distributions use different package names. Start with the equivalent `pkg-config`, X11/XI, and ALSA development packages, then run `bornengine doctor` again.

## If setup fails

Run `bornengine doctor`, fix the first failing check, and rerun it. If a target is rejected after the local tools pass, inspect `perry compile --help`: the CLI only accepts targets advertised by the installed Perry compiler and never silently substitutes another platform.
