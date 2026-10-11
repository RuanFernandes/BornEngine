---
title: UI
description: Build player-facing menus and HUD widgets with the immediate-mode UI that every Game owns.
section: API
order: 45
---

`game.ui` is an immediate-mode UI. You describe the widgets again on every frame, in your `render()` method, and the engine draws them after your own drawing. There are no widget objects to keep. A button is a call such as `this.ui.button(103, 'Apply')` that returns `true` when the player has clicked it.

Use `game.ui` for small menus, settings panels, and HUD elements that are easy to describe from game state. For controls that you want to keep as objects, with parents, event hooks, and styles, use the retained [GUI API](../gui/). Both APIs draw through the same egui context (egui is the UI library behind them) and share the display. Their IDs and responses are separate, so a widget ID in `game.ui` never collides with a control in `game.gui`.

## Player UI

Every widget has an ID, a number that must stay the same from frame to frame and must be unique among the widgets you draw. The engine uses the ID to remember hover, focus, and typing state.

```ts
import { Colors, Game } from '@bornengine/engine';

class SettingsGame extends Game {
  private volume = 0.7;
  private muted = false;

  constructor() {
    super({ window: { title: 'Settings', width: 800, height: 450 }, targetFps: 60 });
  }

  protected override render(): void {
    this.renderer.clear(Colors.DARKGRAY);

    this.ui.beginWindow(100, 'Audio', 24, 24, 340, 220);
    this.volume = this.ui.sliderFloat(101, 'Volume', this.volume, 0, 1);
    this.muted = this.ui.checkbox(102, 'Mute', this.muted);
    if (this.ui.button(103, 'Apply')) {
      this.audio.setMasterVolume(this.muted ? 0 : this.volume);
    }
    this.ui.endWindow(100);
  }
}

new SettingsGame().run();
```

How the example works:

- Value widgets take the current value and return the new one. `sliderFloat` and `sliderInt` return a number, `checkbox` returns a boolean, and `textEditSingleline` returns a string. Store the result back in your own field, as the example does.
- `button`, `link`, `radioButton`, `selectable`, and `menuItem` return `true` when the player clicked them.
- Windows and other containers come in `begin...` and `end...` pairs. Call the matching `end...` method in the same frame, even when a `begin...` method returned `false`. A `begin...` call without its `end...` call draws nothing, and it can break the containers around it.
- Each frame, `beginWindow(id, title, x, y, width, height)` places the window at that position and size. The defaults are 16, 16, 320, and 240. Call `setWindowPosition` or `setWindowSize` in the same frame to replace them.
- A frame accepts up to 16,384 UI commands. Commands past that limit are dropped.

The available widgets are:

| Group | Methods |
| --- | --- |
| Containers | `beginWindow`, `beginPanel`, `beginHorizontal`, `beginVertical`, `beginScrollArea`, `beginCollapsingHeader`, `beginTabBar` with `beginTabItem`, `beginMenuBar` with `beginMenu`, `beginTreeNode`, `beginTable` with `tableNextRow` and `tableNextColumn`, `beginCombo`. Each has an `end...` method. |
| Spacing | `spacing(amount)`, `separator()` |
| Text and buttons | `label`, `link`, `button`, `menuItem`, `selectable` |
| Values | `checkbox`, `radioButton`, `sliderFloat`, `sliderInt`, `dragFloat`, `textEditSingleline`, `progressBar` |
| Images and drawing | `image`, `registerTexture`, `paintLine`, `paintRect`, `paintCircle`, `paintText`, `paintPolyline`, `paintPolygon` |
| Style | `setTheme('dark' or 'light')`, `loadFont`, `setFont` |
| State | `response`, `isAvailable`, `wantsPointerInput`, `wantsKeyboardInput`, `injectText` |

## Layout, input, and responses

The engine evaluates the UI after your `render()` method returns. The results of that evaluation reach your code on the next frame. So `button()` reports a click on the frame after the player pressed it, and a changed value comes back from its widget on the next frame. The first time you draw an ID, and on any frame where it is missing, a widget returns the value you passed in.

```ts
import { Colors, Game, Key } from '@bornengine/engine';

class InventoryGame extends Game {
  private autoPickup = true;
  private pickups = 0;
  private hint = '';

  protected override loop(_deltaTime: number): void {
    if (this.ui.wantsKeyboardInput()) return;
    if (this.input.isKeyPressed(Key.SPACE)) this.pickups += 1;
  }

  protected override render(): void {
    this.renderer.clear(Colors.DARKGRAY);

    this.ui.beginWindow(200, 'Inventory', 24, 24, 320, 200);
    this.ui.beginHorizontal(201);
    this.ui.label(202, 'Pickups: ' + this.pickups);
    this.autoPickup = this.ui.checkbox(203, 'Auto pickup', this.autoPickup);
    this.ui.endHorizontal(201);
    this.ui.separator();
    if (this.ui.button(204, 'Reset')) this.pickups = 0;
    this.ui.endWindow(200);

    const reset = this.ui.response(204);
    this.hint = reset.present && reset.hovered ? 'Sets the pickup count to zero.' : '';
    if (this.hint.length > 0) {
      this.renderer.drawText(this.hint, { x: 24, y: 240 }, 16, Colors.WHITE);
    }
  }
}

new InventoryGame().run();
```

