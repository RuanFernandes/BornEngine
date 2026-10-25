---
title: Troubleshooting
description: Diagnose BornEngine build and startup problems by starting with the doctor and then matching the error text.
section: Troubleshooting
order: 70
---

Most BornEngine problems fall into one of three groups: the toolchain is incomplete, a command asked for something the machine cannot do, or the game started and then stopped. The doctor finds the first group. For the other two, find your error text below.

## Start with the doctor

```sh
bornengine doctor
```

The doctor checks the tools a build needs, and then the project in the current folder. Fix the first line marked `[FAIL]` and run the doctor again, because later failures often come from the first one. A healthy run on Linux looks like this:

```text
BornEngine Doctor

[OK] Perry: perry 0.5.1659
[OK] Rust: rustc 1.98.1 (48a229cea 2026-09-01)
[OK] Cargo: cargo 1.98.1 (797e8a9bc 2026-08-05)
[OK] pnpm
[OK] native target
[OK] Linux development library: x11
[OK] Linux development library: xi
[OK] Linux development library: alsa
Project: /home/you/MyGame
[OK] Project metadata: my-game
[OK] Engine dependency: @bornengine/engine 0.18.2 (npm registry)
[OK] BornEngine package is installed
[OK] Perry native-library allowlist
[OK] Entry point: main.ts

Environment looks ready.
```

What the lines mean:

- `Perry`, `Rust`, and `Cargo` show the version of each program, or a `[FAIL]` line if it cannot be started. The package manager line names the manager your project uses (`pnpm`, `npm`, or `yarn`).
- `native target` means Perry can build for this machine. If it cannot, you see `Perry cannot build for this host` instead.
- The `Linux development library` lines appear only on Linux.
- Below `Project:` come the project checks: the package name, the engine dependency, whether the engine is installed in `node_modules`, whether `package.json` allows Perry to link the engine, and whether `main.ts` exists.
- `[WARN]` and `[INFO]` lines do not make the doctor fail. Any `[FAIL]` line does: the doctor then ends with `Some checks need attention.` and exits with status 1.

The doctor does not check Xcode, the Android SDK, `wasm-pack`, a Windows linker, or your graphics driver. The [platform pages](../platforms/) cover those. Add `-v` to print more detail.

When you ask for help, include the output of `bornengine info`, the first failing line of `bornengine doctor`, the target you build for, and the exact command you ran:

```text
BornEngine CLI: 0.7.1
Host: linux (x86_64)
Perry: perry 0.5.1659
Rust: rustc 1.98.1 (48a229cea 2026-09-01)
Project: my-game
Engine: @bornengine/engine 0.18.2 (npm registry)
```

## Common failures

CLI errors start with `Error:`. Messages below are quoted as the tools print them, and `<...>` marks a part that changes.

### Perry is missing or broken

- `[FAIL] Perry was not found or could not be started`, or ``Error: could not start `perry`; make sure it is installed and on PATH: <system error>``. The CLI cannot run Perry. Run `bornengine perry install`, which downloads Perry for your machine and checks its SHA-256 sum, and then `bornengine perry path` to see which Perry the CLI will run. To use a Perry you built or installed yourself, set the `BORNENGINE_PERRY` environment variable to its path.
- `no Perry archive is published for <os>-<arch>`. `bornengine perry install` has archives only for Linux x86_64, Windows x86_64, and macOS on Intel and Apple Silicon. On any other machine, such as Linux on ARM64, use your own Perry through `BORNENGINE_PERRY`.
- `checksum mismatch for <archive>: expected <hash>, got <hash>`. The download was damaged. Run `bornengine perry install` again.
- `could not GET <url>`. The CLI could not reach GitHub to download Perry. Check your network connection and proxy.
- `Could not find libperry_runtime.a`, followed by a list of places Perry looked and a line that contains `Out-of-tree install: set PERRY_RUNTIME_DIR to the directory containing`. This message comes from Perry, not from the CLI. Perry needs its runtime libraries (`libperry_runtime.a` and `libperry_stdlib.a`, or `perry_runtime.lib` and `perry_stdlib.lib` on Windows). The CLI sets `PERRY_RUNTIME_DIR` for a Perry it installed. If you use your own Perry, keep those libraries next to the `perry` program, or set `PERRY_RUNTIME_DIR` to the folder that holds them.

### Other tools are missing

