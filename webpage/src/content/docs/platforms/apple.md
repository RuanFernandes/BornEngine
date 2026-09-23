---
title: Apple platforms
description: Prepare Xcode and Perry for iOS, tvOS, watchOS, and other Apple targets.
section: Platforms / Apple
order: 52
---

Apple builds require a macOS host and Xcode for the SDKs and simulators. The engine ships platform libraries; Perry owns the app shell, signing, bundle metadata, and platform entry point.

## iOS

The iOS engine crate is a static library, not a complete Xcode app. The Perry game loop feature is mandatory because UIKit owns the main thread:

```sh
rustup target add aarch64-apple-ios aarch64-apple-ios-sim
perry setup ios
perry setup ios --development
perry compile src/main.ts -o build/Game --target ios --features ios-game-loop
```

Read the [iOS target notes](https://github.com/RuanFernandes/BornEngine/blob/main/docs/ios-target.md) before signing a device build. Asset reads resolve from the app bundle, not the process working directory.

## watchOS

watchOS uses a draw-command bridge to SwiftUI Canvas and SceneKit rather than the desktop wgpu/Jolt stack. Compile with `--features watchos-swift-app` and use the Perry [watchOS platform guide](https://docs.perryts.com/) for the nightly/build-std setup. The watch target is constrained by screen size, RAM, and the absence of wgpu/Jolt.

The [mobile guide](../mobile/) covers touch and device input differences shared across Apple targets.
