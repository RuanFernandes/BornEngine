---
title: Textures
description: Load images and offscreen render targets through the owning asset scope, and control how they are sampled.
section: API
order: 34
---

A **texture** is an image stored on the graphics card so it can be drawn quickly. You do not create textures with `new`. You ask an asset scope for them: `game.assets` for textures that live as long as the game, or `scene.assets` for textures that belong to one level. The scope loads the file, remembers it, and releases it when its owner ends. [Assets](../assets/) explains the scopes in detail.

This page covers the three texture classes: `Texture`, `RenderTexture`, and `ImageData`. Import them from `@bornengine/engine`, or from `@bornengine/engine/textures`.

## Loading

`assets.loadTexture(path)` loads an image file and returns a `Texture`. The path is relative to your project folder.

```ts
import { Colors, FILTER_NEAREST, Game } from '@bornengine/engine';
import type { Texture } from '@bornengine/engine';

class SpriteGame extends Game {
  private player: Texture | null = null;

  constructor() {
    super({ window: { title: 'Textures', width: 640, height: 360 } });
  }

  protected override onStart(): void {
    const texture = this.assets.loadTexture('assets/player.png');
    if (texture === null || !texture.isLoaded) {
      console.error(texture?.error ?? 'Could not load the player texture.');
      return;
    }
    texture.setFilter(FILTER_NEAREST);
    this.player = texture;
  }

  protected override render(): void {
    this.renderer.clear(Colors.DARKBLUE);
    const player = this.player;
    if (player === null) return;
    player.draw({ x: 190, y: 200 });
    this.renderer.drawTexture(player, { x: 300, y: 200 }, Colors.SKYBLUE);
  }
}

new SpriteGame().run();
```

What `loadTexture` gives you:

- It returns `null` when the path is empty or the asset scope is already disposed. Otherwise it returns a `Texture`, even if loading failed. Check `texture.isLoaded`, and read `texture.error` for the reason.
- A loaded texture has `width` and `height` in pixels. A failed texture has no size and draws nothing.
- Loading the same path again in the same scope returns the same `Texture`. A failed result is cached as well, so release it with `assets.releaseTexture(path)` before you retry. [Assets](../assets/) lists the cache operations.
- `texture.draw(position, tint?)` and `renderer.drawTexture(texture, position, tint?)` do the same thing. Both draw the whole image at its own size, with `position` as the top-left corner. The default `tint` is `Colors.WHITE`, which leaves the image unchanged. Both return `false` instead of drawing when the texture is not loaded.
- `texture.dispose()` releases a texture early. You do not have to call it, because the scope disposes everything it created when it ends.

PNG files always load. JPEG, BMP, TGA, HDR, and DDS files need the `image-extras` feature, an optional part of the native library that you choose when you build the game. The `2d` native profile does not include it, so use PNG in a 2D project or add the feature as described in [Project configuration](../../cli/project/). The Web build loads PNG, JPEG, BMP, and TGA.

A game object can also load its textures with the `@Asset` field annotation. [Assets](../assets/) describes it.

## Sampling

**Sampling** is how the renderer reads pixels from a texture when it draws it. Two things control it: the filter, and which part of the texture you draw.

```ts
import { Colors, FILTER_LINEAR, FILTER_NEAREST, Game, MouseButton } from '@bornengine/engine';
import type { Texture } from '@bornengine/engine';

const FRAME_SIZE = 32;

class AtlasDemo extends Game {
  private atlas: Texture | null = null;

  constructor() {
    super({ window: { title: 'Atlas', width: 640, height: 360 } });
  }

  protected override onStart(): void {
    const atlas = this.assets.loadTexture('assets/characters.png');
    if (atlas !== null && atlas.isLoaded) {
      atlas.setFilter(FILTER_NEAREST);
      this.atlas = atlas;
    }
  }

  protected override loop(_deltaTime: number): void {
    if (this.atlas === null) return;
    if (this.input.isMouseButtonPressed(MouseButton.LEFT)) this.atlas.setFilter(FILTER_LINEAR);
  }

  protected override render(): void {
    this.renderer.clear(Colors.BLACK);
    const atlas = this.atlas;
    if (atlas === null) return;

    const source = { x: FRAME_SIZE * 2, y: 0, width: FRAME_SIZE, height: FRAME_SIZE };
    const destination = { x: 200, y: 120, width: FRAME_SIZE * 4, height: FRAME_SIZE * 4 };
    const pivot = { x: destination.width / 2, y: destination.height / 2 };
    atlas.drawRegion(source, destination, pivot, 15, Colors.WHITE);
  }
}

new AtlasDemo().run();
```

The filter and the region work like this:

