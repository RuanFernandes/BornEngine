---
title: Architecture
description: See how the TypeScript API, Perry compiler, Rust platform crates, and wgpu or browser backends fit together.
section: Reference
order: 80
---

BornEngine separates game code from platform code without hiding the boundary:

```text
TypeScript API
  ├── core, assets, game, scene, input, math, shapes, textures, sprites, text, audio
  ├── physics, physics2d, tilemap, camera2d, world, world2d, vfx, storage
  ├── scripting, colyseus, mobile, ui, debug-ui, models
  │
Perry AOT compiler
  │
native/<platform> + native/shared
  ├── macos / ios / tvos / visionos / windows / linux / android / web / watchos
  │
wgpu + platform surface (or WebGPU, Web Audio, DOM events)
```

The `src/` tree is the public TypeScript surface. `native/shared/` holds cross-platform Rust implementation such as rendering, audio, text, model loading, scene, and physics helpers. Platform crates provide the FFI surface and window/input integration. The web target uses a second WASM module and a thin JavaScript glue layer; watchOS uses draw-list replay through SwiftUI Canvas and SceneKit instead of the wgpu renderer.

The public TypeScript API is class-first: `Game` owns services, manager scopes own assets, and resource and component instances express runtime identity and lifetime. Perry compiles that API ahead of time and calls a platform FFI. Across the FFI, small values and private native handles connect TypeScript objects to Rust registries; the low-level transport shape does not define the public game-code API. `native/shared/` contains cross-platform Rust systems, while each platform crate supplies its bindings and host integration. The [API shape page](../../concepts/api-shape/) explains the user-facing design.
