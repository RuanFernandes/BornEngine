---
title: Assets
description: Load resources from Game or Scene scopes and let each owner release them.
section: API / Assets
order: 34
---

`game.assets` and `scene.assets` expose the same factory API with different lifetimes. Game assets are shared until the Game shuts down. Scene assets are released when their Scene unloads, so a level can own its temporary resources directly.

## Game-owned cache

```ts
import { Game, Texture } from '@bornengine/engine';

class MyGame extends Game {
  private player: Texture | null = null;

  protected override onStart(): void {
    this.player = this.assets.loadTexture('assets/player.png');
    if (this.player === null || !this.player.isLoaded) {
      console.error(this.player?.error || 'Unable to load player texture.');
    }
  }
}
```

Successful loads of the same path in one scope return the same live resource. Failed loads remain available through their `error` and `isLoaded` fields; release the entry before retrying. `loadTexture(path)`, `loadModel(path)`, `loadFont(path, size)`, `loadSound(path)`, and `loadMusic(path)` cache by path, with font size included in its key.

## Scene-owned assets

```ts
import { Scene, Texture } from '@bornengine/engine';

class ForestScene extends Scene {
  private atlas: Texture | null = null;

  override onEnter(): void {
    this.atlas = this.assets.loadTexture('assets/forest/atlas.png');
  }

  override onUnload(): void {
    // The scene asset scope releases the atlas automatically after this hook.
  }
}
```

`scene.assets` also provides `loadModel`, `loadFont`, `loadSound`, `loadMusic`, `createMesh`, `createMaterial`, `createAnimation`, `createImageData`, `createTexture`, and `createRenderTexture`. Each created resource is disposed as the Scene unloads. Use `game.assets` for resources intentionally shared across scenes; use `scene.assets` for assets that should end with a level.

## Texture cache operations

Use `getTexture(path)` or `getModel(path)` to inspect a cache without loading. `releaseTexture(path)`, `releaseModel(path)`, `releaseSound(path)`, and `releaseMusic(path)` dispose a cached entry. `release(resource)` disposes any resource created by that manager. `clear()` releases all managed resources but keeps the scope reusable; `dispose()` releases them and prevents further loads. `textureCount` counts cached textures and `resourceCount` counts all live resources.

If a path is empty, a manager is disposed, or its Game has shut down, path-based factories return `null`. When an embedded Game is not ready, texture loading returns an uncached readiness-error Texture so the host can retry after attaching its surface.

## Ownership and shutdown

Every resource created by a manager belongs to that manager even when it is not path-cached, including generated meshes, materials, animation controllers, image data, textures made from image data, and render targets. `scene.assets.dispose()` runs automatically when its Scene unloads. `game.assets.dispose()` runs during `Game.dispose()`. A manually disposed resource is removed from the live resource count and can be loaded again through the manager.

## Preload groups

Use `createGroup()` to track textures, sounds, and music needed before entering a level. The group reports aggregate progress and a result for each path. Loaded assets join the scope's cache and lifetime, including when the group belongs to `scene.assets`.

```ts
const levelAssets = game.assets.createGroup('forest-level');
if (levelAssets !== null) {
  levelAssets.addTexture('assets/forest/atlas.png');
  levelAssets.addSound('assets/audio/step.wav');
  levelAssets.addMusic('assets/audio/forest.ogg');

  const state = await levelAssets.load();
  if (state === 'ready') startForestLevel();
  else console.error(levelAssets.entries);
}
```

`load()` starts each entry once and resolves to `ready`, `failed`, `cancelled`, or `disposed`. Inspect `progress`, `state`, and `entries` to show loading UI or handle individual failures. `cancel()` settles pending entries; `dispose()` releases the group's references.

See [Textures](../textures/) for sampling and render targets, and the [asset pipeline guide](../../guides/assets/) for project paths and packaging.
