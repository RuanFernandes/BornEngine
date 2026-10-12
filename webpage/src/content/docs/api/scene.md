---
title: Scene graph
description: Create retained 3D renderer nodes and configure their hierarchy, geometry, materials, lights, and picking.
section: API
order: 41
---

The scene graph is a set of **retained nodes**. You create a node once, give it geometry and a material, and the engine draws it every frame until you hide or dispose it. You do not draw it again each frame, which is the difference from `renderer.drawCube` and the other immediate draw calls.

`game.sceneGraph` owns the nodes. It is a different thing from a `Scene` in [Game objects](../game/): a `Scene` groups game objects, while a node is only something to draw. To drive a node from a game object, attach a `SceneNodeComponent`.

Three rules apply to every node:

- The game must use the 3D renderer. With `renderMode: '2d'` the engine skips retained nodes, so they are not drawn. Use `'3d'`, `'2.5d'`, or leave the option out.
- Nodes are drawn at the end of the frame with the camera of the latest `renderer.begin3D(camera)` call. Call `begin3D` and `end3D` in `render()` every frame, even if you draw nothing between them.
- A node belongs to one `Game`. Models and meshes that you attach must come from the same game.

## Nodes

Create a node with `game.sceneGraph.createNode(options)`. The only option is `name`. A node reports `isLoaded`, and `error` explains why it is not loaded, for example when the game is not ready. Every setter returns a `boolean`: `false` means the node is not loaded or the argument was refused, and nothing changed.

```ts
import { Game } from '@bornengine/engine';

const game = new Game({ window: { title: 'Nodes', width: 800, height: 450 }, renderMode: '3d' });

const tank = game.sceneGraph.createNode({ name: 'Tank' });
const turret = game.sceneGraph.createNode({ name: 'Turret' });

if (tank.isLoaded && turret.isLoaded) {
  turret.setParent(tank);
  tank.setTrs({ x: 2, y: 0, z: -6 }, Math.PI / 2, 1);
  turret.setTrs({ x: 0, y: 1, z: 0 }, 0, 1);
}

console.log(game.sceneGraph.nodeCount, tank.children.length, game.sceneGraph.findByName('Turret') === turret);
```

A node's matrix is local to its parent, and the renderer draws each node at its parent's world transform times its own matrix, so a child moves with its parent. In the example the turret sits one unit above the tank, and moving the tank moves the turret.

`SceneNode` members:

| Member | Meaning |
| --- | --- |
| `name`, `error`, `isLoaded`, `isDisposed` | Read-only state. |
| `parent`, `children` | The hierarchy. `children` returns a copy. |
| `setParent(parent)` | Records a new parent. Pass `null` to detach the node, which then uses its own matrix as its world transform. It returns `false` if the parent is not loaded, belongs to another game, or is a descendant of this node. |
| `setVisible(visible)` | Shows or hides the node. |
| `setTransform(matrix)` | Sets the full local transform from a 4 by 4 matrix: an array of 16 numbers, column-major. It returns `false` for any other length. |
| `setTrs(position, yaw = 0, scale = 1)` | Sets position, a rotation around the Y axis in **radians**, and one uniform scale. |
| `getTransform()` | Reads back the local 16-number matrix last set, or `null` when the node is not loaded. |
| `getBounds()` | The bounding box of the node's geometry in local space, or `null`. |
| `setUserData(value)`, `getUserData()` | Stores one number on the node. Editors use it to map a node to their own id. |
| `dispose()` | Frees the node and every node below it. |

`dispose()` disposes the whole subtree. To keep the children, call `child.setParent(null)` first. A disposed node removes itself from the graph.

`SceneGraph` members for managing nodes:

| Member | Meaning |
| --- | --- |
| `nodeCount`, `getNodes()` | How many nodes are registered, and a copy of the list. |
| `createNode(options?)` | Creates a node and registers it. |
| `add(node)` | Adds a node to the list if it is not there yet. It returns `false` if the node is not loaded or belongs to another game. |
| `remove(node, dispose = false)` | Takes a node out of the list. Pass `true` to dispose it as well. |
| `findByName(name)` | The first loaded node with that name, or `null`. |
| `isReady` | `true` while the game is running and the graph is not disposed. |

