---
title: Organize assets and worlds
description: Keep assets in stable folders, load models through an owning scope, and load a validated world file into a scene.
section: Guides
order: 73
---

This guide builds a small world viewer. A 3D level lives in a JSON file next to the models it uses. The viewer reads the file, checks it, loads the models through the level's own asset scope, and shows the result. Pressing `R` loads the file again and releases the old level.

Along the way you will see where assets belong, which object owns each resource, and what you must dispose yourself. Each section adds one piece. The last section has the complete `main.ts`.

## What you will build

- A project folder with models, a world file, and a prefab file in predictable places.
- A `Level` scene that loads a world, loads its models from the scene's asset scope, and disposes the world when it unloads.
- A viewer with an orbit camera, per-frame world lighting, and a reload key.
- A preload group for textures and sounds that you can use with the same layout.

## Setup

Create a project that can load models, and the folders for this guide:

```sh
bornengine new WorldViewer --game-type 2.5d
cd WorldViewer
mkdir -p assets/models assets/worlds/prefabs
```

Keep everything the game loads inside the project's `assets` folder, and refer to it with a path relative to the project:

```text
assets/
  models/
    crate.glb
    pole.glb
    lamp.glb
  worlds/
    main.world.json
    prefabs/
      lamp_post.prefab.json
```

Write paths with forward slashes, match the case of the file names, and never use absolute paths. These rules keep a project working on every platform. See [Assets](../../concepts/assets/) for the full list.

You can use any models. This guide expects `crate.glb`, `pole.glb`, and `lamp.glb`, but every model is optional: a model that cannot be loaded is reported as a warning, and the part of the world that uses it is skipped.

### The world file

A `.world.json` file describes one 3D level: its environment, an optional terrain, the entities and lights in it, and any water. Save this as `assets/worlds/main.world.json`:

```json
{
  "schemaVersion": 2,
  "name": "Demo meadow",
  "id": "demo_meadow",
  "bounds": { "min": [-16, 0, -16], "max": [16, 8, 16] },
  "environment": {
    "skyColor": [0.53, 0.81, 0.92],
    "ambientColor": [1, 1, 1],
    "ambientIntensity": 0.35,
    "sunDirection": [0.4, 1, 0.3],
    "sunColor": [1, 0.95, 0.85],
    "sunIntensity": 1,
    "fogStart": 40,
    "fogEnd": 120,
    "fogColor": [0.7, 0.8, 0.9],
    "shadowsEnabled": false
  },
  "terrain": {
    "width": 5,
    "depth": 5,
    "cellSize": 8,
    "origin": [-16, 0, -16],
    "heights": [
      0, 0, 0, 0, 0,
      0, 1, 1, 1, 0,
      0, 1, 2.5, 1, 0,
      0, 1, 1, 1, 0,
      0, 0, 0, 0, 0
    ],
    "layers": []
  },
  "entities": [
    {
      "id": "ent_0001",
      "name": "Crate",
      "modelRef": "assets/models/crate.glb",
      "prefabRef": null,
      "transform": { "position": [0, 2.5, 0], "rotation": [0, 0.4, 0], "scale": [1, 1, 1] },
      "tint": null,
      "tags": [],
      "userData": {}
    },
    {
      "id": "ent_0002",
      "name": "Lamp post",
      "modelRef": null,
      "prefabRef": "lamp_post",
      "transform": { "position": [6, 0, 6], "rotation": [0, 0, 0], "scale": [1, 1, 1] },
      "tint": null,
      "tags": ["lamp"],
      "userData": {}
    }
  ],
  "lights": [
    {
      "id": "light_0001",
      "name": "Lantern",
      "kind": "point",
      "position": [3, 4, 0],
      "color": [1, 0.8, 0.5],
      "intensity": 1.5,
      "range": 12
    }
  ],
  "water": [
    {
      "id": "water_0001",
      "kind": "box",
      "center": [0, -1, 12],
      "size": [32, 2, 8],
      "surfaceHeight": 0,
      "color": [0.1, 0.4, 0.6, 0.7],
      "waveAmplitude": 0.05,
      "waveSpeed": 1
    }
  ],
  "rivers": [],
  "metadata": {}
}
```

