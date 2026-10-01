---
title: Asset pipeline
description: Keep files portable across desktop, mobile, Apple bundles, and the browser build.
section: Guides
order: 63
---

Treat `assets/` as the stable boundary between project source and platform packaging:

```text
assets/
├── models/character.glb
├── textures/player.png
├── audio/jump.wav
├── fonts/ui.ttf
└── worlds/level1.world.json
```

Use relative paths from the project root in TypeScript. The native Apple layer resolves read paths from the application bundle, and the Web/WASM build copies the assets into `dist/web/`. Avoid relying on the process working directory or a developer-specific absolute path.

For models, glTF/GLB is the main path and OBJ is also recognized by the model loader. For audio, keep web compatibility in mind: WAV and OGG are supported, while MP3 is not on the web target. Preprocess images with the texture image helpers when you need a crop, resize, flip, or mipmap before upload.

Load long-lived resources once, retain their handles, and choose their owner by lifetime. `game.assets` keeps shared resources until shutdown; `scene.assets` releases its resources when that scene unloads:

```ts
import { FILTER_NEAREST, Game, Scene, Texture } from '@bornengine/engine';

const game = new Game();
const playerTexture = game.assets.loadTexture('assets/textures/player.png');
const sameTexture = game.assets.loadTexture('assets/textures/player.png');
// Repeated requests for a live path return the same Texture instance.

if (playerTexture !== null && playerTexture.isLoaded) {
  playerTexture.setFilter(FILTER_NEAREST);
}

class ForestScene extends Scene {
  private atlas: Texture | null = null;

  override onEnter(): void {
    this.atlas = this.assets.loadTexture('assets/forest/atlas.png');
  }
  // Scene unload disposes this Texture automatically.
}

// Keep the player texture shared; only release it early when no owner uses it.
game.assets.releaseTexture('assets/textures/player.png');
```

`loadTexture()` returns `null` if the manager is disposed or the path is empty. A file-loading failure returns a `Texture` with `isLoaded === false` and an `error` message. Before an embedded Game is ready, it returns an uncached readiness-error Texture so the caller can retry after attaching its surface. `game.assets.clear()` releases all resources in that scope but keeps the manager reusable. `scene.assets` offers the same factories with automatic Scene lifetime; resource classes are created by their owning asset manager rather than by passing a Game to their constructors.
