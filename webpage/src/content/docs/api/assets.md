---
title: Assets
description: Cache Game-owned textures and manage their lifetime across scenes.
section: API / Assets
order: 34
---

Every `Game` exposes an `AssetManager` at `game.assets`. It provides a shared cache for file-backed textures, while direct resource constructors remain available when a resource needs an individual lifetime.

## Game-owned cache

```ts
import { Game } from '@bornengine/engine';

const game = new Game();
const player = game.assets.loadTexture('assets/textures/player.png');
const background = game.assets.loadTexture('assets/textures/background.png');

if (player === null) {
  console.error('Game is not available for asset loading.');
} else if (!player.isLoaded) {
  console.error(player.error || 'Player texture failed to load.');
}
```

`loadTexture(path)` returns the same live `Texture` for repeated requests with the same path string. Paths are used as cache keys exactly as supplied, so prefer one consistent spelling for each asset. The manager does not own `SpriteSheet` objects; sheets reference their texture.

## Texture cache operations

Use `getTexture(path)` to inspect the cache without loading. `releaseTexture(path)` disposes and removes one texture; `clear()` releases the full cache and keeps the manager reusable. `textureCount` counts live cached textures.

```ts
const shared = game.assets.loadTexture('assets/textures/player.png');
const cached = game.assets.getTexture('assets/textures/player.png');
const released = game.assets.releaseTexture('assets/textures/player.png');
```

`loadTexture()` returns `null` after the manager or its Game is disposed, or for an empty path. If the runtime is not ready, it returns an uncached `Texture` with a readiness error so embedded hosts can retry after attaching their surface. A file-loading failure returns a `Texture` whose `isLoaded` is false and whose `error` describes the failure.

## Ownership and shutdown

The manager is owned by `Game`; Game shutdown releases its cache. A loading scene can call `releaseTexture(path)` when that asset should be removed before the whole Game shuts down. If other gameplay code still holds the released `Texture`, it must stop using it. Use `new Texture(game, path)` for an uncached resource with its own explicit `dispose()` lifecycle.

See [Textures](../textures/) for filtering, drawing, and render targets, and [Assets guide](../../guides/assets/) for project paths and packaging.

## Preload groups

Use `createGroup()` to track textures, sounds, and music needed by a scene. The group reports aggregate progress and an entry result for each path; it does not take ownership away from `AssetManager` or `AudioSystem`.

```ts
const levelAssets = game.assets.createGroup('forest-level');
if (levelAssets !== null) {
  levelAssets.addTexture('assets/forest/atlas.png');
  levelAssets.addSound('assets/audio/step.wav');
  levelAssets.addMusic('assets/audio/forest.ogg');

  const state = await levelAssets.load();
  if (state === 'ready') {
    startForestLevel();
  } else {
    console.error(levelAssets.entries);
  }
}
```

`load()` starts each entry once and resolves to `ready`, `failed`, `cancelled`, or `disposed`. Inspect `progress`, `state`, and `entries` to show loading UI or handle individual failures. `cancel()` settles pending entries, while `dispose()` releases the group's references; cached and loaded resources remain owned by the Game's asset and audio services.
