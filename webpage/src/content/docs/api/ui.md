---
title: UI
description: Build player-facing menus and HUD widgets with the Game-owned UI facade.
section: API / UI
order: 45
---

`game.ui` is a player-facing immediate UI surface. Describe widgets during the `render()` hook with stable numeric IDs; the backend processes commands after the callback and reports responses on the next frame.

For persistent control objects, nested parents, subclass event hooks, profiles, and method-based geometry, use the [retained GUI API](../gui/). Both APIs share the same egui context and display while keeping separate IDs and response data.

## Player UI

```ts
import { Game } from '@bornengine/engine';
class ExampleGame extends Game {
  protected override render(): void {
    this.renderer.clear({ r: 16, g: 20, b: 28, a: 255 });
    this.ui.beginWindow(100, 'Audio', 24, 24, 340, 220);
    volume = this.ui.sliderFloat(101, 'Volume', volume, 0, 1);
    muted = this.ui.checkbox(102, 'Mute', muted);
    if (this.ui.button(103, 'Apply')) saveSettings(volume, muted);
    this.ui.endWindow(100);
  }
}

const game = new ExampleGame({ window: { title: 'Settings' } });
let volume = 0.7;
let muted = false;

game.run();
```

Give each interactive widget a stable ID. A widget can return its previous value for one frame while the completed UI response is being applied.

## Layout, input, and responses

The surface includes windows, panels, horizontal/vertical layouts, tabs, tables, menus, scroll areas, text fields, sliders, buttons, and collapsible sections. Read `game.ui.response(id)` when you need hover, focus, or changed state. Use `wantsPointerInput()` and `wantsKeyboardInput()` to suppress gameplay input while the UI has focus.

```ts
const response = game.ui.response(103);
if (response.present && response.clicked) console.log('apply requested');
if (game.ui.wantsPointerInput()) pausePointerLook();
```

## Custom drawing and assets

Use `paintLine`, `paintRect`, `paintCircle`, `paintText`, `paintPolyline`, and `paintPolygon` for custom UI shapes. Register a Game-owned Texture before passing it to `image()`.

```ts
game.ui.registerTexture(playerTexture);
game.ui.image(104, playerTexture, 64, 64);
game.ui.setTheme('dark');
```

## Developer overlay

`game.debugUi` exposes the separate developer overlay backend. Keep it separate from player-facing UI, and check `isAvailable()` before presenting platform-specific debug panels.

## Platform support

UI availability depends on the selected platform backend. Query `game.ui.isAvailable()` at runtime and provide a non-UI gameplay path for targets where that backend is not available.
