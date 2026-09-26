---
title: Core
description: Own the window, frame lifecycle, renderer, and platform services through Game.
section: API / Core
order: 32
---

Create a Game as the root of one runtime. It constructs the window and exposes each service as an instance, rather than relying on process-wide operation functions.

## Frame lifecycle

```ts
import { Colors, Game } from '@bornengine/engine/core';

const game = new Game({
  window: { title: 'Manual control', width: 1280, height: 720 },
  targetFps: 60,
});
let playerX = 80;

game.run({
  update(deltaTime) { playerX += 120 * deltaTime; },
  render() {
    game.renderer.clear({ r: 12, g: 16, b: 20, a: 255 });
    game.renderer.drawRectangle({ x: playerX, y: 320, width: 48, height: 48 }, Colors.LIME);
  },
  onStop: () => game.dispose(),
});
```

Game owns begin/end frame calls and invokes update before render. Native uses the engine loop; Web/WASM uses the browser scheduler. The delta is elapsed seconds, not a fixed frame interval.

## Input

Read devices through `game.input`, or create a named action map through `game.input.createActionMap()`. Input state is polled once before the update callback on each Game frame.

```ts
import { Game, Key } from '@bornengine/engine';

const game = new Game();
const controls = game.input.createActionMap();
controls.bindAction('jump', { kind: 'key', key: Key.SPACE });

game.run({
  update() {
    if (controls.wasPressed('jump')) console.log('jump');
  },
  render() {},
  onStop: () => game.dispose(),
});
```

## Cameras and coordinates

Pass plain camera records to `game.renderer.begin2D(camera)` or `begin3D(camera)` and close the pass with its matching end method. The renderer rejects overlapping or unbalanced passes. `game.input.screenToWorld(position, camera)` and `worldToScreen` convert between screen and world coordinates.

```ts
import type { Camera2D } from '@bornengine/engine';

const camera: Camera2D = {
  offset: { x: 0, y: 0 }, target: { x: 0, y: 0 }, rotation: 0, zoom: 1,
};
const worldPoint = game.input.screenToWorld({ x: 400, y: 300 }, camera);
```

## Files and profiling

Platform helpers live on their owner. Use `game.input.fileExists(path)`, `readFile(path)`, `writeFile(path, data)`, clipboard and dialog methods for host-facing IO. Renderer profiling is available through `setProfilerEnabled`, `getProfilerCpuTimeUs`, `getProfilerGpuTimeUs`, and frame-history queries. Methods return a failure value when the Game is not ready.
