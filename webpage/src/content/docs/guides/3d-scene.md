---
title: Build a 3D scene
description: Create a camera-driven 3D view with Game-owned models and retained scene nodes.
section: Guides
order: 71
---

This recipe covers immediate renderer primitives and retained 3D nodes. The camera uses a right-handed, Y-up world.

## Setup

Place a supported model in `assets/models/statue.glb` and create it through the Game that will render it.

```ts
import { Game, Model } from '@bornengine/engine';

const game = new Game({ window: { title: 'Scene Demo', width: 1280, height: 720 } });
const statue = new Model(game, 'assets/models/statue.glb');
const statueNode = game.sceneGraph.createNode({ name: 'Statue' });
if (statue.isLoaded) statueNode.attachModel(statue);
statueNode.setTrs({ x: 0, y: 0, z: -5 }, 0, 1);
statueNode.setPbr(0.42, 0.15);
```

## Game loop

Pass the camera to `begin3D()` and always balance the pass with `end3D()`. Draw the HUD after returning from the 3D pass.

```ts
const camera = {
  position: { x: 5, y: 3, z: 6 },
  target: { x: 0, y: 1, z: -4 },
  up: { x: 0, y: 1, z: 0 },
  fovy: 45,
  projection: 'perspective' as const,
};

game.run({
  update() {},
  render() {
    game.renderer.clear({ r: 8, g: 12, b: 18, a: 255 });
    if (!game.renderer.begin3D(camera)) return;
    game.renderer.drawGrid(20, 1);
    if (statue.isLoaded) statue.draw(game.renderer, { x: 2, y: 0, z: -5 });
    game.renderer.end3D();
    game.renderer.drawText('Scene Demo', { x: 24, y: 24 }, 20, Colors.WHITE);
  },
  onStop: () => game.dispose(),
});
```

Retained nodes keep their transforms and model attachment across frames. Immediate model draws are useful for prototypes and one-off overlays.

## Complete example

```ts
import { Colors, Game, Model } from '@bornengine/engine';

const game = new Game({ window: { title: 'Scene Demo', width: 1280, height: 720 } });
const statue = new Model(game, 'assets/models/statue.glb');
const node = game.sceneGraph.createNode({ name: 'Statue' });
if (statue.isLoaded) node.attachModel(statue);
node.setTrs({ x: 0, y: 0, z: -5 }, 0, 1);
const camera = {
  position: { x: 5, y: 3, z: 6 }, target: { x: 0, y: 1, z: -4 },
  up: { x: 0, y: 1, z: 0 }, fovy: 45, projection: 'perspective' as const,
};

game.run({
  update() {},
  render() {
    game.renderer.clear(Colors.BLACK);
    if (game.renderer.begin3D(camera)) {
      game.renderer.drawGrid(20, 1);
      if (statue.isLoaded) statue.draw(game.renderer, { x: 0, y: 0, z: -5 });
      game.renderer.end3D();
    }
  },
  onStop: () => game.dispose(),
});
```

## Next steps

Add scene nodes for persistent geometry, picking, and lights through `game.sceneGraph`. See the [scene API](../../api/scene/), [models API](../../api/models/), and [skeletal animation guide](../skeletal-animation/).
