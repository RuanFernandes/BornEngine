---
title: 2D production workflow
description: Move from a Tiled room to a tested, packaged BornEngine 2D game.
section: Guides
order: 67
---

This guide follows one 2D room from the map editor to a packaged game. You draw the room in Tiled, convert it with the CLI, check the asset folder, load the room into a scene, set up the camera and physics, and save settings and progress. Each step names the command or API to use and the limits you will run into.

## Before you start

- Finish the [Quickstart](../../getting-started/quickstart/) so that `bornengine run main.ts` works.
- Install Tiled, the map editor this guide uses.

Four terms you will see:

- **Tiled** is a map editor. It saves maps as TMX files and tilesets as TSX files.
- A **room document** is a JSON file whose name ends in `.world2d.json`. It holds tilesets, tile layers, and objects. The engine calls this format World2D.
- An **asset root** is one of the folders `assets/`, `public/`, or `static/` in your project. The CLI treats the files inside them as game assets.
- The **logical view** is the fixed-size area your game draws into. The engine scales it to the window.

The examples use this project layout:

```text
my-game/
  main.ts
  perry.toml
  bornengine.assets.json
  maps/
    moonlit-pier.tmx
    room.tsx
  assets/
    atlas.png
    pickup.wav
    moonlit-pier.world2d.json
```

Tiled files live in `maps/`, outside the asset roots, so they are not packaged with the game. The converted room and the files it uses live in `assets/`.

## 1. Author a room

A room document has a `format` of `bornengine.world2d`, a `version`, and lists of `assets`, `tilesets`, and `layers`. A tileset points at one atlas image cut into a grid of equal tiles. A tile layer is a grid of references to those tiles. An object layer holds positioned objects, such as a player spawn.

The current format is version 2. The engine writes version 2 (`WORLD2D_VERSION` is 2) and loads both version 2 and the older version 1. Version 2 is the compact form. Version 1 is the plain, expanded form, and `bornengine import tiled` still writes it. The [world format guide](../world-format/) describes both versions, and the [World2D API](../../api/world2d/) describes the schema.

Draw the room in Tiled with these settings so that the import in the next section accepts it:

- Use an orthogonal map, turn off the "Infinite" option, and keep the default render order, Right Down.
- Set "Tile Layer Format" to CSV in the map properties.
- Build each tileset from one atlas image. A tileset in its own `.tsx` file works, and so does a tileset embedded in the map.
- Keep the TMX file, the TSX files, and the atlas image inside the project folder, and refer to them with relative paths.
- Draw objects as rectangles or points. Name the player spawn `player`, because the loader below finds it by name.
- To make a tile solid, add one rectangle to it in Tiled's tile collision editor. The import copies the rectangle into the document, and the engine treats every tile that has one as solid.

Load the document into a `Scene`. `World2DLoader` needs one thing from you: `resolveSpriteFrame`, which maps a tile of a tileset to a frame of a loaded `SpriteSheet`. Tile IDs count across the atlas row by row, so the column is `tileId % columns` and the row is `Math.floor(tileId / columns)`.

```ts
import { FILTER_NEAREST, Scene, SpriteSheet } from '@bornengine/engine';
import type { Game, GameObject } from '@bornengine/engine';
import { formatWorld2DDiagnostics, World2DLoader } from '@bornengine/engine/world2d';
import type { World2DLoadInstance } from '@bornengine/engine/world2d';

const ATLAS_PATH = 'assets/atlas.png';
const ROOM_PATH = 'assets/moonlit-pier.world2d.json';

export interface Room {
  scene: Scene;
  player: GameObject;
  instances: World2DLoadInstance[];
}

export function loadRoom(game: Game): Room | null {
  const texture = game.assets.loadTexture(ATLAS_PATH);
  if (texture === null || !texture.isLoaded) {
    console.error(texture === null ? 'The asset manager is not available.' : texture.error);
    return null;
  }
  texture.setFilter(FILTER_NEAREST);
  const sheet = new SpriteSheet(texture, { frameWidth: 32, frameHeight: 32 });
  if (sheet.error !== null) {
    console.error(sheet.error);
    return null;
  }

  const source = game.input.readFile(ROOM_PATH);
  if (source.length === 0) {
    console.error('Could not read ' + ROOM_PATH);
    return null;
  }

  const scene = new Scene(game, { name: 'Moonlit Pier' });
  const loader = new World2DLoader(undefined, {
    resolveSpriteFrame: (tileset, tileId) =>
      sheet.gridFrame(tileId % tileset.columns, Math.floor(tileId / tileset.columns)),
  });
  const result = loader.loadJSON(source, scene);
  if (!result.ok) {
    console.error(formatWorld2DDiagnostics(result.diagnostics));
    scene.unload();
    return null;
  }

  for (let index = 0; index < result.instances.length; index++) {
    const instance = result.instances[index];
    if (instance.sourceKind === 'object' && instance.gameObject.name === 'player') {
      return { scene, player: instance.gameObject, instances: result.instances };
    }
  }
  console.error('The room has no object named player.');
  scene.unload();
  return null;
}
```

