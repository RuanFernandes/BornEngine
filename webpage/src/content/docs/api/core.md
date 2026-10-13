---
title: Core
description: Own the window, frame lifecycle, renderer, and platform services through Game.
section: API
order: 32
---

The core module holds `Game`, the root object of every BornEngine program. It also holds the `Window`, the `Renderer`, and shared values such as `Colors`, `Key`, and `MouseButton`. A `Game` opens the window, creates one instance of each engine service, and runs the frame loop. You normally subclass it.

Import these from `@bornengine/engine`, or from `@bornengine/engine/core`. A `Game` gives you its services as properties:

| Property | What it is | Reference |
| --- | --- | --- |
| `game.window` | The window: title, size, fullscreen. | The window section below |
| `game.renderer` | Drawing, camera passes, and profiling. | [Shapes](../shapes/), [Textures](../textures/), [Text](../text/) |
| `game.input` | Keyboard, mouse, gamepad, touch, and action maps. | [Input](../input/) |
| `game.audio` | Sounds and music. | [Audio](../audio/) |
| `game.scenes` | The scene manager. | [Game objects](../game/) |
| `game.assets` | The shared asset cache. | [Assets](../assets/) |
| `game.mobile`, `game.ui`, `game.gui`, `game.debugUi`, `game.scripting`, `game.sceneGraph` | Optional systems. | [Mobile](../mobile/), [UI](../ui/), [GUI controls](../gui/), [Debug UI](../debug-ui/), [Embedded scripting](../scripting/), [Scene](../scene/) |

Only one `Game` can be active in a process. Creating a second one gives you a game whose `error` is `Only one BornEngine Game may be active at a time.`

## Frame lifecycle

Subclass `Game` and override the hooks you need. The engine calls them in this order:

- `onStart()` runs once, after the window and renderer exist and before the first frame.
- `loop(deltaTime)` runs every frame. `deltaTime` is the time since the previous frame in seconds. It is measured, not fixed, so multiply speeds by it.
- `render()` runs every frame after `loop`. The default `render()` draws the current scene.
- `onStop()` runs once when the game ends, before the engine releases its resources.

```ts
import { Colors, Game, Key } from '@bornengine/engine';

const SPEED = 240;

class MovingSquare extends Game {
  private x = 40;

  constructor() {
    super({ window: { title: 'Frame lifecycle', width: 800, height: 450 }, targetFps: 60 });
  }

  protected override onStart(): void {
    console.log('The window and renderer are ready.');
  }

  protected override loop(deltaTime: number): void {
    if (this.input.isKeyDown(Key.RIGHT)) this.x += SPEED * deltaTime;
    if (this.input.isKeyDown(Key.LEFT)) this.x -= SPEED * deltaTime;
    if (this.input.isKeyPressed(Key.ESCAPE)) this.stop();
  }

  protected override render(): void {
    this.renderer.clear(Colors.DARKBLUE);
    this.renderer.drawRectangle({ x: this.x, y: 200, width: 48, height: 48 }, Colors.ORANGE);
  }

  protected override onStop(): void {
    if (this.error !== null) console.error(`The game stopped with an error: ${this.error}`);
  }
}

const game = new MovingSquare();
if (!game.isReady) console.error(game.error);
game.run().then(() => console.log('The game has shut down.'));
```

Inside each frame, the engine does this:

1. The renderer starts the frame.
2. Input updates, including every action map.
3. Engine services update: the retained GUI (the control tree in `game.gui`), audio, and on-screen touch controls.
4. `loop(deltaTime)` runs.
5. `render()` runs.
6. The retained GUI draws, then the debug inspector if you enabled it.

The renderer does not clear the screen, so call `this.renderer.clear(color)` first in `render()`. Scenes are not updated for you either. When you use scenes, call `this.scenes.update(deltaTime)` from `loop`, and call `super.render()` from your `render()` where the scene should draw.

### Options

`new Game(options)` accepts these options. All of them are optional.

- `window`: `title` (default `'BornEngine'`), `width` (default 800), `height` (default 600), `fullscreen`, and `mode`. `mode` is `'windowed'` by default. `'embedded'` is for hosts that provide their own surface. A width or height that is not above zero makes the `Game` fail with an `error`.
- `targetFps`: the frame rate to aim for, 60 by default. On native platforms the engine sleeps at the end of a frame to keep to it. On the Web, the browser schedules frames and this option has no effect. A value that is not a positive finite number makes the `Game` fail.
- `renderMode`: `'2d'` selects the lightweight 2D renderer. `'3d'` and `'2.5d'` select the full scene renderer, which is also the default. This is a run-time choice. It is separate from the `native_profile` build setting that the CLI uses.
- `textureFilter`: `'linear'` or `'nearest'`. It sets the sampling filter for textures that `game.assets` and scene assets load, including `@Asset` fields and sprite templates. The default is `'nearest'` in `'2d'` render mode, which keeps pixel art sharp, and `'linear'` otherwise. Set `'linear'` to smooth textures in a 2D game. Textures you create from image data or render targets are not changed.
- `debug`: `true` or an object that turns on the built-in inspector. It needs the `debug-ui` native feature, a build option described in [Project configuration](../../cli/project/). See [Debug UI](../debug-ui/).

