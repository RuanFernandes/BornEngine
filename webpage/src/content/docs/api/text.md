---
title: Text
description: Draw and measure text with the default font or a game-owned Font resource.
section: API / Text
order: 35
---

Text drawing belongs to the renderer. Create a Font for a custom typeface and pass that resource to the renderer methods.

## Default font

```ts
import { Colors, Game } from '@bornengine/engine';
class ExampleGame extends Game {
  protected override render(): void {
    this.renderer.clear(Colors.BLACK);
    this.renderer.drawText('Score: 120', { x: 24, y: 24 }, 24, Colors.WHITE);
  }
}

const game = new ExampleGame();
game.run();
```

The default font is available without creating a separate resource. Position is the top-left drawing origin.

## Custom fonts

A Font comes from the owning asset scope. Inspect the load result; Game shutdown or Scene unload releases it with the rest of that scope.

```ts
const font = game.assets.loadFont('assets/fonts/heading.ttf', 32);
if (font === null || !font.isLoaded) console.error(font?.error || 'Unable to load font.');
```

Use the Font only with its owner's renderer; foreign-game resources are rejected. For a custom typeface used by one level, load it through `scene.assets.loadFont(...)`.

## Measurement

`renderer.measureText()` returns a width in pixels. Custom Font measurement also returns height through `font.measureText()`.

```ts
const width = game.renderer.measureText('Settings', 28, font);
const bounds = font.measureText('Settings', 28);
console.log(width, bounds.y);
```