`setFilter(FILTER_NEAREST)` keeps scaled pixel art sharp. The 32 in the `SpriteSheet` options is the tile size you set in Tiled; add `margin` and `spacing` if the tileset uses them. The loader works like this:

- Loading is all or nothing. The loader checks the document, resolves every frame, and only then adds objects to the scene. On failure `result.ok` is `false`, `result.diagnostics` lists the problems, and nothing was added. Call `scene.unload()` to release the scene.
- Each tile layer becomes one game object for every tileset it uses, each with a `Tilemap` component, placed at the layer's offset. Each object in an object layer becomes a game object named after it, at its position.
- `result.instances` lists the new game objects. Tile layer entries have `sourceKind` `'tilemap'`. Object entries have `'object'`, and their `sourceId` is the document's object ID.
- The loader needs a ready `PhysicsWorld2D`, passed as the `physicsWorld2D` option, when any object has a `physicsBody2D` component. Without one, loading fails with `physics_world_missing`.

You can add your own component kinds with `World2DComponentRegistry`. The [World2D API](../../api/world2d/) shows how.

## 2. Import Tiled maps and validate the asset tree

`bornengine import tiled` converts a TMX map into a room document. Run it from the project root, and end the output name with `.world2d.json`:

```sh
bornengine import tiled maps/moonlit-pier.tmx --output assets/moonlit-pier.world2d.json
```

The command treats the current folder as the project root, and every file it reads (the map, the tilesets, and the images) must be inside it. It writes the document only after the whole conversion has succeeded, so a failed import leaves an existing file untouched. In the document, the room ID is the map's file name without its extension, and each object ID is `object-` followed by the Tiled object ID.

What the importer accepts:

- Orthogonal, finite maps with CSV or XML tile data.
- Embedded or external (`.tsx`) tilesets that use one atlas image.
- Tile flips, and one unrotated collision rectangle per tile.
- Rectangle and point objects. An object with the class `collision` and a size also gets a static `physicsBody2D` box component.
- Layer visibility, opacity, offset, and parallax.
- String, int, float, bool, color, and file properties. A file property is stored as a project-relative path.

It resolves a tileset image relative to the TSX file (or the TMX file, for an embedded tileset) that names it, and a file property relative to the TMX file. It stops with an error that names the file when it meets something it cannot represent: other map orientations, infinite maps, group and image layers, base64 or compressed tile data, layer tint and blend modes, image-collection tilesets, tile animations, classes on maps, layers, tilesets, and tiles, tile objects and templates, ellipse, polygon, polyline, and text objects, and object-reference properties.

Then check the asset tree:

```sh
bornengine assets validate
```

The command builds an inventory of every file under the asset roots, plus every file that a `.world2d.json` document anywhere in the project lists in its `assets`. It stops with an error and exit code 1 when a room document lists a file that does not exist, when a path is unsafe or leaves the project, when a path differs from the file name on disk only in letter case, or when a room document has a version other than 1 (see the limit below). It only warns about files with no known reference (`orphan_asset`) and about files whose contents do not match their extension. Warnings alone exit with code 0:

```text
warning orphan_asset assets/moonlit-pier.world2d.json: asset has no known static or declared dynamic reference
warning orphan_asset assets/pickup.wav: asset has no known static or declared dynamic reference
Validated 3 project assets (8073 bytes)
```

The validator reads room documents and `bornengine.assets.json`. It does not read your TypeScript. A file that only your code loads, such as a sound or the room document itself, is reported as an orphan unless you declare it. List those files in `dynamic_paths`:

```json
{
  "version": 1,
  "dynamic_paths": [
    "assets/moonlit-pier.world2d.json",
    "assets/pickup.wav"
  ]
}
```

With the manifest in place, the warnings above disappear. The command exits with 0 and prints only the summary line. In a continuous integration job, add `--orphan-policy error` to fail on unreferenced files, `--json` for a machine-readable report, and limits such as `--max-file-bytes`. The [asset commands](../../cli/assets/) page lists every option and diagnostic code, and the [import command](../../cli/import/) page covers the importer.

One limit matters here: the CLI is behind the engine. The asset audit accepts version 1 documents only, and `build`, `run`, and `dev` run it before they compile. CLI 0.7.1 rejects a version 2 document anywhere in the project with `unsupported world format version`, and the command stops. The engine writes version 2, so a room that `serializeWorld2D()` saved is rejected until the CLI is updated. Until then, keep the room documents inside your project at version 1: change the TMX file and import it again.

## 3. Run, watch, and package

Use these commands from the project root:

```sh
bornengine run main.ts
bornengine dev main.ts --watch
bornengine check main.ts --strict
bornengine build main.ts
bornengine assets pack --output dist/game
```

- `run` validates the assets, compiles a development build, copies the assets next to the executable, and starts the game with the project folder as its working directory.
- `dev --watch` builds and runs the game, and restarts it when source files or asset files change. Without `--watch`, `dev` does the same as `run`.
- `check` asks the compiler whether the project compiles for the target, without producing a binary. `--strict` turns compatibility warnings into errors, which suits a continuous integration job.
- `build` validates the assets, compiles an optimized build, copies the assets next to the executable, and prints the output path. `run` and `dev` accept `--release` for an optimized build as well.
- `assets pack` copies the asset files into an output folder you choose and writes `assets.manifest.json` there, with the size and SHA-256 digest of every file. Use it when your own packaging step assembles the final folder. The output folder must be outside the asset roots.

Before you package, run `bornengine assets validate --orphan-policy error` and `bornengine check main.ts --strict`. Both exit with a non-zero code when they find a problem, so they work as gates in a continuous integration job.

A build is written to `.bornengine/builds/<target>/<name>/<build id>/`:

```text
.bornengine/builds/<target>/my-game/<build id>/
  my-game
  assets/
    atlas.png
    pickup.wav
    moonlit-pier.world2d.json
  assets.manifest.json
```

Desktop builds read assets relative to the working directory, so start the executable from that folder. Only files inside the asset roots, and files that a room document lists, are packed. The TMX files in `maps/` are not, and neither is a room document stored outside `assets/`. Keep the room document that your game loads inside `assets/`.

`bornengine clean` removes the build files that the CLI recorded. Keep `.bornengine/`, `.perry-dev/`, and `dist/` out of version control. The project that `bornengine new` creates already ignores them.

This section describes native desktop builds. Web and mobile builds follow their own packaging steps, described on the [Web/WASM](../../platforms/web-wasm/) and [Mobile](../../platforms/mobile/) pages.

## 4. Set the logical view and coordinate flow

A `Viewport2D` fixes the logical size of your game, for example 320 by 180. You always draw in logical units, and the engine scales the view to the window. Its `mode` decides how:

- `fit` keeps the aspect ratio and adds bars at the sides or at the top and bottom.
- `integer` keeps the aspect ratio and uses the largest whole-number scale that fits, so pixel art stays sharp. When the window is smaller than the logical view, it falls back to `fit`.
- `stretch` fills the window and changes the aspect ratio.

Assign the viewport to `scene.viewport2D`. For a camera that follows the player, add a `CameraRig2D` to a game object, and call `scene.bindCameraRig2D(rig)` after that object is in the scene. The rig's `offset` is the point of the logical view where the target appears. It defaults to the center of the viewport, so you can leave it out once `viewport2D` is set. `bounds` keeps the view inside the room, and `smoothing` softens the movement.

Pointer input uses the same mapping in reverse. A mouse position starts in window pixels. `game.input.screenToWorld()` removes the bars and the scale to get a logical position, and then undoes the camera's offset, zoom, and rotation to get a world position. It returns `null` when the pointer is on a bar, or when the scene has neither a camera nor a viewport.

