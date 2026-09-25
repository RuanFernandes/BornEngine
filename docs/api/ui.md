# UI

BornEngine exposes two TypeScript UI APIs backed by Rust renderers:

- `ui` builds game menus, HUDs, settings screens, and other player-facing UI with egui.
- `debugUi` builds optional developer overlays with Dear ImGui on desktop.

Both APIs queue commands during the game callback. Rust evaluates them at the end of the frame and makes the responses available in the next callback. Use stable numeric IDs for widgets that should keep their state between frames.

```ts
import { runGame } from "@bornengine/engine/core";
import { ui } from "@bornengine/engine/ui";
import { debugUi } from "@bornengine/engine/debug-ui";

let volume = 0.8;
let showStats = true;

runGame(() => {
  ui.beginWindow(100, "Settings");
  volume = ui.sliderFloat(101, "Volume", volume, 0, 1);
  ui.endWindow();

  if (debugUi.isAvailable() && showStats) {
    debugUi.beginWindow(900, "Developer tools");
    debugUi.metricsWindow(901);
    debugUi.endWindow();
  }
});
```

## Player-facing UI

The `ui` module supports windows, panels, vertical and horizontal layout, scrolling, tabs, collapsible sections, menus, and tables. Widgets include labels, links, buttons, checkboxes, radio buttons, integer and float sliders, drag values, text fields, combo boxes, selectables, progress bars, and images. `paintLine`, `paintRect`, `paintCircle`, `paintText`, `paintPolyline`, and `paintPolygon` add custom drawing in the current UI area.

Use `setTheme("dark" | "light")`, `loadFont(id, family, bytes)`, and `setFont(id)` to configure the egui style and fonts. Register game textures with `registerTexture(texture)` before passing the returned handle to `image`.

## Developer overlay

`debugUi` exposes the same widget and drawing methods through a separate Dear ImGui context. It includes `demoWindow()` and `metricsWindow()` for Dear ImGui's built-in tools. Dear ImGui is disabled by default and available on Linux, macOS, and Windows when the `debug-ui` native library feature is enabled. The common TypeScript API remains importable on every target; check `debugUi.isAvailable()` before building its widgets.

For a Perry project, enable the opt-in feature in `perry.toml`:

```toml
[native-library."@bornengine/engine"]
features = ["debug-ui"]
```

Native Cargo feature forwarding requires Perry 0.5.1126 or newer. Older Perry versions ignore this feature configuration and use the target crate's default features.

The engine dependencies are `imgui` 0.12 and `imgui-wgpu` 0.28. Ordinary builds that omit `debug-ui` do not include them.

## Input and responses

After building widgets, use `response(id)` to read `clicked`, `changed`, `hovered`, `focused`, `dragged`, `value`, and `text`. The returned `present` flag distinguishes a widget with an empty text value from an ID that was not drawn. Value widgets also return their most recently completed value, which makes this pattern convenient:

```ts
volume = ui.sliderFloat(101, "Volume", volume, 0, 1);
```

The response is one completed UI frame behind the callback that queues the current widgets. `wantsPointerInput()` and `wantsKeyboardInput()` let game code choose when to pause its own pointer- or keyboard-driven controls while the UI is being used. UI input snapshots are collected separately from gameplay input reads.

Text edits use complete Unicode text events. The Web host forwards browser composition and paste input, and desktop builds read the normal keyboard input stream. The iOS host connects the native keyboard bridge. Android exposes native bridge entry points; the Perry Android host still needs to call them to show the soft keyboard and forward committed UTF-8 text.
