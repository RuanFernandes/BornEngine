---
title: Models
description: Load 3D models and create meshes, materials, and skeletal animation resources.
section: API
order: 38
---

A **model** is a 3D object loaded from a file. A **mesh** is geometry you build in code. A **material** is a compiled shader that decides how a surface looks. An **animation** plays the skeletal clips of a model. You create all of them through an asset scope: `game.assets` keeps them until the game shuts down, and `scene.assets` releases them when that scene unloads. See [Assets](../assets/) for how scopes work.

Loading models, creating meshes, and creating animations need the `2.5d` or `3d` build profile. The `2d` profile leaves 3D model support out, so those calls return a resource with `isLoaded` set to `false`. See [Project commands](../../cli/project/).

To show a model, draw it between `renderer.begin3D(camera)` and `renderer.end3D()`, or attach it to a retained node. See [Scene graph](../scene/).

## Loading

`assets.loadModel(path)` returns a `Model`. Use a single-file `.glb`, or an `.obj` file. A `.gltf` file that points at separate `.bin` or image files is not supported, because `loadModel` does not resolve those external files.

```ts
import { Colors, Game, Model } from '@bornengine/engine';
import type { Camera3D } from '@bornengine/engine';

const camera: Camera3D = {
  position: { x: 0, y: 2, z: 6 },
  target: { x: 0, y: 1, z: 0 },
  up: { x: 0, y: 1, z: 0 },
  fovy: 60,
  projection: 'perspective',
};

class ModelViewer extends Game {
  private character: Model | null = null;

  constructor() {
    super({ window: { title: 'Model viewer', width: 800, height: 450 }, renderMode: '3d' });
  }

  protected override onStart(): void {
    const model = this.assets.loadModel('assets/models/character.glb');
    if (model === null || !model.isLoaded) {
      throw new Error(model?.error ?? 'Could not create the model resource');
    }
    this.character = model;
  }

  protected override render(): void {
    this.renderer.clear(Colors.SKYBLUE);
    if (this.character === null) return;
    if (this.renderer.begin3D(camera)) {
      this.renderer.drawGrid(20, 1);
      this.character.draw(this.renderer, { x: 0, y: 0, z: 0 });
      this.renderer.end3D();
    }
  }
}

new ModelViewer().run();
```

Check for `null` and for `isLoaded`. `loadModel` returns `null` only when the asset scope is disposed or the path is empty. When the file cannot be read or parsed, it returns a `Model` with `isLoaded` set to `false` and `error` set to `Unable to load model: <path>`.

The scope caches models by path. A second `loadModel` for the same path returns the same `Model`, even if the first load failed. To try again, call `assets.releaseModel(path)` first. `assets.getModel(path)` returns a cached model without loading anything.

`Model` members:

| Member | Meaning |
| --- | --- |
| `path`, `error`, `isLoaded`, `isDisposed` | State of the load. |
| `meshCount`, `materialCount` | How many meshes and materials the file holds. |
| `transform` | A 4 by 4 matrix as an array of 16 numbers. It is the identity matrix in this version. |
| `getBounds()` | The bounding box in the model's local space, or `null` when the model is not loaded. |
| `draw(renderer, position, scale = 1, tint?, rotationY?)` | Draws the model. `tint` defaults to white. `rotationY` is a rotation around the Y axis in **degrees**. It returns `false` if the model cannot be drawn. |
| `setFoliageWind(amount)` | Lets the wind bend the model. Use about 1 for a tree, less for a stiff shrub, and 0 to turn it off. The wind direction and strength come from `renderer.setWind`. |
| `dispose()` | Frees the model. |

`renderer.drawModel(model, position, scale, tint, rotationY)` does the same as `model.draw`. `renderer.drawModelTransform(model, matrix, tint)` draws under a full 16-number matrix instead, which lets you pitch and roll a model. The matrix includes position and scale. It does nothing for skinned models.