A `Game` also has the getters `isReady`, `isRunning`, `isDisposed`, `error`, and `stats`. Check `isReady` and `error` right after you construct it.

`Game.current` is a static getter that returns the active `Game`. It throws when no `Game` is running. Use it where a class does not receive the game, such as a scene or a component that runs after the constructor.

```ts
const game = Game.current;
console.log(game.window.width);
```

### The window

`game.window` describes the window or host surface. It has `width`, `height`, `title`, `mode`, and `isOpen`.

- `setTitle(title)`, `setIcon(path)`, `toggleFullscreen()`, and `resize(width, height, pixelRatio = 1)` return `true` when they act. They return `false` when the window is not open, and `resize` also returns `false` for a size that is not above zero.
- `close()` closes the window. In a standalone game this ends the run, like `stop()`.
- `width` and `height` hold the size from your options or from the last `resize()` call. The engine does not update them when a player drags the edge of a desktop window. Read `game.input.getScreenWidth()` and `getScreenHeight()` for the current size.

### Start, stop, and the run Promise

`run()` starts the frame loop and returns a `Promise<void>`, the standard TypeScript object for work that finishes later. The Promise resolves after `onStop()` has run and the `Game` has released its resources. It never rejects.

- On native platforms, which means everything except the Web, `run()` blocks until the game has finished, so the Promise is already resolved when you get it. Code after a plain `game.run()` call runs after the game has ended.
- On the Web, the browser schedules frames. `run()` returns at once, and the Promise resolves later, when the game finishes.
- Use `.then(...)` on the Promise, or `onStop()`, for code that must run on every platform after shutdown.
- `stop()` asks for an orderly shutdown. The current frame finishes, then `onStop()` runs, then the `Game` is disposed, and then the Promise resolves. Closing the window does the same.
- `dispose()` releases everything at once when the game is not running. If you call it while the game runs, it requests a stop, and the engine disposes the `Game` when the current frame ends.
- A `Game` runs once. Calling `run()` a second time returns the same Promise and starts nothing.

### Runtime errors

The engine does not throw errors out of `run()` and does not print them. A failure is recorded as text in `game.error`, which is `null` when nothing went wrong. The text is the message of the error that was thrown, or `String(value)` when the thrown value is not an `Error`. The `Game` keeps only the first error.

An error is recorded when:

- The constructor cannot start the `Game`: an invalid window size, an invalid `targetFps`, or a second active `Game`. `isReady` is `false`, and `run()` resolves at once.
- Your `onStart`, `loop`, or `render` throws. The frame loop stops, `onStop()` still runs, the engine disposes the `Game`, and the `run()` Promise resolves.
- `onStop()` or the cleanup throws, and no earlier error exists.

```ts
import { Game } from '@bornengine/engine';

class BrokenGame extends Game {
  protected override onStart(): void {
    throw new Error('Level data is missing.');
  }
}

const broken = new BrokenGame();
broken.run().then(() => {
  console.log(broken.error);
});
```

This prints `Level data is missing.`, because the Promise resolves and the message is in `broken.error`. `error` stays readable after the `Game` is disposed.

### Embedded hosts

`runFrame(deltaTime, callbacks)` is for embedded hosts. An embedded host is an application that owns the native window or view and its own frame scheduler, and runs BornEngine inside it. Create the `Game` with `window.mode` set to `'embedded'`, attach the host's surface, and call `runFrame` once per host frame. Standalone games never call it. It returns `false` unless the `Game` is embedded.

```ts
import { Colors, Game } from '@bornengine/engine';
import type { EmbeddedFrameCallbacks } from '@bornengine/engine';

declare const surfaceHandle: number;

const game = new Game({ window: { mode: 'embedded', width: 640, height: 360 } });

const callbacks: EmbeddedFrameCallbacks = {
  update(deltaTime: number): void {
    game.scenes.update(deltaTime);
  },
  render(): void {
    game.renderer.clear(Colors.DARKGRAY);
    game.scenes.render(game.renderer);
  },
  onStop(): void {
    console.log('The embedded game stopped.');
  },
};

if (!game.window.attachNativeSurface(surfaceHandle, 640, 360)) {
  console.error(game.error ?? 'The native surface could not be attached.');
}

export function onHostFrame(deltaSeconds: number): boolean {
  if (game.runFrame(deltaSeconds, callbacks)) return true;
  game.dispose();
  return false;
}
```

