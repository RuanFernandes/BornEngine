---
title: Textures
description: Load images, draw sprites, set filtering, and use render textures for off-screen work.
section: API / Textures
order: 34
---

Textures are explicit handles with width and height metadata. Keep the source path stable, configure filtering after loading, and release every texture that your game owns.

## Loading

`loadTexture(path)` returns `{ handle, width, height }`. A missing or undecodable asset returns a zero handle and zero dimensions; check the handle when failure needs a visible response.

```ts
import {
  drawTexture, getTextureHeight, getTextureWidth,
  loadTexture, unloadTexture,
} from '@bornengine/engine/textures';

const player = loadTexture('assets/player.png');
if (player.handle === 0) {
  throw new Error('player texture could not be loaded');
}

const size = { width: getTextureWidth(player), height: getTextureHeight(player) };
drawTexture(player, 100, 120, { r: 255, g: 255, b: 255, a: 255 });
console.log(size);
unloadTexture(player);
```

For preprocessing, `loadImage()` returns an image handle that can be resized, cropped, or flipped before `loadTextureFromImage()` uploads it. `genTextureMipmaps()` generates mip levels for a loaded texture. Keep the transformed handle in a short-lived loading scope and retain only the resulting `Texture` in gameplay state.

## Sampling

`FILTER_NEAREST` is useful for pixel art and crisp UI. `FILTER_LINEAR` produces smoother scaling for painted or photographic assets. `drawTextureRec()` selects a source rectangle; `drawTexturePro()` adds destination size, origin, and rotation.

```ts
import {
  FILTER_LINEAR, FILTER_NEAREST, drawTexturePro,
  loadTexture, setTextureFilter, unloadTexture,
} from '@bornengine/engine/textures';

const atlas = loadTexture('assets/characters.png');
setTextureFilter(atlas, FILTER_NEAREST);

drawTexturePro(
  atlas,
  { x: 0, y: 0, width: 32, height: 32 },
  { x: 320, y: 180, width: 96, height: 96 },
  { x: 48, y: 48 },
  0,
  { r: 255, g: 255, b: 255, a: 255 },
);

unloadTexture(atlas);
```

| Function | Signature | Ownership |
| --- | --- | --- |
| `loadTexture` | `(path: string) => Texture` | Creates a native texture handle. |
| `drawTexture` | `(texture, x, y, tint)` | Draws the complete texture. |
| `drawTextureRec` | `(texture, source, position, tint)` | Draws an atlas region at native size. |
| `drawTexturePro` | `(texture, source, dest, origin, rotation, tint)` | Draws a transformed region. |
| `setTextureFilter` | `(texture, FILTER_LINEAR | FILTER_NEAREST)` | Changes sampling for subsequent draws. |
| `getTextureWidth` / `getTextureHeight` | `(texture) => number` | Reads metadata without another GPU query. |
| `unloadTexture` | `(texture) => void` | Releases the native handle. |

## Render textures

Render textures are off-screen targets. Begin a texture mode, draw the pass, end the mode, then get a `Texture` view for a later `drawTexture()` call. The render-texture handle and the texture view have different ownership: unload the render target once, and do not call `unloadTexture()` on the borrowed view.

```ts
import {
  beginTextureMode, drawTexture, endTextureMode,
  getRenderTextureTexture, loadRenderTexture, unloadRenderTexture,
} from '@bornengine/engine/textures';
import { drawCircle } from '@bornengine/engine/shapes';

const minimap = loadRenderTexture(512, 512);

beginTextureMode(minimap);
drawCircle(256, 256, 120, { r: 75, g: 141, b: 255, a: 255 });
endTextureMode();

const minimapTexture = getRenderTextureTexture(minimap);
drawTexture(minimapTexture, 32, 32, { r: 255, g: 255, b: 255, a: 255 });
unloadRenderTexture(minimap);
```

The render-to-texture FFI surface is stable, while the current GPU implementation is intentionally a focused stub. Keep this pattern behind a feature flag if a target does not expose render targets yet.

## Async and staged loading

`loadTextureAsync()` stages one path and commits it on the render thread. `stageTextures()` and `commitTexture()` let a loading screen batch work without uploading every asset in the same frame.

```ts
import { loadTextureAsync, unloadTexture } from '@bornengine/engine/textures';

async function loadPlayer() {
  const texture = await loadTextureAsync('assets/player.png');
  return {
    texture,
    dispose: () => unloadTexture(texture),
  };
}
```

Keep texture paths under `assets/`; platform packaging and Web/WASM URL resolution are covered by the [assets guide](../../concepts/assets/).
