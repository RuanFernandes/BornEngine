---
title: Scene
description: Build a retained scene graph with transforms, geometry, materials, lights, and picking.
section: API / Scene
order: 38
---

The scene module is the retained-mode layer for persistent 3D content. Immediate helpers such as `drawCube()` are ideal for prototypes; scene nodes keep geometry and transforms alive across frames, can be attached into a hierarchy, and are available to picking, shadows, and post-processing.

## Nodes

Create a node, set its transform, attach it to a parent, and destroy it when the owner goes away. Coordinates are right-handed, Y-up, and measured in engine world units. `setSceneNodeTrs()` is the compact position + yaw + uniform-scale path; `setSceneNodeTransform()` accepts a full column-major 4×4 matrix.

```ts
import {
  createSceneNode,
  destroySceneNode,
  setSceneNodeParent,
  setSceneNodeTrs,
  setSceneNodeVisible,
} from '@bornengine/engine/scene';

const player = createSceneNode();
const weapon = createSceneNode();
setSceneNodeTrs(player, 0, 0, -4, 0, 1);
setSceneNodeTrs(weapon, 0.35, 1.1, -0.25, 0, 0.5);
setSceneNodeParent(weapon, player);

setSceneNodeVisible(player, true);

export function destroyPlayer() {
  destroySceneNode(weapon);
  destroySceneNode(player);
}
```

Nodes are visible by default but start without geometry. `setSceneNodeCastShadow()`, `setSceneNodeReceiveShadow()`, and `setSceneNodeGiOnly()` control participation in the corresponding render passes. `setSceneNodeUserData()` can associate an integer entity id with a node so an editor can recover gameplay ownership after a pick.

## Geometry and materials

Use `attachModelToNode()` to copy a mesh from a loaded `Model`, or upload explicit geometry with `updateSceneNodeGeometry()`. Each vertex has 12 floats: `[x, y, z, nx, ny, nz, r, g, b, a, u, v]`; indices are a flat triangle list. Geometry uploads are intended for loading and editing, not for every frame.

```ts
import { createSceneNode } from '@bornengine/engine/scene';
import { loadModel } from '@bornengine/engine/models';
import {
  attachModelToNode,
  setSceneNodeColor,
  setSceneNodePbr,
  setSceneNodeTexture,
  updateSceneNodeGeometry,
} from '@bornengine/engine/scene';

const node = createSceneNode();
const crate = loadModel('assets/models/crate.glb');
attachModelToNode(node, crate.handle, 0);
setSceneNodeColor(node, 220, 230, 255, 255);
setSceneNodePbr(node, 0.45, 0.05);
setSceneNodeTexture(node, 0); // 0 uses the default white texture.

const floor = [
  -4, 0, -4,  0, 1, 0,  255, 255, 255, 255,  0, 0,
   4, 0, -4,  0, 1, 0,  255, 255, 255, 255,  1, 0,
   4, 0,  4,  0, 1, 0, 255, 255, 255, 255,  1, 1,
  -4, 0,  4,  0, 1, 0, 255, 255, 255, 255,  0, 1,
];
updateSceneNodeGeometry(node, floor, [0, 1, 2, 0, 2, 3]);
```

For editor and world-building tools, `extrudePolygon()` creates geometry from flat X/Z points and `subtractBox()` removes triangles inside an axis-aligned cutout. `setSceneNodeLod()` and `attachModelLodToNode()` add reduced-detail variants selected by screen coverage. `setSceneNodeWaterMaterial()` is a compact water-like material with wave parameters and RGBA tint.

## Picking and lights

Call picking after `beginMode3D()` has established the camera matrices. `pickScene()` returns the nearest `PickHit` with a handle, distance, world-space point, and normal. `pickSceneAll()` returns sorted handle/distance pairs for editor cycling. `projectToScreen()` is the inverse workflow for labels and HUD markers.

```ts
import {
  addDirectionalLight,
  addPointLight,
  pickScene,
  projectToScreen,
} from '@bornengine/engine/scene';

addDirectionalLight(-0.4, -1, -0.2, 1, 0.95, 0.85, 2);
addPointLight(0, 2, -3, 8, 0.7, 0.85, 1, 4);

const hit = pickScene(mouseX, mouseY);
if (hit.hit) {
  console.log('selected node', hit.handle, 'at', hit.point);
}

const label = projectToScreen(0, 2, -4);
if (label.visible) drawLabel(label.x, label.y, 'Treasure');

function drawLabel(x: number, y: number, text: string) {
  console.log(text, x, y);
}
```

Light colors use 0–1 channels with a separate intensity; surface colors use 0–255 channels. Enable or disable shadow mapping with `enableShadows()`/`disableShadows()`. `enablePostFx()` turns on outlines and SSAO; pair it with `setPostFxSelected()`, `setPostFxHovered()`, `setOutlineColor()`, and `setOutlineThickness()` for editor selection feedback.

Scene nodes render while the camera is in 3D mode, so keep node updates and picking inside the same frame boundary as the rest of the 3D pass. Read back transforms with `getSceneNodeTransform()` and local bounds with `getSceneNodeBounds()` when an editor needs inspection data.
