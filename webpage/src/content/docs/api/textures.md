---
title: Textures
description: Load images, draw sprites, set filtering, and use render textures for off-screen work.
section: API / Textures
order: 33
---

Import from `@bornengine/engine/textures`:

```ts
import { loadTexture, drawTexture, drawTextureRec, unloadTexture, FILTER_NEAREST } from '@bornengine/engine/textures';

const texture = loadTexture('assets/player.png');
drawTexture(texture, 100, 100, { r: 255, g: 255, b: 255, a: 255 });
unloadTexture(texture);
```

The module exposes `loadTexture`, `drawTexture`, `drawTextureRec`, `drawTexturePro`, dimensions, and explicit unload. `loadImage` plus `loadTextureFromImage` supports image preprocessing; `imageResize`, `imageCrop`, `imageFlipH`, and `imageFlipV` mutate image handles before upload.

`FILTER_LINEAR` and `FILTER_NEAREST` control sampling. `loadRenderTexture`, `beginTextureMode`, and `endTextureMode` provide an off-screen render target for a minimap, post-process input, or a UI composition pass.

Prefer stable asset paths under `assets/`; platform packaging and bundle resolution are covered in the [assets guide](../../concepts/assets/).
