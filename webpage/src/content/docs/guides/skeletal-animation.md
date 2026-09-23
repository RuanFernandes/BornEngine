---
title: Skeletal animation
description: Load a GLB skeleton, choose the mixer or raw-time path, and render GPU-skinned models.
section: Guides
order: 61
---

BornEngine's model pipeline supports GPU-accelerated skeletal animation from glTF/GLB files. The current path uses four-bone linear blend skinning and a 128-joint uniform buffer.

```ts
import { loadModel, loadModelAnimation, updateModelAnimation, drawModel, getTime, Colors } from '@bornengine/engine';

const character = loadModel('assets/models/character.glb');
const animation = loadModelAnimation('assets/models/character.glb');

updateModelAnimation(animation, 0, getTime(), 1, 0, 0, 0, 0);
drawModel(character, { x: 0, y: 0, z: 0 }, 1, Colors.WHITE);
```

For multiple instances, parse the source once and call `instantiateAnimation()`. The preferred mixer surface is `animPlay`, `animSetLayer`, `animSetRootMotion`, `animUpdate`, `animFinished`, `animClipDuration`, and `animRootDelta`. The raw-time function remains useful for a minimal single-clip setup.

Export a GLB with the mesh's `JOINTS_0` and `WEIGHTS_0` attributes. Keep the character and animations from the same source pack so rest-pose orientations agree. The engine skins positions and normals on the GPU; update the animation before the draw call in each frame.
