---
title: Models
description: Load meshes, draw primitives, compile materials, instance geometry, and drive skeletal animation.
section: API / Models
order: 36
---

The models module covers immediate 3D drawing and the lower-level mesh/material boundary. Use it for prototypes and custom render passes; use the [scene graph](../scene/) when objects need persistent transforms, picking, or per-node ownership.

The [3D scene recipe](../../guides/3d-scene/) composes this module with cameras, grids, scene nodes, and teardown.

## Loading

`loadModel()` returns a `Model` handle with mesh and material counts. Supported asset loading includes native glTF/GLB assets and the engine's OBJ path. `getModelBounds()` reads the cached local-space bounds. Release a model when its owning scene or tool is torn down with `unloadModel()`.

```ts
import {
  drawModel,
  drawModelRotated,
  getModelBounds,
  loadModel,
  unloadModel,
} from '@bornengine/engine/models';

const crate = loadModel('assets/models/crate.glb');
const bounds = getModelBounds(crate);

export function drawCrate() {
  drawModel(crate, { x: 0, y: 0, z: -4 }, 1, { r: 255, g: 255, b: 255, a: 255 });
  drawModelRotated(crate, { x: 2, y: 0, z: -4 }, 1, 45, { r: 255, g: 220, b: 180, a: 255 });
}

export function destroyCrate() {
  console.log('local bounds', bounds.min, bounds.max);
  unloadModel(crate);
}
```

`drawModelRotated()` uses degrees for its Y rotation and `drawModelTransform()` accepts a 16-element column-major matrix. Tints use the engine-wide 0–255 RGBA convention. For a loading screen, `loadModelAsync()` stages and commits one model; `stageModels()`/`stageModelsSync()` and `commitModel()` expose the batch boundary explicitly.

## Primitives

The immediate primitive helpers are useful for blockouts, debug geometry, and fallback visuals. `drawCube`, `drawSphere`, `drawCylinder`, `drawPlane`, `drawGrid`, and `drawRay` render directly in the current 3D mode.

```ts
import {
  drawCube,
  drawGrid,
  drawRay,
  drawSphere,
} from '@bornengine/engine/models';

const white = { r: 255, g: 255, b: 255, a: 255 };
drawGrid(20, 1);
drawCube({ x: 0, y: 0.5, z: -4 }, 1, 1, 1, white);
drawSphere({ x: 1.5, y: 1, z: -4 }, 0.5, { r: 184, g: 242, b: 61, a: 255 });
drawRay({ x: 0, y: 1, z: 0 }, { x: 0, y: 0, z: -1 }, { r: 255, g: 80, b: 80, a: 255 });
```

For reusable geometry, `genMeshCube()` and `genMeshHeightmap()` return `Model` handles. `createMesh()` accepts 12 floats per vertex in this order: position, normal, RGBA color, and UV (`[x, y, z, nx, ny, nz, r, g, b, a, u, v]`). The index list is a flat triangle list.

```ts
import { createMesh, drawModel, unloadModel } from '@bornengine/engine/models';

const vertices = [
  -1, 0, -1,  0, 1, 0,  255, 255, 255, 255,  0, 0,
   1, 0, -1,  0, 1, 0,  255, 255, 255, 255,  1, 0,
   0, 0,  1,  0, 1, 0,  255, 255, 255, 255,  0.5, 1,
];
const triangle = createMesh(vertices, [0, 1, 2]);

drawModel(triangle, { x: 0, y: 0, z: -3 }, 1, { r: 255, g: 255, b: 255, a: 255 });
unloadModel(triangle);
```

Create and destroy generated meshes outside the frame loop. The array-to-mesh upload is a load-time operation, not a streaming path.

## Materials and animation

Material compilation is file-backed or source-backed. `compileMaterialFromFile()` can watch a WGSL file for changes during native development; `loadMaterial()` combines the shader path, bucket, and optional numeric parameters. Draw one primitive with `drawMeshWithMaterial()` or every primitive in a model with `drawModelWithMaterial()`.

### Hot reload during native development

Enable the platform crate's `dev` feature in the game's `perry.toml` to reload file-backed WGSL materials while iterating. The feature is opt-in and does not affect Web/WASM builds. Leave it out of release configuration to avoid including the filesystem watcher in shipped native builds.

```toml
[native-library."@bornengine/engine"]
features = ["dev"]
```

This keeps the platform's normal default features. If the game already disables defaults, add `dev` alongside whichever engine features it needs.

```ts
import {
  drawModelWithMaterial,
  loadMaterial,
  loadModel,
} from '@bornengine/engine/models';

const mesh = loadModel('assets/models/robot.glb');
const material = loadMaterial({
  shader: 'assets/shaders/robot.wgsl',
  bucket: 'opaque',
  params: [0.8, 0.1],
});

drawModelWithMaterial(
  material,
  mesh,
  { x: 0, y: 0, z: -6 },
  1,
  { r: 255, g: 255, b: 255, a: 255 },
);
```

The dedicated `compileTransparentMaterial()`, `compileRefractiveMaterial()`, `compileAdditiveMaterial()`, and `compileMaterialCutout()` helpers select common render buckets. `compileMaterialInstanced()` plus `createInstanceBuffer()` and `drawMeshWithMaterialInstanced()` is the path for many copies of one mesh; the buffer uses nine floats per instance: position, Y rotation, scale, and RGBA tint.

Skeletal animation has a shared clip handle and cheap per-character instances. Call `loadModelAnimation()` once, `instantiateAnimation()` for each character, select clips with `animPlay()`, and advance one mixer per frame with `animUpdate()`.

```ts
import {
  animFinished,
  animPlay,
  animSetLayer,
  animUpdate,
  findJoint,
  instantiateAnimation,
  loadModelAnimation,
} from '@bornengine/engine/models';

const clips = loadModelAnimation('assets/models/hero.glb');
const hero = instantiateAnimation(clips);
const spine = findJoint(hero, 'spine');

export function updateHero(dt: number, moving: boolean, attacking: boolean) {
  animPlay(hero, moving ? 1 : 0, 0.15, 1, true);
  animSetLayer(hero, attacking ? 2 : -1, attacking ? 1 : 0, spine, 1, false);
  animUpdate(hero, dt, 1, 0, 0, -5, 0);
  if (attacking && animFinished(hero)) console.log('attack finished');
}
```

Use `animSetRootMotion()` only when gameplay consumes `animRootDelta()` and moves the character controller from the animation. For sockets, cache `findJoint()` results during loading; `jointWorld()` exposes one component of the cached joint transform.
