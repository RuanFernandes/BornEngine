---
title: Architecture
description: See how the TypeScript API, Perry compiler, Rust platform crates, and wgpu or browser backends fit together.
section: Reference
order: 80
---

BornEngine separates game code from platform code without hiding the boundary:

```text
TypeScript API
  ├── core, shapes, textures, text, audio, models, math, scene, physics, world
  │
Perry AOT compiler
  │
native/<platform> + native/shared
  ├── macos / ios / tvos / windows / linux / android / web / watchos
  │
wgpu + platform surface (or WebGPU/WebGL, Web Audio, DOM events)
```

The `src/` tree is the public TypeScript surface. `native/shared/` holds cross-platform Rust implementation such as rendering, audio, text, model loading, scene, and physics helpers. Platform crates provide the FFI surface and window/input integration. The web target uses a second WASM module and a thin JavaScript glue layer; watchOS uses draw-list replay through SwiftUI Canvas and SceneKit instead of the wgpu renderer.

Handles cross the FFI as numbers and real state stays in native registries. That is why plain data and free functions are a natural API boundary. The [API shape page](../concepts/api-shape/) explains the user-facing tradeoff.