`response(id)` returns a `UiResponse` for an ID, taken from the last completed frame:

| Field | Meaning |
| --- | --- |
| `present` | The ID produced a response in the last completed frame. When it is `false`, every other field is empty. |
| `clicked`, `changed` | The widget was clicked or its value changed. |
| `hovered`, `focused`, `dragged` | The pointer is over it, it has keyboard focus, or it is being dragged. |
| `value`, `text` | The numeric value, or the text of a text field. |

Use `wantsPointerInput()` and `wantsKeyboardInput()` to keep gameplay from reacting to input that the UI is using, for example when the pointer is over a window or a text field has focus. The UI does not stop your game from receiving the same input; your code decides what to ignore.

`injectText(text)` queues text for the UI as if the player had typed it. Use it when text comes from your own input path, such as an on-screen keyboard.

## Custom drawing and assets

`paintLine`, `paintRect`, `paintCircle`, `paintText`, `paintPolyline`, and `paintPolygon` draw shapes inside the current container. Coordinates start at the container's top-left corner. Colors are `{ r, g, b, a }` with channels from 0 to 255, like `Colors.*`. `paintRect` fills its rectangle. The circle, polyline, and polygon methods draw outlines. `paintLine`, `paintCircle`, `paintPolyline`, and `paintPolygon` take a `thickness` that defaults to 1.

```ts
import { Colors, Game } from '@bornengine/engine';
import type { Texture } from '@bornengine/engine';

class StatusGame extends Game {
  private portrait: Texture | null = null;

  protected override onStart(): void {
    this.portrait = this.assets.loadTexture('assets/portrait.png');
  }

  protected override render(): void {
    this.renderer.clear(Colors.BLACK);

    this.ui.beginWindow(300, 'Status', 16, 16, 240, 200);
    if (this.portrait !== null) this.ui.image(301, this.portrait, 64, 64);
    this.ui.progressBar(302, 0.75, 'Health');
    this.ui.paintRect(303, 0, 150, 120, 6, Colors.DARKGREEN);
    this.ui.paintText(304, 'Level 3', 4, 160, 14, Colors.WHITE);
    this.ui.endWindow(300);
  }
}

new StatusGame().run();
```

- `image(id, texture, width, height)` draws a texture. The size defaults to the texture's own size. The call registers the texture for you, and it ignores a texture that is not loaded or that belongs to another `Game`. `registerTexture(texture)` does the registration alone.
- `loadFont(id, family, bytes)` loads a font from an array of bytes, and `setFont(id)` selects it. `setTheme('light')` switches from the dark default.
- `progressBar(id, fraction, label)` expects a fraction from 0 to 1.

## Developer overlay

`game.debugUi` is a second surface with the same methods, drawn by Dear ImGui, a UI library for developer tools, instead of egui. It is meant for developer tools. Keep it separate from `game.ui`, which is for the player. Check `game.debugUi.isAvailable()` before you draw, because most targets do not include it.

```ts
import { Colors, Game } from '@bornengine/engine';

class DebugDemo extends Game {
  private wave = 1;

  protected override render(): void {
    this.renderer.clear(Colors.BLACK);
    if (!this.debugUi.isAvailable()) return;
    this.debugUi.beginWindow(9000, 'Gameplay', 16, 300, 240, 120);
    this.debugUi.label(9001, 'Wave: ' + this.wave);
    this.debugUi.endWindow(9000);
  }
}

new DebugDemo().run();
```

[Debug tools](../debug-ui/) covers the built-in inspector, the build requirement, and the ID range that the inspector reserves.

## Platform support

`game.ui.isAvailable()` is `true` on every target that runs the shared engine, which means desktop, mobile, tvOS, visionOS, and Web/WASM. It is `false` on watchOS.

- On watchOS the UI commands are ignored. Buttons return `false`, value widgets return the value you passed in, and `response(id).present` is `false`. Give your game another way to do what the UI does there.
- `game.debugUi.isAvailable()` is `true` only on Linux, macOS, and Windows builds that enable the `debug-ui` native feature.
- The retained GUI is also unavailable on watchOS. Its controls do not render there in the current release. See the [GUI API](../gui/) for the details.

## Next steps

- The [GUI API](../gui/) documents retained controls with parents, events, and profiles.
- [Audio and UI](../../guides/audio-and-ui/) builds a menu with sound effects.
- [Debug tools](../debug-ui/) shows the developer inspector.
