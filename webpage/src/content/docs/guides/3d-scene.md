---
title: Build a 3D scene
description: Draw a lit 3D scene with an orbiting camera, immediate-mode shapes, retained scene nodes, and an optional model.
section: Guides
order: 71
---

This guide builds a small 3D showroom. A camera orbits a pedestal with a spinning box on it. A grid, a sphere, and a cube are drawn directly each frame, and a model can stand behind the pedestal. You light the scene and add a line of text on top.

BornEngine has two ways to put 3D things on screen, and this guide uses both. Each section adds one piece. The last section has the complete `main.ts`.

## What you will build

- A camera you orbit with `Left` and `Right` and move closer or farther with `Up` and `Down`.
- A grid, a red sphere, and a green cube drawn in **immediate mode**.
- A pedestal and a spinning box made from **retained scene nodes**.
- A directional light and an ambient light.
- A text overlay with the number of scene nodes.
- An optional model file that appears when it exists.

## Two ways to draw

- **Immediate mode**: you call a draw method such as `drawCube()` every frame. Nothing is kept. If you stop calling it, the shape is gone. Use it for prototypes, debug shapes, and things that change every frame.
- **Retained mode**: you create a **scene node** once and set its shape, color, and place. The engine draws it every frame until you hide or dispose it. Use it for the permanent parts of a scene. Nodes are objects from `game.sceneGraph`.

The world is right-handed, with +Y up, and its unit is the meter. A rotation about the Y axis is called a yaw, and it is measured in radians.

## Setup

Create a project that can load models, and a folder for them:

```sh
bornengine new Showroom --game-type 2.5d
cd Showroom
mkdir -p assets/models
```

The `2.5d` profile includes model loading. The default `2d` profile does not, so `loadModel` would report a failed load. The `3d` profile adds the physics library as well, which this guide does not need. See [Project commands](../../cli/project/) for the profiles.

The model is optional. To see it, put a glTF or GLB file at `assets/models/statue.glb`. Without the file the scene still runs, and the program prints a warning.

## Game loop

A 3D frame follows the same steps as a 2D frame. `loop(deltaTime)` changes state, and `render()` clears the screen and draws. In `render()`, you give the renderer a camera, draw 3D things, and end the pass. Text and other 2D drawing come after the pass.

This is a complete `main.ts` with an orbiting camera and three immediate-mode shapes:

```ts
import { Colors, Game } from '@bornengine/engine';
import type { Camera3D } from '@bornengine/engine';

class OrbitGame extends Game {
  private yaw = 0;

  constructor() {
    super({ window: { title: 'Orbit', width: 1024, height: 576 }, targetFps: 60 });
  }

  protected override loop(deltaTime: number): void {
    this.yaw += deltaTime * 0.5;
  }

  protected override render(): void {
    this.renderer.clear({ r: 20, g: 26, b: 38, a: 255 });

    const camera: Camera3D = {
      position: { x: Math.sin(this.yaw) * 10, y: 5, z: Math.cos(this.yaw) * 10 },
      target: { x: 0, y: 1, z: 0 },
      up: { x: 0, y: 1, z: 0 },
      fovy: 45,
      projection: 'perspective',
    };
    if (this.renderer.begin3D(camera)) {
      this.renderer.drawGrid(20, 1);
      this.renderer.drawCube({ x: -3, y: 0.5, z: 0 }, { x: 1, y: 1, z: 1 }, Colors.GREEN);
      this.renderer.drawSphere({ x: 3, y: 0.5, z: 0 }, 0.5, Colors.RED);
      this.renderer.end3D();
    }

    this.renderer.drawText('Orbiting camera', { x: 16, y: 16 }, 18, Colors.WHITE);
  }
}

new OrbitGame().run();
```

Run it with `bornengine run main.ts`.

How it works:

- A `Camera3D` has a `position`, a `target` it looks at, an `up` direction, a field of view `fovy` in degrees, and a `projection`: `'perspective'` or `'orthographic'`. With an orthographic camera, `fovy` is the height of the view in world units. Geometry nearer than 0.01 or farther than 1000 units is not drawn.
- `begin3D(camera)` starts the 3D pass and returns `false` if it cannot, for example when a pass is already open. `end3D()` closes it. Always pair them, and draw 3D things between them.
- `drawGrid(slices, spacing)`, `drawCube(position, size, color)`, and `drawSphere(position, radius, color)` take the **center** of the shape. A cube of height 1 at `y: 0.5` rests on the grid.
- `drawText` after `end3D()` draws in window pixels on top of the picture.
- The camera moves on a circle. `yaw` grows each frame, and the sine and cosine place the camera. Multiplying by `deltaTime` keeps the speed the same at any frame rate.

## Retained scene nodes

