---
title: Assets
description: Load textures, fonts, sounds, music, and models through Game or Scene scopes, and let each owner release them.
section: API
order: 34
---

An **asset** is a resource that the engine loads and keeps for you, such as an image, a font, a sound, or a 3D model. You never create these with `new`. You ask an **asset manager** for them. Every `Game` has one at `game.assets`, and every `Scene` has one at `scene.assets`. Both offer the same methods and differ only in lifetime:

- `game.assets` keeps its resources until the `Game` shuts down. Use it for resources that several scenes share.
- `scene.assets` releases its resources when the scene unloads. Use it for resources that belong to one level.

Import `AssetManager`, `SceneAssetManager`, and `AssetGroup` from `@bornengine/engine`, or from `@bornengine/engine/assets`. You normally reach them as `game.assets` and `scene.assets` instead of creating them.

## Game-owned cache

The loading methods cache what they load. Asking for the same path again in the same scope returns the same resource, so loading is cheap to repeat.

```ts
import { Colors, Game } from '@bornengine/engine';
import type { Font, Texture } from '@bornengine/engine';

class MyGame extends Game {
  private player: Texture | null = null;
  private hudFont: Font | null = null;

  constructor() {
    super({ window: { title: 'Assets', width: 640, height: 360 } });
  }

  protected override onStart(): void {
    const player = this.assets.loadTexture('assets/player.png');
    if (player === null || !player.isLoaded) {
      console.error(player?.error ?? 'Could not load the player texture.');
    } else {
      this.player = player;
    }
    this.hudFont = this.assets.loadFont('assets/fonts/ui.ttf', 24);
  }

  protected override render(): void {
    this.renderer.clear(Colors.DARKBLUE);
    if (this.player !== null) this.player.draw({ x: 40, y: 40 });
    const font = this.hudFont !== null && this.hudFont.isLoaded ? this.hudFont : undefined;
    this.renderer.drawText('Assets', { x: 40, y: 200 }, 24, Colors.WHITE, font);
  }
}

new MyGame().run();
```

The manager has these loading methods:

| Method | Returns | Cached by |
| --- | --- | --- |
| `loadTexture(path)` | `Texture \| null` | Path |
| `loadFont(path, size)` | `Font \| null` | Path and size |
| `loadSound(path)` | `Sound \| null` | Path |
| `loadMusic(path)` | `Music \| null` | Path |
| `loadModel(path)` | `Model \| null` | Path |
| `createGroup(name?)` | `AssetGroup \| null` | Not cached. See Preload groups. |

The manager also has methods that create a new resource every time: `createTexture(source)`, `createImageData(path)`, `createRenderTexture(width, height)`, `createMesh(vertices, indices)`, `createMaterial(source, kind?)`, and `createAnimation(path)`.

How loading results work:

- A method returns `null` when the path is empty, the manager is disposed, or the `Game` is disposed. `loadFont` also returns `null` when `size` is not a positive number.
- Otherwise you get a resource even when the file could not be loaded. Every loadable resource has `isLoaded` and `error`, so check them before you use the resource.
- A failed load stays in the cache. Loading the same path again returns the same failed resource until you release it. See Texture cache operations.
- If the `Game` is not ready, for example an embedded `Game` before its surface is attached, a texture or font load returns a resource with an `error` that is not cached. Load it again after the `Game` is ready.
- Paths are relative to your project folder. The [assets concept page](../../concepts/assets/) explains paths and project layout.

### Scene-owned assets

A scene has its own manager, created with the scene. Resources loaded through it are released when the scene unloads, after the scene's objects are destroyed.

```ts
import { Scene } from '@bornengine/engine';
import type { Game, Texture } from '@bornengine/engine';

class ForestScene extends Scene {
  private atlas: Texture | null = null;

  constructor(game: Game) {
    super(game, { name: 'forest' });
  }

  override onEnter(): void {
    this.atlas = this.assets.loadTexture('assets/forest/atlas.png');
  }

  override onUnload(): void {
    this.atlas = null;
  }
}
```

