---
title: Text
description: Load TTF or OTF fonts, render text, and measure layouts before drawing them.
section: API / Text
order: 35
---

Text drawing accepts an RGBA `Color` and uses the current drawing mode. Measure before drawing when a label must be centered, truncated, or aligned to a panel.

## Default font

`drawText()` uses the engine's default font path. `measureText()` returns the width in the same units used by `drawText()`.

```ts
import { clearBackground, initWindow, runGame } from '@bornengine/engine/core';
import { drawText, measureText } from '@bornengine/engine/text';

initWindow(960, 540, 'Text basics');
runGame(() => {
  clearBackground({ r: 12, g: 16, b: 20, a: 255 });
  const label = 'BornEngine';
  const width = measureText(label, 32);
  drawText(label, (960 - width) / 2, 80, 32, { r: 255, g: 255, b: 255, a: 255 });
});
```

Use a stable pixel size for UI labels and derive positions from measured widths instead of character counts. The default font is convenient for diagnostics and prototypes; a shipped game should generally own its font asset.

## Font handles

`loadFont(path, size)` and `loadFontEx(path, size)` return a `Font` handle. `drawTextEx()` accepts a `Vec2` position and letter spacing, while `unloadFont()` releases the native font.

```ts
import {
  drawTextEx, loadFont, measureTextEx, unloadFont,
} from '@bornengine/engine/text';

const font = loadFont('assets/Inter-Regular.ttf', 24);
const title = 'Inventory';
const measured = measureTextEx(font, title, 24, 0);

drawTextEx(
  font,
  title,
  { x: 32, y: 28 },
  24,
  0,
  { r: 255, g: 255, b: 255, a: 255 },
);

console.log(`label width: ${measured.x}`);
unloadFont(font);
```

The loader accepts TTF and OTF files. `loadFontEx()` currently shares the same native loader and keeps the API name available for code that wants to make its extended-font intent explicit.

## Measurement

Measurement returns plain data, so layout code can stay independent from a renderer:

```ts
import { drawTextEx, loadFont, measureTextEx, unloadFont } from '@bornengine/engine/text';

function drawCentered(fontPath: string, text: string, y: number, viewportWidth: number) {
  const font = loadFont(fontPath, 20);
  const size = measureTextEx(font, text, 20, 0);
  drawTextEx(
    font,
    text,
    { x: (viewportWidth - size.x) / 2, y },
    20,
    0,
    { r: 184, g: 242, b: 61, a: 255 },
  );
  unloadFont(font);
}
```

| Function | Result | Use |
| --- | --- | --- |
| `drawText(text, x, y, size, color)` | `void` | Quick text with the default font. |
| `measureText(text, size)` | `number` | Width for default-font layout. |
| `loadFont(path, size)` | `Font` | Create a font handle from TTF/OTF data. |
| `drawTextEx(font, text, pos, size, spacing, color)` | `void` | Draw a custom font with spacing control. |
| `measureTextEx(font, text, size, spacing)` | `Vec2` | Width in `x`; the requested size in `y`. |
| `unloadFont(font)` | `void` | Release the native font. |

For Android/aarch64, prefer the RGBA-number variant `drawTextRgba()` when a direct `Color` field read crosses into native code. Keep font handles alive for as long as a UI screen uses them, then release them with the screen's teardown.
