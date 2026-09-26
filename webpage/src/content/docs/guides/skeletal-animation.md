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

## Blender export

For Mixamo assets, use the character and animation files from the same character pack. Their armature hierarchies may have the same bone names while using different rest-pose orientations, which can twist the mesh after retargeting.

In Blender, move each animation action onto the character armature and push it to an NLA track. Export the GLB with animation and skin data enabled, animation mode set to `NLA_TRACKS`, and forced frame sampling enabled. Keep `export_optimize_animation_size=False`; the optimizer can remove most keys from a motion and leave a character in a near-static pose.

Apply the imported armature's scale before baking animation or exporting. Mixamo FBX files often carry a `0.01` or `100` scale; leaving it unapplied can put mesh vertices and bone transforms in different coordinate spaces. For mobile assets, reduce mesh complexity before export and remove unused cameras, lights, and meshes.

## Runtime checks

| Symptom | Likely cause | What to check |
| --- | --- | --- |
| Character stays in a T-pose | Animation keys were stripped or the action was not on an NLA track | Re-export with animation mode `NLA_TRACKS`, forced sampling, and `export_optimize_animation_size=False` |
| Joints twist | Animation came from an incompatible character pack | Use a character and animations from the same pack |
| Mesh explodes or scales incorrectly | Armature scale was not applied | Apply scale before baking or export |
| Character slides across the floor | Root motion is disabled or not applied by gameplay | Enable it deliberately with `setRootMotion(true)` and consume `getRootMotionDelta(axis)` |
| Animation and model sizes disagree | Animation update and model drawing use different scales | Pass the same scale to both operations |

Root motion is opt-in. When enabled, apply its displacement to gameplay state before drawing the pose. For multiple actors, create a Model and Animation resource per live actor and dispose them with their scene or Game.
