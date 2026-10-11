---
title: Apple platforms
description: Build BornEngine games for macOS, iOS, tvOS, visionOS, and watchOS, and learn the signing, networking, and storage rules that apply to them.
section: Platforms
order: 52
---

Apple builds need a Mac with Xcode. The engine supplies a static library for each Apple target. Perry owns everything around it: the app shell, code signing, bundle metadata, and the platform entry point. This page covers what is specific to iOS, tvOS, visionOS, and watchOS, plus the networking and storage rules that apply to every Apple target. For macOS builds, start with the [Desktop](../desktop/) page.

| Target | `--os` value | Perry targets | Window and graphics | Input |
| --- | --- | --- | --- | --- |
| macOS | `macos` | The host's native target | AppKit window, Metal | Keyboard, mouse, controller |
| iOS | `ios` | `ios`, `ios-simulator` | UIKit view, Metal | Touch (10 points), controller |
| tvOS | `tvos` | `tvos`, `tvos-simulator` | UIKit view, Metal | Siri Remote, keyboard, controller |
| visionOS | `visionos` | `visionos`, `visionos-simulator` | UIKit window, Metal | Touch, key presses, controller |
| watchOS | `watchos` | `watchos`, `watchos-simulator` | SwiftUI Canvas and SceneKit | Digital Crown, taps |

The Rust targets for these builds are `aarch64-apple-ios`, `aarch64-apple-ios-sim`, `aarch64-apple-tvos`, `aarch64-apple-tvos-sim`, `aarch64-apple-visionos`, `aarch64-apple-visionos-sim`, `aarch64-apple-watchos`, and `aarch64-apple-watchos-sim`. The iOS simulator on an Intel Mac uses `x86_64-apple-ios`. Perry's guides give the exact `rustup` commands for each platform, and the watchOS device targets need a nightly toolchain, as described below.

## Before you build

You need a Mac with the full Xcode app installed. The command line tools alone do not include the iOS, tvOS, visionOS, and watchOS SDKs or their simulators. Run `bornengine doctor` to check Perry, Rust, and your package manager; it does not check Xcode or the Rust Apple targets.

There is one limit you need to know about. The BornEngine CLI passes only `--target` to Perry. It has no option for Perry's `--features` flag, and iOS and watchOS games need it. For those platforms you call `perry compile` yourself, as the commands below show. A direct Perry call also ignores the CLI's native profile, so Cargo builds the engine crate with its default features. For iOS, tvOS, and visionOS those include Jolt physics and MP3 decoding.

On the Perry build that BornEngine 0.18.2 pins, the CLI also cannot build tvOS or watchOS, because that Perry does not list those targets in `perry compile --help`. The [Platforms](../) page shows the error. Calling `perry compile` directly avoids the check.

None of the Apple commands on this page were run while writing it. They come from the engine's platform notes, Perry's documentation, and Perry's help output, so check each one against your Perry version.

## iOS

The iOS engine crate is a static library, not a complete Xcode app. There is no Xcode project to open: Perry builds the app bundle, the `Info.plist`, and the signing around the library.

```sh
rustup target add aarch64-apple-ios aarch64-apple-ios-sim
perry setup ios
perry setup ios --development
perry compile main.ts -o build/Game --target ios --features ios-game-loop
xcrun devicectl device install app --device <UDID> build/Game.app
xcrun devicectl device process launch --console --device <UDID> <bundle-id>
```

- `perry setup ios` stores your App Store Connect API key and team identifier once.
- `perry setup ios --development` registers the connected device and creates a development provisioning profile. Run it once for each device.
- For the simulator, use `--target ios-simulator` instead of `--target ios`.
- `--features ios-game-loop` is required. UIKit insists that `UIApplicationMain()` owns the main thread forever, while `Game.run()` is a blocking loop. The feature makes Perry run your game on a second thread and give the main thread to UIKit. Without it the app links, but no window appears, and the game stops after ten seconds with `[bloom-ios] Engine not initialized after 10s.` The same feature applies to tvOS and visionOS.

What to know about iOS:

- **Assets come from the app bundle.** Perry copies the `assets`, `logo`, `resources`, and `images` folders of your project into the `.app`. The engine resolves relative asset paths inside the bundle, not against the working directory. The bundle is read-only on a device, so `game.input.writeFile()` cannot save data there. Use `GameDatabase` for saves (see [GameDatabase files](#gamedatabase-files)).
- **Sizes are in pixels.** iOS reports touch positions in pixels, scaled up from points. The engine's iOS notes list the resulting difference from macOS, which reports points, as a known gap, so a layout built in points on a Mac does not carry over. Use a `Viewport2D` to work in a fixed logical size.
- **Touch and controllers.** See [Apple mobile input](../mobile/#apple-mobile-input).
- **Minimum version.** Perry's documentation gives 17.0 as the default iOS deployment target.
- **Not tested on a device.** The repository builds the iOS crate but never runs a game on an iPhone or iPad. The controller code carries a comment that it has not run on a device.

## tvOS and visionOS

Both crates use the same startup design as iOS: UIKit owns the main thread, and a build made with `--features ios-game-loop` runs the game on a second thread.

**tvOS** maps the Siri Remote and keyboards to keys. The remote's four directions become `Key.UP`, `Key.DOWN`, `Key.LEFT`, and `Key.RIGHT`. Select becomes both `Key.ENTER` and `Key.SPACE`. Menu and Play/Pause become `Key.ESCAPE`. Game controllers are read through the GameController framework. Build with `perry compile main.ts -o build/Game --target tvos --features ios-game-loop`, or `--target tvos-simulator` for the simulator.

**visionOS** shows a flat window. Perry's visionOS guide says the first version supports 2D windowed apps only, with no immersive spaces, volumes, or RealityKit scenes. The engine crate is a near copy of the tvOS crate. Two cautions apply:

- No prebuilt Jolt library exists for visionOS in `@bornengine/jolt-prebuilt`, so the `3d` profile would have to compile Jolt from source. Use the `2d` or `2.5d` profile. This was not tried.
- `tools/validate-ffi.js`, which compares each platform crate's function list with the manifest, does not include visionOS.

## Colyseus networking

Colyseus is the multiplayer library behind `ColyseusClient`. Apple's rules for network access differ by platform, and they decide whether a connection succeeds. The settings below belong to Apple and to Perry's bundler, not to BornEngine. Check the result in the `.app` you build: this page was written without building an Apple app.

**macOS with App Sandbox.** A sandboxed macOS app needs the `com.apple.security.network.client` entitlement, set to `true`, to open outgoing connections. Apps without App Sandbox do not need it. See Apple's [network client entitlement](https://developer.apple.com/documentation/BundleResources/Entitlements/com.apple.security.network.client).

```xml
<key>com.apple.security.network.client</key>
<true/>
```

Perry reads macOS entitlements from `perry.toml`:

```toml
[macos]
entitlements = ["com.apple.security.network.client"]
```

**Local network access.** On iOS, iPadOS, and visionOS, a connection to a server on the local network triggers the Local Network privacy prompt. The app's `Info.plist` must contain `NSLocalNetworkUsageDescription`, which is the text the prompt shows. macOS 15 also applies Local Network privacy to local-network connections. A server on the public Internet does not use this permission. tvOS and watchOS do not implement the Local Network prompt. Apple's [TN3179](https://developer.apple.com/documentation/technotes/tn3179-understanding-local-network-privacy) explains the rules.

```xml
<key>NSLocalNetworkUsageDescription</key>
<string>Connect to multiplayer game servers on your local network.</string>
```

Perry merges extra `Info.plist` entries from `perry.toml`. Its reference documents `[visionos.info_plist]` and `[watchos.info_plist]`, and its iOS bundler reads `[ios.info_plist]`:

```toml
[ios.info_plist]
NSLocalNetworkUsageDescription = "Connect to multiplayer game servers on your local network."
```

The engine links the Colyseus native library for these Rust targets: macOS (`aarch64` and `x86_64`), iOS (device, plus the `aarch64` and `x86_64` simulators), tvOS (device and simulator), visionOS (device and simulator), and watchOS (device and simulator). The [Colyseus API](../../api/colyseus/) page lists what the repository tests for each one.

## watchOS

watchOS does not let third-party apps use wgpu or a Metal surface directly. The engine therefore does not use its wgpu renderer there. Instead, the game's draw calls become a flat list of commands. A SwiftUI `Canvas` replays the 2D commands, and a SceneKit `SceneView` handles the 3D commands, so most game code runs unchanged. The watch crate has no wgpu and no Jolt physics.

Build for the simulator like this:

```sh
rustup target add aarch64-apple-watchos-sim
perry compile main.ts -o MyApp --target watchos-simulator --features watchos-swift-app
```

`--features watchos-swift-app` makes the engine's own SwiftUI app the entry point of the process. Device builds use Rust targets that ship without a prebuilt standard library, so they need a nightly toolchain with `rust-src` and `-Z build-std`. Follow Perry's watchOS guide for the exact steps and for the `arm64_32` build that older watches need. The engine's notes set the minimum version at watchOS 10.0 and name an Apple Watch Series 10 simulator running watchOS 26.4 as the validated setup.

Watch input has no keyboard or mouse. The Digital Crown and taps are available:

```ts
import { Colors, Game } from '@bornengine/engine';

class WatchGame extends Game {
  private x = 40;
  private touching = false;

  protected override onStart(): void {
    if (!this.gui.isAvailable()) console.log('Retained GUI controls are not available on this target.');
  }

  protected override loop(): void {
    this.x += this.input.getCrownRotation() * 30;
    this.touching = this.input.getTouchCount() > 0;
  }

  protected override render(): void {
    this.renderer.clear(this.touching ? Colors.ORANGE : Colors.DARKBLUE);
    this.renderer.drawRectangle({ x: this.x, y: 80, width: 16, height: 16 }, Colors.WHITE);
  }
}

new WatchGame().run();
```

`getCrownRotation()` returns how far the Digital Crown turned since the last call, in radians, and reading it resets the count. It returns 0 on targets without a crown. `getTouchCount()` counts the fingers on the screen. Use `game.input.isWatch()` to branch on the watch. The watch also supports `renderer.begin2D()` cameras, 3D drawing through SceneKit, and `.glb` models.

### Retained GUI controls

Note that retained `game.gui` controls do not work on watchOS in the current release: controls do not render and GUI input/events are unavailable. This limitation is temporary. A future SwiftUI adapter is planned, with no delivery date promised. `game.gui.isAvailable()` returns `false` on watchOS. See the [GUI API](../../api/gui/) for how the controls behave on the other targets.

### Other watch limits

- There is no Metal post-processing, and 3D scenes have no wgpu effects such as global illumination.
- Design for small faces and little memory.
- The simulator is arm64 and cannot run an `arm64_32` build. That build runs only on a real watch.
- Complications, widgets, and background refresh are out of scope.
- Clipboard, file dialogs, physical gamepads, and the window controls do nothing.
- Scripting is not available. Check `game.scripting.isSupported` first.
- `GameDatabase` works only when you enable the `sqlite` feature.

## GameDatabase files

On every Apple target, `GameDatabase` stores persistent databases at:

```text
$HOME/Library/Application Support/<appId>/<name>.sqlite3
```

On iOS, tvOS, visionOS, watchOS, and sandboxed macOS apps, Apple sets `HOME` to the app's private container, so the files are private to your app. A macOS app without App Sandbox uses the real home folder of the user. The engine creates the `<appId>` folder with owner-only permissions. Native targets need the `sqlite` feature, which you add to `native_features` in `perry.toml`; see [Database and migrations](../../api/storage/).

The database is not encrypted. Do not store passwords or tokens in it. Use the Keychain for secrets. `export()` returns the database as bytes when your game needs its own backup or save-export flow. Whether the system backs up the folder follows Apple's rules for the app container.

The path comes from the `HOME` environment variable, and it was not checked on a device. A Linux CI run is not a substitute for testing the packaged app on the Apple platform you ship to.

## Next steps

- [Mobile](../mobile/) covers touch input and the on-screen controls that iOS and Android share.
- [Desktop](../desktop/) covers macOS builds.
- [Colyseus API](../../api/colyseus/) lists the tested platforms for multiplayer.
- [Retained GUI](../../api/gui/) explains the controls that the watch cannot show yet.
- [Troubleshooting](../../troubleshooting/) lists errors such as the iOS startup message.
