---
title: Skeletal animation
description: Load, update, and render GPU-skinned models with Game-owned animation resources.
section: Guides
order: 61
---

BornEngine supports GPU-accelerated skeletal animation from glTF/GLB files. The current path uses four-bone linear blend skinning and a 128-joint uniform buffer.

```ts
import { Animation, Colors, Game, Model } from '@bornengine/engine';

const game = new Game({ window: { title: 'Animation demo' } });
const character = new Model(game, 'assets/models/character.glb');
const animation = new Animation(game, 'assets/models/character.glb');
if (animation.isLoaded) animation.play(0);

game.run({
  update(deltaTime) {
    if (animation.isLoaded) animation.update(deltaTime, { x: 0, y: 0, z: 0 });
  },
  render() {
    game.renderer.clear(Colors.BLACK);
    if (character.isLoaded) character.draw(game.renderer, { x: 0, y: 0, z: 0 });
  },
  onStop: () => game.dispose(),
});
```

`Animation` provides `play`, `setLayer`, `setRootMotion`, `update`, `isFinished`, `getClipDuration`, and joint queries. Update the animation before drawing the corresponding Model each frame.

Export a GLB whose mesh has `JOINTS_0` and `WEIGHTS_0` attributes. Keep the character mesh and animation from compatible source assets so their rest-pose orientations agree. The engine skins positions and normals on the GPU.

For multiple actors, create a Model and Animation resource per live actor and dispose them with their scene or Game. See [BornEngine's detailed skeletal-animation notes](../../../../docs/skeletal-animation.md) for Blender export steps and runtime constraints.
