---
title: Assets
description: How asset paths work, how loading and caching behave, and when a game or scene releases its resources.
section: Concepts
order: 13
---

An asset is a file your game loads, such as an image, a sound, a font, or a 3D model. You refer to assets by path, and the asset manager loads each file once and returns the same object for the same path.

## Keep paths portable

Keep assets inside the project folder, usually in `assets/`, and write paths with forward slashes:

```text
assets/player.png
assets/sounds/jump.wav
assets/fonts/title.ttf
```

Three rules prevent most path problems:

- Use paths relative to the project, not absolute paths such as `/home/you/game/assets/player.png`.
- Match the case of the file name. `Player.png` and `player.png` are different files on Linux and on web servers, even though some desktop systems ignore case.
- Use `/` as the separator on every platform.

The platform pages describe how the files reach each target, including app bundles and the browser build.

## Game and scene scopes

Every asset belongs to one scope:

- **`game.assets`** is shared by the whole game. Its assets stay loaded until the game stops. Use it for assets that many scenes use, such as a UI font or a common sound.
- **`scene.assets`** belongs to one scene. Its assets are released when the scene unloads, which happens when another scene replaces it with `scenes.changeTo(...)`. Use it for level art.

For example, `this.assets.loadFont('assets/fonts/ui.ttf', 16)` loads a font into the game scope, and `scene.assets.loadTexture('assets/level.png')` loads a texture into a scene scope.

If a scene loads an asset that the next scene also needs, move the load to `game.assets` so it is not loaded twice.

## Loading and checking

`loadTexture(path)` returns a `Texture`. The call does not throw when the file is missing. Instead, the texture reports the failure:

```ts
import { Colors, Game, Texture } from '@bornengine/engine';

class AssetDemo extends Game {
  private logo: Texture | null = null;

  constructor() {
    super({ window: { title: 'Assets', width: 800, height: 450 } });
  }

  protected override onStart(): void {
    this.logo = this.assets.loadTexture('assets/logo.png');
    if (this.logo === null || !this.logo.isLoaded) {
      console.error(this.logo?.error ?? 'Could not load assets/logo.png');
    }
  }

  protected override render(): void {
    this.renderer.clear(Colors.BLACK);
    if (this.logo !== null && this.logo.isLoaded) this.renderer.drawTexture(this.logo, { x: 20, y: 20 });
  }
}

new AssetDemo().run();
```

Check `isLoaded` before you draw. `loadTexture` returns `null` when the asset manager can no longer create assets, for example after its scene has unloaded.

Other loaders follow the same pattern: `loadFont(path, size)`, `loadSound(path)`, `loadMusic(path)`, and `loadModel(path)`. `getTexture`, `getModel`, and `getFont` return a cached asset without loading it. `releaseTexture`, `releaseModel`, `releaseSound`, and `releaseMusic` remove a cached asset.

## Caching and retries

The asset manager caches each path. A second call for the same path returns the cached object, including a failed one. If you fix the file and want to load it again, release the cached entry first:

Call `this.assets.releaseTexture('assets/player.png')`, then `this.assets.loadTexture('assets/player.png')` again. `releaseTexture` removes the entry and disposes the texture, so do not keep using the old object after you release it.

## Loading with `@Asset`

Inside a `GameObject` subclass, the `@Asset` decorator loads a texture into a field when the object is added to a scene:

```ts
import { GameObject, Texture } from '@bornengine/engine';
import { Asset } from '@bornengine/engine/annotations';

class Player extends GameObject {
  @Asset('assets/player.png')
  readonly image!: Texture;
}
```

If the file cannot be loaded, the default behavior throws while the object is being added. You get the failure at startup instead of when the field is first used. The [game API](../../api/game/) page describes the optional error callback and its limits.

## Next steps

- [API shape](../api-shape/) explains which owner creates and releases each kind of object.
- [Textures](../../api/textures/) lists the texture members, sampling, and render textures.
- [Assets API](../../api/assets/) covers the cache, hot reload, and shutdown.
- [Assets and worlds](../../guides/assets-and-worlds/) loads a shared set of resources for a level.
