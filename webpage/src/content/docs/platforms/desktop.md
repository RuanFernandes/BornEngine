---
title: Desktop
description: Build and run BornEngine games on Linux, macOS, and Windows, and learn the system packages, window behavior, and file locations of each one.
section: Platforms
order: 51
---

Desktop is the easiest target family to work with. `bornengine run` builds your game and starts it in one step, which none of the other targets allow. This page covers Linux, macOS, and Windows: what each one needs, what the engine uses on each one, and what to know before you ship a build.

## Build and run

```sh
bornengine run main.ts
bornengine run main.ts --release
bornengine build main.ts
bornengine dev main.ts --watch
```

- `run` builds a fast development version and starts it. Development builds turn on asset hot reload, which reloads textures, sounds, and music when their files change. Set the environment variable `BLOOM_NO_HOT_RELOAD=1` to switch the file watcher off.
- `run --release` builds the optimized version and starts it.
- `build` always produces the optimized version and does not start it. The result is one executable in `.bornengine/builds/<target>/<name>/<build id>/`, next to a copy of the asset folders your project has (`assets/`, `public/`, or `static/`) and a manifest file.
- `dev --watch` restarts the game when a source or asset file changes.

The first build for an engine version, Rust toolchain, target, and feature set compiles the engine's Rust dependencies, so it takes much longer than later builds. The CLI keeps the results in a shared cache; `bornengine cache path` prints where.

Build on the operating system you are targeting. The CLI will pass another desktop target to Perry, but the repository's checks do not cover cross-compiling.

## What each desktop target uses

The engine draws through wgpu, a Rust graphics library that talks to Vulkan, OpenGL, Direct3D, or Metal. Everything else in the table is specific to one operating system.

| | Linux | macOS | Windows |
| --- | --- | --- | --- |
| Window system | X11, through Xlib | AppKit | Win32 |
| Graphics (through wgpu) | Vulkan or OpenGL | Metal | Direct3D 12 or Vulkan |
| Audio | ALSA | Core Audio | WASAPI |
| Physical gamepad | The first joystick device, `/dev/input/js0` | The first controller known to the GameController framework | The first controller known to Microsoft's XInput API |
| Perry download from `bornengine perry install` | `linux-x86_64` only | `macos-aarch64` and `macos-x86_64` | `windows-x86_64` |
| Persistent `GameDatabase` files | `$XDG_DATA_HOME/<appId>`, or `~/.local/share/<appId>` | `~/Library/Application Support/<appId>` | `%LOCALAPPDATA%\<appId>`, or `%APPDATA%\<appId>` |

Database files are named `<name>.sqlite3` inside the folder shown. The native database needs the `sqlite` feature; see [Database and migrations](../../api/storage/).

## Linux

Install the build dependencies first. On Debian and Ubuntu:

```sh
sudo apt install pkg-config libx11-dev libxi-dev libasound2-dev
```

On Fedora:

```sh
sudo dnf install pkgconf-pkg-config libX11-devel libXi-devel alsa-lib-devel
```

These are the packages `bornengine doctor` checks for. Other distributions use other package names for the same three libraries (`x11`, `xi`, and `alsa`, as `pkg-config` knows them).

What to know about the Linux backend:

- **Window system.** The engine creates an X11 window. The repository does not test other window systems, such as a Wayland session without X11 support.
- **Graphics.** wgpu chooses Vulkan or OpenGL, so you need a working driver for one of them. If it finds none, the game stops with `No adapter found`.
- **No display.** A game started without a display, for example over SSH, stops with `Failed to open X11 display`. To run a game on a machine without a screen, start it under a virtual X server such as Xvfb with a software Vulkan driver such as Mesa's lavapipe. The repository's CI does this and sets `BLOOM_HEADLESS=1`, which creates the window but never shows it.
- **Gamepads.** The engine reads the first joystick device, `/dev/input/js0`. It tries to open the device on every frame until it succeeds, so a controller plugged in later is picked up.
- **Scripting.** Linux is the only native target that compiles the QuickJS script sandbox. Add `native_features = ["scripting"]` under `[bornengine]` in `perry.toml` to enable it.
- **ARM64 hosts.** `bornengine perry install` has no Perry archive for `linux-aarch64` and stops with `no Perry archive is published for linux-aarch64`. Build Perry yourself and point the CLI at it with the `BORNENGINE_PERRY` environment variable.

## macOS and Windows

### macOS

macOS builds need a macOS host. Running `bornengine build main.ts --os macos` anywhere else stops with `macOS builds require a macOS host because Perry uses the native host target`. Perry's macOS guide lists macOS 13 or later and the Xcode command line tools (`xcode-select --install`).

The engine draws into an AppKit window through Metal, plays audio through Core Audio, and reads controllers through the GameController framework. Fullscreen uses the system's native fullscreen mode.

