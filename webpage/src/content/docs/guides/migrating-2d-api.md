---
title: Migrating a 2D game to the class-first API
description: Move a function-driven game loop to Game, Scene, GameObject, and reusable 2D components.
section: Guides
order: 66
---

BornEngine's current 2D API is organized around a `Game` instance. A game subclass owns its services, a `Scene` owns a level, and `GameObject` components describe what appears and behaves in that level. This guide maps the older function-driven style to those classes.

## Use Vector2D for runtime 2D values

Use the public `Vector2D` class for 2D coordinates, sizes, camera values, and movement data. `GameObject.transform.position` remains a 3D transform with a Z coordinate, so bridge a 2D spawn point to that transform explicitly. Persisted World2D documents continue to store plain JSON records such as `{ x, y }`; they do not serialize runtime vector instances.

```ts
import { Vector2D } from '@bornengine/engine';

const spawn = new Vector2D(96, 120);
const spriteSize = new Vector2D(32, 32);
const worldPosition = { x: spawn.x, y: spawn.y, z: 0 };
```

## Move the loop into a Game subclass

The older entry point created a window and passed standalone update and draw callbacks. In the class-first API, `Game.run()` calls lifecycle hooks on your subclass:

```ts
import { Colors, Game, Scene } from '@bornengine/engine';

class MyGame extends Game {
  private level: Scene | null = null;

  constructor() {
    super({
      window: { title: 'My Game', width: 800, height: 450 },
      targetFps: 60,
    });
  }

  protected override onStart(): void {
    const level = new Scene(this, { name: 'First level' });
    if (!this.scenes.changeTo(level)) {
      this.stop();
      return;
    }
    this.level = level;
  }

  protected override loop(deltaTime: number): void {
    // Update your own game state here.
    this.scenes.update(deltaTime);
  }

  protected override render(): void {
    this.renderer.clear({ r: 12, g: 18, b: 28, a: 255 });
    super.render();
    // Draw a screen-space HUD after the scene.
    this.renderer.drawText('My Game', { x: 16, y: 16 }, 20, Colors.WHITE);
  }

  protected override onStop(): void {
    // Release project-owned resources here if they are not owned by a Game or Scene.
  }
}

new MyGame().run();
```

`Game` calls `onStart()` before the loop, then calls `loop(deltaTime)` and `render()` for each frame. Scene updates stay explicit: call `this.scenes.update(deltaTime)` from your game loop. `super.render()` draws the active scene; code after it draws a HUD in screen coordinates. The normal subclass-driven `run()` lifecycle disposes the game after `onStop()`.

If a host already owns the frame loop, keep using `game.run({ update, render, onStop })` or `game.runFrame(...)` for an embedded surface. A subclass is the simplest entry point for a standalone game.

## Turn draw calls into scene components

For a one-off texture in a menu, `Renderer.drawTexture()` is still useful. For a game sprite, create a `SpriteSheet`, select a `SpriteFrame`, and attach a `SpriteRenderer` to a `GameObject`. Active scene components are drawn automatically by `super.render()`.

```ts
import { Game, GameObject, Scene, SpriteRenderer, SpriteSheet } from '@bornengine/engine';
import { Vector2D } from '@bornengine/engine';

function addPlayer(game: Game, scene: Scene): boolean {
  const texture = game.assets.loadTexture('assets/player.png');
  if (texture === null || !texture.isLoaded) {
    console.error(texture === null ? 'Asset manager is unavailable.' : texture.error);
    return false;
  }

  const sheet = new SpriteSheet(texture, { frameWidth: 32, frameHeight: 32 });
  const idle = sheet.gridFrame(0, 0);
  if (idle === null || sheet.error !== null) return false;

  const spawn = new Vector2D(96, 120);
  const spriteSize = new Vector2D(32, 32);
  const player = new GameObject({ name: 'Player', position: { x: spawn.x, y: spawn.y, z: 0 } });
  player.addComponent(new SpriteRenderer(idle, { size: spriteSize }));
  return scene.addNode(player) !== null;
}
```

Use `SpriteAnimator` for clips, state transitions, and markers; use `ParticleEmitter2D` for scene-owned 2D effects. The [2D production workflow](../2d-production-workflow/) combines these pieces in runnable projects.

## Replace a global level with a Scene

Create each level as a `Scene`, attach game objects with `scene.addNode(object)`, and switch through `game.scenes.changeTo(scene)`. Put per-frame behavior in the game subclass or in component `update(dt)` methods. Call `scene.own(resource)` for a resource that should be disposed when that scene unloads, such as a `PhysicsWorld2D` or scene-scoped audio manager.

```ts
import { Game, GameObject, Scene } from '@bornengine/engine';
import { Vector2D } from '@bornengine/engine';
import { PhysicsWorld2D } from '@bornengine/engine/physics2d';

class Level extends Scene {
  readonly physics: PhysicsWorld2D | null;

  constructor(game: Game) {
    super(game, { name: 'Level' });
    const gravity = new Vector2D(0, 900);
    this.physics = this.own(new PhysicsWorld2D(game, {
      gravity,
      fixedTimeStep: 1 / 60,
      maxSubSteps: 5,
    }));
  }

  override update(deltaTime: number): void {
    super.update(deltaTime);
    if (this.physics !== null) this.physics.step(deltaTime);
  }
}

const player = new GameObject({ name: 'Player' });
```

The physics world advances only when your code calls `step()`. Choose one place in the active scene's update order and step it once per rendered frame; don't also step it from individual bodies.

## Keep 2D and 3D world data separate

`WorldData`, `WorldInstance`, and `PrefabLibrary` belong to BornEngine's existing 3D world API. They are not the 2D level format. A 2D authored map uses `World2DDocument` (`bornengine.world2d`, version 1), validated with `validateWorld2D()` and loaded into a scene with `World2DLoader`.

The 2D loader reports validation and construction problems in its result instead of silently creating a partial level. Version 1 is the current schema; `migrateWorld2D()` currently accepts a valid v1 document by identity and rejects other versions. It does not yet convert legacy 3D `.world.json` documents into a 2D map.

## Move polling to named input actions

Direct `game.input.isKeyDown(...)` polling is still available. For remappable controls, create an `InputActionMap`, bind device inputs to action and axis names, and query the same snapshot during the frame:

```ts
import { Key } from '@bornengine/engine';

const controls = game.input.createActionMap();
controls.bindAxis('move-x', {
  negative: [{ kind: 'key', key: Key.LEFT }, { kind: 'key', key: Key.A }],
  positive: [{ kind: 'key', key: Key.RIGHT }, { kind: 'key', key: Key.D }],
});
controls.bindAction('jump', { kind: 'key', key: Key.SPACE });

// In loop(deltaTime):
const horizontal = controls.readAxis('move-x');
if (controls.wasPressed('jump')) startJump();
```

`Game.input.update()` advances its action maps at the beginning of every game frame, before `loop()` runs. Rebinding a named axis replaces its binding; actions can be extended with `bindAction()` or cleared with `unbindAction()` before installing a new binding.

## Migrate incrementally

You do not need to rewrite every renderer call at once. Start by making the game loop a `Game` subclass, move one level into `Scene`, then convert player and world visuals to components. Keep low-level drawing for a HUD or an effect that is intentionally drawn once; use scene components when you need ownership, transforms, ordering, animation, or automatic camera handling.
