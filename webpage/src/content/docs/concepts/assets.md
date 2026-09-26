---
title: Assets
description: Organize portable asset paths and manage runtime resources through their owning Game.
section: Concepts
order: 12
---

Keep assets under the project directory and use relative paths. The same layout works for native bundles and Web/WASM output:

```text
assets/
├── audio/
├── fonts/
├── models/
└── textures/
```

Runtime resources receive their owning Game. Reuse them while their scene or game is active, check load state, and dispose them when their lifetime ends.

```ts
import { Font, Game, Model, Texture } from '@bornengine/engine';

const game = new Game();
const player = new Texture(game, 'assets/textures/player.png');
const jump = game.audio.loadSound('assets/audio/jump.wav');
const level = new Model(game, 'assets/models/scene.glb');
const uiFont = new Font(game, 'assets/fonts/ui.ttf', 20);

for (const resource of [player, jump, level, uiFont]) {
  if (!resource.isLoaded) console.error(resource.error);
}
```

## Keep paths portable

Native Apple targets resolve reads against the app bundle. Web builds fetch assets from the served output. Place files below `assets/` and let the CLI package them rather than using machine-specific absolute paths.

## Loading strategy

Load textures, fonts, audio, and models during startup or a loading phase, not repeatedly during rendering. Filtering is configured on the Texture instance with `texture.setFilter(...)`; renderer post-processing is configured through the owning `game.renderer`. Neither operation uses global state.

For authored levels, use the versioned [world format](../../guides/world-format/) so editor data and runtime share one serialization shape. `WorldData` owns validation and loading; `WorldInstance` owns the runtime nodes it creates.