- `[FAIL] <manager> was not found in PATH`, followed by ``Install Node.js and run `npm install --global <manager>` ``. Your project uses a package manager that is not installed. Install Node.js, then the manager.
- `[FAIL] Rust was not found or could not be started`, or the same for `Cargo`. Install Rust with [rustup](https://rustup.rs/). During a native build you may see `Cargo was not found in PATH; install Rust to build this native BornEngine target`, which means the same thing.
- `[FAIL] pkg-config is missing; install pkg-config and the X11/XI/ALSA development packages`, or ``[FAIL] Linux development library `x11` is missing`` (also `xi` and `alsa`). Linux builds link against these libraries. The doctor prints the install command for Debian and Ubuntu (`sudo apt install pkg-config libx11-dev libxi-dev libasound2-dev`) and for Fedora (`sudo dnf install pkgconf-pkg-config libX11-devel libXi-devel alsa-lib-devel`). Other distributions use other package names.
- On Windows, linker errors usually mean Perry has no linker toolchain. Run `perry doctor`, which checks Perry's own environment, and follow the [Desktop](../platforms/desktop/) page.
- Xcode, Android SDK, and `wasm-pack` problems do not show up in `bornengine doctor`. See [Apple](../platforms/apple/), [Mobile](../platforms/mobile/), and [Web / WASM](../platforms/web-wasm/).

### The target was rejected

- ``Error: installed Perry does not advertise target `<target>`; supported targets: ...``. The CLI accepts only the targets that `perry compile --help` lists. The Perry that BornEngine 0.18.2 pins does not list `tvos` or `watchos`, so the CLI cannot build for them. Call `perry compile` yourself for those targets, as the [Apple](../platforms/apple/) page shows. For other targets, install a Perry that lists the target.
- ``Error: unsupported operating system `<name>` ``. `--os` accepts `linux`, `windows`, `macos`, `android`, `ios`, `tvos`, `watchos`, `visionos`, and `web`. For anything else, use `--target` with a name from `perry compile --help`.
- `Error: macOS builds require a macOS host because Perry uses the native host target`. Build macOS games on a Mac.
- ``Error: target `<target>` cannot be run on the current `<host>` host``. `bornengine run` and `bornengine dev` start the game on your machine, so they accept only a target that matches it. Use `bornengine build` for other targets and install the result with the platform's own tools.
- `error: the argument '--os <OS>' cannot be used with '--target <TARGET>'`. Use one of the two options, not both.
- `[FAIL] Perry cannot build for this host: <reason>` or `[FAIL] Could not inspect Perry targets: <reason>`. The Perry the CLI found does not work on this machine. Run `bornengine perry install`, or fix the path in `BORNENGINE_PERRY`.

### The project is not set up

- `Error: could not find a BornEngine project; run this command inside a project`. The CLI looks for a `package.json` that lists the engine, starting at your entry file and then at the current folder, and going up. Run the command from your project folder, or create a project with `bornengine create`.
- ``Error: <path>/package.json does not declare a BornEngine dependency``, or `[FAIL] No BornEngine dependency is declared in package.json`. Add the engine with `bornengine engine install`.
- ``Error: entry file does not exist: <path>: No such file or directory (os error 2)``. The file you passed to `build`, `run`, or `check` is not there. Paths are relative to the folder you run the command in.
- ``[FAIL] BornEngine package is missing from node_modules; run `install` ``. The dependencies are not installed. Run your package manager's `install` command in the project folder, for example `pnpm install`.
- ``[FAIL] Perry allowlist is missing `@bornengine/engine/*` ``. Perry refuses to link native code that your project has not approved, and it says so in its own error: ``Error: package `<name>` declares `perry.nativeLibrary` (links arbitrary native code into the binary) but is not in your host `perry.allow.nativeLibrary` ``. Add the engine to `package.json`:

  ```json
  {
    "perry": {
      "allow": {
        "nativeLibrary": ["@bornengine/engine/*"]
      }
    }
  }
  ```
- `[WARN] No main.ts entry point was found at the project root`. This is only a warning. Pass your real entry file to the commands.
- ``unknown BornEngine native profile `<name>` in <path>/perry.toml``. `native_profile` under `[bornengine]` must be `2d`, `2.5d`, or `3d`.
- `output name must be a simple file name without path separators`. The value of `--name` can contain only letters, digits, `-`, `_`, and `.`.

### The build fails

- ``asset validation failed: "<code>" at `<path>`: <message>``. `build` and `run` check your asset folders first and stop on an error. Run `bornengine assets validate` to see every finding. A warning such as `orphan_asset` does not stop a build; an error such as `declared_dynamic_path_missing` does. See [Assets](../cli/assets/).
- ``Error: `perry compile` exited with status exit status: 1; compiler output was streamed above``. Perry or the Rust build failed, and the real reason is in the output before this line. The status text differs between systems. Read the output from the top, and run the command again with `-v` for more detail.
- `Perry completed successfully but did not create <path>` and `Perry completed successfully without creating any build files`. Perry reported success but produced no output file. Run again with `-v` and check the target and the output name.
- ``warning: native feature `<name>` is used at <file>:<line>, but the installed BornEngine does not provide it; update `@bornengine/engine` to enable it``. Your source uses a feature that the installed engine version does not have. Update the engine with `bornengine engine update`.
- The first native build takes a long time. It compiles the engine's Rust dependencies once for each engine version, Rust toolchain, target, and feature set. `bornengine cache warm` does that step ahead of time, and later builds reuse the result.

### The game does not start

A game can fail before it draws anything. Check `isReady` and `error` on the `Game`, and log the error when the run ends:

```ts
import { Colors, Game } from '@bornengine/engine';

class DiagnosticGame extends Game {
  protected override render(): void {
    this.renderer.clear(Colors.DARKBLUE);
  }

  protected override onStop(): void {
    if (this.error !== null) console.error(`The game stopped with an error: ${this.error}`);
  }
}

const game = new DiagnosticGame({ window: { title: 'Diagnostics', width: 640, height: 360 } });
if (!game.isReady) console.error(game.error ?? 'BornEngine could not start.');
game.run();
```

If your code throws in `onStart()`, `loop()`, or `render()`, the run stops, `run()` resolves, and `game.error` holds the message. These engine messages are common:

- `Only one BornEngine Game may be active at a time.` Another `Game` is still running. Stop or dispose it before you create the next one.
- `targetFps must be a positive finite number.` Fix the `targetFps` option.
- `Window width and height must be greater than zero.` Fix the `width` and `height` window options.

Failures in the native layer stop the process with a panic message instead:

- `Failed to open X11 display` (Linux). There is no display. Set `DISPLAY`, or run under a virtual display such as Xvfb.
- `No adapter found` (Linux and Windows), or `No GPU adapter found` (iOS, tvOS, visionOS, and Android). wgpu found no usable graphics driver. Install a Vulkan or OpenGL driver on Linux, and update your graphics driver on Windows.
- `Failed to create surface` (Linux and Windows). On Windows, check that `dxcompiler.dll` and `dxil.dll` sit next to the executable; see [Desktop](../platforms/desktop/).
- `Surface reports no supported formats (emulator Vulkan limitation)` (Android). The emulator's graphics driver is not usable. Use another emulator image or a real device.
- `[bloom-ios] Engine not initialized after 10s.` (iOS). The app was built without Perry's `ios-game-loop` feature. tvOS and visionOS use the same feature, so check it first if those apps show a black screen. On watchOS, check that you built with `watchos-swift-app`. See [Apple](../platforms/apple/).

When a texture, sound, or model does not load, the load call returns `null` or a resource whose `isLoaded` is `false` and whose `error` explains why. An `@Asset` field throws by default instead, which stops the run (see [Your first player](../getting-started/first-player/)). Check the path first. On desktop, relative paths resolve against the working directory. On Apple devices they resolve inside the app bundle, so the folder must be one that Perry copies into the app. On Web they are fetched from the page's folder. Also make sure the owner scope, `game.assets` or `scene.assets`, was not disposed or unloaded, and that you did not use a resource from another `Game`.

### The page does not start (Web)

- The page shows `Failed to start:` and a message. When the message mentions WebGPU, the browser has no WebGPU support or no usable adapter. Use a current Chrome, Edge, or Firefox, turn on hardware acceleration, and open `chrome://gpu` to see why the GPU is blocked. See [Web / WASM](../platforms/web-wasm/).
- A blank page or a failed request for `bloom_glue.js`. Serve the output folder over HTTP, for example with `python3 -m http.server`. Browsers do not allow the page to load its scripts and worker from a `file://` address.
- `ERROR: perry compiler not found. Install it or add to PATH.` Put Perry on your `PATH` before you run `native/web/build.sh`.
- `ERROR: game file not found: <path>`. Check the path you passed to the script.
- `ERROR: --output overlaps with game source inputs`, or `ERROR: --output must not overlap the native/web source tree`. Choose an output folder that is separate from your game's entry file and `assets` folder, and from the engine's `native/web` folder.
- 3D physics does nothing and the console shows `[bloom] Jolt init failed:`. The page could not load JoltPhysics.js from the CDN. Allow access to `cdn.jsdelivr.net`, or add a `jolt-physics.mjs` file next to the page.
- There is no sound until the player clicks or presses a key. Browsers hold audio back until then.

### Multiplayer and saves

- ``Colyseus support is not compiled into this build. Enable the `multiplayer` native feature (bornengine.native_features in perry.toml).`` Colyseus is the multiplayer library behind `ColyseusClient`. The client reports this message when the engine was built without the multiplayer feature. The CLI turns the feature on when your source imports the Colyseus client, unless `auto_native_features = false` is set. Add `"multiplayer"` to `native_features` to force it.
- `The Colyseus Native SDK is currently bundled for Linux x86_64 GNU only.` The text is out of date. The engine links the native library for more targets, but a target without one reports this message. The [Colyseus API](../api/colyseus/) page lists the targets.
- A connection works on your computer but fails on a phone. Check the network permission for the platform: `android.permission.INTERNET` on [Android](../platforms/mobile/), the sandbox network entitlement on macOS, and the local network description on iOS ([Apple](../platforms/apple/)).
- `GameDatabase` calls return `unsupported` on a native target. Add `"sqlite"` to `native_features` and rebuild. On Web the database needs no build option. See [Database and migrations](../api/storage/).
- `GameDatabase` returns `busy` on Web. Another tab has the same database open. Close it there first.
- `GameDatabase` returns `quota_exceeded` or `storage_error` on Web. The browser refused the write. Offer players `export()` for a backup, and do not rely on browser storage alone.

## Next steps

- [Diagnostics and cleanup](../cli/diagnostics/) documents `doctor`, `info`, `clean`, and `check`.
- [Perry](../cli/perry/) documents `bornengine perry install` and the other Perry commands.
- [Build and run](../cli/build/) documents every build option.
- [Platforms](../platforms/) lists what each target needs.
