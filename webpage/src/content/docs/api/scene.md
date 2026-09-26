---
title: Scene graph
description: Create retained renderer nodes and configure their hierarchy, geometry, lights, and picking.
section: API / Scene
order: 41
---

`game.sceneGraph` owns retained renderer nodes. Create each node from that service, then configure it with model, transform, material, and visibility methods. Node handles are internal.

## Nodes

```ts
import { Game, Model } from '@bornengine/engine';
const game = new Game();
const model = new Model(game, 'assets/models/statue.glb');
const node = game.sceneGraph.createNode({ name: 'Statue' });
if (model.isLoaded) node.attachModel(model);
node.setTrs({ x: 0, y: 0, z: -5 }, 0, 1);
node.setVisible(true);
```

Use `setParent(parent)` for retained hierarchies. `dispose()` removes a node's native state and detaches its children safely.

## Geometry and materials

Nodes can receive model meshes or generated geometry. Material properties such as color, PBR roughness/metalness, water parameters, and texture slots are methods on the node; shader materials are separate `Material` resources.

```ts
node.setPbr(0.42, 0.15);
node.setColor({ r: 210, g: 190, b: 150, a: 255 });
node.updateGeometry(vertices, indices);
```

A loaded Model must belong to the same Game as the SceneGraph. The retained graph reuses node state between frames.

## Picking and lights

SceneGraph offers screen-space picking, projection, and light setup. Picking returns SceneNode instances rather than exposing native numeric IDs.

```ts
const sunAdded = game.sceneGraph.addDirectionalLight(
  { x: -0.3, y: -1, z: -0.2 },
  { r: 255, g: 244, b: 220, a: 255 },
  2,
);
const hit = game.sceneGraph.pick({ x: 640, y: 360 });
if (hit.hit && hit.node !== null) game.sceneGraph.setSelected(hit.node);
```