`remove(node)` without `dispose` only drops the node from `getNodes`, `findByName`, and pick results. The node keeps drawing until you dispose it.

When the game shuts down, the graph disposes every node.

## Geometry and materials

A node starts empty. Give it geometry from a loaded model, from your own vertex data, or from a helper. Then set its material.

**Vertex data.** `updateGeometry(vertices, indices)` replaces the node's mesh. `vertices` is a flat array with 12 numbers per vertex: position `x, y, z`, normal `nx, ny, nz`, color `r, g, b, a` as numbers from 0 to 1, and texture coordinates `u, v`. `indices` lists triangles, three indices each. It returns `false` if there are fewer than 12 numbers or no indices. The upload cost grows with the mesh size, so use it when you build or edit a mesh, not to stream new geometry every frame.

```ts
import { Game } from '@bornengine/engine';

const FLOOR_VERTICES: number[] = [
  -5, 0, -5, 0, 1, 0, 0.8, 0.8, 0.8, 1, 0, 0,
  5, 0, -5, 0, 1, 0, 0.8, 0.8, 0.8, 1, 1, 0,
  5, 0, 5, 0, 1, 0, 0.8, 0.8, 0.8, 1, 1, 1,
  -5, 0, 5, 0, 1, 0, 0.8, 0.8, 0.8, 1, 0, 1,
];
const FLOOR_INDICES: number[] = [0, 1, 2, 0, 2, 3];

const game = new Game({ window: { title: 'Geometry', width: 800, height: 450 }, renderMode: '3d' });

const floor = game.sceneGraph.createNode({ name: 'Floor' });
floor.updateGeometry(FLOOR_VERTICES, FLOOR_INDICES);
floor.setColor({ r: 180, g: 180, b: 170, a: 255 });
floor.setPbr(0.8, 0);
floor.setReceiveShadow(true);

const statue = game.sceneGraph.createNode({ name: 'Statue' });
const model = game.assets.loadModel('assets/models/statue.glb');
if (model !== null && model.isLoaded) statue.attachModel(model);
statue.setTrs({ x: 0, y: 0, z: -2 }, 0, 1);
statue.setCastShadow(true);
```

**Models.** `attachModel(model, meshIndex = 0)` uses one mesh of a `Model`, or a `Mesh` from `game.assets.createMesh`. It returns `false` if the node is not loaded, the model is not loaded, or the model belongs to another game. The node also takes the mesh's material from the file: its textures, roughness, metalness, and alpha cutoff. Call `setColor` or `setPbr` afterward to override them. A model with several meshes needs one node per mesh. [Models](../models/) covers loading.

**Level of detail.** The node's own geometry is the finest level. `setLodGeometry(level, vertices, indices, maxCoverage)` and `attachModelLod(model, meshIndex, level, maxCoverage)` add coarser variants. `level` counts up from 0, and each level is coarser than the one before. `maxCoverage` is a number from 0 to 1: the fraction of the viewport that the node's bounds cover. A variant is used when the node covers less than that. Give coarser levels smaller values, for example 0.4, 0.15, and 0.05. Shadows and picking always use the finest geometry.

**Material.**

| Method | Meaning |
| --- | --- |
| `setColor(color)` | The base color. Components are 0 to 255, like `Colors`. |
| `setPbr(roughness, metalness)` | Physically based rendering (PBR) values for the surface. Roughness and metalness usually range from 0 to 1. |
| `setTextureSlot(slot)` | Selects a renderer texture slot. `Texture` does not expose its slot number, so the only value you can rely on is `0`, the default white texture. |
| `setWaterMaterial(waveAmplitude, waveSpeed, color)` | Gives the node a translucent, low-roughness water look. |
| `setCastShadow(enabled)`, `setReceiveShadow(enabled)` | Shadow participation. |
| `setGiOnly(enabled)` | Marks the node as a proxy for global illumination, the light that bounces between surfaces. It feeds that calculation but is not drawn, and it does not cast sun shadows. |

For a shader-based look, create a `Material` and draw a model with it instead. See [Models](../models/).

**Generated geometry.** `extrudePolygon(points, depth)` builds a prism from a polygon. It reads the `x` and `z` of each point and extrudes from `y = 0` up to `depth`. It needs at least three points. `subtractBox(bounds)` removes the triangles that lie completely inside an axis-aligned box, which is enough for simple door cutouts.

