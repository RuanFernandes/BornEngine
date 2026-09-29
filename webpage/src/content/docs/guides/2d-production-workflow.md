---
title: 2D production workflow
description: Move from a Tiled room to a tested, packaged BornEngine 2D game.
section: Guides
order: 67
---

A reliable 2D production loop keeps authored world data, runtime objects, game settings, and packed assets explicit. BornEngine's 2D stack can be used code-first or with a finite orthogonal map authored in Tiled, then loaded into a scene and advanced by your `Game` subclass.

## 1. Author a room

A `bornengine.world2d` document is JSON with a version, project-relative asset list, atlas tilesets, ordered layers, and metadata. The current schema is version 1. Tile layers store cells in row-major order; object layers store position, size, origin, tags, properties, and component descriptors. `{ x, y }` records are the serialized format for world positions and sizes.

Keep atlas images inside the project asset roots. Asset and tileset image paths are project-root relative, even when the world document itself lives in a subdirectory. At runtime, give `World2DLoader` a frame resolver so every authored tile ID maps to a frame from a loaded, Game-owned `SpriteSheet`. Use a 2D document for 2D rooms; `WorldData`, `WorldInstance`, and `PrefabLibrary` are the separate 3D world API.

~~~ts
import { Game, Scene, SpriteSheet } from '@bornengine/engine';
import { World2DLoader, formatWorld2DDiagnostics } from '@bornengine/engine/world2d';
const atlasPath = 'assets/room.png';
function loadRoom(game: Game): Scene | null {
  const texture = game.assets.loadTexture(atlasPath);
  if (texture === null || !texture.isLoaded) {
    console.error(texture === null ? 'Asset manager unavailable' : texture.error);
    return null;
  }

  const sheet = new SpriteSheet(texture, { frameWidth: 32, frameHeight: 32 });
  const scene = new Scene(game, { name: 'Moonlit Pier' });
  const source = game.input.readFile('assets/moonlit-pier.world2d.json');
  const loader = new World2DLoader(undefined, {
    resolveSpriteFrame: (_tileset, tileId) => sheet.gridFrame(tileId, 0),
  });
  const result = loader.loadJSON(source, scene);
  if (!result.ok) {
    console.error(formatWorld2DDiagnostics(result.diagnostics));
    scene.unload();
    return null;
  }
  return scene;
}
~~~

World loading is atomic: invalid JSON, schema errors, missing frame resolvers, unresolved frames, missing component factories, or physics dependencies return diagnostics without attaching a partial room. Check `result.ok` before activating the scene. `migrateWorld2D()` currently validates and returns a valid v1 document; it does not convert old 3D `.world.json` files.

A custom object component can be registered through `World2DComponentRegistry`. Use a namespaced kind for project-specific data and validate its fields in the factory before returning a component.

## 2. Import Tiled maps and validate the asset tree

The CLI converts finite orthogonal TMX maps to the versioned world format:

~~~sh
bornengine import tiled maps/moonlit-pier.tmx --output worlds/moonlit-pier.world2d.json
bornengine assets validate
~~~

The importer accepts CSV or XML tile data, external TSX tilesets with atlas images, typed string/integer/float/boolean/color/file properties, tile GID flips, and rectangular object collisions. During import, it resolves TSX images relative to the TSX file and Tiled file-property paths relative to the TMX map, then stores normalized asset paths relative to the project root in the output document.

It reports unsupported features with the source path and leaves an existing output untouched on conversion failure. This workflow does not import isometric or infinite maps, base64/compressed tile data, image-collection tilesets, nested groups, tile objects, non-rectangular collision shapes, templates, or object-reference properties. Export finite orthogonal maps and use a single atlas image for this importer.

`assets validate` checks `assets/`, `public/`, and `static/` plus world-file references. It catches missing paths, unsafe paths, case mismatches, and symlinks that escape the project. Resolve validation errors before shipping so the runtime package has the same files the authored map expects.

## 3. Run, watch, and package

Use the CLI for the normal local iteration loop:

~~~sh
bornengine dev main.ts --watch
bornengine assets pack --output dist/game
bornengine build main.ts
~~~

`dev --watch` rebuilds and restarts the game when source files or watched asset directories change. `build` and `run` package project assets beside the managed executable automatically. `assets pack` copies the project asset roots with their relative paths and writes a deterministic manifest containing each file's size and SHA-256 digest. The CLI's `clean` command removes only packed files recorded under its managed build directory.

Keep generated output out of source control unless the project intentionally distributes a built artifact. Run `bornengine assets validate` before packaging and check that the asset paths used by `AssetManager` match the project tree.

