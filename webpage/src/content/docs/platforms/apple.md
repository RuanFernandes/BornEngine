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

## Colyseus networking

For a macOS game distributed with App Sandbox enabled, add the `com.apple.security.network.client` entitlement with value `true` to the app's entitlements so it can open outgoing connections. This is only required for sandboxed macOS apps; see Apple's [network client entitlement](https://developer.apple.com/documentation/BundleResources/Entitlements/com.apple.security.network.client).

```xml
<key>com.apple.security.network.client</key>
<true/>
```

On iOS, iPadOS, and visionOS, connections to a server on the local network require the Local Network privacy prompt and the app's `Info.plist` must include `NSLocalNetworkUsageDescription`. macOS 15 also applies Local Network privacy to local-network connections. A server on the public Internet does not use this local-network permission. tvOS and watchOS do not implement this Local Network prompt. See Apple's [TN3179](https://developer.apple.com/documentation/technotes/tn3179-understanding-local-network-privacy).

```xml
<key>NSLocalNetworkUsageDescription</key>
<string>Connect to multiplayer game servers on your local network.</string>
```

## watchOS

watchOS uses a draw-command bridge to SwiftUI Canvas and SceneKit rather than the desktop wgpu/Jolt stack. Compile with `--features watchos-swift-app` and use the Perry [watchOS platform guide](https://docs.perryts.com/) for the nightly/build-std setup. The watch target is constrained by screen size, RAM, and the absence of wgpu/Jolt.

The [mobile guide](../mobile/) covers touch and device input differences shared across Apple targets.