Release a model early with `assets.releaseModel(path)` or `assets.release(model)`. A scene scope disposes its models when the scene unloads.

## Primitives

Two kinds of built-in geometry need no file.

**Drawn primitives.** The renderer draws basic shapes in 3D mode: `drawCube(position, size, color)`, `drawCubeOutline`, `drawSphere(position, radius, color)`, `drawSphereOutline`, `drawCylinder(position, radiusTop, radiusBottom, height, color, slices?)`, `drawPlane(position, width, depth, color)`, `drawGrid(slices, spacing)`, and `drawRay(origin, direction, color)`. Call them between `begin3D` and `end3D`. They are for debug views and prototypes. They are not retained, so you repeat them every frame.

**Generated meshes.** `assets.createMesh(vertices, indices)` builds a `Mesh` from arrays you fill. `vertices` holds 12 numbers per vertex: position `x, y, z`, normal `nx, ny, nz`, color `r, g, b, a` from 0 to 1, and texture coordinates `u, v`. `indices` lists triangles, three vertex numbers each. It returns `null` if either array is empty or the scope is disposed, and a `Mesh` with `isLoaded` set to `false` if the upload fails. A `Mesh` has `draw(renderer, position, scale = 1, tint?, rotationY?)`, `isLoaded`, `error`, and `dispose()`. You can also attach a mesh to a node with `node.attachModel(mesh)`.

```ts
import { Colors, Game } from '@bornengine/engine';
import type { Camera3D, Mesh } from '@bornengine/engine';

const camera: Camera3D = {
  position: { x: 0, y: 4, z: 8 },
  target: { x: 0, y: 0, z: 0 },
  up: { x: 0, y: 1, z: 0 },
  fovy: 60,
  projection: 'perspective',
};

const GROUND_VERTICES: number[] = [
  -6, 0, -6, 0, 1, 0, 0.55, 0.6, 0.5, 1, 0, 0,
  6, 0, -6, 0, 1, 0, 0.55, 0.6, 0.5, 1, 1, 0,
  6, 0, 6, 0, 1, 0, 0.55, 0.6, 0.5, 1, 1, 1,
  -6, 0, 6, 0, 1, 0, 0.55, 0.6, 0.5, 1, 0, 1,
];
const GROUND_INDICES: number[] = [0, 1, 2, 0, 2, 3];

class PrimitivesGame extends Game {
  private ground: Mesh | null = null;

  constructor() {
    super({ window: { title: 'Primitives', width: 800, height: 450 }, renderMode: '3d' });
  }

  protected override onStart(): void {
    const mesh = this.assets.createMesh(GROUND_VERTICES, GROUND_INDICES);
    if (mesh === null || !mesh.isLoaded) {
      throw new Error(mesh?.error ?? 'Could not create the ground mesh');
    }
    this.ground = mesh;
  }

  protected override render(): void {
    this.renderer.clear(Colors.SKYBLUE);
    if (this.renderer.begin3D(camera)) {
      if (this.ground !== null) this.ground.draw(this.renderer, { x: 0, y: 0, z: 0 });
      this.renderer.drawCube({ x: -2, y: 0.5, z: 0 }, { x: 1, y: 1, z: 1 }, Colors.RED);
      this.renderer.drawSphere({ x: 0, y: 0.5, z: 0 }, 0.5, Colors.GREEN);
      this.renderer.drawCylinder({ x: 2, y: 0, z: 0 }, 0.4, 0.4, 1, Colors.BLUE);
      this.renderer.end3D();
    }
  }
}

new PrimitivesGame().run();
```

A `Mesh` cannot be edited after it is created. To change geometry, create a new mesh, or call `node.updateGeometry` on a retained node for occasional edits. See [Scene graph](../scene/).

## Materials and animation

### Materials