- Positions, scales, and colors are plain number arrays. Rotations are Euler angles in radians. Colors run from 0 to 1.
- Each entity has exactly one of `modelRef` and `prefabRef`; the other is `null`. A `modelRef` is passed unchanged to your `getModel` callback. In this guide it is a path from the project folder.
- `sunDirection` points toward the sun, so a positive y value lights the tops of objects.
- The terrain is a grid of heights, listed row by row. `heights` must hold `width * depth` numbers.
- Unknown fields are kept when a file is loaded, but they are lost when it is saved, and the loader prints a warning. Put your own data in an entity's `userData` and `tags` or in the top-level `metadata`.

The format has more fields, such as rivers and terrain layers. The [World format](../world-format/) guide lists them all.

### The prefab file

A **prefab** is a reusable group of models. An entity places a whole prefab with its `prefabRef`. Save this as `assets/worlds/prefabs/lamp_post.prefab.json`:

```json
{
  "schemaVersion": 2,
  "id": "lamp_post",
  "name": "Lamp post",
  "children": [
    {
      "id": "pole",
      "modelRef": "assets/models/pole.glb",
      "prefabRef": null,
      "transform": { "position": [0, 0, 0], "rotation": [0, 0, 0], "scale": [1, 1, 1] },
      "tint": null,
      "tags": []
    },
    {
      "id": "lamp",
      "modelRef": "assets/models/lamp.glb",
      "prefabRef": null,
      "transform": { "position": [0, 3, 0], "rotation": [0, 0, 0], "scale": [1, 1, 1] },
      "tint": [1, 0.9, 0.6, 1],
      "tags": ["light"]
    }
  ],
  "bounds": { "min": [-0.5, 0, -0.5], "max": [0.5, 3.5, 0.5] }
}
```

A prefab child refers to a model or to another prefab. The `id` of the prefab is what an entity writes in `prefabRef`.

### Tell the asset audit about runtime paths

The CLI's `bornengine assets validate` command cannot see paths that your TypeScript code builds or loads at run time, so it reports them as unreferenced. Say so in a `bornengine.assets.json` file in the project folder. The files are still packaged. The list only removes the warnings:

```json
{
  "version": 1,
  "dynamic_paths": [
    "assets/worlds/main.world.json",
    "assets/worlds/prefabs/lamp_post.prefab.json",
    "assets/models/crate.glb",
    "assets/models/pole.glb",
    "assets/models/lamp.glb"
  ]
}
```

Every listed file must exist. See [Asset audit](../../cli/assets/) for the other options.

## Game loop

Loading a world takes four steps, and none of them belongs in the frame loop. Read the file, validate it, create the runtime objects, and apply the lighting every frame. The `Level` scene below does the first three in its constructor:

```ts
import { Game, Scene, WorldData } from '@bornengine/engine';
import type { Model, PrefabLibrary, WorldDocument, WorldInstance } from '@bornengine/engine';

class Level extends Scene {
  readonly document: WorldDocument;
  readonly instance: WorldInstance;

  constructor(game: Game, worldPath: string, prefabs: PrefabLibrary) {
    super({ name: 'level' });

    const data = new WorldData(worldPath);
    if (!data.load() || data.document === null) throw new Error(data.error ?? 'Could not load ' + worldPath);
    const validation = data.validate();
    if (!validation.ok) throw new Error(worldPath + ':\n' + validation.errors.join('\n'));
    this.document = data.document;

    const instance = data.instantiate(game, { getModel: (path) => this.loadModel(path), prefabs });
    if (instance.error !== null) throw new Error(instance.error);
    for (const warning of instance.warnings) console.warn(warning);
    this.instance = instance;
  }

  override onUnload(): void {
    this.instance.dispose();
  }

  private loadModel(path: string): Model | null {
    const model = this.assets.loadModel(path);
    return model !== null && model.isLoaded ? model : null;
  }
}
```