A macOS build is a single executable file. Signing, notarization, and App Sandbox settings are covered on the [Apple](../apple/) page, including the entitlement that multiplayer games need.

### Windows

Perry needs a linker toolchain on Windows. Its guide describes two options: install LLVM and run `perry setup windows` to download the Microsoft libraries, or install the Visual Studio C++ Build Tools. `perry doctor` shows which one Perry uses.

On a 64-bit Windows host, the CLI sets `PERRY_LLD_LINK` and `CARGO_TARGET_X86_64_PC_WINDOWS_MSVC_LINKER` for the programs it starts. It uses a value you already set for either variable, and otherwise `lld-link.exe` when that program is on your `PATH`. Only x64 is covered: the Perry download is `windows-x86_64`, and the prebuilt Jolt libraries are `win32-x64`.

The Windows build is an `.exe` file. Other points to know:

- **Shader compiler files.** The Windows backend asks wgpu to compile shaders with Microsoft's DirectX Shader Compiler, loaded by name from `dxcompiler.dll` and `dxil.dll`. Both files ship with the Windows SDK. The engine repository has a script, `tools/fetch-dxc.ps1`, that copies them next to a game executable. The script's notes say a game without these files can crash at startup with `Failed to create surface`, while a comment in the Windows crate says wgpu falls back to its older compiler. The two notes disagree and no Windows build was run for this page, so ship both files next to your executable.
- **Window icon.** `game.window.setIcon()` does nothing on Windows.
- **Rumble.** `game.input.rumbleGamepad()` drives the controller's motors through XInput.
- **Dialogs and clipboard.** They use the standard Windows file dialogs and clipboard.

## Desktop-only features

The clipboard, native file dialogs, window icon, and fullscreen toggle work on desktop and do nothing on most other targets. This game uses several of them:

```ts
import { Colors, Game, Key } from '@bornengine/engine';

class DesktopGame extends Game {
  private message = 'F11: fullscreen. O: open a file. C: copy this text.';

  constructor() {
    super({ window: { title: 'Desktop features', width: 800, height: 450 } });
  }

  protected override loop(): void {
    if (this.input.isKeyPressed(Key.F11)) this.window.toggleFullscreen();

    if (this.input.isKeyPressed(Key.O)) {
      const path = this.input.openFileDialog('', 'Choose a file');
      this.message = path === '' ? 'No file chosen.' : `Chosen: ${path}`;
    }

    if (this.input.isKeyPressed(Key.C)) this.input.setClipboardText(this.message);

    if (this.input.isGamepadAvailable() && this.input.isGamepadButtonPressed(0)) {
      this.message = 'Gamepad button 0 pressed.';
    }
  }

  protected override render(): void {
    this.renderer.clear(Colors.DARKBLUE);
    this.renderer.drawText(this.message, { x: 24, y: 24 }, 20, Colors.WHITE);
  }
}

new DesktopGame().run();
```

`toggleFullscreen()` switches between windowed and fullscreen mode. `openFileDialog(filter, title)` opens the system file picker and returns the chosen path, or an empty string if the player cancels. `setClipboardText()` copies text to the system clipboard. `isGamepadAvailable()` reports whether a controller was found.

Two details differ between systems:

- **File dialog filters.** Pass an empty filter if you want the dialog to behave the same everywhere. Windows expects a pattern such as `*.png`, while Linux and macOS expect an extension such as `png`. On Linux and macOS the dialogs also need the `dialogs` feature. The CLI turns it on when your source calls `openFileDialog` or `saveFileDialog`. Without it, the call logs a warning once and returns an empty string.
- **Gamepad numbers.** On Windows and macOS, buttons 0 to 3 are A, B, X, and Y, buttons 4 and 5 are the shoulder buttons, axes 0 and 1 are the left stick, axes 2 and 3 are the right stick, and axes 4 and 5 are the triggers. The D-pad is buttons 10 to 13 on Windows and 12 to 15 on macOS. On Linux the numbers come straight from the kernel's joystick interface and depend on the controller.

## Ship a desktop build

- **Keep assets next to the executable.** Desktop builds resolve relative asset paths against the working directory of the process, not against the folder that holds the executable. Start the game with its build folder as the working directory. `bornengine run` starts the game in the project folder instead, which has the same `assets/` folder.
- **Do not store saves in your asset folders.** Use `GameDatabase`, which writes to the per-user folders in the table above.
- **Check your target machines.** Players need a graphics driver for the backend in the table above. Linux builds are linked against X11, XI (the X11 input extension), and ALSA, so check that your target distributions provide them.

## Next steps

- [Platforms](../) compares every target.
- [Apple](../apple/) covers macOS signing, entitlements, and the other Apple targets.
- [Build and run](../../cli/build/) documents every build option.
- [Database and migrations](../../api/storage/) explains how saves are stored.
- [Troubleshooting](../../troubleshooting/) explains the errors quoted above.
