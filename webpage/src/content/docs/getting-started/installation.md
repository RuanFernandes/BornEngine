---
title: Installation
description: Install the BornEngine CLI, the Perry compiler, Rust, a package manager, and the system packages your computer needs.
section: Getting Started
order: 2
---

BornEngine needs a few programs on your computer. This page shows what each goal requires, how to install the CLI and the Perry compiler, and how to check the result. You do not need everything on the list. Install only what your goal needs.

## What you need

| Goal | Requirements |
| --- | --- |
| Read these docs or open the examples | A browser. Git, if you clone the repository. |
| Install the BornEngine CLI | Node.js 18 or newer with npm, or Rust 1.85 or newer with Cargo. |
| Create and build a native game | The CLI, Perry, Node.js 22.18 or newer, one package manager (pnpm, npm, or Yarn), Rust and Cargo, and the system packages for your operating system. |
| Build for Web/WASM | Everything for a native game, plus wasm-pack. |
| Build for Apple platforms | A Mac, Xcode, and the Perry setup for the platform. |
| Build for Android | The Perry setup for Android, Android Studio, and the Android SDK and NDK. |

Each program has a command that checks it. Run the command after you install the program:

| Program | What it does | Verify with |
| --- | --- | --- |
| [Node.js](https://nodejs.org/en/download) | Runs the CLI's npm launcher and your package manager. The engine package needs version 22.18 or newer. | `node --version` |
| [npm](https://docs.npmjs.com/downloading-and-installing-node-js-and-npm) | Installs the CLI. It is also a package manager for projects. | `npm --version` |
| [pnpm](https://pnpm.io/installation) | The default package manager for new projects. | `pnpm --version` |
| [Yarn](https://yarnpkg.com/getting-started/install) | An alternative package manager. | `yarn --version` |
| [Rust and Cargo](https://rustup.rs/) | Compile the engine's native library the first time you build. | `rustc --version` and `cargo --version` |
| [BornEngine CLI](https://github.com/RuanFernandes/bornengine-cli#install) | Creates, builds, and runs projects. | `bornengine --version` |
| [Perry](https://docs.perryts.com/getting-started/installation.html) | Compiles your TypeScript. | `bornengine doctor` |
| [wasm-pack](https://wasm-bindgen.github.io/wasm-pack/installer/) | Builds the Web/WASM engine module. | `wasm-pack --version` |
| [Xcode](https://developer.apple.com/xcode/) | Provides the Apple SDKs and simulators. | `xcodebuild -version` |
| [Android Studio](https://developer.android.com/studio/install) | Provides the Android SDK and NDK. | `adb --version` |
| [Microsoft C++ Build Tools](https://visualstudio.microsoft.com/visual-cpp-build-tools/) | Link native programs on Windows. | `where cl` |
| [Linux system packages](https://github.com/RuanFernandes/bornengine-cli#troubleshooting) | The X11, XI, and ALSA development files that the Linux build links against. | `pkg-config --exists x11 xi alsa` |

BornEngine publishes downloads for Linux on x86-64, Windows on x86-64, and macOS on Intel and Apple silicon. This covers the CLI and the Perry compiler. On another system, such as Linux on ARM64, install the CLI with Cargo and supply your own Perry.

## Install the CLI and compiler

Install the programs in this order. Skip a step for a program that is already installed. [Verify the setup](#verify-the-setup) shows how to check each one.

### 1. Node.js and a package manager

Install Node.js from the [Node.js downloads](https://nodejs.org/en/download) page. Use version 22.18 or newer, because the `@bornengine/engine` package declares that minimum. npm comes with Node.js.

New projects use pnpm unless you choose another manager. You need only one manager. To install pnpm or Yarn:

```sh
npm install --global pnpm
corepack enable
```

The first command installs pnpm. The second turns on Corepack, a program that comes with many Node.js installations and provides the `yarn` command. If your installation does not include Corepack, follow the Yarn installation guide.

### 2. The BornEngine CLI

Install the CLI from npm:

```sh
npm install --global @bornengine/cli
```

The npm package is a small launcher. The first time you run `bornengine`, it downloads the native program for your computer from the CLI's GitHub release, checks its SHA-256 checksum, and keeps it in the `BornEngine/cli` folder of your user cache. Later runs reuse that copy. Set `BORNENGINE_CLI_CACHE_DIR` to store it somewhere else. The launcher needs Node.js 18 or newer. The native program itself does not need Node.js.

To build the CLI from source instead, install Rust 1.85 or newer and run:

```sh
cargo install --git https://github.com/RuanFernandes/bornengine-cli
```

### 3. Rust

Native builds compile the engine's Rust library with Cargo, Rust's build system, so Rust must be installed even though you write only TypeScript. Install it with rustup, the Rust installer:

```sh
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh
```

On Windows, download and run the installer from [rustup.rs](https://rustup.rs/). It may ask you to install the Microsoft C++ Build Tools. Open a new terminal after the installation so that `cargo` is on your `PATH`.

### 4. The Perry compiler

Perry compiles TypeScript to a native program. The CLI downloads a copy that matches a BornEngine release:

```sh
bornengine perry install
```

The command downloads the Perry archive for your computer from the latest BornEngine release, checks its SHA-256 checksum, and stores it in your user data folder. Add `--release <tag>` to choose another release. The managed copy is not added to your `PATH`. The CLI finds it on its own. See [Perry compiler](../../cli/perry/) for the details and for other ways to provide Perry.

### 5. System packages

Native builds link against your operating system. What you need depends on the system.

**Linux.** Install a C compiler and linker (the linker joins compiled code into one executable), `pkg-config`, and the X11, XI, and ALSA development files. X11 and XI provide windows and input, and ALSA provides sound. On Debian and Ubuntu:

```sh
sudo apt install build-essential pkg-config libx11-dev libxi-dev libasound2-dev
```

On Fedora:

```sh
sudo dnf install gcc gcc-c++ glibc-devel pkgconf-pkg-config libX11-devel libXi-devel alsa-lib-devel
```

Other distributions use other package names. Install the equivalent C toolchain, `pkg-config`, X11, XI, and ALSA development packages, and run `bornengine doctor` again.

**macOS.** Install the Xcode Command Line Tools with `xcode-select --install`. Install the full [Xcode](https://developer.apple.com/xcode/) app to build Apple device and simulator targets, because it provides their SDKs and simulators.

**Windows.** Install the [Microsoft C++ Build Tools](https://visualstudio.microsoft.com/visual-cpp-build-tools/) with the "Desktop development with C++" workload. Perry's installation guide describes a lighter alternative that uses LLVM. When `lld-link.exe` is on your `PATH`, the CLI passes it to Perry and Cargo as the linker.

### 6. Extra programs for other targets

- **Web/WASM.** Install wasm-pack with `cargo install wasm-pack`, and add the WebAssembly target with `rustup target add wasm32-unknown-unknown`. See [Web and WASM](../../platforms/web-wasm/).
- **Apple platforms.** Install Xcode and the Rust targets that [Apple platforms](../../platforms/apple/) lists.
- **Android.** Install Android Studio, then the SDK and NDK components that your Perry target needs. See [Mobile](../../platforms/mobile/).

## Verify the setup

Run these commands in a new terminal:

```sh
node --version
npm --version
rustc --version
cargo --version
bornengine --version
bornengine version
bornengine doctor
```

If you use pnpm or Yarn, check that manager too with `pnpm --version` or `yarn --version`. `bornengine version` prints the Perry version, or `Perry: not installed`. Typing `perry --version` works only when a Perry is on your `PATH`. The copy that `bornengine perry install` downloads is not.

`bornengine doctor` is the most useful check. It prints one `[OK]` or `[FAIL]` line for Perry, Rust, Cargo, your package manager, and the Perry target for your computer. On Linux it also checks `pkg-config` and the X11, XI, and ALSA libraries. Inside a project it checks the project files too. It exits with `1` if any check fails. It does not check Node.js, wasm-pack, Xcode, Android, or the Microsoft C++ Build Tools, so verify those with their own commands:

```sh
wasm-pack --version
xcodebuild -version
adb --version
where cl
pkg-config --exists x11 xi alsa && echo "Linux libraries found"
```

Run the command that matches your goal. `where cl` works in the Developer Command Prompt for Visual Studio. When every check you need passes, continue with the [Quickstart](../quickstart/).

## Official installation guides

- [Rust installation](https://www.rust-lang.org/tools/install) and [rustup](https://rustup.rs/)
- [Node.js downloads](https://nodejs.org/en/download) and [npm installation](https://docs.npmjs.com/downloading-and-installing-node-js-and-npm)
- [pnpm installation](https://pnpm.io/installation)
- [Yarn installation](https://yarnpkg.com/getting-started/install)
- [Perry installation](https://docs.perryts.com/getting-started/installation.html)
- [wasm-pack installation](https://wasm-bindgen.github.io/wasm-pack/installer/)
- [Xcode](https://developer.apple.com/xcode/)
- [Android Studio](https://developer.android.com/studio/install)
- [Microsoft C++ Build Tools](https://visualstudio.microsoft.com/visual-cpp-build-tools/)
- [BornEngine CLI installation](https://github.com/RuanFernandes/bornengine-cli#install) and its [list of Linux packages](https://github.com/RuanFernandes/bornengine-cli#troubleshooting)

## If setup fails

Run `bornengine doctor`, fix the first `[FAIL]` line, and run it again. These are the problems that come up most often:

| Symptom | Cause and fix |
| --- | --- |
| `bornengine` is not found after `npm install --global` | npm's global folder is not on your `PATH`. Add it, or open a new terminal. |
| `BornEngine CLI is not available for linux/arm64; install it with Cargo instead.` | The CLI has no download for your system. Use the `cargo install` command above. |
| `Could not download ...` or `Checksum mismatch ...` from `bornengine` | The launcher could not fetch or verify the program. Check that you can reach github.com and run the command again. |
| `Perry was not found or could not be started` | Run `bornengine perry install`. |
| `no Perry archive is published for ...` | There is no download for your system. Install Perry from its own guide and set `BORNENGINE_PERRY` to its path. |
| `package manager ... was not found in PATH` | Install Node.js and the manager. The message tells you which command to run. |
| `Cargo was not found in PATH; install Rust to build this native BornEngine target` | Install Rust, then open a new terminal. |
| `Linux development library ... is missing` | Install the packages from step 5. |
| `installed Perry does not advertise target ...` | Your Perry does not support that target. The message lists the targets it supports. Use one of them. |
| npm warns about the Node.js version when you install the engine | Your Node.js is older than 22.18. Install a newer version. |

If a target is rejected after the local checks pass, run `compile --help` with the Perry that `bornengine perry path` prints and read its list of targets. The CLI only accepts targets that the installed Perry lists, and it never builds for another platform instead. [Build and run](../../cli/build/) explains target selection. For failures that happen while compiling, see [Troubleshooting](../../troubleshooting/).

## Next steps

- [Quickstart](../quickstart/) creates a project and runs the starter game.
- [CLI overview](../../cli/) lists every command.
- [Platforms](../../platforms/) describes what each target needs.