- `new WorldData(path)` remembers the path. `load()` reads the file, upgrades an older schema version, and checks it. It returns `false` and sets `error` when the file is missing, is not valid JSON, or fails the checks. A file from a newer schema version fails instead of being misread.
- `validate()` checks the document again and returns every problem in `errors`. Call it after you change a document in code, before you save or instantiate it.
- `instantiate(game, { getModel, prefabs })` creates the scene nodes for the terrain, the entities, and the water. It calls `getModel(path)` for each model reference. Return the loaded `Model`, or `null` when the model is not available. A `null` is not an error: the entity, or the part of a prefab, that needs the model is skipped and a message is added to `instance.warnings`.
- `instance.error` is set when the instance could not be created at all, for example when the game is not ready.
- The models are loaded through `this.assets`, the scene's own asset scope. They are released when the scene unloads. Models that several levels share belong in `game.assets` instead. The same path always returns the same cached `Model`, so a model that many entities use is loaded once.
- A `WorldInstance` owns its scene nodes, but not the models. `onUnload()` runs before the scene releases its assets, so the instance is disposed first and nothing is left pointing at a model that no longer exists.

Each frame, apply the lighting, then open a 3D pass so that the world's nodes are drawn:

```ts
import { Game } from '@bornengine/engine';
import type { Camera3D, WorldDocument, WorldInstance } from '@bornengine/engine';

function renderWorld(game: Game, world: WorldDocument, instance: WorldInstance, camera: Camera3D): void {
  const sky = world.environment.skyColor;
  game.renderer.clear({ r: sky[0] * 255, g: sky[1] * 255, b: sky[2] * 255, a: 255 });
  instance.applyLighting();
  if (game.renderer.begin3D(camera)) game.renderer.end3D();
}
```

- `applyLighting()` sets the ambient light, the sun, the world's point lights, and the fog. The renderer clears its lights at the start of every frame, so a world that is lit only once goes dark on the second frame. Call it every frame before `begin3D`.
- The world's nodes are drawn with the camera from `begin3D`, so open and close the pass every frame, even when you draw nothing in between.
- Shadows are switched on or off when the world is instantiated, from `environment.shadowsEnabled`.

## Create a world in code

A world is plain data, so you can also build one in code, for example to generate levels or to write tests. `WorldData.create()` starts from an empty world with default settings:

```ts
import { WorldData } from '@bornengine/engine';

function createStarterWorld(path: string): boolean {
  const data = WorldData.create('starter', 'Starter world');
  const document = data.document;
  if (document === null) return false;
  document.entities.push(WorldData.createEntity('ent_0001', 'assets/models/crate.glb', [0, 0, 0]));
  const result = data.save(path);
  if (!result.ok) console.error(result.errors.join('\n'));
  return result.ok;
}
```

`save()` validates the document first and returns the problems instead of writing a bad file. It writes `<path>.tmp`, reads it back to check it, keeps the previous file as `<path>.bak`, and then writes the file. Add `*.tmp` and `*.bak` to `.gitignore`.

## Preload assets

Loading files while the game runs can make a frame take longer. An **asset group** loads a batch of files in one place, before a level starts, and reports how far it got:

```ts
import { AssetGroup, Game } from '@bornengine/engine';

function startPreload(game: Game): AssetGroup | null {
  const group = game.assets.createGroup('interface');
  if (group === null) return null;
  group.addTexture('assets/textures/panel.png');
  group.addTexture('assets/textures/icons.png');
  group.addSound('assets/audio/click.wav');
  group.load();
  return group;
}

function describePreload(group: AssetGroup): string {
  if (group.state === 'failed') {
    return group.entries
      .filter((entry) => entry.state === 'failed')
      .map((entry) => entry.path + ': ' + entry.error)
      .join('\n');
  }
  return group.state + ' ' + Math.round(group.progress * 100) + '%';
}
```

