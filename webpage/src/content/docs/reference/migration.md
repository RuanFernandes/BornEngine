---
title: Migration notes
description: Track the breaking conventions introduced by the 0.5 API cleanup before moving an older project.
section: Reference
order: 81
---

## Colors use 0–255

Scene surface colors now use the same 0–255 channels as drawing calls and `Colors` presets. Light colors remain 0–1 floats with a separate intensity, and world-file tints remain 0–1 serialized values.

```ts
// old                         // current
setSceneNodeColor(node, 0.75, 0.75, 0.7);
setSceneNodeColor(node, 191, 191, 179);
```

## Angles use degrees

User-facing angles use degrees. Physics angular velocity remains radians per second, and quaternions remain quaternions:

```ts
drawModelRotated(model, position, 1, 90, Colors.WHITE);
```

## Texture handles

`Texture.id` became `Texture.handle`, matching `Sound`, `Music`, `Font`, and `Model` resources.

## Physics and stale handles

`physics.step()` uses a fixed timestep with an accumulator and returns interpolation alpha. `stepVariable()` preserves exact-delta stepping for code that owns its own accumulator. Stale handles now fail registry lookups rather than aliasing a slot reused by another resource.

When migrating a project, update examples and helpers together; the [physics API](../api/physics/) and [scene API](../api/scene/) show the current surface.
