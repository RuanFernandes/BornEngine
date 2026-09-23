---
title: Core
description: Windows, game loops, input, timing, colors, platform detection, and file helpers.
section: API / Core
order: 31
---

Import from `@bornengine/engine/core` or the package root. Core owns the window and frame boundary:

```ts
import {
  initWindow, windowShouldClose, beginDrawing, endDrawing,
  clearBackground, getDeltaTime, getTime, Colors,
} from '@bornengine/engine/core';
```

The most common sequence is `initWindow()`, then `beginDrawing()`, game code, and `endDrawing()` inside a loop. `runGame()` is the callback-driven alternative for Web/WASM.

## Useful surfaces

- Window: `initWindow`, `closeWindow`, `resize`, `toggleFullscreen`, `setWindowTitle`.
- Frame: `beginDrawing`, `endDrawing`, `setTargetFPS`, `getDeltaTime`, `getFPS`, `getTime`.
- Input: `Key`, `MouseButton`, key/mouse/touch/gamepad queries, and `getPlatform()`.
- Files: `writeFile`, `readFile`, and `fileExists` for platform-aware game data.
- Rendering controls: `setRenderScale`, `setOutputScale`, post-processing and profiler helpers.

Colors are RGBA values with channels in the 0–255 range. The `Colors` presets provide names such as `SNOW`, `DARKGRAY`, `SKYBLUE`, and `WHITE`.

On Apple and Web targets, read the platform guide before assuming desktop input or filesystem behavior.
