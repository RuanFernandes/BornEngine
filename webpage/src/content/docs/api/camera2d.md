---
title: 2D camera and viewport
description: Follow targets, scale a logical 2D view, and add camera-relative parallax.
section: API / Game
order: 37
---

`Camera2D` remains a plain data record for direct renderer passes. `CameraRig2D` adds target following, dead zones, smoothing, bounds, zoom limits, and shake as a scene component. `Viewport2D` maps a logical game size into the current window, and the renderer and input service share that mapping.

## Camera rig

Attach a rig to a scene object, then bind it to the scene. The `camera` getter returns a detached `Camera2DSnapshot`; its `target` and `offset` values are `Vector2D` instances, so you can use vector helpers without changing the rig's state. Disabling, removing, or detaching the rig restores the camera that was active before it was bound.

```ts
import { CameraRig2D, GameObject, Scene } from '@bornengine/engine';

function followPlayer(scene: Scene, player: GameObject): CameraRig2D | null {
  const cameraObject = new GameObject({ name: 'Camera' });
  const rig = new CameraRig2D({
    target: player,
    offset: { x: 160, y: 90 },
    smoothing: 0.12,
    deadZone: { x: -24, y: -16, width: 48, height: 32 },
    bounds: { x: 0, y: 0, width: 640, height: 360 },
    minZoom: 0.75,
    maxZoom: 2,
  });
  cameraObject.addComponent(rig);
  if (scene.addNode(cameraObject) === null || !scene.bindCameraRig2D(rig)) return null;
  return rig;
}
```

Smoothing is exponential in seconds, so changing frame subdivisions does not change the response. Bounds keep the camera inside the configured world rectangle and center it when that rectangle is smaller than the visible area. Call `setZoom()` for a clamped runtime change, `shake({ amplitude, duration, seed })` for a repeatable shake, or pass a normalized `envelope` of offsets for authored shake.

Camera options accept `Vector2DLike` values such as `{ x, y }`, which are convenient at configuration and JSON boundaries. Values returned by `CameraRig2D.camera` are detached `Vector2D` snapshots.

## Viewport scaling and coordinates

Set `scene.viewport2D` to define the logical game area. `fit` keeps its aspect ratio with centered bars, `integer` chooses whole-number upscales and falls back to fractional fit below 1x, and `stretch` fills both window axes. The transform is recalculated from the renderer's logical window size after resize.

```ts
import { Scene, Viewport2D } from '@bornengine/engine';
import type { Game } from '@bornengine/engine';

function setPixelViewport(scene: Scene, game: Game): void {
  scene.viewport2D = new Viewport2D({ width: 320, height: 180, mode: 'integer' });
  const world = game.input.screenToWorld({ x: 640, y: 360 });
  const screen = world === null ? null : game.input.worldToScreen(world);
  console.log(screen);
}
```

When a viewport is configured without a camera, rendering and input use an identity camera so logical coordinates still scale correctly. Pass a `Camera2D` explicitly when converting against a camera outside the current scene. Pointer positions inside letterbox bars return `null`. Without a configured viewport, the renderer and input keep the current full-window coordinates.

## Parallax layers

Attach `ParallaxLayer2D` to a parent object to offset descendant sprites by a camera-relative fraction. A factor of `1` follows normal camera movement; `0` holds the layer still on screen. The component participates in ordinary ascending `renderOrder` dispatch and may draw additional layer content through its callback.

```ts
import { GameObject, ParallaxLayer2D } from '@bornengine/engine';

function createBackground(): GameObject {
  const layer = new GameObject({ name: 'Distant mountains' });
  layer.addComponent(new ParallaxLayer2D({ factor: { x: 0.25, y: 0.5 }, renderOrder: -10 }));
  return layer;
}
```

`offsetForCamera(camera)` exposes the layer offset for custom renderers, and `resetAnchor(camera)` makes the supplied camera position the new zero point. A missing camera yields a zero offset.
