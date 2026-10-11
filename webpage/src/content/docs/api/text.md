---
title: Text
description: Draw and measure text with the built-in font or with a font loaded from a file.
section: API
order: 35
---

Text drawing belongs to the renderer. `game.renderer.drawText()` paints a string with the built-in font, or with a `Font` that you load through `game.assets` or `scene.assets`. A `Font` is one loaded font file. Import it from `@bornengine/engine`, or from `@bornengine/engine/text`.

## Default font

The default font is built into the engine, so you do not load anything to use it.

```ts
import { Colors, Game } from '@bornengine/engine';

class ScoreScreen extends Game {
  private score = 120;

  constructor() {
    super({ window: { title: 'Score', width: 640, height: 360 } });
  }

  protected override render(): void {
    this.renderer.clear(Colors.BLACK);
    this.renderer.drawText(`Score: ${this.score}`, { x: 24, y: 24 }, 24, Colors.WHITE);
  }
}

new ScoreScreen().run();
```

The full signature is `drawText(text, position, size, color, font?, spacing = 0)`.

- `position` is the top-left corner of the text. It uses the same coordinates as shapes: pixels from the top-left of the window, or world units inside a 2D camera pass.
- `size` is the font size in pixels. You can pass a different size on every call.
- `font` is optional. Leave it out to use the default font.
- `spacing` adds extra pixels between letters. It only applies when you pass a custom `font`; the default font ignores it.
- The method returns `true` after it draws. It returns `false` when the `Game` is not ready, or when the `font` you pass is not usable.

## Custom fonts

Load a font file with `assets.loadFont(path, size)`. The result is a `Font`, or `null` when the path is empty, the `size` is not a positive number, or the asset scope is already disposed. A font file that cannot be read still gives you a `Font`, with `isLoaded` set to `false` and a message in `error`.

```ts
import { Colors, Game } from '@bornengine/engine';
import type { Font } from '@bornengine/engine';

class TitleScreen extends Game {
  private heading: Font | null = null;

  constructor() {
    super({ window: { title: 'Title', width: 640, height: 360 } });
  }

  protected override onStart(): void {
    const font = this.assets.loadFont('assets/fonts/heading.ttf', 48);
    if (font === null || !font.isLoaded) {
      console.error(font?.error ?? 'Could not load the heading font.');
      return;
    }
    this.heading = font;
  }

  protected override render(): void {
    this.renderer.clear(Colors.DARKBLUE);
    const font = this.heading ?? undefined;
    this.renderer.drawText('My Game', { x: 40, y: 40 }, 48, Colors.WHITE, font);
  }
}

new TitleScreen().run();
```

If the font failed to load, `font` is `undefined` and the text falls back to the default font.

Things to know about custom fonts:

- `game.assets` keeps a font until the `Game` shuts down. `scene.assets` releases it when the scene unloads, so use `scene.assets.loadFont(...)` for a font that only one level needs. [Assets](../assets/) explains the ownership rules.
- The cache key is the path plus the size. Calling `loadFont` again with the same arguments returns the same `Font`, and a different size creates a second `Font`. A failed load stays in the cache, so call `assets.release(font)` before you retry.
- The `size` you pass to `loadFont` is stored as `font.size`. It is the default size for `font.measureText()`. Each `drawText` call still takes its own size.
- A `Font` only works with the `Game` that loaded it.
- The engine reads TrueType (`.ttf`) and OpenType (`.otf`) fonts. Keep font files with your other assets, as described in [Assets](../../concepts/assets/).

## Measurement

Measure text before you draw it when you need to center it or fit it into a box. Use the same `size`, `font`, and `spacing` for measuring and for drawing.

```ts
import { Colors, Game } from '@bornengine/engine';
import type { Font } from '@bornengine/engine';

const WINDOW_WIDTH = 640;
const TITLE = 'Settings';

class SettingsScreen extends Game {
  private heading: Font | null = null;

  constructor() {
    super({ window: { title: 'Settings', width: WINDOW_WIDTH, height: 360 } });
  }

  protected override onStart(): void {
    this.heading = this.assets.loadFont('assets/fonts/heading.ttf', 32);
  }

  protected override render(): void {
    this.renderer.clear(Colors.BLACK);
    const font = this.heading !== null && this.heading.isLoaded ? this.heading : undefined;

    const width = this.renderer.measureText(TITLE, 32, font);
    const position = { x: (WINDOW_WIDTH - width) / 2, y: 40 };
    this.renderer.drawText(TITLE, position, 32, Colors.WHITE, font);

    if (font !== undefined) {
      const bounds = font.measureText(TITLE, 32);
      const box = { x: position.x, y: position.y, width: bounds.x, height: bounds.y };
      this.renderer.drawRectangleOutline(box, Colors.GRAY);
    }
  }
}

new SettingsScreen().run();
```

There are two ways to measure:

- `renderer.measureText(text, size, font?, spacing = 0)` returns the width in pixels as a number. It returns `0` when the renderer is not ready or the `font` is not usable. The default font ignores `spacing`, as it does when drawing.
- `font.measureText(text, size = font.size, spacing = 0)` returns a `Vector2D`. Its `x` is the width. Its `y` is the `size` you asked for, not the exact height of the letters, so treat it as a line height.

## Next steps

- [Shapes](../shapes/) draws the boxes and panels that text usually sits on.
- [Assets](../assets/) explains how `game.assets` and `scene.assets` cache and release fonts.
- [GUI controls](../gui/) provides ready-made text, button, and menu controls.
- [Audio and UI](../../guides/audio-and-ui/) builds a heads-up display.