```ts
import { CameraRig2D, GameObject, Vector2D } from '@bornengine/engine';

const VIEW_SIZE = new Vector2D(320, 180);
const ROOM_SIZE = new Vector2D(640, 360);
const TILE_SIZE = 32;

export class FollowCamera extends GameObject {
  readonly rig: CameraRig2D;

  constructor(target: GameObject) {
    super({ name: 'Camera' });
    this.rig = this.addRequiredComponent(
      new CameraRig2D({
        target,
        offset: new Vector2D(VIEW_SIZE.x / 2, VIEW_SIZE.y / 2),
        smoothing: 0.12,
        bounds: { x: 0, y: 0, width: ROOM_SIZE.x, height: ROOM_SIZE.y },
      }),
    );
  }
}

export function pointerToTile(game: Game): { column: number; row: number } | null {
  const world = game.input.screenToWorld(game.input.getMousePosition());
  if (world === null) return null;
  return { column: Math.floor(world.x / TILE_SIZE), row: Math.floor(world.y / TILE_SIZE) };
}
```

Call `pointerToTile()` after `scenes.update()` in `loop()`, so the camera has already moved this frame. Use `screenToWorld()` for anything that depends on where the player points, such as clicking a tile or placing an object.

## 5. Advance physics deliberately

`PhysicsWorld2D` simulates bodies in fixed steps, but it never runs by itself. Create it with `new PhysicsWorld2D(game, options)`, give it to the scene with `scene.own(physics)` so that unloading the scene disposes it, and call `physics.step(deltaTime)` yourself. `step` adds the elapsed time to an accumulator and runs as many fixed steps as fit, 1/60 second each by default, up to `maxSubSteps` (5 by default). Time beyond that budget is dropped.

Pick one update order and keep it. The platformer sample does this in `loop()`:

1. Read the input and set the character's velocity.
2. Call `character.moveAndSlide(velocity, deltaTime)`. A `CharacterBody2D` moves by the velocity times the time and slides along solid surfaces.
3. Call `physics.step(deltaTime)`.
4. Call `this.scenes.update(deltaTime)`.

A tilemap draws tiles and reports which ones are solid, but it does not create bodies. `getSolidRegions()` merges neighboring full-cell solid tiles into larger rectangles, and `getSolidTiles()` returns one rectangle per solid tile. Both use coordinates relative to the map's top-left corner, so add the map object's world position. A box body is centered on its game object, so place each object at the center of its rectangle:

```ts
import { GameObject, Tilemap } from '@bornengine/engine';
import type { PhysicsWorld2D, Scene } from '@bornengine/engine';
import type { World2DLoadInstance } from '@bornengine/engine/world2d';

export function addTileColliders(
  scene: Scene,
  physics: PhysicsWorld2D,
  instances: World2DLoadInstance[],
): number {
  let created = 0;
  for (let index = 0; index < instances.length; index++) {
    const instance = instances[index];
    if (instance.sourceKind !== 'tilemap') continue;
    const tilemap = instance.gameObject.getComponent(Tilemap);
    if (tilemap === null) continue;

    const origin = instance.gameObject.transform.worldPosition;
    const regions = tilemap.getSolidRegions();
    for (let regionIndex = 0; regionIndex < regions.length; regionIndex++) {
      const region = regions[regionIndex];
      const solid = new GameObject({
        name: 'Solid',
        position: {
          x: origin.x + region.x + region.width / 2,
          y: origin.y + region.y + region.height / 2,
          z: origin.z,
        },
      });
      solid.addComponent(physics.createBody({
        type: 'static',
        shape: { type: 'box', width: region.width, height: region.height },
      }));
      if (scene.addNode(solid) !== null) created++;
    }
  }
  return created;
}
```

Pass it `room.instances` from `loadRoom()`. Limits to keep in mind:

- Dynamic bodies are axis-aligned boxes and circles. Static bodies can also be line segments and convex polygons, which suit ramps and uneven ground. Colliders ignore the rotation and scale of their game object.
- A Tiled rectangle object with the class `collision` imports as a static box body. The body is centered on its game object, but the loader puts that object at the rectangle's top-left corner, so the body ends up half its width to the left and half its height above the rectangle you drew. Mark solid tiles with tile collision rectangles instead, as above.
- The solid rectangles come from the `Tilemap`, not from physics. If you change the map at run time, create or remove the bodies yourself.

