---
title: UI
description: Build player-facing menus, HUDs, settings, and custom widgets with BornEngine's TypeScript UI API.
section: API / UI
order: 44
---

BornEngine's `ui` module provides an immediate-mode API for in-game interfaces. TypeScript describes the widgets each frame; the Rust renderer runs egui and draws the result with the game. Stable widget IDs preserve interaction state between frames. The API is suited to menus, settings, inventory panels, and HUD elements that need layout, input, and text editing.

Use `@bornengine/engine/ui` for player-facing UI. `@bornengine/engine/debug-ui` exposes a separate Dear ImGui context for developer overlays; it is optional and described below.

## Player UI

Queue UI commands from the regular game callback. Give each interactive widget a stable numeric ID and keep its value in game state:

```ts
import { clearBackground, initWindow, runGame } from '@bornengine/engine/core';
import { ui } from '@bornengine/engine/ui';

initWindow(960, 540, 'Settings');
let volume = 0.7;
let muted = false;

runGame(() => {
  clearBackground({ r: 16, g: 20, b: 28, a: 255 });

  ui.beginWindow(100, 'Audio', 24, 24, 340, 220);
  volume = ui.sliderFloat(101, 'Volume', volume, 0, 1);
  muted = ui.checkbox(102, 'Mute', muted);
  if (ui.button(103, 'Apply')) saveSettings(volume, muted);
  ui.endWindow(100);
});

function saveSettings(nextVolume: number, nextMuted: boolean): void {
  console.log('settings', nextVolume, nextMuted);
}
```

The API includes windows and panels, horizontal and vertical layouts, spacing, separators, scroll areas, tabs, collapsible and tree sections, menus, tables, and combo boxes. Interactive widgets include links, buttons, checkboxes, radio buttons, sliders, drag values, text fields, selectables, progress bars, and images.

## Layout, input, and responses

The callback queues a fresh widget description each frame. Rust evaluates that description after the callback, then exposes the completed response during the next callback. This one-frame delay applies to button clicks, changed values, text edits, and input-capture state. Keep IDs stable and unique for widgets whose state you read back.

Read the complete response when you need to distinguish an undrawn ID from a widget with a default value:

```ts
import { ui } from '@bornengine/engine/ui';

const response = ui.response(103);
if (response.present && response.clicked) {
  console.log('Apply was clicked');
}

if (ui.wantsPointerInput()) {
  // Pause pointer-driven gameplay while the UI owns the pointer.
}
if (ui.wantsKeyboardInput()) {
  // Pause keyboard-driven gameplay while a UI field has focus.
}
```

`UiResponse` contains `present`, `clicked`, `changed`, `hovered`, `focused`, `dragged`, `value`, and `text`. `wantsPointerInput()` and `wantsKeyboardInput()` let the game decide which gameplay controls to suppress while a UI widget is active.

## Custom drawing and assets

Use `paintLine`, `paintRect`, `paintCircle`, `paintText`, `paintPolyline`, and `paintPolygon` for custom elements in the UI layer. Colors use `{ r, g, b, a }` channels from `0` to `255`. Use `registerTexture()` and `image()` to show an engine texture in a widget; optional width and height override its displayed size. `setTheme()` chooses the dark or light style. `loadFont()` and `setFont()` register and select a font for the UI context.

## Developer overlay

The `debugUi` export uses a separate Dear ImGui context and shares the typed widget API. It includes `demoWindow()` and `metricsWindow()` for built-in developer tools. The TypeScript subpath is available on every target, while the renderer is opt-in for desktop native builds:

```toml
[native-library."@bornengine/engine"]
features = ["debug-ui"]
```

Enable the Cargo `debug-ui` feature for Linux, macOS, or Windows and check `debugUi.isAvailable()` before drawing the overlay. Perry must be version 0.5.1126 or newer to forward native library features from `perry.toml`. Builds without the feature do not include the Dear ImGui renderer.

## Platform support

The egui `ui` backend is available on desktop, Android, iOS, tvOS, visionOS, and Web/WASM. It is unavailable on watchOS. Use `ui.isAvailable()` when a game runs across targets. Dear ImGui debug overlays are available only on Linux, macOS, and Windows when `debug-ui` is enabled.

Text fields use Unicode text input on desktop, including Windows keyboard input and non-BMP characters. The Web host forwards browser composition and paste events; iOS connects its native keyboard bridge. Android provides bridge entry points, and its Perry host must call them to show the soft keyboard and forward committed UTF-8 text.
