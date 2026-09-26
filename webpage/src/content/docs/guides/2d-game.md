---
title: Build a 2D game
description: Combine Game-owned input, sprites, collision values, and rendering in one small 2D game.
section: Guides
order: 70
---

This recipe builds a small arena with a controllable sprite and one wall. It uses a Game-owned Texture, action map, and Renderer so every stateful object has a clear owner.

## Setup

Create a project, install the engine package, and put the sprite at `assets/textures/player.png`:

```sh
bornengine new TinyArena --package-manager npm
cd TinyArena
npm install @bornengine/engine
mkdir -p assets/textures
bornengine run main.ts
```

Load long-lived assets once during startup, then check their loading state before use.

```ts
import { Collision, Colors, Game, Key, Texture } from '@bornengine/engine';

const game = new Game({ window: { title: 'Tiny Arena', width: 960, height: 540 } });
const playerTexture = new Texture(game, 'assets/textures/player.png');
const controls = game.input.createActionMap();
controls.bindAxis('move-x', {
  negative: [{ kind: 'key', key: Key.LEFT }, { kind: 'key', key: Key.A }],
  positive: [{ kind: 'key', key: Key.RIGHT }, { kind: 'key', key: Key.D }],
});
```

## Game loop

Game polls action maps once before calling update. Collision helpers operate on plain rectangles, and renderer calls submit visuals only inside the render callback.

```ts
let player = { x: 120, y: 220, width: 48, height: 48 };
const wall = { x: 420, y: 180, width: 40, height: 180 };

game.run({
  update(deltaTime) {
    const next = { ...player, x: player.x + controls.readAxis('move-x') * 220 * deltaTime };
    if (!Collision.checkRectangles(next, wall)) player = next;
  },
  render() {
    game.renderer.clear({ r: 14, g: 18, b: 24, a: 255 });
    if (playerTexture.isLoaded) playerTexture.draw({ x: player.x, y: player.y });
    game.renderer.drawRectangle(wall, { r: 184, g: 242, b: 61, a: 255 });
    game.renderer.drawText('Arrow keys to move', { x: 24, y: 24 }, 22, Colors.WHITE);
  },
  onStop: () => game.dispose(),
});
```

Clamp or resolve each movement axis separately when sliding along obstacles is preferable to stopping on every diagonal collision.

## Complete example

This assembled entry point includes initialization, failure checks, input, collision, drawing, and shutdown:

```ts
import { Collision, Colors, Game, Key, Texture } from '@bornengine/engine';

const game = new Game({ window: { title: 'Tiny Arena', width: 960, height: 540 } });
const playerTexture = new Texture(game, 'assets/textures/player.png');
const controls = game.input.createActionMap();
controls.bindAxis('move-x', {
  negative: [{ kind: 'key', key: Key.LEFT }, { kind: 'key', key: Key.A }],
  positive: [{ kind: 'key', key: Key.RIGHT }, { kind: 'key', key: Key.D }],
});
let player = { x: 120, y: 220, width: 48, height: 48 };
const wall = { x: 420, y: 180, width: 40, height: 180 };

if (!game.isReady) console.error(game.error || 'Game startup failed');

game.run({
  update(deltaTime) {
    const next = { ...player, x: player.x + controls.readAxis('move-x') * 220 * deltaTime };
    if (!Collision.checkRectangles(next, wall)) player = next;
  },
  render() {
    game.renderer.clear(Colors.BLACK);
    if (playerTexture.isLoaded) playerTexture.draw({ x: player.x, y: player.y });
    game.renderer.drawRectangle(wall, Colors.LIME);
    game.renderer.drawText('Tiny Arena', { x: 24, y: 24 }, 22, Colors.WHITE);
  },
  onStop: () => game.dispose(),
});
```

## Next steps

Add a `GameScene` when the arena needs lifecycle hooks or multiple gameplay objects. See the [Input API](../../api/input/) for rebinding and gamepad axes, and the [asset guide](../assets-and-worlds/) for model and world ownership.
