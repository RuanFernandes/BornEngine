---
title: Shapes
description: Draw rectangles, circles, lines, and polygons through the renderer, and test 2D overlaps with pure collision helpers.
section: API
order: 33
---

The shapes module has two parts. The first is a set of drawing methods on `game.renderer` that paint colored shapes. The second is `Collision`, a class of static functions that test whether 2D shapes overlap.

The drawing methods are **immediate mode**: you call them every frame, and the renderer keeps nothing from one frame to the next. Import `Collision` from `@bornengine/engine` or from `@bornengine/engine/shapes`.

## Drawing

Call the drawing methods from `render()`. Inside a scene, call them from a component's `render(renderer)` method. Shapes appear in the order you draw them, so a later call covers an earlier one. The renderer does not clear the screen for you; call `clear(color)` first.

```ts
import { Colors, Game } from '@bornengine/engine';

class ShapeGallery extends Game {
  constructor() {
    super({ window: { title: 'Shapes', width: 640, height: 360 } });
  }

  protected override render(): void {
    this.renderer.clear(Colors.DARKGRAY);
    this.renderer.drawRectangle({ x: 40, y: 40, width: 160, height: 96 }, Colors.LIME);
    this.renderer.drawRectangleOutline({ x: 40, y: 40, width: 160, height: 96 }, Colors.WHITE, 2);
    this.renderer.drawLine({ x: 40, y: 40 }, { x: 200, y: 136 }, Colors.RED, 3);
    this.renderer.drawCircle({ x: 320, y: 88 }, 44, Colors.SKYBLUE);
    this.renderer.drawCircleOutline({ x: 320, y: 88 }, 52, Colors.WHITE);
    this.renderer.drawTriangle({ x: 440, y: 130 }, { x: 490, y: 40 }, { x: 540, y: 130 }, Colors.GOLD);
    this.renderer.drawPolygon({ x: 320, y: 250 }, 6, 50, Colors.PURPLE, 15);
    this.renderer.drawBezier({ x: 40, y: 300 }, { x: 120, y: 200 }, { x: 220, y: 340 }, { x: 300, y: 260 }, Colors.ORANGE, 2);
  }
}

new ShapeGallery().run();
```

The 2D drawing methods on `game.renderer` are:

| Method | Draws |
| --- | --- |
| `drawLine(start, end, color, thickness = 1)` | A line between two points. |
| `drawRectangle(rect, color)` | A filled rectangle. `rect` is `{ x, y, width, height }`, and `x`, `y` is the top-left corner. |
| `drawRectangleOutline(rect, color, thickness = 1)` | The outline of a rectangle. |
| `drawCircle(center, radius, color)` | A filled circle. |
| `drawCircleOutline(center, radius, color)` | A circle outline. It has no thickness argument. |
| `drawTriangle(a, b, c, color)` | A filled triangle. |
| `drawPolygon(center, sides, radius, color, rotation = 0)` | A filled regular polygon. `rotation` is in degrees. Fewer than three sides draw nothing. |
| `drawBezier(start, control1, control2, end, color, thickness = 1)` | A cubic curve, drawn as 24 short line segments. |

A few rules apply to every method:

- Points are `{ x, y }` objects, and a `Vector2D` works too. Sizes and radii are in pixels, or in world units while a 2D camera is active.
- Colors have `r`, `g`, `b`, and `a` channels from 0 to 255. Use the `Colors.*` constants, such as `Colors.RED`, or write your own `{ r, g, b, a }` object.
- Every method returns a `boolean`. It returns `false` when the `Game` is not ready, for example after a failed start, and draws nothing.

## Collision helpers

`Collision` has static functions for 2D overlap tests. They only read their arguments, so they need no `Game`, and they work the same inside or outside a running game.

```ts
import { Collision } from '@bornengine/engine/shapes';
import type { Rect } from '@bornengine/engine/shapes';

const player: Rect = { x: 80, y: 220, width: 36, height: 52 };
const hazards: Rect[] = [
  { x: 100, y: 240, width: 48, height: 48 },
  { x: 300, y: 220, width: 48, height: 48 },
];

for (const hazard of hazards) {
  if (!Collision.checkRectangles(player, hazard)) continue;
  const overlap = Collision.getRectangleIntersection(player, hazard);
  console.log(`Overlap: ${overlap.width} by ${overlap.height} pixels`);
}

const leftBox: Rect = { x: 0, y: 0, width: 10, height: 10 };
const rightBox: Rect = { x: 10, y: 0, width: 10, height: 10 };
console.log(Collision.checkRectangles(leftBox, rightBox));
```

The last line prints `false`: rectangles that only share an edge do not overlap. The 2D tests are:

| Function | Result |
| --- | --- |
| `checkRectangles(a, b)` | `true` when two rectangles overlap. Touching edges do not count. |
| `checkCircles(centerA, radiusA, centerB, radiusB)` | `true` when two circles overlap or touch. |
| `checkCircleRectangle(center, radius, rect)` | `true` when a circle overlaps or touches a rectangle. |
| `checkPointRectangle(point, rect)` | `true` when the point is inside the rectangle or on its edge. |
| `checkPointCircle(point, center, radius)` | `true` when the point is inside the circle or on its edge. |
| `getRectangleIntersection(a, b)` | The rectangle where `a` and `b` overlap, or `{ x: 0, y: 0, width: 0, height: 0 }` when they do not. |

These helpers answer a yes-or-no question about two shapes you already have. They do not move anything or resolve contacts. For bodies that move and collide, use [Physics 2D](../physics2d/). The 3D tests, such as sphere, box, and ray checks, are on the [Math](../math/) page.

## Next steps

- [Text](../text/) draws and measures text with the same renderer.
- [Textures](../textures/) draws images, which you can combine with shapes in one frame.
- [2D camera and viewport](../camera2d/) explains how shapes drawn in a scene use world coordinates.
- [Core](../core/) describes the frame lifecycle that calls `render()`.
