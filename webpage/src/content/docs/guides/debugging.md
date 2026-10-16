---
title: Runtime debugging
description: Turn on the built-in inspector and draw your own developer windows while the game runs.
section: Guides
order: 9
---

The inspector is a set of developer windows that the engine draws on top of your running game. It shows frame timing, the active scene's object tree, the number of loaded textures, and the state of embedded scripts. You turn it on with the `debug` option of `Game`. You can also draw your own windows through `game.debugUi`.

The inspector uses Dear ImGui, which is compiled only into desktop builds that ask for it (see the Desktop feature section below). On every other build the same code runs and draws nothing, so you do not need platform checks around it.

## Turn on the inspector

Pass `debug: true` to show every panel, or pass an options object to choose panels.

```ts
import { Colors, Game } from '@bornengine/engine';

class DebugDemo extends Game {
  constructor() {
    super({
      window: { title: 'Debug demo', width: 800, height: 450 },
      targetFps: 60,
      debug: { enabled: true, assets: false },
    });
  }

  protected override render(): void {
    this.renderer.clear(Colors.DARKBLUE);
    super.render();
  }
}

new DebugDemo().run();
```

With an options object, `enabled` must be exactly `true`. An object without it leaves the inspector off, even if you set a panel option such as `metrics`. Each panel is shown unless you set its option to `false`.

| Option | Default | Panel |
| --- | --- | --- |
| `enabled` | `false` | Turns the whole inspector on |
| `metrics` | `true` | Performance |
| `sceneHierarchy` | `true` | Scene |
| `assets` | `true` | Assets |

What each panel shows:

- **Performance** (`BornEngine | Performance`): frames per second, the frame interval in milliseconds, 2D draw submissions, sprites drawn and culled, the time spent in the update and render steps, and active and total counts of objects and components.
- **Scene** (`BornEngine | Scene`): the active scene's name and state, its object count, and a tree of game objects. Expand an object to see whether it is active, how many components it has, and its world position and scale. The tree lists the first 256 objects and stops at a depth of 64.
- **Assets** (`BornEngine | Assets`): the number of textures cached by `game.assets`. Textures owned by a scene's `scene.assets` are not counted.

The inspector draws last in each frame: after your `render()` and after the retained GUI. It draws nothing until the game is ready and the debug backend is available.

## Desktop feature

Dear ImGui is an optional native feature named `debug-ui`. Add it to `native_features` in the `[bornengine]` table of your project's `perry.toml`. Keep the profile you already use; this example shows a 2D project.

```toml
[bornengine]
native_profile = "2d"
native_features = ["debug-ui"]
```

Build with `bornengine build`, `bornengine run`, or `bornengine dev`. The CLI forwards the profile and the extra feature to the engine's Rust crate. Adding a feature changes the native feature set, so the next build compiles the engine again.

The feature exists only in the Linux, macOS, and Windows native crates. It is not part of the Web/WASM build or the mobile, tvOS, visionOS, and watchOS targets. It also does nothing for builds that call Perry or Cargo directly: those commands need their own feature selection.

Check availability before you draw custom widgets:

```ts
import { Game } from '@bornengine/engine';

class AvailabilityCheck extends Game {
  protected override onStart(): void {
    if (this.debugUi.isAvailable()) console.log('Dear ImGui is compiled in.');
    else console.log('No debug UI in this build.');
  }
}

new AvailabilityCheck().run();
```

`isAvailable()` is `false` when the feature is not compiled in, on unsupported targets, and when the game is not ready or has been disposed. Skip your debug drawing code while it is `false`, as the next section does.

## Project-specific windows

`game.debugUi` accepts the same widget calls as the player-facing `game.ui`: windows, labels, buttons, checkboxes, sliders, tables, and so on. See the [UI API](../../api/ui/) for the full list. Use `game.debugUi` for developer-only controls and keep `game.ui` for what players see.

This example adds a window with a counter, a button, and a checkbox. It also skips the mouse click for gameplay while the pointer is over a debug window.

```ts
import { Colors, Game, MouseButton } from '@bornengine/engine';

const WINDOW_ID = 9000;
const WAVE_ID = 9001;
const ENEMIES_ID = 9002;
const NEXT_WAVE_ID = 9003;
const INVINCIBLE_ID = 9004;

class DebugDemo extends Game {
  private wave = 1;
  private enemies = 12;
  private invincible = false;

  constructor() {
    super({ window: { title: 'Debug demo', width: 800, height: 450 }, targetFps: 60 });
  }

  protected override loop(_deltaTime: number): void {
    const overDebugWindow = this.debugUi.wantsPointerInput();
    if (!overDebugWindow && this.input.isMouseButtonPressed(MouseButton.LEFT)) {
      this.enemies = Math.max(0, this.enemies - 1);
    }
  }

  protected override render(): void {
    this.renderer.clear(Colors.DARKGRAY);
    super.render();
    this.drawDebugWindow();
  }

  private drawDebugWindow(): void {
    const ui = this.debugUi;
    if (!ui.isAvailable()) return;

    ui.beginWindow(WINDOW_ID, 'Gameplay', 16, 300, 260, 140);
    ui.label(WAVE_ID, 'Wave: ' + this.wave);
    ui.label(ENEMIES_ID, 'Enemies: ' + this.enemies);
    if (ui.button(NEXT_WAVE_ID, 'Next wave')) this.wave += 1;
    this.invincible = ui.checkbox(INVINCIBLE_ID, 'Invincible', this.invincible);
    ui.endWindow(WINDOW_ID);
  }
}

new DebugDemo().run();
```

Rules to follow:

- **Draw every frame.** The debug UI is immediate: a window exists only while you call `beginWindow` and `endWindow` in that frame. Do it once per frame, usually from `render()`.
- **Use stable, unique ids.** Each widget needs a number that does not change between frames. Use ids below 4,000,000,000. The built-in inspector reserves that value and everything above it.
- **Position and size are suggestions.** `beginWindow(id, title, x, y, width, height)` applies them the first time the window appears. After that the user can drag and resize it. Defaults are `16, 16, 320, 240`. Call `setWindowPosition` or `setWindowSize` to force a value.
- **Results come from the previous frame.** A widget returns what happened to it in the last completed UI frame, so a button click reaches your code one frame after it happens.
- **Keep input separate.** `wantsPointerInput()` and `wantsKeyboardInput()` report whether a debug window currently captures the mouse or keyboard. Check them before you handle gameplay input, as the example does.

## Next steps

- [Debug UI](../../api/debug-ui/) lists the inspector options and the debug UI surface.
- [UI](../../api/ui/) documents the widget calls shared by `game.ui` and `game.debugUi`.
- [Game](../../api/game/) is the reference for `Game` and its options.
- [Project commands](../../cli/project/) explains `native_profile` and `native_features` in `perry.toml`.
