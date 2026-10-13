---
title: 2D camera and viewport
description: Follow a target with a camera rig, scale a fixed logical view to the window, and add camera-relative parallax.
section: API
order: 37
---

A 2D game draws into a **world**, a coordinate space measured in game units. A **camera** decides which part of the world appears on screen. A **viewport** decides how the game's fixed logical size maps onto the real window. This page covers the pieces that do that work:

- `Camera2D` is a plain data record with four fields. `target` is the world point the camera looks at. `offset` is the screen position where that point appears. `rotation` is in degrees. `zoom` is a number above zero, where `1` means no zoom. You can pass one to `renderer.begin2D(camera, viewport?)` for a manual pass, or assign one to `scene.camera2D`.
- `CameraRig2D` is a component that moves a camera for you. It follows a game object, applies smoothing, a dead zone, bounds, zoom limits, and shake.
- `Viewport2D` maps a logical game size, such as 320 by 180, onto the window. The renderer and `game.input` share this mapping.
- `ParallaxLayer2D` offsets a layer by a fraction of the camera's movement.

Import `CameraRig2D`, `Viewport2D`, and `ParallaxLayer2D` from `@bornengine/engine`, or from `@bornengine/engine/camera2d`. The `Camera2D` type comes from `@bornengine/engine`.

## Camera rig

A `CameraRig2D` is a component. Attach it to a game object, and the rig moves the scene camera. The usual pattern is to put the rig on the object the camera follows. This is one example. A rig can follow any object, or none. With no `target` option, the rig follows the object it is attached to:

```ts
import { GameObject, Vec3 } from '@bornengine/engine';
import { GameComponent } from '@bornengine/engine/annotations';
import { CameraRig2D } from '@bornengine/engine/camera2d';

class Player extends GameObject {
  @GameComponent<CameraRig2D>({ smoothing: 0.12, bounds: { x: 0, y: 0, width: 1600, height: 900 } })
  private readonly playerCamera!: CameraRig2D;

  constructor() {
    super({ name: 'Player', position: new Vec3(200, 150, 0) });
  }
}
```

Set `scene.viewport2D` before you add the player, so the rig can center the target in the view. If the scene has no camera yet, the rig binds itself when the player is added. The decorator reads the class at runtime, so import `CameraRig2D` as a value, not with `import type`. Its options are the same as the constructor's options, passed as one object. The type argument `<CameraRig2D>` checks those options and gives you autocomplete. Without it, the options are not checked. Set `target: null` in them to keep the camera fixed at `cameraTarget`.

### Create the rig in code

Use this form when the camera belongs to its own object, or when the target is picked at run time. The camera is a `GameObject` subclass, so the scene only adds it and binds its rig:

```ts
import { CameraRig2D, GameObject, Scene, Vec3, Viewport2D } from '@bornengine/engine';
import type { Game } from '@bornengine/engine';

const VIEW_WIDTH = 480;
const VIEW_HEIGHT = 270;

class FollowCamera extends GameObject {
  readonly rig: CameraRig2D;

  constructor(target: GameObject) {
    super({ name: 'Camera' });
    this.rig = this.addRequiredComponent(
      new CameraRig2D({
        target,
        offset: { x: VIEW_WIDTH / 2, y: VIEW_HEIGHT / 2 },
        smoothing: 0.12,
        deadZone: { x: -24, y: -16, width: 48, height: 32 },
        bounds: { x: 0, y: 0, width: 1600, height: 900 },
        minZoom: 0.75,
        maxZoom: 2,
      }),
    );
  }
}

class Level extends Scene {
  constructor() {
    super({ name: 'level' });
    this.viewport2D = new Viewport2D({ width: VIEW_WIDTH, height: VIEW_HEIGHT, mode: 'fit' });

    const player = new GameObject({ name: 'Player', position: new Vec3(200, 150, 0) });
    this.addNode(player);

    const camera = new FollowCamera(player);
    this.addNode(camera);
    if (!this.bindCameraRig2D(camera.rig)) console.error(camera.rig.error ?? 'The camera rig could not be bound.');
  }
}
```

### Options

The options of `CameraRig2D` are:

