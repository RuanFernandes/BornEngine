---
title: Shapes
description: Draw 2D primitives and run the small collision helpers that pair with them.
section: API / Shapes
order: 32
---

Import from `@bornengine/engine/shapes`:

```ts
import { drawRect, drawCircle, drawLine, checkCollisionRecs } from '@bornengine/engine/shapes';
```

The immediate drawing surface includes `drawLine`, `drawRect`, `drawRectRec`, `drawRectLines`, `drawCircle`, `drawCircleLines`, `drawTriangle`, `drawPoly`, and `drawBezier`. Coordinates use the current 2D drawing space and colors use the engine's 0–255 RGBA `Color` shape.

Collision helpers operate on plain `Vec2` and `Rect` data: `checkCollisionRecs`, `checkCollisionCircles`, `checkCollisionCircleRec`, `checkCollisionPointRec`, `checkCollisionPointCircle`, and `getCollisionRec`.

Use shapes for immediate UI, prototypes, and simple 2D games. For persistent 3D objects, use the [scene graph](../scene/) or [models](../models/) modules instead.