## Picking and lights

**Picking** finds the node under a screen position. `pick` and `projectToScreen` use the camera from the latest `renderer.begin3D(camera)` call, so call `begin3D` at least once first.

| Method | Returns |
| --- | --- |
| `pick(screenPosition)` | A `ScenePickHit`: `hit`, `node`, `distance`, `point`, and `normal` for the closest visible node. `node` is `null` when nothing was hit, or when the hit node is no longer registered. |
| `pickAll(screenPosition, maxResults = 8)` | A list of `{ node, distance }`, nearest first. |
| `projectToScreen(position)` | `{ x, y, visible }` for a world position, or `null` when the graph is not ready. `visible` is `false` when the point is behind the camera. |

Screen positions use the same units as `game.input.getMouseX()` and `getMouseY()`.

**Lights** are added with `addDirectionalLight(direction, color, intensity)`, `addPointLight(position, range, color, intensity)`, and `setAmbientLight(color, intensity)`. Colors are 0 to 255. A direction does not need to be normalized. The renderer ignores lights beyond its fixed limits. Each method returns `false` when the graph is not ready.

**Lights reset at the start of every frame.** This includes the ambient light, so call these methods every frame, in `loop` or in `render`. A light added once at startup is gone after the first frame.

Other renderer settings on the graph:

| Method | Meaning |
| --- | --- |
| `setShadowsEnabled(enabled)` | Turns shadow mapping on or off. This setting persists. |
| `dumpShadowMap(path)` | Writes the shadow map to a PNG file for debugging. |
| `setPostProcessingEnabled(enabled)` | Turns on the post-processing pipeline that draws outlines. |
| `setSelected(node)`, `setHovered(node)` | Outlines a node. Pass `null` to clear. They return `false` if the node is not loaded or belongs to another game. |
| `setOutlineColor(color)`, `setOutlineThickness(pixels)` | Outline style. A negative thickness is refused. |
| `onFrame(callback, priority = 0)` | Registers a callback that receives the frame's delta time once per frame, lowest `priority` first. On native targets it runs before your `loop`. It returns a `FrameSubscription`, or `null` if the graph is not ready. Call `subscription.dispose()` to stop it. |

```ts
import { Colors, Game, MouseButton } from '@bornengine/engine';
import type { Camera3D } from '@bornengine/engine';

const camera: Camera3D = {
  position: { x: 0, y: 3, z: 8 },
  target: { x: 0, y: 1, z: 0 },
  up: { x: 0, y: 1, z: 0 },
  fovy: 60,
  projection: 'perspective',
};

class PickGame extends Game {
  constructor() {
    super({ window: { title: 'Picking', width: 800, height: 450 }, renderMode: '3d' });
  }

  protected override onStart(): void {
    this.sceneGraph.setPostProcessingEnabled(true);
    this.sceneGraph.setShadowsEnabled(true);
  }

  protected override loop(_deltaTime: number): void {
    if (this.input.isMouseButtonPressed(MouseButton.LEFT)) {
      const hit = this.sceneGraph.pick({ x: this.input.getMouseX(), y: this.input.getMouseY() });
      this.sceneGraph.setSelected(hit.node);
    }
  }

  protected override render(): void {
    this.renderer.clear(Colors.SKYBLUE);
    this.sceneGraph.setAmbientLight(Colors.WHITE, 0.3);
    this.sceneGraph.addDirectionalLight({ x: -0.3, y: -1, z: -0.2 }, { r: 255, g: 244, b: 220, a: 255 }, 2);
    this.sceneGraph.addPointLight({ x: 0, y: 3, z: 0 }, 10, Colors.ORANGE, 4);
    if (this.renderer.begin3D(camera)) this.renderer.end3D();
  }
}

new PickGame().run();
```

The click picks with the camera that `render` set in the previous frame. When a world file supplies the lighting, call `WorldInstance.applyLighting()` every frame instead. See [World data](../world/).

## Next steps

- [Models](../models/) loads the models and meshes that nodes display.
- [Game objects](../game/) drives nodes from game objects with `SceneNodeComponent`.
- [World data](../world/) builds nodes, lights, terrain, and water from a world file.
- [3D scene guide](../../guides/3d-scene/) walks through a full 3D scene.
