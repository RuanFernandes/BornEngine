---
title: Textures
description: Load game-owned images, draw sprites, and render into textures.
section: API / Textures
order: 34
---

A Texture stores dimensions and loading state while keeping its native handle private. Construct it with the Game that will draw it, and dispose it when it leaves gameplay.

## Loading

```ts
import { Game, Texture } from '@bornengine/engine';
const game = new Game();
const player = new Texture(game, 'assets/player.png');
if (!player.isLoaded) console.error(player.error);
else console.log(player.width, player.height);
```

Texture loading can fail without throwing. Inspect `isLoaded` and `error` before using the resource. The Game also disposes resources that remain registered at shutdown.

## Sampling

Filtering and mipmap generation are resource methods. Draw with `texture.draw(position, tint?)` or `game.renderer.drawTexture(texture, position, tint?)`.

```ts
import { FILTER_NEAREST, Game, Texture } from '@bornengine/engine';
const game = new Game();
const atlas = new Texture(game, 'assets/characters.png');
if (atlas.isLoaded) {
  atlas.setFilter(FILTER_NEAREST);
  atlas.generateMipmaps();
  atlas.draw({ x: 320, y: 180 });
}
```

## Render textures

`RenderTexture(game, width, height)` owns an off-screen target. Pair `renderer.beginRenderTexture(target)` and `endRenderTexture(target)` within one render callback. A Texture may view a render texture as a draw source, but does not own that target's storage.

```ts
import { Game, RenderTexture } from '@bornengine/engine';
const target = new RenderTexture(game, 512, 512);
if (game.renderer.beginRenderTexture(target)) {
  game.renderer.clear({ r: 0, g: 0, b: 0, a: 0 });
  game.renderer.endRenderTexture(target);
}
```
