---
title: Text
description: Load TTF or OTF fonts, render text, and measure layouts before drawing them.
section: API / Text
order: 34
---

Import from `@bornengine/engine/text`:

```ts
import { loadFont, drawText, measureText, unloadFont } from '@bornengine/engine/text';

const font = loadFont('assets/ui.ttf', 20);
drawText('BornEngine', 24, 24, 20, { r: 255, g: 255, b: 255, a: 255 });
const width = measureText('BornEngine', 20);
unloadFont(font);
```

`drawText` uses the default font path. Use `loadFont` and `drawTextEx` when the game needs a specific font, spacing, or a `Vec2` position. `measureText` and `measureTextEx` let UI code compute alignment without guessing character widths.

The loader accepts TTF and OTF files. Keep the font in the project's assets so native bundles and Web/WASM output resolve the same relative path.
