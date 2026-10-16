---
title: Platforms
description: Compare the targets BornEngine can build for, what the repository checks for each one, and the toolchain each one needs.
section: Platforms
order: 50
---

A BornEngine game is one TypeScript program. Perry, the compiler BornEngine uses, turns it into a native program or a WebAssembly module. For each target, a Rust platform crate (a small library in the engine's `native/` folder) provides the window, graphics, audio, and input. Your game code stays the same, but the toolchain you install, the way you run the game, and a few features change from target to target.

This page lists every target, says what the repository checks for it, and links to a page with the details.

## Targets

| Target | Support level | Toolchain needed |
| --- | --- | --- |
| [Linux](./desktop/) | Tested in CI | Linux host, Perry, Rust, `pkg-config`, and the X11, XI (the X11 input extension), and ALSA development packages |
| [macOS](./desktop/) | Built in CI | macOS host, Perry, Rust, Xcode command line tools |
| [Windows](./desktop/) | Built in CI | Windows host, Perry, Rust, a linker toolchain (Visual Studio C++ Build Tools, or LLVM with `lld-link`) |
| [iOS](./apple/) | Built in CI, limited | macOS host, Xcode, Rust iOS targets, and Perry run directly with `--features ios-game-loop` |
| [tvOS](./apple/) | Built in CI, limited | macOS host, Xcode, Rust tvOS targets |
| [visionOS](./apple/) | Built in CI, limited | macOS host, Xcode, Rust visionOS targets |
| [watchOS](./apple/) | Built in CI | macOS host, Xcode, nightly Rust with `-Z build-std`, and Perry run directly with `--features watchos-swift-app` |
| [Android](./mobile/) | Built in CI, limited | Android SDK and NDK, Rust Android targets, Perry |
| [Web](./web-wasm/) | Built in CI, no browser run | Clone of the engine repository, `wasm-pack`, Rust `wasm32-unknown-unknown`, Node.js, Python 3, Perry, a browser with WebGPU |

Every target also needs a Rust toolchain, because the platform crate is compiled with Cargo, Rust's build tool, the first time you build for that target.

### Support levels

The level describes what the repository's automated checks cover. It does not promise that every feature works on every device.

- **Tested in CI**: the continuous integration (CI) workflow compiles a game with Perry for the target and runs it on a runner of that operating system. Only Linux has this level, and it runs under a virtual display with a software Vulkan driver.
- **Built in CI**: CI builds or type-checks the platform crate for the target. No game runs on the target. For Web, CI builds the engine package without a game and tests its networking bridge in Node.js, not in a browser.
- **Built in CI, limited**: a workflow that runs only when a limited set of files changes builds the platform crate with the `models3d` and `image-extras` features. The default feature set, which adds Jolt physics and MP3 decoding, is not built there. The same workflow runs a networking protocol test in a simulator or emulator, but no game.

No check opens a BornEngine game on a phone, a television, a headset, a watch, or in a browser. Test on your own hardware before you ship.

## Build for a target with the CLI

Without options, `bornengine build` builds for the machine you are on. Use `--os` to choose a target by operating system, or `--target` to pass an exact Perry target name. You cannot use both at once.

```sh
bornengine build main.ts
bornengine build main.ts --os windows
bornengine build main.ts --target ios-simulator
```

| `--os` value | Perry target | `bornengine run` |
| --- | --- | --- |
| `linux` | `linux` | Only on a Linux host |
| `windows` | `windows` | Only on a Windows host |
| `macos` (or `darwin`) | The native target of the host | Only on a macOS host |
| `android` | `android` | Not possible |
| `ios` | `ios` | Not possible |
| `tvos` | `tvos` | Not possible |
| `watchos` | `watchos` | Not possible |
| `visionos` | `visionos` | Not possible |
| `web` | `web` | Not possible |

`--target` also reaches names that `--os` has no value for, such as `ios-simulator`, `visionos-simulator`, `android-x86_64`, `windows-aarch64`, and `wasm`.

`bornengine run` and `bornengine dev` start the game on your machine, so they accept only a target that matches the host. Any other target stops with an error such as ``target `windows` cannot be run on the current `linux` host``. The `macos` value works only on a macOS host, because Perry uses its native host target there.

The CLI never guesses. Before it builds, it runs `perry compile --help`, reads the list on the `Target platform:` line, and refuses a target that is not on that list:

```text
Error: installed Perry does not advertise target `tvos`; supported targets: android, android-widget, android-x86_64, ios, ios-simulator, ios-widget, ios-widget-simulator, linux, visionos, visionos-simulator, wasm, watchos-widget, watchos-widget-simulator, wearos-tile, web, windows, windows-aarch64, windows-x86_64
```

That message comes from the Perry build that BornEngine 0.18.2 pins (Perry 0.5.1659). Its list does not include `tvos`, `tvos-simulator`, `watchos`, or `watchos-simulator`, so the CLI cannot build those four targets with that Perry. Perry's own documentation lists them, so call `perry compile` yourself for those targets; the [Apple](./apple/) page shows how. See [Build and run](../cli/build/) for the full command reference.

To see the list your Perry accepts, run `perry compile --help`. If you installed Perry with `bornengine perry install`, run it through the path that `bornengine perry path` prints.

## Choose a native profile

For native targets, the CLI builds the engine's Rust crate with a set of Cargo features that matches the profile in your `perry.toml`. A Cargo feature is a switch that includes or leaves out a part of the engine:

```toml
[bornengine]
native_profile = "2d"
native_features = ["sqlite"]
```

| Profile | Cargo features | What it adds |
| --- | --- | --- |
| `2d` | `mp3` | MP3 decoding. Leaves out Jolt (the 3D physics library), 3D model loading, and extra image codecs. |
| `2.5d` | `mp3`, `models3d`, `image-extras` | glTF models and JPEG, BMP, TGA, and HDR images. |
| `3d` | `mp3`, `jolt`, `models3d`, `image-extras` | Jolt physics. |

`native_features` adds more features. The most common is `sqlite`, the native `GameDatabase` backend. The CLI also turns on `multiplayer` when your source imports the Colyseus client, and `dialogs` when it calls `openFileDialog` or `saveFileDialog`. Set `auto_native_features = false` under `[bornengine]` to stop that detection.

The profile applies to Linux, Windows, macOS, Android, iOS, tvOS, visionOS, and watchOS builds started by `bornengine build`, `run`, or `dev`. It does not apply to Web, and it does not apply when you call `perry compile` yourself. A direct Perry call builds the crate with the crate's default features, which include Jolt on every native target except watchOS.

## Differences between targets

The TypeScript API is the same everywhere. These behaviors are not:

- **Asset paths.** On Linux, macOS, and Windows, a relative path such as `assets/player.png` is resolved against the working directory of the process. `bornengine run` starts the game in the project folder. On iOS, tvOS, visionOS, and watchOS, relative paths are resolved inside the app bundle. On Android they are resolved inside the directory the host app gives the engine. On Web they are fetched from the server that delivers the page.
- **Window title, icon, and fullscreen.** `game.window.setTitle()`, `setIcon()`, and `toggleFullscreen()` work on Linux and macOS. On Windows they work except `setIcon()`, which does nothing. On iOS, tvOS, visionOS, watchOS, and Android they do nothing. On Web, `setTitle()` sets the page title, `toggleFullscreen()` asks the browser for fullscreen, and `setIcon()` does nothing.
- **Clipboard and file dialogs.** `game.input.setClipboardText()`, `getClipboardText()`, `openFileDialog()`, and `saveFileDialog()` work on Linux, macOS, and Windows. On every other target they do nothing and return an empty string.
- **Physical gamepads.** Linux, macOS, Windows, iOS, tvOS, and visionOS can report a connected controller. No code in the repository reports one on Android, watchOS, or Web, so `game.input.isGamepadAvailable()` stays `false` there.
- **Debug UI.** The Dear ImGui inspector exists only in Linux, macOS, and Windows builds that enable the `debug-ui` feature.
- **3D physics.** Jolt is built when the platform crate has the `jolt` feature, which the `3d` profile enables. Web loads JoltPhysics.js instead. watchOS has no 3D physics.
- **MP3.** Web cannot decode MP3 files. Use WAV or OGG for sounds that must play in a browser.
- **Embedded host surface.** `game.window.attachNativeSurface()` is implemented on Windows, macOS, iOS, tvOS, visionOS, and Android. It does not attach on Linux, Web, or watchOS.
- **SQLite saves.** Native targets include `GameDatabase` storage only when the `sqlite` feature is on. Web always includes it.

## Detect the target in code

`game.input.getPlatform()` returns a number, and `Platform` names each value. `isMobile()` is true on iOS and Android, `isTV()` is true on tvOS, and `isWatch()` is true on watchOS.

```ts
import { Colors, Game, Platform } from '@bornengine/engine';

function platformName(platform: number): string {
  switch (platform) {
    case Platform.MACOS:
      return 'macOS';
    case Platform.IOS:
      return 'iOS';
    case Platform.WINDOWS:
      return 'Windows';
    case Platform.LINUX:
      return 'Linux';
    case Platform.ANDROID:
      return 'Android';
    case Platform.TVOS:
      return 'tvOS';
    case Platform.WEB:
      return 'Web';
    case Platform.WATCHOS:
      return 'watchOS';
    case Platform.VISIONOS:
      return 'visionOS';
    default:
      return 'an unknown platform';
  }
}

class PlatformGame extends Game {
  private label = 'an unknown platform';
  private mainInput = 'keyboard and mouse';

  constructor() {
    super({ window: { title: 'Platform check', width: 640, height: 360 } });
  }

  protected override onStart(): void {
    this.label = platformName(this.input.getPlatform());
    if (this.input.isMobile()) this.mainInput = 'touch';
  }

  protected override render(): void {
    this.renderer.clear(Colors.DARKBLUE);
    this.renderer.drawText(`Running on ${this.label}`, { x: 24, y: 24 }, 24, Colors.WHITE);
    this.renderer.drawText(`Main input: ${this.mainInput}`, { x: 24, y: 64 }, 20, Colors.SKYBLUE);
  }
}

new PlatformGame().run();
```

`getPlatform()` is available once the game is ready, so read it in `onStart()` or later. Branch on the platform only for behavior that truly differs, such as showing on-screen touch controls.

## Next steps

- [Desktop](./desktop/) covers Linux, macOS, and Windows.
- [Apple](./apple/) covers iOS, tvOS, visionOS, watchOS, and signing.
- [Mobile](./mobile/) covers Android and touch input.
- [Web / WASM](./web-wasm/) covers the browser build.
- [Troubleshooting](../troubleshooting/) lists the errors you are most likely to see.
- [Architecture](../reference/architecture/) explains how the layers fit together.
