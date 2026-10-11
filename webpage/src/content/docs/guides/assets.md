---
title: Asset pipeline
description: Write asset paths that resolve the same way on desktop, mobile, Apple bundles, and the browser build.
section: Guides
order: 63
---

An asset is a file your game loads while it runs: an image, a sound, a model, a font, or a world file. You refer to it with a path string such as `assets/textures/player.png`. Every target turns that string into a file read in its own way. This guide shows how to write paths and lay out files so one string works everywhere.

[Assets](../../concepts/assets/) explains the basics of `game.assets` and `scene.assets`. Read it first if those names are new.

## Lay out the project

Put every file the game loads at runtime under `assets/`, with one folder per kind of file.

```text
my-game/
├── main.ts
├── perry.toml
└── assets/
    ├── textures/player.png
    ├── audio/jump.wav
    ├── models/character.glb
    ├── fonts/ui.ttf
    └── worlds/level1.world2d.json
```

After it compiles the game, `bornengine build` and `bornengine run` copy the contents of `assets/`, `public/`, and `static/` into the build folder, next to the executable, keeping the same relative paths. They also copy any file that a `.world2d.json` map names. The browser build script copies only the `assets/` folder that sits beside your entry file. A file outside `assets/` is missing from the browser build.

## Write paths the same way everywhere

Follow these rules in every path string:

- **Start at the project folder.** Write `assets/textures/player.png`, not `./player.png` and not a full path.
- **Use forward slashes.** Do not use backslashes, even on Windows.
- **Match the case of every folder and file name.** Windows and macOS usually treat `Player.png` and `player.png` as the same file. Linux and most web servers do not, so a wrong case works on your machine and fails elsewhere.
- **Do not use absolute paths or `..`.** On desktop, iOS, tvOS, visionOS, and Android, a path that starts with `/` is used as written, so it only works on the machine that has that file. A path that climbs out of `assets/` also leaves the folder that gets packed or served.

Each target then starts from a different place:

| Target | A relative path is read from |
| --- | --- |
| Linux, Windows, macOS | The process's working directory. The engine does not search next to the executable. |
| iOS, tvOS, visionOS | The app bundle's resource folder. |
| watchOS | The bundle path that the Swift host sets at startup. |
| Android | The folder that the Android host registers at startup. How assets get into that folder depends on the app shell and is not covered here. |
| Web | The page's URL. Each file is fetched from the folder that serves `index.html`. |

On desktop this means the working directory decides what loads. `bornengine run` starts the game with your project folder as the working directory, so `assets/...` resolves. A packed build is different: start the executable from the build folder that holds `assets/`, or from a launcher that sets that folder as the working directory.

## Choose formats every target can read

| Kind | Reads everywhere | Depends on the build |
| --- | --- | --- |
| Images | PNG | JPEG, BMP, TGA, and DDS need the `image-extras` feature. The 2.5D and 3D profiles and the Web build include it. The 2D profile does not, so use PNG in a 2D game. |
| Audio | WAV and OGG | MP3 needs the `mp3` feature, which every CLI profile includes. The browser build cannot decode MP3. |
| Models | `.glb` | `.obj` files are also read. A `.gltf` file that points at separate `.bin` or image files is not resolved by `loadModel`, so export a single `.glb`. |
| Fonts | `.ttf` and `.otf` | No extra feature. |

3D models also need the `2.5d` or `3d` profile, because the `2d` profile leaves model loading out. Choose the profile in `perry.toml`; the [project commands](../../cli/project/) page explains it.

## Load once and check every result

Load assets in `onStart()` or in a loading step, keep the handles, and check each one before the game uses it. A path that cannot be read does not throw. It gives you a resource whose `isLoaded` is `false` and whose `error` explains why. The call returns `null` only for a disposed manager or an invalid argument, such as an empty path.

