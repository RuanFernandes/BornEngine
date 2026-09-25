---
title: Shapes
description: Draw 2D primitives and run the small collision helpers that pair with them.
section: API / Shapes
order: 33
---

The shapes module is immediate-mode drawing plus pure TypeScript collision math. It is a good fit for prototypes, UI, debug overlays, and small 2D games.

```ts
import { drawCircle, drawLine, drawRect, drawRectLines } from '@bornengine/engine/shapes';
import { beginDrawing, clearBackground, endDrawing } from '@bornengine/engine/core';

beginDrawing();
clearBackground({ r: 15, g: 18, b: 24, a: 255 });
drawRect(40, 40, 160, 96, { r: 184, g: 242, b: 61, a: 255 });
drawRectLines(40, 40, 160, 96, 2, { r: 255, g: 255, b: 255, a: 255 });
drawLine(40, 40, 200, 136, 3, { r: 255, g: 117, b: 94, a: 255 });
drawCircle(320, 88, 44, { r: 75, g: 141, b: 255, a: 255 });
endDrawing();
```

## Drawing

Drawing functions submit geometry immediately in the active 2D or 3D mode. A `Color` is `{ r, g, b, a }`, with every channel in the `0..255` range.

| Function | Arguments | Notes |
| --- | --- | --- |
| `drawLine` | `startX, startY, endX, endY, thickness, color` | A line segment with explicit width. |
| `drawRect` | `x, y, width, height, color` | Filled axis-aligned rectangle. |
| `drawRectRec` | `rect, color` | Same operation using a `{ x, y, width, height }` record. |
| `drawRectLines` | `x, y, width, height, thickness, color` | Rectangle outline. |
| `drawCircle` / `drawCircleLines` | `centerX, centerY, radius, color` | Filled or outlined circle. |
| `drawTriangle` | three points and `color` | Filled triangle. |
| `drawPoly` | `centerX, centerY, sides, radius, rotation, color` | Regular polygon; rotation follows the drawing coordinate system. |
| `drawBezier` | endpoints, two control points, thickness, color | Cubic curve approximated by line segments. |

The functions do not retain a shape handle. Call them between `beginDrawing()` and `endDrawing()`, and re-submit them every frame.

## Collision helpers

Collision helpers operate on plain `Rect` and `Vec2` objects, so the same records can be stored in gameplay state or serialized without conversion.

```ts
import { checkCollisionRecs, drawRect } from '@bornengine/engine/shapes';

type Actor = { bounds: { x: number; y: number; width: number; height: number } };
const player: Actor = { bounds: { x: 80, y: 220, width: 36, height: 52 } };
const hazard: Actor = { bounds: { x: 300, y: 220, width: 48, height: 48 } };

function drawWorld() {
  drawRect(player.bounds.x, player.bounds.y, player.bounds.width, player.bounds.height, {
    r: 184, g: 242, b: 61, a: 255,
  });
  drawRect(hazard.bounds.x, hazard.bounds.y, hazard.bounds.width, hazard.bounds.height, {
    r: 255, g: 117, b: 94, a: 255,
  });
}

function update() {
  if (checkCollisionRecs(player.bounds, hazard.bounds)) {
    console.log('hit');
  }
}
```

`checkCollisionRecs` uses strict overlap: two rectangles that only touch at an edge are not colliding. `getCollisionRec` returns a zero-sized rectangle when there is no overlap.

| Function | Inputs | Result |
| --- | --- | --- |
| `checkCollisionRecs` | two `Rect` values | `boolean` overlap test |
| `checkCollisionCircles` | two centers and two radii | `boolean` distance test |
| `checkCollisionCircleRec` | circle center/radius and `Rect` | `boolean` closest-point test |
| `checkCollisionPointRec` | `Vec2` point and `Rect` | `boolean` containment test |
| `checkCollisionPointCircle` | point, center, radius | `boolean` containment test |
| `getCollisionRec` | two `Rect` values | intersection `Rect`, or zero-sized `Rect` |

## Coordinate and color conventions

Use `drawRectRec` when a system already owns a `Rect`; it avoids keeping four coordinates in sync. For a camera-relative world, wrap the draw block in `beginMode2D(camera)` from Core. For screen-space UI, draw after `endMode2D()` so the UI does not inherit world zoom or rotation.

The module does not provide a retained shape list, z-index, or automatic batching. Keep ordering explicit: draw the background first, gameplay next, and overlays last.
