---
title: Game loop
description: Choose the explicit native loop or the callback-driven loop that also works in the browser.
section: Concepts
order: 10
---

BornEngine does not hide the frame boundary. The native loop is explicit, which makes input, simulation, and drawing order visible in the source.

```ts
import { initWindow, windowShouldClose, beginDrawing, endDrawing, clearBackground, Colors } from '@bornengine/engine';

initWindow(800, 450, 'My Game');

while (!windowShouldClose()) {
  beginDrawing();
  clearBackground(Colors.SNOW);
  // update game state and draw here
  endDrawing();
}
```

## The portable loop

Browsers cannot let a game block the main thread with a `while` loop. `runGame()` lets the platform drive frames:

```ts
import { initWindow, runGame, clearBackground, drawText, Colors } from '@bornengine/engine';

initWindow(800, 450, 'My Game');

runGame((dt) => {
  clearBackground(Colors.SNOW);
  drawText(`Frame: ${dt.toFixed(3)}s`, 24, 24, 20, Colors.DARKGRAY);
});
```

On native, `runGame()` enters the engine loop. On Web/WASM it delegates to the browser's animation frame scheduler. Use the callback's delta time for time-based movement; do not assume a fixed refresh rate.

## Frame order

For an explicit loop, initialize once, update state, issue draw calls between `beginDrawing()` and `endDrawing()`, and release resources when the game closes. The renderer and platform layer are native; the TypeScript side stays responsible for game state and orchestration.
