---
title: Migrating a 2D game to the class-first API
description: Move a function-driven 2D game loop to Game, Scene, GameObject, and reusable 2D components.
section: Guides
order: 66
---

Older BornEngine games were written as plain functions: `initWindow`, a `while` loop, module-level variables, and a callback passed to `game.run()`. Today the same game is built from classes. A `Game` subclass owns the window and the services. A `Scene` owns one level. `GameObject`s and their components describe what appears and what behaves.

This guide takes one piece of the old style at a time. Each section shows the old shape as plain text and the current code that replaces it. The old shapes no longer exist in the engine, so they are not code you can run. The current code on this page compiles against the current engine. The [migration reference](../../reference/migration/) has the full table of removed functions.

## Use Vector2D for runtime 2D values

A 2D game tracks positions, sizes, and velocities. In the old style these were pairs of numbers or loose `{ x, y }` records:

```text
let playerX = 96;
let playerY = 120;
let velocityX = 180;
let velocityY = 90;
const speed = Math.sqrt(velocityX * velocityX + velocityY * velocityY);
playerX = playerX + velocityX * dt;
playerY = playerY + velocityY * dt;
```

`Vector2D` is a small class with a mutable `x` and `y` and methods for vector math. The methods return new vectors and leave the original unchanged. Renderer and texture calls that take a 2D position or size accept any object with `x` and `y`, so you can pass a `Vector2D` directly.

```ts
import { GameObject, Vec3, Vector2D } from '@bornengine/engine';

const spawn = new Vector2D(96, 120);
const velocity = new Vector2D(2, 1).normalized.scale(180);
const next = spawn.add(velocity.scale(1 / 60));
const speed = velocity.length;

const player = new GameObject({ name: 'Player', position: new Vec3(next.x, next.y, 0) });
console.log('moving at ' + Math.round(speed) + ' units per second');
```

A game object's `transform.position` is three-dimensional. It is a `Vec3` with a `z` value, so you copy a 2D point into it with a `z` of 0. Saved 2D maps never contain `Vector2D` objects. They store plain numbers such as `[x, y]`.

## Move the loop into a Game subclass

The first old style owned the loop itself:

```text
initWindow(800, 450, 'My Game');
setTargetFPS(60);
while (!windowShouldClose()) {
  const dt = getDeltaTime();
  updateGame(dt);
  beginDrawing();
  clearBackground(background);
  drawGame();
  endDrawing();
}
closeWindow();
```

The next style passed callbacks to the game. That form was removed too:

```text
const game = new Game({ window: { title: 'My Game', width: 800, height: 450 } });
game.run({
  update(dt) { updateGame(dt); },
  render() { drawGame(); },
  onStop() { saveGame(); },
});
```

Now you subclass `Game` and override the hooks you need. `run()` takes no arguments:

```ts
import { Colors, Game, Scene } from '@bornengine/engine';

class MyGame extends Game {
  constructor() {
    super({ window: { title: 'My Game', width: 800, height: 450 }, targetFps: 60 });
  }

  protected override onStart(): void {
    if (!this.scenes.changeTo(new Scene({ name: 'First level' }))) this.stop();
  }

  protected override loop(deltaTime: number): void {
    this.scenes.update(deltaTime);
  }

  protected override render(): void {
    this.renderer.clear({ r: 12, g: 18, b: 28, a: 255 });
    super.render();
    this.renderer.drawText('My Game', { x: 16, y: 16 }, 20, Colors.WHITE);
  }
}

new MyGame().run();
```

How the old pieces map:

- `initWindow` and `setTargetFPS` become the options of `super(...)`.
- `onStart()` runs once, after the window exists. Create scenes and load assets there.
- `loop(deltaTime)` replaces your update function. `deltaTime` is in seconds. Input is already updated when it runs.
- `render()` replaces your draw function. There are no begin and end calls. The renderer does not clear the screen, so call `clear` first.
- Scenes do not update themselves. Call `this.scenes.update(deltaTime)` from `loop`.
- `super.render()` draws the active scene. Anything you draw after it appears on top, in screen coordinates, which suits a HUD.
- `onStop()` replaces the `onStop` callback. The game runs it once when it ends, then releases the resources it owns.

`run()` returns a promise that resolves after `onStop()` and cleanup. If `onStart`, `loop`, or `render` throws, the run stops and `game.error` holds the message. Use `runFrame()` only when another program owns the window and calls you every frame; the [game loop](../../concepts/game-loop/) page explains embedded hosts.

## Turn draw calls into scene components

