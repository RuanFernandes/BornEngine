---
title: Mobile
description: Build for Android and iPhone, read touch input, add on-screen controls, and set up the permissions and save locations that phones require.
section: Platforms
order: 53
---

Mobile here means Android phones and tablets, and iPhones and iPads. The BornEngine CLI can build for these targets, but it cannot start the result: `bornengine run` launches games only on your own computer. Install and start a mobile build with the platform's own tools.

```sh
bornengine build main.ts --os android
bornengine build main.ts --target android-x86_64
```

For iOS, call Perry directly; the [Apple](../apple/) page explains why and shows the commands. For iPad and iPhone, the build is the same iOS target.

## Android

Perry's Android guide lists the Android SDK, the Android NDK, and the Rust targets `aarch64-linux-android` and `armv7-linux-androideabi`. A local run also needs Gradle and Java. Perry's `android` target builds for ARM64 devices, and `android-x86_64` builds for x86_64 emulators and devices. Perry's guide is the place to check the exact setup for your version.

What the engine does on Android:

- **Window and graphics.** The engine draws into an `ANativeWindow` that the Android app provides. It uses wgpu, its graphics library, with Vulkan or OpenGL ES.
- **Audio.** Audio goes through Oboe, which uses AAudio or OpenSL ES.
- **Touch.** The Android app forwards touch events to the engine. The engine keeps ten touch slots, and touch events also move the mouse position and press mouse button 0.
- **Files.** Relative asset paths resolve inside the directory the Android app gives the engine at startup, which is also where `GameDatabase` stores its files.
- **Controls that do nothing.** Window title, window icon, fullscreen, clipboard, and file dialogs do nothing. No physical gamepad is reported.

There are two limits to know about before you plan an Android release:

- **The Android host app is not in this repository.** The engine crate expects an Android app to create the window, pass in the asset directory, and forward touch and text events. Neither the BornEngine repository nor the Perry source checked for this documentation contains that host code. A full Android build was not verified, and the repository's checks only build the Rust library and run a networking test on an x86_64 emulator. Perry's Android UI also has a `BloomView` widget that hands the engine a surface to draw into, and the `perry-embed` example in the engine repository describes that route, but it was not verified on a device either. Treat Android as unverified from end to end, and test on a real device early.
- **The screen size is half the pixel size.** When the engine creates its own window on Android, it reports half of the surface's pixel width and height as the screen size, and halves touch positions to match. A 2340 by 1080 surface reports 1170 by 540. `game.input.getScreenWidth()` and `getScreenHeight()` return the halved values, so use a `Viewport2D` rather than hard-coded pixel sizes. When a host attaches its own surface in embedded mode, the engine uses the size the host passes in.

An emulator whose Vulkan driver reports no surface formats stops the game with `Surface reports no supported formats (emulator Vulkan limitation)`. Use an emulator image with working graphics, or a real device.

### Colyseus networking

Colyseus is the multiplayer library behind `ColyseusClient`. A game that opens network sockets needs the `android.permission.INTERNET` permission in the final app manifest. It is a normal permission: Android grants it when the app is installed and shows no prompt. `ACCESS_NETWORK_STATE` is needed only if your own code reads connectivity status; Colyseus does not need it. See Android's [network connection requirements](https://developer.android.com/develop/connectivity/network-ops/connecting).

```xml
<uses-permission android:name="android.permission.INTERNET" />
```

BornEngine does not add this line for you, and the repository contains no Android manifest. Open the manifest of the project Perry generates and add the line if it is missing. Perry's `perry.toml` also has an `[android]` table with a `permissions` list. In the Perry source checked for this page, only `perry publish` passes that list on, so confirm the permission in the manifest of your own build.

The engine links the Colyseus native library for `aarch64-linux-android` and `x86_64-linux-android` only. A 32-bit ARM build has no Colyseus library. See the [Colyseus API](../../api/colyseus/) page for what the repository tests.

## Apple mobile input

An iPhone or iPad has real multitouch, and the engine also treats the first finger as a mouse. The touch calls are the same on Android and the other touch targets. These rules describe iOS:

- The engine tracks up to ten fingers. Each finger holds a numbered slot while it is down, and a new finger takes the lowest free slot.
- The finger in slot 0 also sets the mouse position and presses mouse button 0. A game that reads mouse button 0 as "fire" will fire whenever that finger is down, so read the touch API directly if your game supports more than one finger.
- Slots become sparse when fingers lift out of order. If you hold two fingers and lift the first, the remaining finger stays in slot 1 while `getTouchCount()` reports 1. Looping from 0 to `getTouchCount()` then reads slot 0, a lifted finger that still holds its last position. Loop over `getMaxTouchPoints()` and skip slots where `isTouchActive()` is false.
- Touch positions are in pixels, the same unit as `getScreenWidth()` and `getScreenHeight()`.
- iOS also reads the first connected game controller (MFi, Xbox, or PlayStation) through the GameController framework. The controller code carries a comment that it has not run on an iOS device.

```ts
import { Colors, Game } from '@bornengine/engine';

class TouchGame extends Game {
  private readonly fingers: { x: number; y: number }[] = [];

  protected override loop(): void {
    this.fingers.length = 0;
    const slots = this.input.getMaxTouchPoints();
    for (let slot = 0; slot < slots; slot++) {
      if (!this.input.isTouchActive(slot)) continue;
      this.fingers.push(this.input.getTouchPosition(slot));
    }
  }

  protected override render(): void {
    this.renderer.clear(Colors.DARKBLUE);
    for (const finger of this.fingers) {
      this.renderer.drawCircle(finger, 32, Colors.ORANGE);
    }
    this.renderer.drawText(`${this.fingers.length} fingers`, { x: 16, y: 16 }, 20, Colors.WHITE);
  }
}

new TouchGame().run();
```

Every frame, `loop()` collects the position of each finger that is down, and `render()` draws a circle under each one. The loop covers all ten slots, so it keeps working when the slots are sparse.

## On-screen controls

`game.mobile` creates virtual joysticks and buttons. They read the touch API and then inject a gamepad axis or a key press into the same input system your game already reads, so one code path serves touch, keyboard, and controller:

```ts
import { Colors, Game, Key } from '@bornengine/engine';

class MobileGame extends Game {
  private x = 100;
  private y = 100;
  private firing = false;

  protected override onStart(): void {
    this.mobile.createJoystick({ zone: 'left', radius: 64, deadzone: 0.16 });
    const width = this.input.getScreenWidth();
    const height = this.input.getScreenHeight();
    this.mobile.createButton(width - 80, height - 80, { radius: 40, label: 'Fire', key: Key.SPACE });
  }

  protected override loop(deltaTime: number): void {
    const move = this.mobile.movementInput();
    this.x += move.x * 200 * deltaTime;
    this.y += move.y * 200 * deltaTime;
    this.firing = this.input.isKeyDown(Key.SPACE);
  }

  protected override render(): void {
    this.renderer.clear(Colors.DARKBLUE);
    this.renderer.drawCircle({ x: this.x, y: this.y }, 20, this.firing ? Colors.ORANGE : Colors.WHITE);
    this.mobile.draw();
  }
}

new MobileGame().run();
```

`movementInput()` combines WASD, the arrow keys, and the primary gamepad axes, so the same code moves the circle on a phone, a keyboard, and a controller. Place the buttons using the screen size, and draw the controls last so they appear on top. See the [mobile API](../../api/mobile/) for the full list of options.

The controls limit their scan to `getTouchCount()` slots, so they can miss a finger that sits in a higher slot than the number of fingers down. If the finger holding slot 0 lifts while another finger stays down, a joystick or button held by the remaining finger can release. Keep this in mind for games where players hold a stick and a button at the same time, and test it on a device.

## Save data on a phone

Use `GameDatabase` for saves and settings. On Android it writes under the directory the app gives the engine. On iOS it writes under the app container's `Library/Application Support`. `game.input.writeFile()` is a poor fit for saves on iOS, because relative paths resolve inside the read-only app bundle. See [Database and migrations](../../api/storage/) for the database API and the [Apple](../apple/#gamedatabase-files) page for the Apple path.

The database file is not encrypted. Keep passwords and tokens in the Android Keystore or the Apple Keychain.

## Next steps

- [Apple](../apple/) covers iOS builds, signing, and networking permissions.
- [Mobile API](../../api/mobile/) documents the on-screen controls.
- [Input API](../../api/input/) documents touch, mouse, and gamepad calls.
- [Colyseus API](../../api/colyseus/) lists the tested platforms for multiplayer.
- [Troubleshooting](../../troubleshooting/) explains the errors quoted above.
