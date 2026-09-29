---
title: World2D API
description: Validate, migrate, serialize, and instantiate versioned 2D world documents.
section: API / World
order: 44
---

The `@bornengine/engine/world2d` module provides a separate v1 contract for tilemaps and 2D object layers. It does not change the existing 3D `WorldData` format. Import from the package root or from the `world2d` subpath.

## Validate and serialize

`World2DDocument` is plain JSON data. It can be created or edited without a `Game` instance. `validateWorld2D` returns all diagnostics with JSON Pointer paths; `migrateWorld2D` currently accepts v1 unchanged and rejects unsupported versions. `serializeWorld2D` validates the input and returns canonical pretty JSON.

```ts
import { serializeWorld2D, validateWorld2D } from '@bornengine/engine/world2d';
import type { World2DDocument } from '@bornengine/engine/world2d';

declare const document: World2DDocument;
const validation = validateWorld2D(document);
if (!validation.ok) {
  console.error(validation.diagnostics);
} else {
  const saved = serializeWorld2D(document);
  if (saved.ok) writeProjectFile('maps/level.world2d.json', saved.json);
}
```

Asset paths are normalized paths relative to the document root and listed in the sorted `assets` array. Tileset and file-property references must appear there. Both layer kinds may include a name-keyed `properties` record using the same typed `WorldProperty` values as objects and tile definitions. Tile IDs are zero-based in the document; every tile cell has explicit horizontal, vertical, and diagonal flip flags. Object positions and sizes use pixels, rotations use degrees, and origins are normalized from 0 to 1.

## Runtime loading

`World2DLoader` receives the destination `GameScene`, an optional document root, and callbacks for resolving sprite frames and physics. The loader validates and resolves every built-in descriptor before constructing runtime objects. It groups each tile layer by tileset, maps local tile IDs to the Tilemap empty-cell convention, and adds the complete set of objects before calling their `onAwake` methods. If validation, resolution, construction, or attachment fails, it returns diagnostics without adding any of the new objects.

```ts
import { World2DComponentRegistry, World2DLoader } from '@bornengine/engine/world2d';

const registry = new World2DComponentRegistry();
registry.registerComponentFactory('gameplay.spawn-marker', (data) => {
  return new SpawnMarker(String(data.spawnId));
});

const loader = new World2DLoader(registry, {
  documentRoot: 'assets/worlds',
  resolveSpriteFrame(tileset, tileId, imagePath) {
    return spriteFrames.resolve(imagePath, tileset, tileId);
  },
  physicsWorld2D,
});
const scene = game.scenes.currentScene;
if (scene !== null) {
  const result = loader.load(document, scene);
  if (!result.ok) console.error(result.diagnostics);
}
```

The built-in object components are `spriteRenderer` and `physicsBody2D`; tilemaps are created from tile layers. A physics descriptor requires a ready `PhysicsWorld2D` owned by the destination Game. Custom component kinds must be registered explicitly. Factories receive a JSON clone of descriptor data and may return a `GameComponent` or a structured diagnostic. `context.resolveAssetPath` returns a path only for assets declared in the document.

Layer offsets, visibility, and opacity are applied during loading. Parallax values remain in the document for game code to use; `GameScene` does not currently provide a layer-parallax camera hook. Diagonal flips are supported on tile cells; `SpriteRenderer` exposes horizontal and vertical flips only.