In the old style you loaded a texture into a handle and drew it by hand every frame:

```text
const playerTexture = loadTexture('assets/player.png');
...
beginMode2D(camera);
drawTexture(playerTexture, playerX, playerY, Colors.WHITE);
endMode2D();
```

Now a `GameObject` carries a `SpriteRenderer` component, and the scene draws it for you when `super.render()` runs. A sprite needs a `SpriteSheet`, which cuts one texture into frames, and a frame to show. Load the texture from the scene's own asset scope so the scene releases it when it unloads.

```ts
import { GameObject, Scene, SpriteRenderer, SpriteSheet, Vec3, Vector2D } from '@bornengine/engine';

export function addPlayer(scene: Scene): GameObject | null {
  const texture = scene.assets.loadTexture('assets/player.png');
  if (texture === null || !texture.isLoaded) {
    console.error(texture === null ? 'The scene asset manager is unavailable.' : texture.error);
    return null;
  }

  const sheet = new SpriteSheet(texture, { frameWidth: 32, frameHeight: 32 });
  const idle = sheet.gridFrame(0, 0);
  if (idle === null || sheet.error !== null) {
    console.error(sheet.error);
    return null;
  }

  const spawn = new Vector2D(96, 120);
  const player = new GameObject({ name: 'Player', position: new Vec3(spawn.x, spawn.y, 0) });
  player.addComponent(new SpriteRenderer(idle, { size: new Vector2D(32, 32) }));
  return scene.addNode(player);
}
```

The scene draws components in order of their `renderOrder`, and components with equal order keep the order in which they were added. `Renderer.drawTexture()` is still available for something drawn once, such as a menu picture. Use `SpriteAnimator` for clips and `ParticleEmitter2D` for scene effects. [Build a 2D game](../2d-game/) puts these pieces together.

## Replace a global level with a Scene

A level used to be a set of module-level variables plus functions that loaded and cleared them:

```text
let enemies = [];
let coins = [];
let gravity = 900;

function loadLevel(number) { enemies = spawnEnemies(number); coins = spawnCoins(number); }
function updateLevel(dt) { applyGravity(enemies, gravity, dt); }
function unloadLevel() { enemies = []; coins = []; }
```

Make each level a `Scene`. Add its objects with `scene.addNode(object)`, and switch levels with `game.scenes.changeTo(scene)`. Changing scenes unloads the previous one: its objects are destroyed, its `scene.assets` are released, and so is everything you passed to `scene.own(resource)`.

A physics world is a good example of an owned resource. It advances only when your code calls `step()`, so step it once per frame from the scene's `update`.

```ts
import { Game, GameObject, Key, PhysicsWorld2D, Scene, Vector2D } from '@bornengine/engine';

class Level extends Scene {
  readonly physics: PhysicsWorld2D | null;

  constructor(game: Game, name: string) {
    super({ name });
    this.physics = this.own(
      new PhysicsWorld2D(game, { gravity: new Vector2D(0, 900), fixedTimeStep: 1 / 60, maxSubSteps: 5 }),
    );
    this.addNode(new GameObject({ name: 'Player', position: { x: 96, y: 120, z: 0 } }));
  }

  override update(deltaTime: number): void {
    super.update(deltaTime);
    if (this.physics !== null && this.physics.isReady) this.physics.step(deltaTime);
  }
}

class PlatformerGame extends Game {
  private levelNumber = 1;

  protected override onStart(): void {
    this.loadLevel();
  }

  protected override loop(deltaTime: number): void {
    if (this.input.isKeyPressed(Key.N)) {
      this.levelNumber += 1;
      this.loadLevel();
    }
    this.scenes.update(deltaTime);
  }

  private loadLevel(): void {
    if (!this.scenes.changeTo(new Level(this, 'Level ' + this.levelNumber))) this.stop();
  }
}

new PlatformerGame().run();
```

`own()` returns the resource, or `null` if the scene cannot take it, for example because the scene is already unloading. `PhysicsWorld2D` uses a fixed step of `1 / 60` second by default and runs at most five sub-steps per call, and `step()` returns how many it ran. Step each world from one place only. Do not also step it from individual bodies. The per-scene hooks `onEnter`, `onPause`, `onResume`, `onExit`, and `onUnload` replace the code you used to run when a level started and ended.

## Keep 2D and 3D world data separate

Two world formats exist, and they are unrelated:

| | 3D world | 2D world |
| --- | --- | --- |
| File | `*.world.json` | `*.world2d.json` |
| Version field | `schemaVersion` | `format` set to `bornengine.world2d`, plus `version` |
| Current version | 2 | 2 |
| Load with | `WorldData` and `WorldInstance` | `World2DLoader` |
| Result | Scene nodes, lights, terrain | Game objects with tilemap and sprite components |