- `createGroup(name)` belongs to an asset scope. Call it on `game.assets` or on `scene.assets`.
- `addTexture`, `addSound`, and `addMusic` queue a file. They return `false` for a duplicate path or after `load()` has started.
- `load()` starts every entry once. A group has the state `idle`, `loading`, `ready`, `failed`, `cancelled`, or `disposed`, a `progress` from 0 to 1, and an `entries` list with the state and error of each file. One failed file does not stop the others.
- Textures finish inside the `load()` call. Sounds and music load in the background, so check `state` and `progress` on later frames. Do not wait for the promise that `load()` returns in a native game.
- Disposing a group does not release the assets. They stay in the scope that loaded them until you release them or the scope is disposed.

## Complete example

Replace `main.ts` with this file. It combines the `Level` scene, the prefab library, the per-frame rendering, and the reload key:

```ts
import { Colors, Game, Key, Mathf, PrefabLibrary, Scene, WorldData } from '@bornengine/engine';
import type { Camera3D, Model, WorldDocument, WorldInstance } from '@bornengine/engine';

const WORLD_PATH = 'assets/worlds/main.world.json';
const PREFAB_PATHS = ['assets/worlds/prefabs/lamp_post.prefab.json'];

function loadPrefabs(paths: string[]): PrefabLibrary {
  const library = new PrefabLibrary();
  for (const path of paths) {
    try {
      library.load(path);
    } catch (error) {
      console.warn('Skipping prefab ' + path + ': ' + String(error));
    }
  }
  return library;
}

class Level extends Scene {
  readonly document: WorldDocument;
  readonly instance: WorldInstance;

  constructor(game: Game, worldPath: string, prefabs: PrefabLibrary) {
    super({ name: 'level' });

    const data = new WorldData(worldPath);
    if (!data.load() || data.document === null) throw new Error(data.error ?? 'Could not load ' + worldPath);
    const validation = data.validate();
    if (!validation.ok) throw new Error(worldPath + ':\n' + validation.errors.join('\n'));
    this.document = data.document;

    const instance = data.instantiate(game, { getModel: (path) => this.loadModel(path), prefabs });
    if (instance.error !== null) throw new Error(instance.error);
    for (const warning of instance.warnings) console.warn(warning);
    this.instance = instance;
  }

  override onUnload(): void {
    this.instance.dispose();
  }

  private loadModel(path: string): Model | null {
    const model = this.assets.loadModel(path);
    return model !== null && model.isLoaded ? model : null;
  }
}

class ViewerGame extends Game {
  private level: Level | null = null;
  private prefabs: PrefabLibrary = new PrefabLibrary();
  private yaw = 0.5;
  private distance = 40;

  constructor() {
    super({ window: { title: 'World viewer', width: 1024, height: 576 }, targetFps: 60 });
  }

  protected override onStart(): void {
    this.prefabs = loadPrefabs(PREFAB_PATHS);
    this.openLevel();
  }

  protected override loop(deltaTime: number): void {
    if (this.input.isKeyPressed(Key.R)) this.reloadLevel();
    if (this.input.isKeyDown(Key.LEFT)) this.yaw -= deltaTime;
    if (this.input.isKeyDown(Key.RIGHT)) this.yaw += deltaTime;
    if (this.input.isKeyDown(Key.UP)) this.distance -= 20 * deltaTime;
    if (this.input.isKeyDown(Key.DOWN)) this.distance += 20 * deltaTime;
    this.distance = Mathf.clamp(this.distance, 8, 120);
    this.scenes.update(deltaTime);
  }

  protected override render(): void {
    const level = this.level;
    if (level === null) return;
    const world = level.document;
    const sky = world.environment.skyColor;
    this.renderer.clear({ r: sky[0] * 255, g: sky[1] * 255, b: sky[2] * 255, a: 255 });
    level.instance.applyLighting();

    const center = {
      x: (world.bounds.min[0] + world.bounds.max[0]) / 2,
      y: (world.bounds.min[1] + world.bounds.max[1]) / 2,
      z: (world.bounds.min[2] + world.bounds.max[2]) / 2,
    };
    const camera: Camera3D = {
      position: {
        x: center.x + Math.sin(this.yaw) * this.distance,
        y: center.y + this.distance * 0.4,
        z: center.z + Math.cos(this.yaw) * this.distance,
      },
      target: center,
      up: { x: 0, y: 1, z: 0 },
      fovy: 50,
      projection: 'perspective',
    };
    if (this.renderer.begin3D(camera)) this.renderer.end3D();

    const shown = level.instance.entityNodes.length + ' of ' + world.entities.length + ' entities';
    this.renderer.drawText(world.name + ': ' + shown + ', ' + world.lights.length + ' lights', { x: 16, y: 16 }, 18, Colors.WHITE);
    this.renderer.drawText('Arrows: orbit and zoom   R: reload the world', { x: 16, y: 40 }, 18, Colors.LIGHTGRAY);
  }

  private reloadLevel(): void {
    try {
      this.openLevel();
    } catch (error) {
      console.error('Could not reload the world, keeping the current one: ' + String(error));
    }
  }

  private openLevel(): void {
    const level = new Level(this, WORLD_PATH, this.prefabs);
    if (!this.scenes.changeTo(level)) throw new Error('Could not activate the level.');
    this.level = level;
  }
}

const game = new ViewerGame();
game.run().then(() => {
  if (game.error !== null) console.error(game.error);
});
```

