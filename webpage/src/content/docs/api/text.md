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
const game = new Game();
game.run({
  update() {},
  render() {
    game.renderer.clear(Colors.BLACK);
    game.renderer.drawText('Score: 120', { x: 24, y: 24 }, 24, Colors.WHITE);
  },
  onStop: () => game.dispose(),
});
```

The default font is available without creating a separate resource. Position is the top-left drawing origin.

## Custom fonts

A Font is constructed with its owning Game. Inspect the load result and call `dispose()` when the custom font is no longer needed.

```ts
import { Font, Game } from '@bornengine/engine';
const font = new Font(game, 'assets/fonts/heading.ttf', 32);
if (!font.isLoaded) console.error(font.error);
```

Use the Font only with its owner's renderer; foreign-game resources are rejected.

## Measurement

`renderer.measureText()` returns a width in pixels. Custom Font measurement also returns height through `font.measureText()`.

```ts
const width = game.renderer.measureText('Settings', 28, font);
const bounds = font.measureText('Settings', 28);
console.log(width, bounds.y);
```
