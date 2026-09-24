---
title: Build a 2D game
description: Compose the core loop, keyboard input, sprites, collision helpers, and readable HUD text into a small 2D game.
section: Guides
order: 70
---

This recipe keeps the game deliberately small: a controllable sprite, one wall, a texture, and a HUD. It is a good first project after the [quickstart](../../getting-started/quickstart/) because every system remains visible in one source file.

## Setup

Create a project with the CLI, install the engine package, and keep runtime files below `assets/`:

```sh
bornengine new TinyArena --package-manager npm
cd TinyArena
npm install @bornengine/engine
mkdir -p assets/textures
bornengine run main.ts
```

Add a small PNG at `assets/textures/player.png`. Use relative paths from the project root so native bundles and Web/WASM packaging resolve the same asset.

```ts
import { initWindow, runGame } from '@bornengine/engine/core';
import { loadTexture } from '@bornengine/engine/textures';

initWindow(960, 540, 'Tiny Arena');
const playerTexture = loadTexture('assets/textures/player.png');

runGame(() => {
  console.log('texture handle', playerTexture.handle);
});
```

## Game loop

Use `getDeltaTime()` for movement, read held keys with `isKeyDown()`, and keep all drawing between `beginDrawing()` and `endDrawing()`. Rectangles are also the simplest collision representation for a first 2D game.

```ts
import {
  Key,
  beginDrawing,
  clearBackground,
  endDrawing,
  getDeltaTime,
  isKeyDown,
} from '@bornengine/engine/core';
import { checkCollisionRecs, drawRect } from '@bornengine/engine/shapes';
import { drawTexture } from '@bornengine/engine/textures';
import { drawText } from '@bornengine/engine/text';

let player = { x: 120, y: 220, width: 48, height: 48 };
const wall = { x: 420, y: 180, width: 40, height: 180 };

runGame(() => {
  const dt = getDeltaTime();
  const speed = 220 * dt;
  const next = { ...player };
  if (isKeyDown(Key.LEFT)) next.x -= speed;
  if (isKeyDown(Key.RIGHT)) next.x += speed;
  if (isKeyDown(Key.UP)) next.y -= speed;
  if (isKeyDown(Key.DOWN)) next.y += speed;
  if (!checkCollisionRecs(next, wall)) player = next;

  beginDrawing();
  clearBackground({ r: 14, g: 18, b: 24, a: 255 });
  drawTexture(playerTexture, player.x, player.y, { r: 255, g: 255, b: 255, a: 255 });
  drawRect(wall.x, wall.y, wall.width, wall.height, { r: 184, g: 242, b: 61, a: 255 });
  drawText('Arrow keys to move', 24, 24, 22, { r: 255, g: 255, b: 255, a: 255 });
  endDrawing();
});
```

`checkCollisionRecs()` is pure TypeScript, so it is useful for menus, hitboxes, and simple walls without creating a physics world. Use the physics API when you need continuous collision, forces, sensors, or constraints.

## Complete example

Put the following in `main.ts`. The explicit cleanup function is useful for native hosts and tests; a browser page can call it from its own lifecycle.

```ts
import {
  Key, beginDrawing, clearBackground, endDrawing,
  getDeltaTime, initWindow, isKeyDown, runGame,
} from '@bornengine/engine/core';
import { checkCollisionRecs, drawRect } from '@bornengine/engine/shapes';
import { drawText } from '@bornengine/engine/text';
import { drawTexture, loadTexture, unloadTexture } from '@bornengine/engine/textures';

initWindow(960, 540, 'Tiny Arena');
const playerTexture = loadTexture('assets/textures/player.png');
let player = { x: 120, y: 220, width: 48, height: 48 };
const wall = { x: 420, y: 180, width: 40, height: 180 };

runGame(() => {
  const dt = getDeltaTime();
  const next = { ...player };
  const speed = 220 * dt;
  if (isKeyDown(Key.LEFT)) next.x -= speed;
  if (isKeyDown(Key.RIGHT)) next.x += speed;
  if (isKeyDown(Key.UP)) next.y -= speed;
  if (isKeyDown(Key.DOWN)) next.y += speed;
  if (!checkCollisionRecs(next, wall)) player = next;

  beginDrawing();
  clearBackground({ r: 14, g: 18, b: 24, a: 255 });
  drawTexture(playerTexture, player.x, player.y, { r: 255, g: 255, b: 255, a: 255 });
  drawRect(wall.x, wall.y, wall.width, wall.height, { r: 184, g: 242, b: 61, a: 255 });
  drawText(`x ${Math.round(player.x)}  y ${Math.round(player.y)}`, 24, 24, 20, { r: 255, g: 255, b: 255, a: 255 });
  endDrawing();
});

export function shutdown() {
  unloadTexture(playerTexture);
}
```

## Next steps

- Replace the rectangle wall with a physics body from the [physics gameplay recipe](../physics-gameplay/).
- Load an atlas and use `drawTextureRec()` for animation frames.
- Add a title screen with `drawText()`, `measureText()`, and `checkCollisionPointRec()`.
- Move the complete project to Web/WASM after checking the [platform guide](../../platforms/web-wasm/).