```ts
import { Game } from '@bornengine/engine';
import type { Font, Model, Music, Sound, Texture } from '@bornengine/engine';

interface Loaded {
  readonly isLoaded: boolean;
  readonly error: string | null;
}

function problem(name: string, asset: Loaded | null): string | null {
  if (asset === null) return name + ': the asset manager is not available.';
  if (asset.isLoaded) return null;
  return name + ': ' + (asset.error === null ? 'not loaded.' : asset.error);
}

class AssetDemo extends Game {
  private player: Texture | null = null;
  private jump: Sound | null = null;
  private theme: Music | null = null;
  private label: Font | null = null;
  private statue: Model | null = null;

  constructor() {
    super({ window: { title: 'Asset demo', width: 800, height: 450 }, targetFps: 60 });
  }

  protected override onStart(): void {
    this.player = this.assets.loadTexture('assets/textures/player.png');
    this.jump = this.assets.loadSound('assets/audio/jump.wav');
    this.theme = this.assets.loadMusic('assets/audio/theme.ogg');
    this.label = this.assets.loadFont('assets/fonts/ui.ttf', 20);
    this.statue = this.assets.loadModel('assets/models/statue.glb');

    const checks: Array<[string, Loaded | null]> = [
      ['player texture', this.player],
      ['jump sound', this.jump],
      ['theme music', this.theme],
      ['label font', this.label],
      ['statue model', this.statue],
    ];
    let failed = false;
    for (const [name, asset] of checks) {
      const message = problem(name, asset);
      if (message === null) continue;
      console.error(message);
      failed = true;
    }
    if (failed) this.stop();
  }
}

new AssetDemo().run();
```

The error text names the path that failed, for example `Unable to load texture: assets/textures/player.png`. Textures, sounds, music, fonts, and models use the same pattern: `Unable to load sound: ...`, `Unable to load music: ...`, `Unable to load font: ...`, and `Unable to load model: ...`.

Keep these points in mind:

- **Repeat requests return the same object.** Asking `game.assets` for a path it already holds gives back the same resource, including a failed one. To retry a failed load, release it first with `releaseTexture(path)`, `releaseModel(path)`, `releaseSound(path)`, `releaseMusic(path)`, or `release(resource)`.
- **Choose the owner by lifetime.** `game.assets` keeps a resource until the game ends. `scene.assets` releases it when that scene unloads. The two scopes have separate caches, so the same path loaded in both is read twice.
- **Load before the frame loop.** In the browser, the first load of a file is a blocking request. A load inside `loop()` or `render()` freezes the page until the file arrives.

## When a load fails

| Symptom | Likely cause |
| --- | --- |
| The game loads its files under `bornengine run` but not when you start the built game from another folder. | Desktop paths are read from the working directory. Start the game from the folder that holds `assets/`. |
| A file loads on Windows or macOS but not on Linux or in the browser. | The case in the path differs from the case on disk. |
| A file loads on desktop but is missing in the browser. | The file sits outside `assets/`, or the path climbs out of it with `..`. |
| `Unable to load texture` for a JPEG, BMP, or TGA file in a 2D game. | The `2d` profile has no decoder for it. Convert the file to PNG. |
| `Unable to load model` for a `.gltf` file. | `loadModel` does not read separate `.bin` or image files. Export a single `.glb`. |

## Check assets before you ship

`bornengine assets validate` walks `assets/`, `public/`, and `static/`. It reports missing references, unsafe paths, case mismatches in references, media files with an invalid header or the wrong extension, and optional size budgets. `bornengine build`, `run`, and `dev` run the same check first and stop on an error.

The check cannot read path strings in your TypeScript. List files you load through computed paths in `bornengine.assets.json` under `dynamic_paths`, so a wrong case or a missing file is caught. The [asset audit](../../cli/assets/) page documents the manifest and the report.

One limit applies today. CLI 0.7.1 reads `.world2d.json` maps with `version: 1` only. If the project contains a map saved as version 2, which is what the engine and the map editor write, the audit stops with `unsupported world format version Some(2)`, and so do `build`, `run`, and `dev`. The [World format](../world-format/) guide explains the two versions.

## Next steps

- [Assets](../../concepts/assets/) covers `game.assets`, `scene.assets`, and how scopes release resources.
- [Assets API](../../api/assets/) lists every loader, the preload groups, and desktop hot reload.
- [Asset audit](../../cli/assets/) documents `bornengine assets validate` and `assets pack`.
- [Web/WASM](../../platforms/web-wasm/) describes the browser build.
- [Organize assets and worlds](../assets-and-worlds/) loads models and world files together.
