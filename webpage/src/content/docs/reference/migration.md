---
title: Migrate to the class-first API
description: Replace the old flat function API with Game-owned classes and services, and move off the removed callback runner and GameStorage.
section: Reference
order: 81
---

BornEngine 0.6.0 replaced the old collection of global functions with classes. A `Game` now owns the window, renderer, input, audio, scenes, and assets, and you call methods on those services instead of free functions. The current release, 0.18.2, keeps that model. It has no aliases for the old functions: `initWindow`, `drawRect`, `loadTexture`, and the rest are no longer part of the public API.

This page maps the old calls to the current ones. If you are coming from 0.5, read all of it. If you are coming from 0.6 through 0.10, you can skip to [Current lifecycle and data APIs](#current-lifecycle-and-data-apis).

## What changed, by release

| Release | Change |
| --- | --- |
| 0.6.0 | The class-first API replaces the flat functions. |
| 0.7.0 | `Game` gains the subclass hooks `onStart()`, `loop()`, `render()`, and `onStop()`. |
| 0.10.0 | `Vector2D` replaces `Vec2`. `GameStorage` is added. |
| 0.11.0 | `Game.run(callbacks)` and `GameStorage` are removed. `Game.run()` returns a `Promise`. `GameDatabase` is added. |

## Application lifecycle

In 0.5 you opened a window, wrote your own loop, and closed the window yourself:

```text
initWindow(800, 450, 'My game');
setTargetFPS(60);
while (!windowShouldClose()) {
  beginDrawing();
  clearBackground(Colors.DARKBLUE);
  drawRect(100, 100, 50, 50, Colors.RED);
  endDrawing();
}
closeWindow();
```

Today you subclass `Game`. The engine owns the loop and calls your hooks:

```ts
import { Colors, Game } from '@bornengine/engine';

class MyGame extends Game {
  private x = 100;

  constructor() {
    super({ window: { title: 'My game', width: 800, height: 450 }, targetFps: 60 });
  }

  protected override loop(deltaTime: number): void {
    this.x += 60 * deltaTime;
  }

  protected override render(): void {
    this.renderer.clear(Colors.DARKBLUE);
    this.renderer.drawRectangle({ x: this.x, y: 100, width: 50, height: 50 }, Colors.RED);
  }
}

new MyGame().run();
```

| 0.5 | Current |
| --- | --- |
| `initWindow(width, height, title)` | Pass `{ window: { width, height, title } }` to the `Game` constructor. |
| `windowShouldClose()` loop, or `runGame(update)` | `game.run()` on a `Game` subclass that overrides `loop(deltaTime)` and `render()`. |
| `beginDrawing()` and `endDrawing()` | The engine does both around every frame. |
| `closeWindow()` | `this.stop()` inside a hook, or `game.dispose()` for a game that never ran. |
| `setWindowTitle(title)` | `game.window.setTitle(title)` |
| `setTargetFPS(fps)` | The `targetFps` option of the `Game` constructor. |
| `getDeltaTime()` | The `deltaTime` argument of `loop()`. |
| `toggleFullscreen()` | `game.window.toggleFullscreen()` |
| `takeScreenshot(path)` | `game.renderer.screenshot(path)` |

## Services and resources

Every subsystem is now a property of the `Game`, and resources are objects instead of numbers.

| 0.5 | Current |
| --- | --- |
| `clearBackground(color)` | `game.renderer.clear(color)` |
| `drawRect(x, y, width, height, color)` | `game.renderer.drawRectangle({ x, y, width, height }, color)` |
| `drawCircle(x, y, radius, color)` | `game.renderer.drawCircle({ x, y }, radius, color)` |
| `drawText(text, x, y, size, color)` | `game.renderer.drawText(text, { x, y }, size, color)` |
| `loadTexture(path)` and `unloadTexture(texture)` | `game.assets.loadTexture(path)` and `game.assets.releaseTexture(path)` |
| `loadModel(path)` and `unloadModel(model)` | `game.assets.loadModel(path)` and `game.assets.releaseModel(path)` |
| `loadFont(path, size)` | `game.assets.loadFont(path, size)` |
| `loadSound(path)` and `playSound(sound)` | `game.assets.loadSound(path)` and `sound.play()` |
| `loadMusic(path)`, `playMusic(music)`, and `updateMusicStream(music)` | `game.assets.loadMusic(path)` and `music.play()`. The game streams every music resource once per frame. |
| `isKeyDown(key)`, `getMouseX()`, `getMouseY()` | `game.input.isKeyDown(key)`, `game.input.getMouseX()`, `game.input.getMouseY()` |
| `createVirtualJoystick()` and `getMovementInput()` | `game.mobile.createJoystick(options)` and `game.mobile.movementInput()` |
| `createSceneNode()` and `setSceneNodeTrs(node, x, y, z, yaw, scale)` | `game.sceneGraph.createNode()` and `node.setTrs(position, yaw, scale)` |
| `createWorld(config)` and `step(world, deltaTime)` from the physics module | `new PhysicsWorld(game, options)` and `world.step(deltaTime)` |

Sounds and music can also be created through `game.audio.loadSound(path)` and `game.audio.loadMusic(path)`. The calls above use `game.assets` because it is the one place that also caches and releases resources.

## Resource ownership changes

Resources used to be numbers that you freed yourself. Now they are objects that belong to an owner, and the owner releases them.

- **Create assets through the scope that should own them.** Use `game.assets` for resources shared across scenes. Use `scene.assets` for resources that should go away when the scene unloads. `Texture` has no public constructor, so `new Texture(...)` is not an option.
- **Some systems still take the `Game`.** `new PhysicsWorld(game, options)` and `new ColyseusClient(game, endpoint)` belong to one game and receive it when you create them.
- **Check for failure.** A load can return `null`, or an object whose `isLoaded` is `false` and whose `error` explains why. Draw calls skip a resource that is not loaded.
- **Release what you create yourself.** The `Game` and each `Scene` free the resources they still own when they end. Dispose anything else when its lifetime ends.
- **Resources do not move between games.** A draw call refuses a resource that belongs to another `Game`, and native handles are not part of the public API.
- **Only one game can be active.** A second `Game` created while another is active reports `Only one BornEngine Game may be active at a time.` in `game.error`. Dispose the first game before you create the next. A host that owns a native window uses an embedded window and calls `runFrame()` from its own scheduler.
- **Value types stay plain.** `Vec3`, `Quat`, `Matrix4`, colors, and rectangles are ordinary values that need no game.

```ts
import { Game, Scene } from '@bornengine/engine';
import type { Texture } from '@bornengine/engine';

class Level extends Scene {
  private background: Texture | null = null;

  constructor(game: Game) {
    super(game, { name: 'level' });
    this.background = this.assets.loadTexture('assets/background.png');
    if (this.background === null || !this.background.isLoaded) {
      console.error(this.background?.error ?? 'Could not load the background.');
    }
  }
}
```

The texture belongs to the level's asset scope, so it is released when the level unloads and you do not release it yourself.

## 2D camera and coordinates

| 0.5 | Current |
| --- | --- |
| `Vec2` (removed in 0.10.0) | `Vector2D`, or a plain `{ x, y }` object wherever a position is accepted |
| `beginMode2D(camera)` and `endMode2D()` | `game.renderer.begin2D(camera)` and `game.renderer.end2D()` |
| `getScreenToWorld2D(position, camera)` | `game.input.screenToWorld(position, camera?, viewport?)` |
| `getWorldToScreen2D(position, camera)` | `game.input.worldToScreen(position, camera?, viewport?)` |

`Camera2D` is still a plain record (`offset`, `target`, `rotation`, `zoom`), and you can still pass one to `begin2D()`. For a scene camera that follows a target, attach a `CameraRig2D` component to a `GameObject` and bind it with `scene.bindCameraRig2D(rig)`. Set `scene.viewport2D` to a `Viewport2D` when the game uses a fixed logical resolution. The input conversions then use the scene's camera and viewport by default, and you can still pass your own. A position inside a letterbox bar converts to `null`.

```ts
import { CameraRig2D, Colors, Game, GameObject, Scene, Viewport2D } from '@bornengine/engine';

class Level extends Scene {
  constructor(game: Game) {
    super(game, { name: 'level' });
    this.viewport2D = new Viewport2D({ width: 800, height: 450, mode: 'fit' });

    const player = new GameObject({ name: 'Player' });
    this.addNode(player);

    const camera = new GameObject({ name: 'Camera' });
    const rig = new CameraRig2D({ target: player, smoothing: 0.1 });
    camera.addComponent(rig);
    this.addNode(camera);
    this.bindCameraRig2D(rig);
  }
}

class CameraGame extends Game {
  private cursor = 'outside the view';

  constructor() {
    super({ window: { title: 'Camera', width: 800, height: 450 } });
  }

  protected override onStart(): void {
    this.scenes.changeTo(new Level(this));
  }

  protected override loop(deltaTime: number): void {
    this.scenes.update(deltaTime);
    const world = this.input.screenToWorld({ x: this.input.getMouseX(), y: this.input.getMouseY() });
    this.cursor = world === null ? 'outside the view' : `${Math.round(world.x)}, ${Math.round(world.y)}`;
  }

  protected override render(): void {
    this.renderer.clear(Colors.DARKBLUE);
    super.render();
    this.renderer.drawText(`World position: ${this.cursor}`, { x: 16, y: 16 }, 20, Colors.WHITE);
  }
}

new CameraGame().run();
```

When `viewport2D` is not set, the full-window coordinates behave as they did before. The [2D camera API](../../api/camera2d/) covers dead zones, bounds, zoom, shake, scale modes, and parallax. The [2D migration guide](../../guides/migrating-2d-api/) shows the same move for a complete 2D game.

## Migration sequence

1. Create a `Game` subclass and move the window settings and frame rate into its constructor options.
2. Move the body of your old loop into `loop(deltaTime)` for logic and `render()` for drawing. Delete `beginDrawing()`, `endDrawing()`, `windowShouldClose()`, `runGame()`, and `closeWindow()`.
3. Replace each free function with the call on `game.renderer`, `game.input`, `game.audio`, `game.assets`, or `game.window`, using the tables above.
4. Replace numeric handles with the resource objects those calls return, and add `isLoaded` and `error` checks where a load can fail.
5. Move per-level resources to `scene.assets`, and consider moving level code into a `Scene` with `GameObject` components. The [first player](../../getting-started/first-player/) tutorial shows the pattern.
6. Replace `Vec2` with `Vector2D` if you used it.
7. Replace `Game.run(callbacks)` and `GameStorage` if your code comes from 0.6 through 0.10. The next section shows how.
8. Run `bornengine check main.ts` to find syntax Perry cannot compile, start the game, and read `game.error` if it stops early.

## Current lifecycle and data APIs

The old callback runner and the JSON storage helper no longer exist. Update those calls when you move to the current runtime.

The callback overload `Game.run(callbacks)` was removed in 0.11.0, so standalone games use the subclass hooks and call `game.run()` with no arguments.

The old `GameStorage` API was removed in 0.11.0, and `GameDatabase` is the current typed persistence API.

| Removed API | Current API |
| --- | --- |
| `game.run({ update, render, onStop })` and the `GameLoopCallbacks` type | Subclass `Game`, override `loop()`, `render()`, and `onStop()`, then call `game.run()` with no arguments. `runFrame()` is only for an embedded host that owns the surface and the scheduler. |
| `GameStorage`, `createGameStorage()`, `GameStorageBackend`, `GameStorageResult`, `GameStorageStatus`, and `JsonValue` | `GameDatabase` with `defineSchema()`, explicit `defineMigration()` entries, and typed insert, select, update, delete, and transaction methods. |
| JSON records kept by `GameStorage` | Rows in a SQLite table. Persistent mode is the default; use `inMemory: true` only when you want volatile storage. |

`Game.run()` returns a `Promise` that resolves after `onStop()` and the cleanup of the resources the game owns. A failure inside `onStart()`, `loop()`, or `render()` stops the run and leaves the message in `game.error`, so check it after the `Promise` resolves.

`GameStorage` shipped only in 0.10.0. It saved JSON values, worked only on Web, and reported `unsupported` on native targets. Nothing in the current engine reads the data it wrote, so a Web game that shipped with 0.10.0 needs its own step to carry players' saves over. `GameDatabase` works on every target, with the setup that each target needs (see [Database and migrations](../../api/storage/)).

```ts
import { columns, defineMigration, defineSchema, defineTable, GameDatabase } from '@bornengine/engine/storage';

const schema = defineSchema({
  settings: defineTable({
    columns: {
      key: columns.text({ primaryKey: true }),
      value: columns.text({ notNull: true }),
    },
  }),
});

const migrations = [
  defineMigration(1, schema, (migration) => {
    migration.createTable('settings', schema.settings.columns);
  }),
];

const database = new GameDatabase({
  appId: 'org.example.mygame',
  name: 'profile',
  schema,
  migrations,
});

export async function saveVolume(volume: number): Promise<boolean> {
  const opened = await database.open();
  if (!opened.ok) return false;
  const text = String(volume);
  const existing = await database.findByPrimaryKey('settings', 'volume');
  const stored =
    existing.ok && existing.value !== null
      ? await database.update('settings', { value: text }, { key: { eq: 'volume' } })
      : await database.insert('settings', { key: 'volume', value: text });
  await database.close();
  return stored.ok;
}
```

Every `GameDatabase` call returns a result with `ok` and a `status`, so check it instead of expecting an exception. See [Core](../../api/core/) for the lifecycle details.

## Next steps

- [Quickstart](../../getting-started/quickstart/) builds a class-first game from the start.
- [Scenes and objects](../../concepts/scenes-and-objects/) explains scenes, game objects, and components.
- [Assets](../../concepts/assets/) explains `game.assets` and `scene.assets`.
- [Database and migrations](../../api/storage/) documents `GameDatabase`.
- [Architecture](../architecture/) shows how the layers fit together.