- `setFilter(FILTER_LINEAR)` blends neighboring pixels when the image is scaled, which looks smooth. It is the default. `setFilter(FILTER_NEAREST)` keeps hard pixel edges, which suits pixel art. The method returns `false` when the texture is not loaded or is a view of a render texture. The watchOS build ignores the filter.
- `drawRegion(source, destination, origin, rotation, tint)` draws part of the texture, scaled and rotated. `source` is a rectangle in texture pixels and must lie inside the texture. A negative `source.width` or `source.height` flips the region. `destination` is where the unrotated result goes, with `x` and `y` as its top-left corner. `origin` is the pivot, measured from the top-left corner of `destination`. `rotation` is in degrees. It returns `false` when any value is not finite, the source is outside the texture, or the destination has no area.
- The renderer builds a chain of smaller copies of each texture (mipmaps) when it creates the texture, and the default filter uses them when an image is drawn smaller than its real size. Android builds create only one level. `generateMipmaps()` exists for compatibility, but it currently changes nothing.

For named frames and animation, build a `SpriteSheet` on top of a texture. See [Sprites](../sprites/).

## Render textures

A **render texture** is an offscreen image that the renderer can draw into, which you can then draw to the screen like any other texture. Create one with `assets.createRenderTexture(width, height)`. It returns `null` when `width` or `height` is not above zero, or the scope is disposed. The scope owns the result, so it disposes the target with the rest of its resources.

```ts
import { Colors, Game, Key } from '@bornengine/engine';
import type { RenderTexture } from '@bornengine/engine';

class Snapshot extends Game {
  private target: RenderTexture | null = null;
  private capturing = false;
  private hasCapture = false;

  constructor() {
    super({ window: { title: 'Render texture', width: 640, height: 360 } });
  }

  protected override onStart(): void {
    const target = this.assets.createRenderTexture(256, 256);
    if (target === null || !target.isLoaded) {
      console.error(target?.error ?? 'Could not create the render texture.');
      return;
    }
    this.target = target;
  }

  protected override loop(_deltaTime: number): void {
    const target = this.target;
    if (target === null) return;
    if (this.capturing) {
      this.renderer.endRenderTexture(target);
      this.capturing = false;
      this.hasCapture = true;
    } else if (this.input.isKeyPressed(Key.C)) {
      this.capturing = this.renderer.beginRenderTexture(target);
    }
  }

  protected override render(): void {
    this.renderer.clear(Colors.DARKBLUE);
    this.renderer.drawCircle({ x: 120, y: 120 }, 60, Colors.GOLD);
    const target = this.target;
    if (target !== null && this.hasCapture && !this.capturing) target.draw({ x: 360, y: 40 });
  }
}

new Snapshot().run();
```

In this example, pressing C starts a capture in `loop`. The engine renders that whole frame into the texture instead of the window. The next frame ends the capture in `loop`, and `render` then draws the captured image.

How render textures behave:

- `renderer.beginRenderTexture(target)` makes the texture the active target. It returns `false` when the renderer is not ready, a 2D or 3D camera pass is active, another render texture is already active, or the target is not loaded. `renderer.endRenderTexture(target?)` clears the active target and returns `false` when none is active. `target.begin()` and `target.end()` are shortcuts for the same calls.
- The renderer applies the active target when a frame finishes. Draw calls are collected until then, so beginning and ending a target inside one `render()` call does not move those draw calls into the texture. While a target is active at the end of a frame, the engine draws that frame into the target and does not show it in the window.
- While a target is active, `begin2D` and `begin3D` return `false`. A scene that uses a camera or viewport therefore draws nothing during a capture.
- A `RenderTexture` has `width` and `height`. Its `texture` property is a `Texture` view of the same image, shared and not owned separately. The view reports a `width` and `height` of `0`, `setFilter` and `generateMipmaps` return `false` for it, and `drawRegion` cannot use it. Draw the `RenderTexture` itself with `target.draw(position, tint?)` or `renderer.drawTexture(target, position, tint?)`.
- Platform support is limited. The Web build does not implement render textures: `createRenderTexture` succeeds, but nothing is ever drawn into the texture. The watchOS build cannot create them, so `isLoaded` is `false`. Test render textures on each platform you ship.

## Image data

`ImageData` holds an image in memory so you can change its pixels before it becomes a texture. Load it with `assets.createImageData(path)`, edit it, and turn it into a `Texture` with `assets.createTexture(imageData)`.

```ts
import type { Game, Texture } from '@bornengine/engine';

export function createMirroredTile(game: Game): Texture | null {
  const image = game.assets.createImageData('assets/tiles.png');
  if (image === null || !image.isLoaded) {
    console.error(image?.error ?? 'Could not load the tile image.');
    return null;
  }
  image.crop({ x: 0, y: 0, width: 64, height: 64 });
  image.flipHorizontal();
  return game.assets.createTexture(image);
}
```

`ImageData` offers `resize(width, height)`, `crop(rect)`, `flipHorizontal()`, and `flipVertical()`. Each returns `false` when the image is not loaded. `resize` and `crop` also return `false` when the new size is not above zero. The texture you create is a separate copy, so later edits to the image do not change it. The engine has no native call to release image data, so `dispose()` only invalidates the `ImageData` object. Keep these images few and small.

## Next steps

- [Assets](../assets/) explains caching, `@Asset`, and how scopes release textures.
- [Sprites](../sprites/) cuts textures into frames and animates them.
- [Shapes](../shapes/) draws the primitives that you can combine with textures.
- [Core](../core/) describes the renderer passes that render textures interact with.
