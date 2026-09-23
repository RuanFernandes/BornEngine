---
title: Scene
description: Build a retained scene graph with transforms, geometry, lights, materials, picking, and frame callbacks.
section: API / Scene
order: 38
---

Import from `@bornengine/engine/scene`:

```ts
import { createSceneNode, setSceneNodeTrs, setSceneNodeColor, addDirectionalLight } from '@bornengine/engine/scene';

const node = createSceneNode();
setSceneNodeTrs(node, 0, 1, 0, 0, 1);
setSceneNodeColor(node, 255, 255, 255, 255);
addDirectionalLight(-0.4, -1, -0.2, 1, 1, 1, 2);
```

Immediate drawing is useful for a small scene; the retained graph keeps nodes alive across frames and supports parent transforms, geometry updates, PBR properties, textures, water materials, bounds, user data, and model attachment.

The scene module also exposes `registerFrameCallback`, shadow toggles, post-FX selection, `projectToScreen`, `pickScene`, `pickSceneAll`, `extrudePolygon`, and `subtractBox`. Coordinates are right-handed, Y-up, and measured in meters. Surface colors use 0–255 channels; light colors are 0–1 values with a separate intensity.
