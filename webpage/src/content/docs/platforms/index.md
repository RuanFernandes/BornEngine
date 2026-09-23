---
title: Platforms
description: Choose a native, Apple, mobile, or Web/WASM target and understand the toolchain it needs.
section: Platforms
order: 50
---

BornEngine shares a TypeScript API across target families, but the host toolchain and run model are not identical. Start with the target you can build locally, then move to cross-compilation once Perry and the platform SDK advertise the exact target.

- [Desktop](desktop/) — macOS, Windows, and Linux native builds.
- [Apple](apple/) — iOS, tvOS, watchOS, and the macOS/Xcode constraints around them.
- [Mobile](mobile/) — Android and Apple input/packaging considerations.
- [Web/WASM](web-wasm/) — the browser build script, loop, assets, and browser support.

The CLI accepts friendly `--os` names or exact `--target` values, but it never fabricates support that the installed Perry does not expose.
