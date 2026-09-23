---
title: Models
description: Load glTF or OBJ models, generate primitives, compile materials, and drive skeletal animation.
section: API / Models
order: 36
---

Import from `@bornengine/engine/models`:

```ts
import { loadModel, drawModel, getModelBounds } from '@bornengine/engine/models';
import { Colors } from '@bornengine/engine';

const character = loadModel('assets/models/character.glb');
drawModel(character, { x: 0, y: 0, z: 0 }, 1, Colors.WHITE);
```

The module covers model loading, `drawModel`, transforms, bounds, primitive meshes, shader/material compilation, instancing, lighting, procedural sky, and planar reflections. `drawCube`, `drawSphere`, `drawCylinder`, `drawPlane`, and `drawGrid` are useful before an asset pipeline exists.

## Skeletal animation

`loadModelAnimation`, `instantiateAnimation`, `animPlay`, `animSetLayer`, `animUpdate`, `animFinished`, and `drawModel` form the preferred mixer path. The legacy raw-time `updateModelAnimation` function remains supported. See the [skeletal animation guide](../../guides/skeletal-animation/) for GLB export and GPU skinning details.

Model resources use explicit handles and should be unloaded when no longer owned by a scene.