## 4. Set the logical view and coordinate flow

A `Viewport2D` defines the logical resolution. `fit` preserves aspect ratio and adds bars, `integer` favors crisp whole-number upscaling, and `stretch` fills both window axes. Bind a `CameraRig2D` to the active scene for follow behavior, bounds, smoothing, zoom, and shake. Rendering and input conversion use the same scene camera and viewport.

~~~ts
import { CameraRig2D, GameObject, Scene, Viewport2D } from '@bornengine/engine';
import { Vector2D } from '@bornengine/engine';

const viewportSize = new Vector2D(320, 180);
scene.viewport2D = new Viewport2D({
  width: viewportSize.x,
  height: viewportSize.y,
  mode: 'integer',
});
const cameraObject = new GameObject({ name: 'Camera' });
const camera = new CameraRig2D({
  target: player,
  offset: new Vector2D(viewportSize.x / 2, viewportSize.y / 2),
  bounds: { x: 0, y: 0, width: 640, height: 360 },
});
cameraObject.addComponent(camera);
scene.addNode(cameraObject);
scene.bindCameraRig2D(camera);

// Pointer coordinates share the scene's camera and viewport mapping.
const worldPointer: Vector2D | null = game.input.screenToWorld(new Vector2D(420, 240));
~~~

Use `screenToWorld()` for gameplay interaction such as clicking a tile or placing an object. Pointer positions inside letterbox bars return `null`. For public runtime coordinates and sizes in 2D, use the engine's `Vector2D` class. World files remain plain JSON with `{ x, y }` values, so serialization does not depend on a runtime class.

## 5. Advance physics deliberately

Create a `PhysicsWorld2D` for the scene and step it once in a documented update order. `CharacterBody2D` supports kinematic movement with collision-aware `moveAndSlide()`. A `Tilemap` can report solid tile rectangles, but those rectangles do not automatically become physics bodies. Convert selected solids into static bodies when the game needs collision.

The current physics shapes are axis-aligned boxes and circles. Tile collision rectangles are map-local; apply the tilemap's world translation before creating bodies. A scaled or rotated map needs collision bounds transformed deliberately, and axis-aligned physics boxes cannot represent arbitrary rotated tiles. See the [2D physics and tilemaps guide](../physics2d-tilemap/) for a complete collision setup.

## 6. Rebind, preload, and save

Use `InputActionMap` to bind keys, mouse/gamepad inputs, and axes to named gameplay actions. `toData()` returns a detached, versioned record; `loadData()` validates the complete record before replacing bindings. Persist that data next to the user's settings and restore it at startup. `createGameStorage()` selects the platform adapter; the current Web adapter uses localStorage, while targets without an adapter return an unsupported status. Check each operation's `ok` result and `status` before using a saved value.

~~~ts
import { createGameStorage } from '@bornengine/engine';
import type { InputActionMapData } from '@bornengine/engine/input';

const storage = createGameStorage('com.example.moonlit-pier', 'default');
const saved = storage.read<InputActionMapData>('controls');
if (saved.ok && saved.value !== null) controls.loadData(saved.value);

const write = storage.write('controls', controls.toData());
if (!write.ok) console.warn('Settings were not saved: ' + write.status);
~~~

Use `AssetManager.createGroup()` to batch texture, sound, and music loads. A group's `load()` resolves when every entry settles, while `state`, `progress`, and `entries` expose per-asset results. Groups keep references to resources; the owning `AssetManager` and `AudioSystem` control resource lifetime. Put a group under `Scene.own()` when its metadata should be released with that scene.

For positional 2D playback, attach `AudioEmitter2D` to the object that owns a loaded `Sound` and use `game.audio.listener2D` as the shared listener. The emitter tracks its owner's XY position and projects it onto the audio XZ plane; the listener follows the active scene camera by default and can also use an explicit XY position. Stop or let the component stop its voice when the object is destroyed. Use `SoundManager` for simpler non-positional effects.

## Sample projects

The [2D platformer](https://github.com/RuanFernandes/BornEngine/tree/main/examples/2d-platformer) combines a tilemap, kinematic movement, a follow camera, sprite-state animation, sound, and marker-driven particles. The [2D top-down sample](https://github.com/RuanFernandes/BornEngine/tree/main/examples/2d-top-down) loads a room document, maps actions to movement, and exercises game-owned assets and scene lifecycle.

For the API details, see [World2D](../../api/world2d/), [camera and viewport](../../api/camera2d/), [physics 2D](../../api/physics2d/), [tilemaps](../../api/tilemap/), [input](../../api/input/), [audio](../../api/audio/), and the [2D game guide](../2d-game/).