`assets.createMaterial(source, kind = 'opaque')` compiles a GPU material. `source` is WGSL shader text (WGSL is the shader language of the GPU backend) written against the engine's material interface, which is documented in `native/shared/shaders/material_abi.wgsl` inside the engine package. The source can `#include "material_abi.wgsl"`. `native/shared/shaders/materials/test_minimal.wgsl` in the same package is a short opaque example. The result is `null` when `source` is empty or the scope is disposed. When the shader does not compile, the error is printed to the error output and the `Material` has `isLoaded` set to `false` and `error` set to `Unable to compile material.`

`kind` chooses how the surface is drawn:

| Kind | Use |
| --- | --- |
| `'opaque'` | Solid surfaces. |
| `'cutout'` | Solid surfaces with holes, such as leaf cards and fences. The shader discards transparent pixels, and the surface is drawn on both sides. |
| `'transparent'` | Alpha-blended surfaces, sorted back to front. |
| `'additive'` | Glows and flares. The result does not depend on draw order. |
| `'refractive'` | Surfaces that sample the scene behind them, such as glass or water. |

`Material` members:

| Member | Meaning |
| --- | --- |
| `source`, `kind`, `error`, `isLoaded`, `isDisposed` | State. |
| `setParameters(values)` | Sends up to 64 numbers to the shader as per-material parameters. An empty array resets them to zero. |
| `setShadingModel(model)` | `SHADING_MODEL_DEFAULT_LIT` (0), `SHADING_MODEL_FOLIAGE` (1), or `SHADING_MODEL_SUBSURFACE` (2, which currently behaves like the default). The shader chooses what to do with it. |
| `setFoliage(transmission, amount, wrapFactor)` | Foliage lighting. `transmission` is a color with 0 to 255 components, and `amount` and `wrapFactor` range from 0 to 1. It has an effect only with `SHADING_MODEL_FOLIAGE`. |
| `setProbeVisible(visible)` | Whether the material draws into planar reflections. |
| `draw(renderer, model, position, scale = 1, tint?, meshIndex?)` | Draws a model or mesh with this material. Without `meshIndex`, it draws the whole model. |
| `dispose()` | Invalidates the material. |

```ts
import { Colors, Game, Material, Model } from '@bornengine/engine';
import type { Camera3D } from '@bornengine/engine';

declare const waterShader: string;

const camera: Camera3D = {
  position: { x: 0, y: 3, z: 8 },
  target: { x: 0, y: 0, z: 0 },
  up: { x: 0, y: 1, z: 0 },
  fovy: 60,
  projection: 'perspective',
};

class WaterGame extends Game {
  private water: Material | null = null;
  private pool: Model | null = null;

  constructor() {
    super({ window: { title: 'Material', width: 800, height: 450 }, renderMode: '3d' });
  }

  protected override onStart(): void {
    this.pool = this.assets.loadModel('assets/models/pool.glb');
    const material = this.assets.createMaterial(waterShader, 'transparent');
    if (material === null || !material.isLoaded) {
      throw new Error(material?.error ?? 'Could not create the water material');
    }
    material.setParameters([0.1, 0.3, 0.4, 1, 0.2]);
    this.water = material;
  }

  protected override render(): void {
    this.renderer.clear(Colors.SKYBLUE);
    if (this.water === null || this.pool === null) return;
    if (this.renderer.begin3D(camera)) {
      this.water.draw(this.renderer, this.pool, { x: 0, y: 0, z: 0 });
      this.renderer.end3D();
    }
  }
}

new WaterGame().run();
```

`waterShader` stands for the WGSL text of your material. Load it from a file or keep it in a string.

### Skeletal animation

An `Animation` plays the clips stored in a `.glb` file that has a skeleton. Create one per character: `assets.createAnimation(path)` makes a new controller each time, because each character needs its own playback state. Using the same file for the model and the animation keeps their rest poses in agreement. Clips are numbered from 0 in the order they appear in the file.