`scene.assets` has the same methods as `game.assets`. Once the scene has unloaded, its textures are disposed and `isLoaded` is `false`, so drop your references in `onUnload`. If the next scene needs a resource too, load it through `game.assets` instead.

### Load a texture into a field with @Asset

`Asset(path, errCallback?)` is a field decorator from `@bornengine/engine/annotations`. It loads a texture into a field of a `GameObject` subclass when you add the object to a scene. The decorator uses TypeScript's legacy decorator syntax. Perry compiles it without extra configuration, and your editor needs `experimentalDecorators` in `tsconfig.json`. [Game objects](../game/) covers the annotations in full.

```ts
import { GameObject } from '@bornengine/engine';
import type { Texture } from '@bornengine/engine';
import { Asset } from '@bornengine/engine/annotations';

class Badge extends GameObject {
  @Asset('assets/badge.png', (error, path) => {
    console.warn(`Badge image unavailable (${path}): ${error}`);
    return null;
  })
  readonly image!: Texture | null;
}

declare function downloadFile(url: string, path: string): Promise<void>;

class Chart extends GameObject {
  @Asset('assets/chart.png', async (_error, path, retry) => {
    await downloadFile('https://example.com/chart.png', path);
    return retry();
  })
  readonly image!: Texture;
}
```

In the example, `downloadFile` stands for your own code. This is how `@Asset` works:

- The field is filled when the object is added to a scene, before the object's `onAwake()` runs. The texture is loaded through the scene's `scene.assets`, so the scene releases it on unload. Components are not bound; only fields of `GameObject` subclasses are.
- Without a callback, a failed load throws an `Error` with the texture's `error` message. The exception comes out of `scene.addNode(...)`.
- With a callback, the engine calls `errCallback(error, path, retry)` instead of throwing. Whatever it returns becomes the field value: a `Texture`, `null`, or a Promise of either. Type the field as `Texture | null` when your callback can return `null`.
- `retry()` reloads the same path. If the scene cached a failed texture for that path, `retry()` releases it and loads the file again. It returns the new `Texture`, or throws if the load fails again. This is useful when your callback has already fetched or created the missing file.
- An `async` callback delays the object. `scene.addNode(...)` returns the object at once, and the object joins the scene, and runs `onAwake()`, after the Promise resolves. `addChild()` throws when you attach such an object to a parent that is already in a scene, so add it with `scene.addNode(...)` instead.
- Limitation: on native Linux, `Game.run()` does not process promise jobs (the queued work that lets a Promise finish) or timers during play yet. An `async` callback does not resolve there, and the object stays pending. Use synchronous callbacks in native games.

## Texture cache operations

Use these methods to inspect or change what a manager holds:

| Member | What it does |
| --- | --- |
| `getTexture(path)`, `getModel(path)`, `getFont(path, size)` | Return the cached resource without loading anything, or `null`. |
| `releaseTexture(path)`, `releaseModel(path)`, `releaseSound(path)`, `releaseMusic(path)` | Dispose the cached resource for that path and remove it from the cache. Return `true` if there was one. |
| `release(resource)` | Disposes any resource this manager created, including fonts and uncached resources. Returns `false` for a resource it does not own. |
| `textureCount` | The number of cached textures that are not disposed. |
| `resourceCount` | The number of live resources the manager created. |
| `clear()` | Releases every resource and group but keeps the manager usable. |
| `dispose()` | Releases everything and refuses further loads. It is safe to call twice. |

```ts
import type { Game } from '@bornengine/engine';

export function reloadSkin(game: Game, path: string): boolean {
  const assets = game.assets;
  console.log(`${assets.textureCount} textures cached, ${assets.resourceCount} resources alive.`);

  assets.releaseTexture(path);
  const texture = assets.loadTexture(path);
  if (texture === null || !texture.isLoaded) {
    console.error(texture?.error ?? 'Could not reload the skin.');
    return false;
  }
  return true;
}
```

Releasing a texture and loading it again is also how you retry a failed load. A released path loads from disk again on the next `loadTexture`, and the old `Texture` object stops working, so replace any reference you kept.

## File-backed hot reload

