---
title: Core
description: Windows, game loops, input, timing, colors, platform detection, and file helpers.
section: API / Core
order: 32
---

Core owns the host surface and the boundary between one frame and the next. Import it directly or use the same exports from `@bornengine/engine`.

```ts
import {
  beginDrawing, clearBackground, endDrawing, getDeltaTime,
  initWindow, setTargetFPS, windowShouldClose,
} from '@bornengine/engine/core';
```

## Frame lifecycle

The manual loop gives you maximum control. `beginDrawing()` opens the frame, `getDeltaTime()` returns elapsed seconds, and `endDrawing()` submits the frame. Keep resource creation outside this loop whenever possible.

```ts
import {
  beginDrawing, clearBackground, closeWindow, endDrawing,
  getDeltaTime, initWindow, setTargetFPS, windowShouldClose,
} from '@bornengine/engine/core';
import { drawRect } from '@bornengine/engine/shapes';

initWindow(1280, 720, 'Manual loop');
setTargetFPS(displayRefreshRate());
let playerX = 80;

while (!windowShouldClose()) {
  const dt = getDeltaTime();
  playerX += 120 * dt;

  beginDrawing();
  clearBackground({ r: 12, g: 16, b: 20, a: 255 });
  drawRect(playerX, 320, 48, 48, { r: 184, g: 242, b: 61, a: 255 });
  endDrawing();
}

closeWindow();

function displayRefreshRate(): number {
  return 60;
}
```

`setTargetFPS()` is a native sleep-based cap. It is effective with a non-vsync present mode; with the default FIFO mode the swapchain already controls pacing. Treat `dt` as the source of gameplay motion instead of assuming every frame is exactly 1/60 second.

`runGame(update)` owns the loop for you. Native targets call the callback from a blocking loop; Web/WASM hands it to the browser's `requestAnimationFrame` integration. Use it when the host owns scheduling, especially on the web.

```ts
import { clearBackground, initWindow, runGame } from '@bornengine/engine/core';
import { drawText } from '@bornengine/engine/text';

initWindow(960, 540, 'Callback loop');
let elapsed = 0;

runGame((dt) => {
  elapsed += dt;
  clearBackground({ r: 8, g: 10, b: 14, a: 255 });
  drawText(`time ${elapsed.toFixed(2)}s`, 24, 24, 22, { r: 255, g: 255, b: 255, a: 255 });
});
```

Do not call `runGame()` after embedding BornEngine in a host-owned native view. In that mode the host drives `beginDrawing()` and `endDrawing()` itself.

## Input

Keyboard, mouse, gamepad, and touch queries are stateless reads of the current platform input snapshot. Use `isKeyPressed()` for a one-frame edge, `isKeyDown()` for held input, and `isKeyReleased()` for the release edge.

```ts
import {
  Key, getMousePosition, getMouseWheel, getTouchCount,
  getTouchPosition, isGamepadAvailable, isKeyDown, isKeyPressed,
} from '@bornengine/engine/core';

export function readInput() {
  const mouse = getMousePosition();
  const touch = getTouchCount() > 0 ? getTouchPosition(0) : null;
  return {
    moveX: Number(isKeyDown(Key.RIGHT)) - Number(isKeyDown(Key.LEFT)),
    jumpPressed: isKeyPressed(Key.SPACE),
    mouse,
    wheel: getMouseWheel(),
    touch,
    gamepad: isGamepadAvailable(),
  };
}
```

| Surface | Useful exports | Notes |
| --- | --- | --- |
| Keyboard | `Key`, `isKeyPressed`, `isKeyRepeated`, `isKeyDown`, `isKeyReleased` | `Key` contains portable numeric values such as `LEFT`, `RIGHT`, `SPACE`, and `ESCAPE`. |
| Mouse | `MouseButton`, `getMousePosition`, `isMouseButtonPressed`, `isMouseButtonDown`, `isMouseButtonReleased`, `getMouseDeltaX`, `getMouseDeltaY`, `getMouseWheel` | Coordinates are in the current screen space. |
| Touch | `getTouchCount`, `getTouchPosition`, `getTouchX`, `getTouchY`, `isTouchActive`, `getMaxTouchPoints` | Touch slots are sparse; scan the maximum slots and check `isTouchActive(slot)`. |
| Gamepad | `isGamepadAvailable`, `getGamepadAxisValue`, `getGamepadAxis`, `isGamepadButtonPressed`, `isGamepadButtonDown`, `isGamepadButtonReleased` | These wrappers currently read the primary controller. |
| Platform | `getPlatform`, `isMobile`, `isTV`, `isWatch`, `getLanguage`, `isAnyInputPressed` | Use platform checks to select an input or asset policy, not to fork all gameplay code. |