Run it with `bornengine run main.ts`. Add models to `assets/models` to fill the level, and press `R` after you edit the world file to see the change.

What each part does:

- `loadPrefabs()` reads each prefab file into a `PrefabLibrary`, which checks and registers it. `load()` throws on a missing or invalid file, so the loop catches the error and keeps going. A world that names a prefab the library does not have gets a warning, and that entity has no models.
- `Level` loads and checks the world, and instantiates it. If any step fails it throws, and the old level stays active because `changeTo` is never reached.
- `ViewerGame.render()` follows the order from the game loop section: clear, apply lighting, open and close the 3D pass, then draw text.
- `reloadLevel()` builds a new `Level` before it replaces the old one. `changeTo` unloads the old level, which disposes its world and releases its models. A broken edit to the file leaves the old level on screen and prints the problem.
- The summary line compares `entityNodes.length` with `world.entities.length`. An entity whose own model is missing has no node, so the first number can be lower than the second. A missing model inside a prefab shows up only as a warning in the console.

## Limits to know

- Keep the `modelRef` convention the same across your world and prefab files. The engine passes the string to your `getModel` callback without changing it, so a path that works for `loadModel` is the only requirement.
- A model that a world uses should stay loaded. Do not call `releaseModel` on it while the world's instance exists.
- Loading, validating, and instantiating a large world takes time and runs on the main thread. Do it in `onStart()` or in a loading step, not in the middle of play.
- Prefabs are expanded when the world is instantiated. Cycles are rejected, and a prefab that refers to itself, directly or through another prefab, produces a warning.
- How files reach each platform differs. See the [platform pages](../../platforms/) for bundles and the browser build.

## Next steps

- [World format](../world-format/) lists every field of world and prefab files, and the 2D world format.
- [World API](../../api/world/) documents `WorldData`, `WorldInstance`, and `PrefabLibrary`.
- [Assets API](../../api/assets/) covers the cache, release rules, and asset groups in detail.
- [Build a 3D scene](../3d-scene/) covers cameras, lights, and scene nodes.
- [Asset pipeline](../assets/) explains how assets are packaged for each target.
