---
title: Assets
description: Organize portable asset paths and manage resources through Game and Scene scopes.
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

Create resources from an asset scope instead of passing a Game to each constructor. Shared resources live in `game.assets`; level-specific resources live in `scene.assets` and are released when that Scene unloads.

```ts
import { Game } from '@bornengine/engine';
import type { Sound, Texture } from '@bornengine/engine';

class MyGame extends Game {
  private player: Texture | null = null;
  private jump: Sound | null = null;

  protected override onStart(): void {
    this.player = this.assets.loadTexture('assets/textures/player.png');
    this.jump = this.assets.loadSound('assets/audio/jump.wav');
    const level = this.assets.loadModel('assets/models/scene.glb');
    const uiFont = this.assets.loadFont('assets/fonts/ui.ttf', 20);

    if (this.player === null || !this.player.isLoaded) console.error(this.player?.error);
    if (level === null || !level.isLoaded) console.error(level?.error);
    if (uiFont === null || !uiFont.isLoaded) console.error(uiFont?.error);
  }
}
```

## Keep paths portable

Native Apple targets resolve reads against the app bundle. Web builds fetch assets from the served output. Place files below `assets/` and let the CLI package them rather than using machine-specific absolute paths.

## Loading strategy

Load textures, fonts, audio, and models during startup or a loading phase, not repeatedly during rendering. Filtering is configured on the Texture instance with `texture.setFilter(...)`; renderer post-processing is configured through the owning `game.renderer`. Neither operation uses global state.

Use `game.assets` for assets intentionally shared by multiple scenes. When a resource belongs only to one level, create it through that scene's asset scope; leaving the scene releases it automatically. Use `scene.vfx` for scene-owned 3D particle and decal systems.

For authored levels, use the versioned [world format](../../guides/world-format/) so editor data and runtime share one serialization shape. `WorldData` owns validation and loading; `WorldInstance` owns the runtime nodes it creates.
