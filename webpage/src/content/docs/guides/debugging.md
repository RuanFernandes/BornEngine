---
title: Runtime debugging
description: Enable the BornEngine inspector and add project-specific runtime diagnostics.
section: Guides
order: 9
---

BornEngine's developer inspector is configured on the `Game` instance. Enable it for local builds and keep it off for ordinary game builds:

```ts
const game = new Game({
  debug: {
    enabled: true,
    metrics: true,
    sceneHierarchy: true,
    assets: true,
  },
});
```

The inspector draws after the game's render hook through the Dear ImGui debug surface. It reports frame timing, scene objects, and asset usage. Each panel can be disabled separately. `debug: true` turns on all built-in panels.

## Desktop feature

Dear ImGui is opt-in on native desktop targets. Add `debug-ui` to the BornEngine CLI's native feature list in `perry.toml`. Keep the selected game profile; this example shows a 2D project:

```toml
[bornengine]
native_profile = "2d"
native_features = ["debug-ui"]
```

Build with `bornengine build`, `bornengine run`, or `bornengine dev` so the CLI forwards both the profile and extra feature to the Rust crate. `debug-ui` is available only in the Linux, macOS, and Windows native crates. This setting does not affect direct Perry commands or the prebuilt Web/WASM package.

Check `game.debugUi.isAvailable()` before drawing custom panels. On other targets, or when the desktop feature is off, it returns `false`; gameplay can keep using the same `Game` options without platform checks.

## Project-specific windows

Use `game.debugUi` for developer-only widgets such as state labels and live counters. Keep IDs stable and unique, and use `game.ui` only for player-facing interface.

```ts
if (game.debugUi.isAvailable()) {
  game.debugUi.beginWindow(9100, 'Combat');
  game.debugUi.label(9101, 'Wave: ' + wave);
  game.debugUi.label(9102, 'Enemies: ' + enemies.length);
  game.debugUi.endWindow(9100);
}
```

See [Debug tools](../../api/debug-ui/) for the complete configuration and backend details.