A node starts empty. You give it a shape and a material, and you place it. The next module has two helpers. `addBox` makes a box by extruding a rectangle upward. `addModel` loads a model file and puts it in a node.

```ts
import { Game } from '@bornengine/engine';
import type { Color, SceneNode } from '@bornengine/engine';

function addBox(
  game: Game,
  name: string,
  width: number,
  depth: number,
  height: number,
  color: Color,
  roughness: number,
  metalness: number,
): SceneNode {
  const node = game.sceneGraph.createNode({ name });
  if (!node.isLoaded) throw new Error(node.error ?? 'Could not create the scene node ' + name);
  const x = width / 2;
  const z = depth / 2;
  node.extrudePolygon(
    [
      { x: -x, y: 0, z: -z },
      { x, y: 0, z: -z },
      { x, y: 0, z },
      { x: -x, y: 0, z },
    ],
    height,
  );
  node.setColor(color);
  node.setPbr(roughness, metalness);
  return node;
}

function addModel(game: Game, path: string, x: number, y: number, z: number): SceneNode | null {
  const model = game.assets.loadModel(path);
  if (model === null || !model.isLoaded) return null;
  const node = game.sceneGraph.createNode({ name: path });
  if (!node.isLoaded || !node.attachModel(model)) return null;
  node.setTrs({ x, y, z }, 0, 1);
  return node;
}
```

- `createNode()` returns a node even when something goes wrong. Check `node.isLoaded`, and read `node.error` when it is `false`.
- `extrudePolygon(points, depth)` fills the outline you give it with a solid that extends from `y = 0` up to `y = depth`. It uses the `x` and `z` of each point. The engine calculates normals and texture coordinates. For other shapes, `updateGeometry(vertices, indices)` takes your own mesh: 12 numbers per vertex (position, normal, color, and texture coordinates).
- `setColor(color)` tints the node with 0 to 255 channels. `setPbr(roughness, metalness)` sets the material. **PBR** means physically based rendering: a roughness near 0 gives a mirror-like surface, and a metalness near 1 gives a metal.
- `setTrs(position, yaw, scale)` places a node with a position, a rotation about the Y axis in radians, and one uniform scale. For any other rotation or a non-uniform scale, call `setTransform(matrix)` with a column-major matrix of 16 numbers.
- `attachModel(model)` draws a loaded model through the node. `game.assets.loadModel(path)` caches the model by path, as it does for textures. Always check `isLoaded`: a missing file or a project without model support gives a model that did not load.
- Nodes belong to the game and are drawn on every frame. Call `node.setVisible(false)` to hide one. Call `node.dispose()` to remove one, which also removes its children. The game disposes the rest when it stops. `game.sceneGraph.nodeCount` counts the live nodes.

## Lights

The renderer clears its lights at the start of every frame. Add your lights from `render()`, every frame, before you begin the 3D pass:

```ts
import { Game } from '@bornengine/engine';

function applyLights(game: Game): void {
  game.sceneGraph.setAmbientLight({ r: 255, g: 255, b: 255, a: 255 }, 0.25);
  game.sceneGraph.addDirectionalLight({ x: 0.4, y: 1, z: 0.3 }, { r: 255, g: 244, b: 224, a: 255 }, 0.9);
}
```

- `setAmbientLight(color, intensity)` lights every surface equally, so that shadowed sides are not black.
- `addDirectionalLight(direction, color, intensity)` is a light that is infinitely far away, like the sun. The direction points from the scene toward the light, so `(0.4, 1, 0.3)` is a light above the scene. It does not need to be normalized.
- `addPointLight(position, range, color, intensity)` adds a light that fades to nothing at `range`.

## Complete example

Replace `main.ts` with this file:

```ts
import { Colors, Game, Key, Mathf } from '@bornengine/engine';
import type { Camera3D, Color, SceneNode } from '@bornengine/engine';

function addBox(
  game: Game,
  name: string,
  width: number,
  depth: number,
  height: number,
  color: Color,
  roughness: number,
  metalness: number,
): SceneNode {
  const node = game.sceneGraph.createNode({ name });
  if (!node.isLoaded) throw new Error(node.error ?? 'Could not create the scene node ' + name);
  const x = width / 2;
  const z = depth / 2;
  node.extrudePolygon(
    [
      { x: -x, y: 0, z: -z },
      { x, y: 0, z: -z },
      { x, y: 0, z },
      { x: -x, y: 0, z },
    ],
    height,
  );
  node.setColor(color);
  node.setPbr(roughness, metalness);
  return node;
}

function addModel(game: Game, path: string, x: number, y: number, z: number): SceneNode | null {
  const model = game.assets.loadModel(path);
  if (model === null || !model.isLoaded) return null;
  const node = game.sceneGraph.createNode({ name: path });
  if (!node.isLoaded || !node.attachModel(model)) return null;
  node.setTrs({ x, y, z }, 0, 1);
  return node;
}

function applyLights(game: Game): void {
  game.sceneGraph.setAmbientLight({ r: 255, g: 255, b: 255, a: 255 }, 0.25);
  game.sceneGraph.addDirectionalLight({ x: 0.4, y: 1, z: 0.3 }, { r: 255, g: 244, b: 224, a: 255 }, 0.9);
}

class ShowroomGame extends Game {
  private yaw = 0.6;
  private distance = 12;
  private spin = 0;
  private spinner: SceneNode | null = null;

  constructor() {
    super({ window: { title: 'Showroom', width: 1024, height: 576 }, targetFps: 60 });
  }

  protected override onStart(): void {
    addBox(this, 'Pedestal', 2, 2, 0.5, { r: 176, g: 124, b: 70, a: 255 }, 0.35, 0.8);
    this.spinner = addBox(this, 'Spinner', 1, 1, 1, { r: 70, g: 150, b: 220, a: 255 }, 0.5, 0.1);
    this.spinner.setTrs({ x: 0, y: 0.5, z: 0 });

    if (addModel(this, 'assets/models/statue.glb', 0, 0, -4) === null) {
      console.warn('The statue is off: could not load assets/models/statue.glb');
    }
  }

  protected override loop(deltaTime: number): void {
    if (this.input.isKeyDown(Key.LEFT)) this.yaw -= deltaTime;
    if (this.input.isKeyDown(Key.RIGHT)) this.yaw += deltaTime;
    if (this.input.isKeyDown(Key.UP)) this.distance -= 6 * deltaTime;
    if (this.input.isKeyDown(Key.DOWN)) this.distance += 6 * deltaTime;
    this.distance = Mathf.clamp(this.distance, 4, 24);

    this.spin += deltaTime;
    if (this.spinner !== null) this.spinner.setTrs({ x: 0, y: 0.5, z: 0 }, this.spin, 1);
  }

  protected override render(): void {
    this.renderer.clear({ r: 20, g: 26, b: 38, a: 255 });
    applyLights(this);

    const camera: Camera3D = {
      position: { x: Math.sin(this.yaw) * this.distance, y: 5, z: Math.cos(this.yaw) * this.distance },
      target: { x: 0, y: 1, z: 0 },
      up: { x: 0, y: 1, z: 0 },
      fovy: 45,
      projection: 'perspective',
    };
    if (this.renderer.begin3D(camera)) {
      this.renderer.drawGrid(20, 1);
      this.renderer.drawSphere({ x: 3, y: 0.5, z: 0 }, 0.5, Colors.RED);
      this.renderer.drawCube({ x: -3, y: 0.5, z: 0 }, { x: 1, y: 1, z: 1 }, Colors.GREEN);
      this.renderer.end3D();
    }

    this.renderer.drawText('Left/Right: orbit   Up/Down: zoom', { x: 16, y: 16 }, 18, Colors.WHITE);
    this.renderer.drawText('Scene nodes: ' + this.sceneGraph.nodeCount, { x: 16, y: 40 }, 18, Colors.LIGHTGRAY);
  }
}

new ShowroomGame().run();
```

Run it with `bornengine run main.ts`. The blue box spins on the pedestal, and the camera orbits.

What each part does:

- `onStart()` creates the permanent parts once: the pedestal, the spinner, and the optional statue. A game's `onStart` runs after the window exists, so creating nodes there is safe.
- `loop()` reads the keys and updates numbers. It moves the spinner by calling `setTrs` with a new yaw. Retained nodes change only when you call a method on them.
- `render()` clears, applies the lights, and runs the 3D pass. The retained nodes draw with the camera from `begin3D`. For that reason, call `begin3D` and `end3D` every frame, even if you draw no immediate shapes between them.
- The grid, the sphere, and the cube are redrawn every frame. They are gone from any frame where you do not draw them.
- The two lines of text are 2D drawing after the 3D pass.

## Limits to know

- A model needs a project with model support. In a `2d` project, `loadModel` reports a failed load.
- Leave the `renderMode` option out, or set it to `'3d'` or `'2.5d'`. With `renderMode: '2d'` the engine uses a faster 2D path that skips retained nodes.
- Do not start a pass inside another pass. Calling `begin3D` while a 2D or 3D pass is open returns `false`.
- Retained nodes belong to the `Game`, not to a `Scene`. Changing the active scene does not remove them.

## Next steps

- [Scene graph API](../../api/scene/) covers the node hierarchy, geometry, materials, lights, and picking.
- [Models API](../../api/models/) covers loading models and creating meshes, materials, and animations.
- [Skeletal animation](../skeletal-animation/) plays animated characters.
- [Add physics gameplay](../physics-gameplay/) puts bodies into a 3D scene.
- [Organize assets and worlds](../assets-and-worlds/) loads a whole level from a world file.