| Option | Meaning |
| --- | --- |
| `target` | The `GameObject` to follow. The rig reads its world `x` and `y` every update. The default is the object the rig is attached to. |
| `targetOffset` | A point added to the target's position, for example to look ahead of the player. |
| `offset` | The screen position where the camera target appears. The default is the center of the scene viewport's logical size, recalculated every update. Without a viewport and without `viewSize`, the default is `{ x: 0, y: 0 }`, which draws the target in the top-left corner. Setting `offset` turns off the automatic centering. |
| `smoothing` | A time constant in seconds. The camera closes about 63 percent of the remaining distance after that many seconds, whatever the frame rate. The default `0` follows the target exactly. |
| `deadZone` | A rectangle measured from the camera center. The target can move inside it without moving the camera. |
| `bounds` | A world rectangle that the visible area must stay inside. When the rectangle is smaller than the view on one axis, the camera centers on it. |
| `viewSize` | The size of the visible area, used for `bounds` and the default `offset`. It defaults to the scene viewport's logical size. Without a viewport, it defaults to twice `offset`. |
| `zoom`, `minZoom`, `maxZoom` | The starting zoom and its limits. The limits default to `0.01` and `100`. |
| `rotation`, `cameraTarget` | The starting rotation in degrees and the starting camera position. |

Things to know about the rig:

- `bounds` assumes the target is drawn at the center of the view. Keep the default `offset`, or set it to half of the view size, whenever you use `bounds`.
- A rig with no `target` on a camera object that never moves keeps the camera still. Give the rig a `target` to follow another object.
- The rig updates when the scene updates, in the order objects were added. Add the camera object after the object it follows, so the camera reads the position from the same frame.
- `bindCameraRig2D` returns `false` when the rig's object is not in this scene yet, the rig was destroyed, the rig has an `error`, or the scene is unloaded.
- Invalid options do not throw. They set `rig.error` to a message, and the rig then does nothing: `update`, `setZoom`, `setOffset`, and `shake` have no effect, and the scene refuses to bind it.
- While the rig is bound, enabled, and active, `scene.camera2D` returns the rig's camera. Disabling the rig, removing it, or unloading the scene restores the camera you had assigned before binding.
- The `camera` property returns a snapshot with `offset`, `target`, `rotation`, and `zoom`. Its `offset` and `target` are `Vector2D` values, and changing them does not change the rig.

You can control the rig while the game runs:

```ts
import { CameraRig2D, Key } from '@bornengine/engine';
import type { GameObject, InputSystem } from '@bornengine/engine';

export function controlCamera(rig: CameraRig2D, input: InputSystem, boss: GameObject): void {
  if (input.isKeyPressed(Key.E)) {
    rig.shake({ amplitude: { x: 6, y: 6 }, duration: 0.3, seed: 7 });
  }
  if (input.isKeyPressed(Key.EQUAL)) rig.setZoom(rig.camera.zoom + 0.25);
  if (input.isKeyPressed(Key.MINUS)) rig.setZoom(rig.camera.zoom - 0.25);
  if (input.isKeyPressed(Key.B)) rig.setTarget(boss);
}
```

- `setZoom(zoom)` clamps to `minZoom` and `maxZoom`. It returns `false` for a value that is not above zero.
- `setTarget(target)` changes what the rig follows, and `setTarget(null)` makes it stop following. It returns `false` for a destroyed object.
- `shake({ amplitude, duration, seed?, envelope? })` adds a temporary offset in world units. `duration` must be above zero. Without an `envelope`, the shake is a fading oscillation, and the same `seed` always produces the same motion. With an `envelope`, which needs at least two offsets, the rig plays through your list evenly over the duration. `stopShake()` ends the shake at once.
- `setOffset(offset)` changes the screen position of the target, for example after you change the logical size.

## Viewport scaling and coordinates

A viewport gives your game one fixed logical size, so you can design for 320 by 180 and let the engine scale it to any window. Set `scene.viewport2D` to a `Viewport2D`, or pass the viewport to `renderer.begin2D(camera, viewport)` for a manual pass. The `mode` option chooses how the logical area is scaled:

| Mode | Behavior | 320 by 180 in a 1000 by 720 window |
| --- | --- | --- |
| `fit` (default) | Scales evenly until one axis fills the window. Bars appear on the other axis. | Scale 3.125, bars above and below. |
| `integer` | Scales by a whole number, and falls back to a fractional fit when the window is smaller than the logical size. Use it for pixel art. | Scale 3, bars on all sides. |
| `stretch` | Fills both axes and changes the aspect ratio. | Scale 3.125 across and 4 down, no bars. |

Drawing is clipped to the scaled logical area. The bars show whatever you passed to `renderer.clear(color)`. A viewport with a width or height that is not above zero, or a mode that does not exist, sets `viewport.error` and falls back to a 1-to-1 mapping.

The following game draws a 320 by 180 area with a camera pass and converts a mouse click into logical coordinates:

```ts
import { Colors, Game, MouseButton, Vector2D, Viewport2D } from '@bornengine/engine';
import type { Camera2D } from '@bornengine/engine';

class PixelGame extends Game {
  private readonly viewport = new Viewport2D({ width: 320, height: 180, mode: 'integer' });
  private readonly camera: Camera2D = {
    offset: { x: 0, y: 0 },
    target: { x: 0, y: 0 },
    rotation: 0,
    zoom: 1,
  };
  private marker: Vector2D | null = null;

  constructor() {
    super({ window: { title: 'Pixel view', width: 960, height: 540 } });
  }

  protected override loop(_deltaTime: number): void {
    if (!this.input.isMouseButtonPressed(MouseButton.LEFT)) return;
    this.marker = this.viewport.screenToWorld(
      this.input.getMousePosition(),
      this.camera,
      this.input.getScreenWidth(),
      this.input.getScreenHeight(),
    );
  }

  protected override render(): void {
    this.renderer.clear(Colors.BLACK);
    if (!this.renderer.begin2D(this.camera, this.viewport)) return;
    this.renderer.drawRectangle({ x: 0, y: 0, width: 320, height: 180 }, Colors.DARKBLUE);
    if (this.marker !== null) this.renderer.drawCircle(this.marker, 4, Colors.GOLD);
    this.renderer.end2D();
  }
}

new PixelGame().run();
```

`Viewport2D.screenToWorld(position, camera, screenWidth, screenHeight)` returns `null` when the position falls in a bar, because no part of the game is drawn there. `Viewport2D` also has `worldToScreen(position, camera, screenWidth, screenHeight)` for the opposite direction. `screenToLogical(position, screenWidth, screenHeight)` and `logicalToScreen(position, screenWidth, screenHeight)` skip the camera, and `getTransform(screenWidth, screenHeight)` returns the scale and offsets.

When your game uses scenes, you can skip the arguments. `game.input.screenToWorld(position)` and `game.input.worldToScreen(position)` use the current scene's camera and viewport:

- With a viewport but no camera, they use an identity camera, so the result is in logical coordinates.
- They return `null` for a position in a bar, for values that are not finite, and when there is neither a camera nor a viewport. In that last case, pass a camera as the second argument.
- They take the window size from `game.window.width` and `game.window.height`. Those values come from your `Game` options and from `window.resize()`, and the engine does not update them when a player resizes a desktop window. If your window is resizable, use the viewport method above with `game.input.getScreenWidth()` and `getScreenHeight()`, which always report the current size.

Without a viewport, drawing and input coordinates stay in the window's own pixels.

Inside a camera pass, `renderer.isRectVisibleIn2D(rect)` tells you whether a world-space rectangle is in view. Sprites and tilemaps use it to skip drawing what is off screen, and you can use it in your own components.

## Parallax layers

Parallax makes distant layers appear to move more slowly than the foreground. Add a `ParallaxLayer2D` to a game object. Its `factor` is the fraction of the camera's movement that the layer seems to follow:

- `1` is the default and follows the world normally, so the layer gets no extra offset.
- `0` holds the layer still on screen.
- A value between the two, such as `0.25`, makes the layer drift slowly. `factor` can be one number, or `{ x, y }` to set each axis.

```ts
import { Colors, GameObject, ParallaxLayer2D } from '@bornengine/engine';
import type { Scene } from '@bornengine/engine';

export function addMountains(scene: Scene): GameObject | null {
  const layerObject = new GameObject({ name: 'Mountains' });
  layerObject.addComponent(
    new ParallaxLayer2D({
      factor: { x: 0.25, y: 0.5 },
      renderOrder: -10,
      draw: (renderer, offset) => {
        for (let index = 0; index < 8; index++) {
          const left = index * 300 + offset.x;
          const base = 360 + offset.y;
          const peak = 200 + offset.y;
          renderer.drawTriangle({ x: left, y: base }, { x: left + 150, y: peak }, { x: left + 300, y: base }, Colors.DARKGRAY);
        }
      },
    }),
  );
  return scene.addNode(layerObject);
}
```

How parallax works:

- The layer measures how far the camera moved from the position it first saw, and offsets by that distance times `1 - factor`. The first frame has no offset. `resetAnchor(camera)` makes the camera's current position the new zero point.
- A `draw(renderer, offset)` callback runs in the component's render step, in ascending `renderOrder`. Add `offset` to the positions you draw. A negative `renderOrder` draws the layer behind the rest of the scene.
- `SpriteRenderer` components on the same object, or on any child of a layer's object, apply the layer's offset automatically. You can also call `layer.offsetForCamera(camera)` yourself, or `getParallaxOffset(object, camera)` to sum the offsets from an object and its parents.
- Without an active camera pass, the offset is zero.

## Next steps

- [Core](../core/) explains camera passes with `begin2D` and `end2D`.
- [Game objects](../game/) covers scenes, `bindCameraRig2D`, and the component lifecycle.
- [Sprites](../sprites/) draws the images that parallax layers move.
- [2D game](../../guides/2d-game/) builds a level with a following camera.
