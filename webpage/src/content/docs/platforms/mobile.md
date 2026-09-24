---
title: Mobile
description: Build for Android and Apple mobile targets while accounting for SDKs, touch, and bundle paths.
section: Platforms / Mobile
order: 53
---

Mobile outputs are build-only from the BornEngine CLI. Use `bornengine build` with the exact target your Perry installation advertises; do not expect `bornengine run` to launch a phone or browser build from a desktop host.

## Android

Install [Android Studio](https://developer.android.com/studio/install), the Android SDK, and the NDK version requested by the Perry target. Verify `adb --version`, install Perry's Android target, then inspect `perry compile --help` for the exact target name.

## Apple mobile input

iOS has real multitouch and also synthesizes touch 0 as mouse button 0. Multi-touch games should read the touch API directly instead of treating mouse button 0 as a fire action. Touch slots become sparse when fingers lift out of order, so scan active slots with `isTouchActive()` rather than iterating only up to `getTouchCount()`.

The `@bornengine/engine/mobile` module provides virtual joysticks and buttons. See [mobile input](../../api/mobile/) for the API and [Apple targets](../apple/) for packaging details.

The [2D game recipe](../../guides/2d-game/) gives you a small render/input loop to adapt to a mobile target; combine it with the [audio and UI recipe](../../guides/audio-and-ui/) for touch-friendly HUD feedback.
