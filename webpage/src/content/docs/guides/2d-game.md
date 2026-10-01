---
title: Build a 2D game
description: Use Game subclasses, scene components, sprite animation, and marker-driven particle effects.
section: Guides
order: 70
---

This path builds a small 2D game around one `Game` subclass. A `Scene` owns gameplay objects, sprite components draw automatically, and animation markers can trigger effects at the right frame.

## Setup

Create a project and install BornEngine:

```sh
bornengine new TinyArena --package-manager npm
cd TinyArena
npm install @bornengine/engine
mkdir -p assets/sprites
```

Create `main.ts` and add your atlas at `assets/sprites/hero.png`. It can be a uniform grid or a set of named rectangles. Keep every frame used by one animation or emitter on the same `SpriteSheet` texture. Run the game with `bornengine run main.ts` when those files are in place.

## Game loop

The game subclass owns startup, simulation, and rendering. Advance scene components explicitly in `loop`; the base `render()` draws the current scene, including its `SpriteRenderer` and `ParticleEmitter2D` components.

```ts
import { Colors, Game } from '@bornengine/engine';

class Arena extends Game {
  protected override loop(deltaTime: number): void {
    this.scenes.update(deltaTime);
  }

  protected override render(): void {
    this.renderer.clear(Colors.SKYBLUE);
    super.render();
    this.renderer.drawText('WASD move · Space attack', { x: 18, y: 18 }, 18, Colors.WHITE);
  }
}
```

## Camera presentation

Use `CameraRig2D` for target following and set a logical viewport when the game needs stable composition across window sizes. Scene rendering and `game.input.screenToWorld()` use the same camera and viewport mapping. HUD drawing after `super.render()` stays in screen coordinates.

```ts
import { CameraRig2D, GameObject, Scene, Viewport2D } from '@bornengine/engine';

function configureCamera(scene: Scene, player: GameObject): void {
  scene.viewport2D = new Viewport2D({ width: 320, height: 180, mode: 'integer' });
  const cameraObject = new GameObject({ name: 'Camera' });
  const camera = new CameraRig2D({
    target: player,
    offset: { x: 160, y: 90 },
    smoothing: 0.15,
    deadZone: { x: -20, y: -12, width: 40, height: 24 },
  });
  cameraObject.addComponent(camera);
  scene.addNode(cameraObject);
  scene.bindCameraRig2D(camera);
}
```

Choose `fit` for centered letterboxing, `integer` for crisp pixel-art upscales, or `stretch` when the composition should fill every window shape. `ParallaxLayer2D` on a parent object offsets its descendant sprites by a camera-relative amount.

`Game.input.update()` advances all action maps once per frame before `loop()` runs. Create an action map with `this.input.createActionMap()`, bind keys or axes during startup, and read its snapshot in `loop()`.

Attach the animator and emitter beside the renderer on the player object. Keyframe markers then trigger effects at their authored frame:

```ts
import { GameObject, ParticleEmitter2D, SpriteAnimator, SpriteSheet } from '@bornengine/engine';

function addImpactEffect(player: GameObject, animator: SpriteAnimator, sheet: SpriteSheet): void {
  const spark = sheet.gridFrame(3, 0);
  if (spark === null) return;

  const impact = new ParticleEmitter2D({
    frames: [spark],
    capacity: 64,
    lifetime: { min: 0.2, max: 0.5 },
    speed: { min: 40, max: 100 },
    startSize: { min: 4, max: 8 },
    endSize: { min: 0, max: 2 },
  });
  player.addComponent(impact);
  animator.onMarker = (marker) => {
    if (marker === 'impact') impact.emitBurst(16);
  };
}
```

## Complete example

The complete runnable project includes a pixel-art atlas, movement and attack controls, a camera, idle/walk/attack states, animation markers, and both burst and continuous particle emission. Browse the [sprite animation example on GitHub](https://github.com/RuanFernandes/BornEngine/tree/main/examples/sprite-animation/). After cloning BornEngine, run it with:

```sh
cd examples/sprite-animation
npm install
bornengine run main.ts
```

Use WASD or the arrow keys to move and Space to attack. See the [Sprites API](../../api/sprites/) for named atlas frames, crossfades, condition types, emitter shapes, and local/world particle space.

## Next steps

Use the [2D camera API](../../api/camera2d/) for camera rigs, viewport mapping, and parallax, the [Input API](../../api/input/) for action maps and gamepad bindings, the [Game API](../../api/game/) for object and scene lifecycles, and the [Textures API](../../api/textures/) for image ownership and filtering. The [VFX API](../../api/vfx/) covers the separate 3D particle and decal systems.

For durable typed saves, use [GameDatabase](../../api/storage/) and open it before starting the game loop. The [2D platformer sample](https://github.com/RuanFernandes/BornEngine/tree/main/examples/2d-platformer) includes database migrations and a save/restore flow alongside slopes, one-way platforms, and CCD. For user-authored JavaScript behaviors, see the [embedded scripting API](../../api/scripting/).