`WorldData`, `WorldInstance`, and `PrefabLibrary` are the 3D API. A 2D map goes through `validateWorld2D()`, and `World2DLoader` builds it into a scene. Version 1 maps still load, and `migrateWorld2D()` returns them as a normalized version 2 document without changing your input. Neither API converts a 3D file into a 2D map. The 2D validator rejects a 3D document at its `/format` field:

```ts
import { formatWorld2DDiagnostics, migrateWorld2D, validateWorld2D } from '@bornengine/engine/world2d';

export function checkMap(text: string): boolean {
  let input: unknown;
  try {
    input = JSON.parse(text);
  } catch (error) {
    console.error('The map is not valid JSON.');
    return false;
  }

  const check = validateWorld2D(input);
  if (!check.ok) {
    console.error(formatWorld2DDiagnostics(check.diagnostics));
    return false;
  }
  const migrated = migrateWorld2D(input);
  return migrated.ok && migrated.document !== null && migrated.document.version === 2;
}
```

When you load a map with `World2DLoader`, it reports validation and construction problems in its result instead of building half a level. If anything fails, none of the objects reach the scene. The engine writes version 2 maps, but the asset audit in CLI 0.7.1 accepts only version 1, so `bornengine build`, `run`, and `dev` stop on a version 2 map. The [World format](../world-format/) guide documents both formats and this limit.

## Move polling to named input actions

Old code asked about each key in the update function:

```text
if (isKeyDown(Key.LEFT) || isKeyDown(Key.A)) playerX -= speed * dt;
if (isKeyDown(Key.RIGHT) || isKeyDown(Key.D)) playerX += speed * dt;
if (isKeyDown(Key.SPACE)) startJump();
```

`game.input.isKeyDown(...)` still works. For controls players can change, create an `InputActionMap`, bind device inputs to names, and ask for the names:

```ts
import { Game, Key } from '@bornengine/engine';
import type { InputActionMap } from '@bornengine/engine';

class RunnerGame extends Game {
  private controls: InputActionMap | null = null;
  private x = 0;
  private jumps = 0;

  protected override onStart(): void {
    const controls = this.input.createActionMap();
    controls.bindAxis('move-x', {
      negative: [{ kind: 'key', key: Key.LEFT }, { kind: 'key', key: Key.A }],
      positive: [{ kind: 'key', key: Key.RIGHT }, { kind: 'key', key: Key.D }],
    });
    controls.bindAction('jump', { kind: 'key', key: Key.SPACE });
    this.controls = controls;
  }

  protected override loop(deltaTime: number): void {
    const controls = this.controls;
    if (controls === null) return;
    this.x += controls.readAxis('move-x') * 200 * deltaTime;
    if (controls.wasPressed('jump')) this.jumps += 1;
  }
}

new RunnerGame().run();
```

The game updates every action map once at the start of each frame, before `loop()` runs, so every query in a frame sees the same snapshot. Binding rules to remember:

- `bindAxis` replaces any earlier binding of that axis name. `bindAction` adds bindings to an existing action. `unbindAction` and `unbindAxis` remove a name.
- A newly bound action stays quiet until all of its inputs have been released once. A key that is already held down does not count as a press.
- `readVector2(horizontal, vertical)` does not shorten diagonal values, so normalize them if you need equal speed in every direction.
- `toData()` exports the bindings and `loadData()` restores them, so you can save a player's remapped keys.

## Migrate incrementally

You do not have to move everything at once. This order keeps the game working at each step:

1. Make the game loop a `Game` subclass. Keep your own state and drawing code inside `loop` and `render` for now.
2. Move one level into a `Scene` and switch to it with `game.scenes.changeTo`.
3. Replace player and world drawing with `GameObject`s and components, one object at a time.
4. Move keyboard polling to an `InputActionMap`.
5. Load authored maps with `World2DLoader`.

Keep direct drawing for a HUD or for an effect you draw once. Use scene components when you need ownership, transforms, drawing order, animation, or automatic camera handling.

## Next steps

- [Scenes, objects, and components](../../concepts/scenes-and-objects/) explains the lifecycle hooks used above.
- [Build a 2D game](../2d-game/) builds a complete level with sprites and effects.
- [2D production workflow](../2d-production-workflow/) takes a Tiled map to a packaged game.
- [Migration reference](../../reference/migration/) lists the removed functions and their replacements.
