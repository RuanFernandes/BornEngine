---
title: Shapes
description: Draw immediate primitives through Renderer and use pure collision helpers.
section: API / Shapes
order: 33
---

Immediate shapes are renderer commands. Call them in `render()` or during an active camera pass. The Game manages the frame boundary.

## Drawing

```ts
import { Colors, Game } from '@bornengine/engine';
const game = new Game();
game.run({
  update() {},
  render() {
    game.renderer.clear({ r: 15, g: 18, b: 24, a: 255 });
    game.renderer.drawRectangle({ x: 40, y: 40, width: 160, height: 96 }, Colors.LIME);
    game.renderer.drawRectangleOutline({ x: 40, y: 40, width: 160, height: 96 }, Colors.WHITE, 2);
    game.renderer.drawLine({ x: 40, y: 40 }, { x: 200, y: 136 }, Colors.RED, 3);
    game.renderer.drawCircle({ x: 320, y: 88 }, 44, Colors.BLUE);
  },
  onStop: () => game.dispose(),
});
```

Colors use RGBA channels from 0 to 255. Renderer methods return `false` if the Game is not ready.

## Collision helpers

Collision checks are pure value operations exported from the shapes subpath. They accept rectangles and vectors without allocating native resources.

```ts
import { Collision } from '@bornengine/engine';
const player = { x: 80, y: 220, width: 36, height: 52 };
const hazard = { x: 300, y: 220, width: 48, height: 48 };
if (Collision.checkRectangles(player, hazard)) console.log('hit');
```

Rectangle edge contact is not an overlap. Collision query methods are static because they do not own runtime state.