The host owns the loop, so the rules differ from a standalone game:

- `surfaceHandle` is a number that identifies the host's native view. The host supplies it, and `attachNativeSurface(handle, width, height)` returns `false` if the attach fails. `deltaSeconds` is the time since the host's previous frame, in seconds.
- `runFrame` runs one frame with the same internal order as `run()`: input, services, then your callbacks. The `update` and `render` callbacks replace the `loop` and `render` hooks. The `onStart`, `loop`, `render`, and `onStop` hooks of a subclass are not used, and `run()` does not start a loop for an embedded `Game`.
- `runFrame` returns `true` while the game keeps running. It returns `false` when the `Game` is not ready, is not embedded, was asked to stop, its window closed, or a callback threw.
- When a callback throws, the error goes to `game.error`, the `onStop` callback runs, and `runFrame` returns `false`. The `Game` closes its window but still holds its resources, so call `dispose()` as the example does.

## Input

Read devices through `game.input`, or create a named action map with `game.input.createActionMap()`. The engine reads input once per frame, before `loop` runs, so every call during a frame sees the same state.

```ts
import { Colors, Game, Key, MouseButton } from '@bornengine/engine';
import type { InputActionMap } from '@bornengine/engine';

class InputDemo extends Game {
  private readonly controls: InputActionMap;
  private x = 100;
  private jumps = 0;

  constructor() {
    super({ window: { title: 'Input', width: 640, height: 360 } });
    this.controls = this.input.createActionMap();
    this.controls.bindAction('jump', [
      { kind: 'key', key: Key.SPACE },
      { kind: 'mouse', button: MouseButton.LEFT },
    ]);
  }

  protected override loop(deltaTime: number): void {
    if (this.input.isKeyDown(Key.RIGHT)) this.x += 200 * deltaTime;
    if (this.input.isKeyDown(Key.LEFT)) this.x -= 200 * deltaTime;
    if (this.controls.wasPressed('jump')) this.jumps += 1;
  }

  protected override render(): void {
    this.renderer.clear(Colors.BLACK);
    this.renderer.drawText(`Jumps: ${this.jumps}`, { x: 16, y: 16 }, 24, Colors.WHITE);
    this.renderer.drawRectangle({ x: this.x, y: 200, width: 32, height: 32 }, Colors.ORANGE);
  }
}

new InputDemo().run();
```

Use the `Key` and `MouseButton` constants instead of raw numbers. [Input](../input/) covers bindings, axes, rebinding, and device differences.

## Cameras and coordinates

By default, drawing coordinates are window pixels with the origin at the top-left corner and y growing downward. A **camera pass** changes that to world coordinates.

- `renderer.begin2D(camera, viewport?)` starts a 2D pass with a `Camera2D`: `{ offset, target, rotation, zoom }`. `renderer.end2D()` ends it.
- `renderer.begin3D(camera)` starts a 3D pass with a `Camera3D`: `{ position, target, up, fovy, projection }`, where `fovy` is in degrees and `projection` is `'perspective'` or `'orthographic'`. `renderer.end3D()` ends it.
- Each `begin` returns `false` when it cannot start: the `Game` is not ready, or another pass or a render texture is already active. `begin2D` also returns `false` for a camera with a value that is not finite or a zoom that is not above zero. Passes do not nest. Match every successful `begin` with its `end`.
- A scene starts and ends its own 2D pass when it has a camera or viewport, so you do not call `begin2D` for scene content.

```ts
import { Colors, Game } from '@bornengine/engine';
import type { Camera2D } from '@bornengine/engine';

class CameraDemo extends Game {
  private readonly camera: Camera2D = {
    offset: { x: 400, y: 225 },
    target: { x: 0, y: 0 },
    rotation: 0,
    zoom: 1,
  };

  constructor() {
    super({ window: { title: 'Camera pass', width: 800, height: 450 } });
  }

  protected override render(): void {
    this.renderer.clear(Colors.BLACK);
    if (!this.renderer.begin2D(this.camera)) return;

    this.renderer.drawCircle({ x: 0, y: 0 }, 32, Colors.GOLD);
    const mouse = this.input.screenToWorld(this.input.getMousePosition(), this.camera);
    if (mouse !== null) this.renderer.drawCircle(mouse, 8, Colors.RED);

    this.renderer.end2D();
  }
}

new CameraDemo().run();
```