| Member | Meaning |
| --- | --- |
| `play(clip, fade = 0.15, speed = 1, looping = true)` | Fades to a clip over `fade` seconds. Calling it every frame with the clip you want is safe: asking for the clip that is already playing does nothing. |
| `setLayer(clip, weight, maskRoot, speed = 1, looping = false)` | Plays a second clip on the joints below `maskRoot`, which is a joint number from `findJoint`. Pass `-1` as `clip` to switch the layer off. Use it to attack while walking. |
| `update(deltaTime, position, scale = 1, rotationY = 0)` | Advances the clocks and uploads the pose. Call it once per character per frame. `rotationY` is in **radians**. |
| `isFinished()` | `true` after a non-looping clip has run past its end. |
| `getClipDuration(clip)` | The clip length in seconds, or 0. |
| `setRootMotion(enabled)` | Off by default. When on, the pose no longer carries the root's movement, and you must apply `getRootMotionDelta(axis)` to your character yourself, or the model animates in place. |
| `getRootMotionDelta(axis)` | The root movement from the last `update`, in model space. `axis` is 0, 1, or 2. |
| `findJoint(name)` | The number of a joint, or -1. Look it up once and keep it. |
| `getJointWorldTransformComponent(joint, component)` | One of the 16 numbers of a joint's matrix, column-major. Numbers 12, 13, and 14 are the position. The matrix is in model space, so apply the same position, scale, and rotation that you gave to `update`. |
| `isLoaded`, `error`, `isDisposed`, `dispose()` | State and lifetime. |

The pose that `update` uploads is used by the next skinned model you draw. Each `update` queues one pose, each draw of a skinned model takes the oldest queued pose, and poses nobody draws are dropped at the end of the frame. So update and draw each character as a pair, in the same order. For a skinned model, the position, scale, and rotation come from `update`. Pass the same position and scale to `draw`, and note that `draw` ignores its `rotationY` for skinned models.

```ts
import { Animation, Colors, Game, Model } from '@bornengine/engine';
import type { Camera3D } from '@bornengine/engine';

const CHARACTER_PATH = 'assets/models/character.glb';

const camera: Camera3D = {
  position: { x: 0, y: 2, z: 7 },
  target: { x: 0, y: 1, z: 0 },
  up: { x: 0, y: 1, z: 0 },
  fovy: 60,
  projection: 'perspective',
};

class CharacterGame extends Game {
  private model: Model | null = null;
  private animation: Animation | null = null;
  private x = -3;

  constructor() {
    super({ window: { title: 'Animation', width: 800, height: 450 }, renderMode: '3d' });
  }

  protected override onStart(): void {
    this.model = this.assets.loadModel(CHARACTER_PATH);
    this.animation = this.assets.createAnimation(CHARACTER_PATH);
    if (this.animation !== null && this.animation.isLoaded) this.animation.play(0);
  }

  protected override loop(deltaTime: number): void {
    this.x += deltaTime;
    if (this.x > 3) this.x = -3;
    if (this.animation !== null && this.animation.isLoaded) {
      this.animation.update(deltaTime, { x: this.x, y: 0, z: 0 });
    }
  }

  protected override render(): void {
    this.renderer.clear(Colors.SKYBLUE);
    const model = this.model;
    if (model === null || !model.isLoaded) return;
    if (this.renderer.begin3D(camera)) {
      model.draw(this.renderer, { x: this.x, y: 0, z: 0 });
      this.renderer.end3D();
    }
  }
}

new CharacterGame().run();
```

The example updates the animation in `loop` and draws in `render`, which runs later in the same frame. Pass the same position and scale to `update` and `draw`.

The native layer has no release call for materials and animation controllers yet. `dispose()` makes the wrapper unusable, but their native memory stays until the process ends. Create each material once and reuse it, and create animation controllers only for the characters you need. Models and meshes are freed on dispose.

## Next steps

- [Scene graph](../scene/) attaches models and meshes to retained nodes.
- [Skeletal animation guide](../../guides/skeletal-animation/) covers exporting a model and animation file.
- [Assets](../assets/) explains scopes, caching, and release.
- [3D scene guide](../../guides/3d-scene/) puts models, lights, and a camera together.
