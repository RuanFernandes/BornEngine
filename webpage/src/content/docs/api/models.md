---
title: Models
description: Load 3D models and create mesh, material, and skeletal animation resources.
section: API / Models
order: 38
---

Create 3D resources through the Game or Scene asset scope. Models and fonts are cached by their asset key; animation controllers and generated meshes are independent resources.

## Loading

```ts
import { Colors, Game, Model } from '@bornengine/engine';

class ExampleGame extends Game {
  private character: Model | null = null;

  protected override onStart(): void {
    this.character = this.assets.loadModel('assets/models/character.glb');
    if (this.character === null || !this.character.isLoaded) {
      console.error(this.character?.error || 'Unable to load character model.');
    }
  }

  protected override render(): void {
    this.renderer.begin3D(camera);
    this.renderer.drawGrid(20, 1);
    this.renderer.drawCube({ x: 0, y: 0.5, z: 0 }, { x: 1, y: 1, z: 1 }, Colors.BLUE);
    if (this.character !== null && this.character.isLoaded) {
      this.character.draw(this.renderer, { x: 0, y: 0, z: -3 });
    }
    this.renderer.end3D();
  }
}
```

`game.assets.loadModel(path)` returns the same live Model for repeated requests in that scope. `scene.assets.loadModel(path)` keeps models scoped to one level. Model exposes mesh/material counts, bounds, transform data, and load status.

## Primitives

Use `game.assets.createMesh(vertices, indices)` for generated geometry. Built-in primitives can also be drawn directly through `game.renderer`.

## Materials and animation

Create materials and animation controllers through the same scope. Animation controllers are not cached because they hold per-character playback state.

```ts
const material = game.assets.createMaterial(shaderSource, 'opaque');
const animation = game.assets.createAnimation('assets/models/character.glb');
if (animation !== null && animation.isLoaded) {
  animation.play(0);
  animation.update(deltaTime, { x: 0, y: 0, z: 0 });
}
```

Release short-lived resources with `assets.release(resource)` or let a Scene asset scope dispose them on unload. See the [skeletal animation guide](../../guides/skeletal-animation/) for asset export and update order.
