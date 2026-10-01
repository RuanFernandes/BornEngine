---
title: Textures
description: Load images and offscreen targets through the owning asset scope.
section: API / Textures
order: 34
---

Textures are created by an asset scope. The scope tracks the native resource and releases it with the owning Game or Scene, so application code does not pass a Game into a Texture constructor.

## Loading

```ts
import { FILTER_NEAREST, Game, Texture } from '@bornengine/engine';

class SpriteGame extends Game {
  private player: Texture | null = null;

  protected override onStart(): void {
    this.player = this.assets.loadTexture('assets/player.png');
    if (this.player === null || !this.player.isLoaded) {
      console.error(this.player?.error || 'Unable to load player texture.');
      return;
    }
    this.player.setFilter(FILTER_NEAREST);
  }

  protected override render(): void {
    if (this.player !== null && this.player.isLoaded) {
      this.player.draw({ x: 190, y: 200 });
    }
  }
}
```

`game.assets.loadTexture(path)` caches shared textures for the Game. `scene.assets.loadTexture(path)` creates a cache scoped to one Scene and disposes it when that Scene unloads. Both expose load status and an error message when the file cannot be read. See the [Assets API](../assets/) for release and cache operations.

## Sampling

Filtering, mipmaps, and drawing are methods on the Texture resource. You can draw with `texture.draw(position, tint?)` or `game.renderer.drawTexture(texture, position, tint?)`.

```ts
const atlas = game.assets.loadTexture('assets/characters.png');
if (atlas !== null && atlas.isLoaded) {
  atlas.setFilter(FILTER_NEAREST);
  atlas.generateMipmaps();
  atlas.draw({ x: 320, y: 180 });
}
```

## Render textures

Create offscreen targets through `assets.createRenderTexture(width, height)`. The same asset scope owns the returned target; `target.texture` provides a Texture view without transferring ownership.

```ts
const target = game.assets.createRenderTexture(512, 512);
if (target !== null && game.renderer.beginRenderTexture(target)) {
  game.renderer.clear({ r: 0, g: 0, b: 0, a: 0 });
  game.renderer.endRenderTexture(target);
}
```

Use `assets.createImageData(path)` to make CPU-side edits before uploading with `assets.createTexture(imageData)`. Disposing the parent render target also releases its cached Texture view.
