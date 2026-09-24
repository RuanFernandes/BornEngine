---
title: Build a 3D scene
description: Combine a camera, immediate primitives, retained scene nodes, model assets, and explicit cleanup in a small 3D view.
section: Guides
order: 71
---

This recipe shows both sides of BornEngine's 3D surface: immediate drawing for grids and prototypes, and the retained scene graph for objects that persist across frames. The [scene API](../../api/scene/) explains the lower-level operations in detail.

## Setup

Create a project and place a supported model under `assets/models/`:

```sh
bornengine new SceneDemo --package-manager npm
cd SceneDemo
npm install @bornengine/engine
mkdir -p assets/models
bornengine run main.ts
```

The camera uses a right-handed, Y-up world. A scene node starts empty, so attach a loaded model before expecting it to render.

```ts
import { initWindow } from '@bornengine/engine/core';
import { loadModel } from '@bornengine/engine/models';
import {
  attachModelToNode,
  createSceneNode,
  setSceneNodePbr,
  setSceneNodeTrs,
} from '@bornengine/engine/scene';

initWindow(1280, 720, 'Scene Demo');
const statue = loadModel('assets/models/statue.glb');
const statueNode = createSceneNode();
attachModelToNode(statueNode, statue.handle, 0);
setSceneNodeTrs(statueNode, 0, 0, -5, 0, 1);
setSceneNodePbr(statueNode, 0.42, 0.15);
```

## Game loop

Wrap the 3D pass between `beginMode3D()` and `endMode3D()`. Immediate primitives are drawn in that pass; persistent scene nodes are rendered by the scene system. Draw 2D text after `endMode3D()` when adding a HUD.

```ts
import {
  beginDrawing, beginMode3D, clearBackground, endDrawing,
  endMode3D, runGame,
} from '@bornengine/engine/core';
import { drawGrid, drawModel } from '@bornengine/engine/models';

const camera = {
  position: { x: 5, y: 3, z: 6 },
  target: { x: 0, y: 1, z: -4 },
  up: { x: 0, y: 1, z: 0 },
  fovy: 45,
  projection: 'perspective' as const,
};

runGame(() => {
  beginDrawing();
  clearBackground({ r: 8, g: 12, b: 18, a: 255 });
  beginMode3D(camera);
  drawGrid(20, 1);
  drawModel(statue, { x: 2, y: 0, z: -5 }, 1, { r: 255, g: 255, b: 255, a: 255 });
  endMode3D();
  endDrawing();
});
```

Immediate `drawModel()` and the attached `statueNode` can coexist. Use immediate draws for a short-lived preview; use a node when you need parent transforms, LODs, picking, shadows, or per-object material state.

## Complete example

The full version updates a retained node, renders a debug grid and a second immediate model, and frees both scene and model resources during shutdown.

```ts
import {
  beginDrawing, beginMode3D, clearBackground, endDrawing,
  endMode3D, getDeltaTime, initWindow, runGame,
} from '@bornengine/engine/core';
import { drawGrid, drawModel, loadModel, unloadModel } from '@bornengine/engine/models';
import {
  attachModelToNode, createSceneNode, destroySceneNode,
  setSceneNodePbr, setSceneNodeTrs,
} from '@bornengine/engine/scene';

initWindow(1280, 720, 'Scene Demo');
const statue = loadModel('assets/models/statue.glb');
const prop = loadModel('assets/models/prop.glb');
const statueNode = createSceneNode();
attachModelToNode(statueNode, statue.handle, 0);
setSceneNodePbr(statueNode, 0.42, 0.15);

const camera = {
  position: { x: 5, y: 3, z: 6 }, target: { x: 0, y: 1, z: -4 },
  up: { x: 0, y: 1, z: 0 }, fovy: 45, projection: 'perspective' as const,
};
let angle = 0;

runGame(() => {
  angle += getDeltaTime() * 30;
  setSceneNodeTrs(statueNode, 0, 0, -5, angle, 1);

  beginDrawing();
  clearBackground({ r: 8, g: 12, b: 18, a: 255 });
  beginMode3D(camera);
  drawGrid(20, 1);
  drawModel(prop, { x: 2, y: 0, z: -5 }, 1, { r: 255, g: 220, b: 180, a: 255 });
  endMode3D();
  endDrawing();
});

export function shutdown() {
  destroySceneNode(statueNode);
  unloadModel(statue);
  unloadModel(prop);
}
```

## Next steps

- Add `addDirectionalLight()` and `enableShadows()` for a lit scene.
- Use `pickScene()` to select nodes and `projectToScreen()` for world labels.
- Replace the immediate prop draw with `attachModelToNode()` when it needs persistent state.
- Continue with [assets and worlds](../assets-and-worlds/) for authored level data.
