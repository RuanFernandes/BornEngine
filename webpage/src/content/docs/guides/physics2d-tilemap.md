---
title: 2D physics and tilemaps
description: Build a 2D level from atlas tiles and a fixed-step physics world.
section: Guides
order: 64
---

This guide combines `PhysicsWorld2D`, `PhysicsBody2D`, and `Tilemap` in a `Scene`. The map draws occupied atlas cells automatically. Collision rectangles remain explicit so you can choose which tiles become physics bodies.

## Setup

Create a project with a small atlas and a row-major tile-ID map. `0` represents an empty cell; each nonzero value references a tile definition. For the full runnable project, see [`examples/physics2d-tilemap`](https://github.com/RuanFernandes/BornEngine/tree/main/examples/physics2d-tilemap).

## Game loop

```ts
import { Game, Scene } from '@bornengine/engine';
import { PhysicsWorld2D } from '@bornengine/engine/physics2d';

class Level extends Scene {
  readonly physics: PhysicsWorld2D | null;

  constructor(game: Game) {
    super(game, { name: 'Level' });
    this.physics = this.own(new PhysicsWorld2D(game, {
      gravity: { x: 0, y: 900 },
      fixedTimeStep: 1 / 60,
      maxSubSteps: 5,
    }));
  }

  override update(deltaTime: number): void {
    super.update(deltaTime);
    if (this.physics !== null) this.physics.step(deltaTime);
  }
}
```

Step the world once after the Scene updates its objects. Unloading the Scene releases the world because it was registered with `own()`.

## Tile collisions

Mark tile definitions as `solid: true` or provide a smaller collision rectangle. Call `getSolidTiles()` and create static box bodies at each returned rectangle's center. The returned bounds use map-local coordinates, so add the tilemap object's position before creating bodies when the map is offset.

```ts
const mapOrigin = tilemapObject.transform.worldPosition;
const solids = tilemap.getSolidTiles();
for (let index = 0; index < solids.length; index++) {
  const tile = solids[index];
  const colliderObject = new GameObject({
    position: {
      x: mapOrigin.x + tile.bounds.x + tile.bounds.width * 0.5,
      y: mapOrigin.y + tile.bounds.y + tile.bounds.height * 0.5,
      z: mapOrigin.z,
    },
  });
  colliderObject.addComponent(physics.createBody({
    type: 'static',
    shape: { type: 'box', width: tile.bounds.width, height: tile.bounds.height },
  }));
  scene.add(colliderObject);
}
```

## Complete example

The included sample demonstrates an atlas-backed map, player body, contact callbacks, `camera2D`, and an explicitly stepped world. It uses the Game asset manager to share its texture. Run it with `bornengine run main.ts` from the example directory.

## Next steps

Read the [Physics 2D API](../../api/physics2d/), [Tilemaps API](../../api/tilemap/), and [Sprites API](../../api/sprites/) for shape limits, frame metadata, rendering, and camera culling.