`camera.target` is the world point the camera looks at, and `camera.offset` is where that point appears on screen. Here the offset is the middle of the 800 by 450 window, so the circle at the world origin draws in the middle.

`game.input.screenToWorld(position, camera?)` turns a screen position into a world position, and `worldToScreen(position, camera?)` does the opposite. Without a camera argument they use the current scene's camera and viewport. They return `null` when no conversion is possible. The [2D camera and viewport](../camera2d/) page explains scaling modes, letterbox bars, and the camera rig.

## Files and profiling

Several platform helpers live on `game.input`, because they talk to the host system:

- `fileExists(path)`, `readFile(path)`, and `writeFile(path, data)` read and write small text files. `readFile` returns an empty string when the file cannot be read, so call `fileExists` first when an empty file is possible. `writeFile` returns `false` when it fails.
- `setClipboardText(text)` and `getClipboardText()` use the system clipboard.
- `openFileDialog(filter, title)` and `saveFileDialog(defaultName, title)` open native file pickers and return the chosen path, or an empty string if the player cancels. The CLI turns on the native `dialogs` feature when your source calls them.

Where files go depends on the platform:

- On Linux, Windows, and macOS, a relative path is relative to the folder the game runs from. `bornengine run` starts the game in your project folder.
- On Android and iOS, the engine resolves relative paths for you.
- On the Web, `writeFile` stores text in the browser's local storage, and `readFile` and `fileExists` check that storage first and then the files served with the game. The clipboard and file dialogs are not implemented there.

For structured save data, use the typed database in [Database and migrations](../storage/) instead of text files.

The renderer has a built-in profiler. It is off by default and costs nothing while off.

```ts
import { Colors, Game, Key } from '@bornengine/engine';

class ProfiledGame extends Game {
  private profiling = false;

  protected override onStart(): void {
    const path = 'save.json';
    if (this.input.fileExists(path)) {
      console.log(`The save file has ${this.input.readFile(path).length} characters.`);
    }
    if (!this.input.writeFile(path, JSON.stringify({ level: 3 }))) {
      console.error('Could not write save.json.');
    }
  }

  protected override loop(_deltaTime: number): void {
    if (!this.input.isKeyPressed(Key.F3)) return;
    this.profiling = !this.profiling;
    this.renderer.setProfilerEnabled(this.profiling);
  }

  protected override render(): void {
    this.renderer.clear(Colors.BLACK);
    if (!this.profiling) return;

    const cpuMs = this.renderer.getProfilerCpuTimeUs() / 1000;
    const gpuMs = this.renderer.getProfilerGpuTimeUs() / 1000;
    this.renderer.drawText(`CPU ${cpuMs.toFixed(2)} ms   GPU ${gpuMs.toFixed(2)} ms`, { x: 12, y: 12 }, 20, Colors.LIME);

    let y = 40;
    for (const row of this.renderer.getProfilerOverlay().slice(0, 8)) {
      this.renderer.drawText(`${row.label}: ${(row.cpuUs / 1000).toFixed(2)} ms`, { x: 12, y }, 16, Colors.WHITE);
      y += 20;
    }
  }
}

new ProfiledGame().run();
```

The profiler methods on `game.renderer` are:

- `setProfilerEnabled(enabled)` turns it on or off.
- `getProfilerCpuTimeUs()` and `getProfilerGpuTimeUs()` return the average frame time over the last 120 frames, in microseconds. The GPU value is `0` when the graphics device cannot time passes.
- `getProfilerOverlay()` returns one row per phase, `{ label, cpuUs, gpuUs }`, sorted by CPU time. A row's `gpuUs` is `-1` when GPU timing is not available.
- `getProfilerFrameHistory()` returns the last frames' totals as `{ cpuUs, gpuUs }`, oldest first.
- `printProfilerSummary()` prints a timing table to the console.

Two read-only snapshots help when you do not need the profiler. `game.stats` reports `frameTimeMs`, `updateTimeMs`, `renderTimeMs`, and the object and component counts of the current scene. `game.renderer.stats` reports `fps`, `frameIntervalMs`, `drawSubmissions2D`, `spritesDrawn`, and `spritesCulled`. `renderer.screenshot(path)` asks the renderer to save a screenshot to `path`.

Renderer methods return `false`, `0`, or an empty value instead of throwing when the `Game` is not ready.

## Next steps

- [Game objects](../game/) explains scenes, objects, and components that run inside this lifecycle.
- [Input](../input/) covers action maps and device behavior.
- [2D camera and viewport](../camera2d/) builds on the camera passes described above.
- [Game loop](../../concepts/game-loop/) explains the same frame order as a concept.
- [Desktop](../../platforms/desktop/) and [Web / WASM](../../platforms/web-wasm/) list platform differences.
