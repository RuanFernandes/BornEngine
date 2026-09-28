---
title: Debug tools
description: Configure the optional Dear ImGui inspector and add game-specific diagnostics.
section: API / UI
order: 46
---

The engine inspector is opt-in through `Game` options and uses BornEngine's existing Dear ImGui backend. It can show frame timing, the active scene hierarchy, and loaded asset counts without adding a second UI system to the game.

## Enable the built-in inspector

```ts
import { Game } from '@bornengine/engine';

const game = new Game({
  debug: {
    enabled: true,
    metrics: true,
    sceneHierarchy: true,
    assets: true,
  },
});
```

For quick local builds, `debug: true` enables all built-in panels. With an options object, `enabled` must be set to `true`; each panel defaults to visible and can be hidden independently. The inspector adds a small amount of CPU work while enabled and remains absent by default.

Dear ImGui is compiled only into opt-in desktop native builds (`macOS`, `Linux`, and `Windows`) with the `debug-ui` feature. Web, mobile, tvOS, visionOS, and watchOS report this backend as unavailable. The inspector checks availability before issuing commands, so the same game code can run on every target.

## Add custom diagnostics

`game.debugUi` is separate from player-facing `game.ui`. Add your own stable widget IDs while rendering, and check whether the backend is available first:

```ts
if (game.debugUi.isAvailable()) {
  game.debugUi.beginWindow(9000, 'Gameplay');
  game.debugUi.label(9001, 'Wave: ' + wave);
  game.debugUi.label(9002, 'Enemies: ' + enemies.length);
  game.debugUi.endWindow(9000);
}
```

Use unique numeric IDs below `4_000_000_000` for custom widgets; the built-in inspector reserves IDs from that value upward. Do not put debug controls in `game.ui` unless players should see them in production.

See the [UI API](ui/) for the full widget surface and the [debugging guide](../guides/debugging/) for platform build settings.
