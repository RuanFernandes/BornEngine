---
title: Models
description: Load models and animate or draw them through the owning renderer.
section: API / Models
order: 38
---

Model and animation instances are constructed with a Game. Their native identities remain private, and their load status can be inspected before use.

## Loading

```ts
import { Colors, Game, Model } from '@bornengine/engine';
class ExampleGame extends Game {
  protected override render(): void {
    this.renderer.begin3D(camera);
    this.renderer.drawGrid(20, 1);
    this.renderer.drawCube({ x: 0, y: 0.5, z: 0 }, { x: 1, y: 1, z: 1 }, Colors.BLUE);
    if (character.isLoaded) character.draw(this.renderer, { x: 0, y: 0, z: -3 });
    this.renderer.end3D();
  }
}

const game = new ExampleGame();
const character = new Model(game, 'assets/models/character.glb');
if (!character.isLoaded) console.error(character.error);
else console.log(character.meshCount, character.materialCount);
```

## Primitives

Use `game.renderer` for built-in 3D primitives or draw an owned model through that renderer. Positions and sizes use world-space values.

```ts
game.run();
```

## Materials and animation

Material instances compile a shader for one Game and draw through Renderer. Animation instances can play clips, blend a layer, and update a skinned model each frame.

```ts
import { Animation, Material } from '@bornengine/engine';
const material = new Material(game, shaderSource, 'opaque');
const animation = new Animation(game, 'assets/models/character.glb');
if (animation.isLoaded) {
  animation.play(0);
  animation.update(deltaTime, { x: 0, y: 0, z: 0 });
}
```

Dispose model and animation resources when finished. The [skeletal animation guide](../../guides/skeletal-animation/) describes asset export and update order.