A native game can watch the asset files it loaded and replace a resource when its file changes on disk. You can edit an image or a sound, save it, and see or hear the change without restarting. This is **hot reload**.

- It needs the `hot-reload` feature, an optional part of the native library that you choose when you build the game. `bornengine run` and `bornengine dev` turn it on unless you pass `--release`. `bornengine build` and optimized builds leave it off. See [Build and run](../../cli/build/). A direct Cargo build of an engine platform crate must enable the feature itself.
- The watcher covers textures, sounds, and music that were loaded successfully from a file. Textures made from `ImageData`, render textures, fonts, and models are not watched.
- After a file changes, the watcher waits for about 120 ms without further changes to that file before it reloads. This keeps a half-saved file from being read. The reload happens at the start of a frame, and the resource keeps its identity, so objects that hold the `Texture`, `Sound`, or `Music` do not need to be recreated.
- Texture reload replaces the pixels. The new image must have the same width and height as the original. A decode error or a size change leaves the old texture in place. The sampling filter is kept.
- Sound reload replaces the samples for later playback. Voices that are already playing finish with the samples they started with.
- Reloading music that is playing starts it again from the beginning and preserves its volume and loop setting.
- A failed reload keeps the previous resource and prints a message to the console.
- Set the environment variable `BLOOM_NO_HOT_RELOAD=1` when you start the game to turn the watcher off. Only the exact value `1` disables it.

```sh
BLOOM_NO_HOT_RELOAD=1 bornengine run main.ts
```

The watcher is native only. Web/WASM builds, builds without the `hot-reload` feature, and watchOS do not reload file-backed assets.

## Ownership and shutdown

Every resource that a manager creates belongs to that manager, even when it is not cached by path. That includes meshes, materials, animation controllers, image data, textures made from image data, and render targets.

- `scene.assets` is disposed when its scene unloads. `game.assets` is disposed when the `Game` is disposed, after the current scene has unloaded. Your `onStop()` hook runs before either, so resources are still valid there.
- A resource that you dispose yourself, with `release(resource)` or its own `dispose()`, leaves the live count. Loading the same path again creates a new resource.
- After `dispose()`, a manager returns `null` from every load and create method, and `isDisposed` is `true`. `clear()` is the gentler option: it releases the resources and keeps the manager usable.

## Preload groups

Use `createGroup()` to load several assets before a level starts. A group tracks progress and keeps a result for each path. The assets it loads join the manager's cache and lifetime, and disposing the group does not dispose them.

```ts
import type { AssetGroup, Game } from '@bornengine/engine';

declare function startForestLevel(): void;

export function preloadForest(game: Game): AssetGroup | null {
  const group = game.assets.createGroup('forest-level');
  if (group === null) return null;

  group.addTexture('assets/forest/atlas.png');
  group.addSound('assets/audio/step.wav');
  group.addMusic('assets/audio/forest.ogg');

  group.load().then((state) => {
    if (state === 'ready') startForestLevel();
    else console.error(group.entries.filter((entry) => entry.state === 'failed'));
  });
  return group;
}
```

- `addTexture`, `addSound`, and `addMusic` return `false` for an empty path, a duplicate, or a group that already started loading. Add every entry before you call `load()`.
- `load()` starts each entry once and returns a Promise for the final state: `ready`, `failed`, `cancelled`, or `disposed`. Textures load during the call. Sound and music entries load through promises, so on native Linux they are affected by the limitation described under `@Asset`.
- `state`, `progress` (0 to 1), and `entries` let you draw a loading screen. Each entry has a `kind`, a `path`, a `state`, a `result`, and an `error`.
- `cancel()` marks unfinished entries as cancelled, and `dispose()` cancels the group and drops its results.

## Next steps

- [Textures](../textures/) covers sampling, render textures, and image data.
- [Text](../text/) uses `loadFont` for custom fonts.
- [Game objects](../game/) explains scenes, `scene.assets`, and the annotations.
- The [assets concept page](../../concepts/assets/) describes asset paths and project layout.
- The [asset pipeline guide](../../guides/assets/) covers packaging assets for release.