For named cross-device actions, stable per-frame snapshots, and combined digital/analog axes, see the [Input API](../input/).

## Cameras and coordinates

`Camera2D` is plain data. Its `rotation` is in degrees, `zoom` is a scale, and `offset` describes where the camera target appears on screen.

```ts
import {
  beginMode2D, endMode2D, getScreenToWorld2D,
} from '@bornengine/engine/core';
import { drawCircle } from '@bornengine/engine/shapes';

const camera = {
  offset: { x: 640, y: 360 },
  target: { x: 320, y: 180 },
  rotation: 0,
  zoom: 2,
};

beginMode2D(camera);
drawCircle(320, 180, 18, { r: 184, g: 242, b: 61, a: 255 });
endMode2D();

const worldPoint = getScreenToWorld2D({ x: 640, y: 360 }, camera);
```

For 3D, `Camera3D` accepts `position`, `target`, `up`, `fovy`, and a `projection` string (`'perspective'` or `'orthographic'`). `beginMode3D()` must be paired with `endMode3D()` before any 2D overlay is drawn.

| Helper | Use |
| --- | --- |
| `beginMode2D(camera)` / `endMode2D()` | Transform immediate 2D drawing through a camera. |
| `beginMode3D(camera)` / `endMode3D()` | Submit models, scene geometry, and 3D primitives through a camera. |
| `getScreenToWorld2D(position, camera)` | Convert pointer coordinates into world coordinates. |
| `getWorldToScreen2D(position, camera)` | Place a screen-space label over a world point. |
| `resize(physW, physH, logW, logH)` | Tell an embedded surface about physical and logical dimensions. |
| `getScreenWidth()` / `getScreenHeight()` | Read the logical render dimensions. |

## Files and profiling

File helpers return simple values and are intended for configuration, save data, and diagnostics. They do not replace the CLI's project packaging rules.

```ts
import { fileExists, readFile, writeFile } from '@bornengine/engine/core';

const savePath = 'saves/slot-1.json';
const state = { version: 1, score: 4200 };

if (fileExists(savePath)) {
  const previous = JSON.parse(readFile(savePath));
  console.log('loaded score', previous.score);
}

const saved = writeFile(savePath, JSON.stringify(state));
if (!saved) console.warn('save failed');
```

The profiler is opt-in and exposes frame totals plus structured overlay/history rows:

```ts
import {
  getProfilerFrameCpuUs, getProfilerFrameGpuUs,
  getProfilerFrameHistory, getProfilerOverlay,
  printProfilerSummary, setProfilerEnabled,
} from '@bornengine/engine/core';

setProfilerEnabled(true);
const cpuUs = getProfilerFrameCpuUs();
const gpuUs = getProfilerFrameGpuUs();
const rows = getProfilerOverlay();
const history = getProfilerFrameHistory();
if (cpuUs > 16_667 || gpuUs > 16_667) printProfilerSummary();
console.log({ rows, history });
```

| Function | Return | Typical use |
| --- | --- | --- |
| `writeFile(path, data)` | `boolean` | Persist text or JSON. |
| `readFile(path)` | `string` | Load text after checking `fileExists`. |
| `fileExists(path)` | `boolean` | Guard optional saves and assets. |
| `takeScreenshot(path)` | `void` | Capture the next frame at `endDrawing()`. |
| `getProfilerFrameCpuUs()` / `getProfilerFrameGpuUs()` | `number` | Read the current frame cost in microseconds. |
| `getProfilerOverlay()` | `{ label, cpuUs, gpuUs }[]` | Draw a compact runtime overlay. |
| `getProfilerFrameHistory()` | `{ cpuUs, gpuUs }[]` | Plot a rolling frame-time graph. |

Always close the window during native teardown. For Web/WASM, let the page lifecycle own the canvas and use `runGame()` rather than blocking on a manual loop.
