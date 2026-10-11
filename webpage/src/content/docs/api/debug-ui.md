---
title: Debug tools
description: Turn on the built-in inspector and add your own developer panels with the optional Dear ImGui overlay.
section: API
order: 46
---

The inspector is a set of developer panels that the engine draws on top of your game. It shows frame timing, the active scene and its objects, the number of loaded textures, and any script components. It is off by default and costs a little CPU time every frame while it is on.

`game.debugUi` is the drawing surface behind it. It has the same methods as the player UI in [UI](../ui/), but it is drawn by Dear ImGui, a UI library for developer tools, instead of egui, and it is meant for developers, not players. You can use it for your own panels.

Dear ImGui is not part of every build. It exists only in Linux, macOS, and Windows builds that include the `debug-ui` native feature. On every other target `game.debugUi.isAvailable()` returns `false`, and the inspector and your panels draw nothing. The same game code runs everywhere because both check availability before they issue any command.

To include the feature in a BornEngine CLI project, add it to `native_features` under `[bornengine]` in `perry.toml`, and keep the project's `native_profile`:

```toml
[bornengine]
native_profile = "2d"
native_features = ["debug-ui"]
```

Then build with `bornengine build`, `bornengine run`, or `bornengine dev` so the CLI passes the feature on. The [debugging guide](../../guides/debugging/) walks through the setup.

## Enable the inspector

Turn the inspector on with the `debug` option of the `Game` constructor.

```ts
import { Colors, Game } from '@bornengine/engine';

class InspectedGame extends Game {
  constructor() {
    super({
      window: { title: 'Inspector demo', width: 960, height: 540 },
      targetFps: 60,
      debug: {
        enabled: true,
        metrics: true,
        sceneHierarchy: true,
        assets: true,
        scripts: false,
      },
    });
  }

  protected override render(): void {
    this.renderer.clear(Colors.DARKBLUE);
    super.render();
  }
}

new InspectedGame().run();
```

`debug: true` turns on every panel. With an options object, `enabled` must be `true`, and each panel is on unless you set its option to `false`:

| Option | Panel | What it shows |
| --- | --- | --- |
| `metrics` | Performance | Frames per second, frame time, 2D draw submissions, sprites drawn and culled, update and render time, and active and total object and component counts. |
| `sceneHierarchy` | Scene | The active scene's name and state, then its objects as a tree with each object's active state, component count, world position, and scale. It lists the first 256 objects and goes 64 levels deep. |
| `assets` | Assets | The number of loaded textures. |
| `scripts` | Scripts | For each script component, its owner, status, guest memory, last callback time, and error. It lists the first 64 components. See [Embedded JavaScript](../scripting/). |

The inspector draws after your `render()` method and after the retained controls of the [GUI API](../gui/), so its panels stay on top.

## Add custom diagnostics

Draw your own panels from `render()`. Check `isAvailable()` first, and give every widget a numeric ID that stays the same from frame to frame.

```ts
import { Colors, Game } from '@bornengine/engine';

class WaveGame extends Game {
  private wave = 1;
  private enemies = 0;

  protected override render(): void {
    this.renderer.clear(Colors.BLACK);
    if (!this.debugUi.isAvailable()) return;

    this.debugUi.beginWindow(9000, 'Gameplay', 16, 300, 240, 120);
    this.debugUi.label(9001, 'Wave: ' + this.wave);
    this.debugUi.label(9002, 'Enemies: ' + this.enemies);
    if (this.debugUi.button(9003, 'Next wave')) this.wave += 1;
    this.debugUi.endWindow(9000);
  }
}

new WaveGame().run();
```

- Use IDs below 4,000,000,000 for your widgets. The inspector reserves IDs from that value upward.
- Every widget method of [UI](../ui/) is available, including `response(id)` and the `begin...` and `end...` pairs. `demoWindow(id)` and `metricsWindow(id)` open the built-in Dear ImGui demo and metrics windows.
- Do not draw debug controls through `game.ui` unless players should see them in the shipped game. The player UI is available on more targets and is part of the shipped game.
- Debug panels belong in `render()`, but never make game rules depend on what they return.

## Next steps

- [UI](../ui/) documents the immediate-mode widgets that `debugUi` shares.
- The [GUI API](../gui/) documents retained controls with parents, events, and profiles.
- [Runtime debugging](../../guides/debugging/) covers build settings and troubleshooting.