See the [2D physics API](../../api/physics2d/) for one-way surfaces, opt-in continuous collision detection, and solver limits, and the [2D physics and tilemaps guide](../physics2d-tilemap/) for a full collision setup.

## 6. Rebind, preload, and save

**Rebind controls.** An `InputActionMap` maps names such as `jump` to keys, mouse buttons, gamepad buttons, or touch regions, and maps axes such as `move-x` to a pair of keys or a gamepad stick. Create one with `game.input.createActionMap()`. The game updates it every frame. `bindAction()` adds bindings to an action, so call `unbindAction()` first to replace them; `bindAxis()` replaces the whole axis. `toData()` returns a versioned snapshot of every binding, and `loadData()` checks the whole snapshot before it replaces the bindings. It returns `false` and changes nothing when the snapshot is invalid.

**Preload assets.** Load what the first frame needs in `onStart()`. `loadTexture()`, `loadSound()`, and `loadMusic()` return the resource at once, so check `isLoaded` and `error`. To track a batch, create a group with `createGroup()`, add paths with `addTexture()`, `addSound()`, and `addMusic()`, and call `load()`. The group keeps a `state`, a `progress` value, and one result per path in `entries`. The loaded resources belong to the asset manager that created the group, and a group created from `scene.assets` ends with its scene.

Textures load immediately. Sounds and music load in the background, and `load()` returns a Promise that settles when every entry has finished. On native builds `Game.run()` is a plain blocking loop, so Promise continuations and timers do not run while the game plays. Await the group in code that runs before `run()`, or load sounds directly with `loadSound()` in `onStart()`. In an async `main()`, that means `await preload(game)` between creating the game and calling `game.run()`:

```ts
import type { Game } from '@bornengine/engine';

export async function preload(game: Game): Promise<boolean> {
  const group = game.assets.createGroup('moonlit-pier');
  if (group === null) return false;
  group.addTexture('assets/atlas.png');
  group.addSound('assets/pickup.wav');

  const state = await group.load();
  if (state === 'ready') return true;

  const entries = group.entries;
  for (let index = 0; index < entries.length; index++) {
    if (entries[index].state === 'failed') console.error(entries[index].path, entries[index].error);
  }
  return false;
}
```

**Save settings and progress.** `GameDatabase` stores typed rows in SQLite. You define a schema and at least one migration, open the database, and then call `findByPrimaryKey()`, `select()`, `insert()`, `update()`, `delete()`, or `transaction()`. Every call returns a result with an `ok` flag and a `status`, because storage can fail at any time. [Database and migrations](../../api/storage/) describes the statuses, transactions, backups, and where each platform keeps the data.

Two rules apply to native games:

- Native builds include SQLite only when you ask for it. Create the project with `bornengine new MyGame --native-features sqlite`, or add the feature to `perry.toml`. Without it, `open()` returns the status `unsupported`. Web builds do not need the feature.

  ```toml
  [bornengine]
  native_profile = "2d"
  native_features = ["sqlite"]
  ```

- Database calls are asynchronous, and Promise continuations do not run while a native game plays. Open the database and read what the first frame needs before `run()`, and write after the Promise returned by `run()` resolves.

This program follows both rules for the control bindings. It reads the saved bindings before the game starts and writes them after the game stops. The game takes its snapshot in `onStop()` because shutdown clears every action map:

```ts
import { Game, Key } from '@bornengine/engine';
import type { InputActionMap, InputActionMapData } from '@bornengine/engine';
import {
  columns,
  defineMigration,
  defineSchema,
  defineTable,
  GameDatabase,
} from '@bornengine/engine/storage';

const schema = defineSchema({
  settings: defineTable({
    columns: {
      key: columns.text({ primaryKey: true }),
      json: columns.text({ notNull: true }),
    },
  }),
});

const migrations = [
  defineMigration(1, schema, (migration) => {
    migration.createTable('settings', schema.settings.columns);
  }),
];

class MoonlitGame extends Game {
  readonly controls: InputActionMap;
  bindings: InputActionMapData | null = null;

  constructor() {
    super({ window: { title: 'Moonlit Pier', width: 960, height: 576 }, targetFps: 60 });
    this.controls = this.input.createActionMap();
    this.controls.bindAction('confirm', { kind: 'key', key: Key.ENTER });
    this.controls.bindAxis('move-x', {
      negative: [{ kind: 'key', key: Key.A }, { kind: 'key', key: Key.LEFT }],
      positive: [{ kind: 'key', key: Key.D }, { kind: 'key', key: Key.RIGHT }],
    });
  }

  protected override onStop(): void {
    this.bindings = this.controls.toData();
  }
}

export function rebind(controls: InputActionMap, action: string, key: number): boolean {
  controls.unbindAction(action);
  return controls.bindAction(action, { kind: 'key', key });
}

function restoreBindings(controls: InputActionMap, text: string): void {
  try {
    const record = JSON.parse(text) as InputActionMapData;
    if (!controls.loadData(record)) console.warn('The saved bindings are not valid.');
  } catch (_error) {
    console.warn('The saved bindings are not valid JSON.');
  }
}

async function main(): Promise<void> {
  const database = new GameDatabase({
    appId: 'org.example.moonlit-pier',
    name: 'profile',
    schema,
    migrations,
  });
  const opened = await database.open();
  let savedBindings: string | null = null;
  if (opened.ok) {
    const row = await database.findByPrimaryKey('settings', 'controls');
    if (row.ok && row.value !== null) savedBindings = row.value.json;
    else if (!row.ok) console.warn('Could not read the bindings:', row.status);
  } else {
    console.warn('Saves are unavailable:', opened.status);
  }

  const game = new MoonlitGame();
  if (savedBindings !== null) restoreBindings(game.controls, savedBindings);

  await game.run();
  if (game.error !== null) console.error('The game stopped with an error:', game.error);

  if (!opened.ok) return;
  const bindings = game.bindings;
  if (bindings !== null) {
    const json = JSON.stringify(bindings);
    const saved = await database.transaction(async (transaction) => {
      const removed = await transaction.delete('settings', { key: { eq: 'controls' } });
      if (!removed.ok) return removed;
      return transaction.insert('settings', { key: 'controls', json });
    });
    if (!saved.ok) console.warn('The bindings were not saved:', saved.status);
  }
  const closed = await database.close();
  if (!closed.ok) console.warn('Could not close the database:', closed.status);
}

main();
```

`rebind()` replaces every binding of one action with a single key, for example after the player presses a new key on a settings screen. The program keeps the game running when the database cannot open, so players can play without saves. The engine does not encrypt the database, so keep passwords and tokens out of it. Browsers can evict stored data; `export()` returns a backup that you can offer to the player.

**Positional sound.** An `AudioEmitter2D` plays a loaded `Sound` from the XY position of its game object. Create it with the sound and `game.audio.listener2D`, which follows the active scene's camera by default, and call `play()` on the emitter. Destroying the object stops its voice. For effects that need no position, use `SoundManager`. See the [audio API](../../api/audio/).

## Sample projects

The repository contains two 2D samples. Run either one from its folder:

```sh
npm install
bornengine run main.ts
```

- `examples/2d-platformer` builds a tilemap in code and adds a kinematic character, a slope, a one-way bridge, a fast projectile with continuous collision detection, a follow camera, sprite animation with markers, pooled particles, and sound effects. It saves progress with `GameDatabase`: a versioned schema, a transaction after the game stops, and an export and import round trip. Its `bornengine.assets.json` lists the files that its code loads.
- `examples/2d-top-down` loads a room document with `World2DLoader`, maps movement to an action map with a second key layout (press R), plays a positional sound (press Space), and follows the player with a camera inside a `Viewport2D`.

Neither sample contains a TMX file. Use them to see the runtime side of this guide.

The platformer opens its `GameDatabase` before the game starts and stops if the database cannot open. The folder has no `perry.toml`, so a native build has no SQLite and `open()` returns `unsupported`. Add this file next to `main.ts` before you run it:

```toml
[project]
name = "bornengine-2d-platformer"
entry = "main.ts"

[bornengine]
native_profile = "2d"
native_features = ["sqlite"]
```

For the API details, see [World2D](../../api/world2d/), [camera and viewport](../../api/camera2d/), [physics 2D](../../api/physics2d/), [tilemaps](../../api/tilemap/), [input](../../api/input/), [audio](../../api/audio/), and the [2D game guide](../2d-game/).
