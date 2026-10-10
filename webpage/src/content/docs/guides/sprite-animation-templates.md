---
title: Reusable sprite animation templates
description: Bind author-defined image parameters to layered 2D animation clips.
section: Guides
order: 77
---

Use a sprite animation template when several characters or equipment sets share the same timing and layer transforms but use different images. BornEngineTools can create and edit the template; the engine binds its named image parameters to textures at runtime.

## Setup

Create a `.spriteanim-template.json` file with BornEngineTools. The document uses the `bornengine.spriteanim-template` format and declares author-defined image parameter IDs, clips, frame crops, layer order, and transforms. IDs such as `body_art` or `held_item` are examples only. Labels and tags organize the authoring form and do not affect playback.

Templates support required and optional image parameters. Required textures must be supplied during binding. Omitting an optional texture skips only the layers that refer to it. Each supplied texture must be loaded and owned by the same `Game`, and every crop must fit inside its image. The editor can save compact JSON by omitting values that have the same documented defaults; this does not remove animation data.

```ts
import { Game, SpriteAnimationTemplateAsset } from '@bornengine/engine';

function loadAnimationTemplate(game: Game): SpriteAnimationTemplateAsset {
  const source = game.input.readFile('assets/hero.spriteanim-template.json');
  if (source.length === 0) throw new Error('Could not read the animation template.');
  const template = new SpriteAnimationTemplateAsset(JSON.parse(source) as unknown);
  if (template.error !== null) throw new Error(template.error);
  return template;
}
```

The template file contains the reusable animation definition, not character art. Keep texture loading in the project's normal asset workflow.

## Game loop

Use the parameter IDs as object keys. The map is not positional, so reordering fields in the template does not change which texture each layer receives. Bind once per image combination, then give the returned clips to one `SpriteAnimator` and its renderer.

```ts
const textures = {
  body_art: game.assets.loadTexture('assets/hero-body.png'),
  held_item: game.assets.loadTexture('assets/bronze-sword.png'),
};
if (textures.body_art === null || !textures.body_art.isLoaded ||
    textures.held_item === null || !textures.held_item.isLoaded) {
  throw new Error('Load both template images before binding.');
}

const binding = template.bind(textures);
if (!binding.ok) throw new Error(binding.diagnostics.map((item) => item.message).join('\n'));

const renderer = new SpriteAnimationTemplateRenderer(binding.value, { size: new Vector2D(48, 48) });
const animator = new SpriteAnimator(renderer, { clips: binding.value.clips });
const character = new GameObject({ position: { x: 160, y: 120, z: 0 } });
character.addComponent(renderer);
character.addComponent(animator);
scene.add(character);
animator.play('walk');
```

Call the game's usual `this.scenes.update(deltaTime)` from its loop. The renderer draws every visible layer in authored order, and the animator advances one shared frame schedule for the composite image.

## Directional clips

Turn on **4 directions** for a clip in BornEngineTools to author separate frames for up, left, down, and right. The JSON clip then stores `directions` (with `up`, `left`, `down`, and `right` frame lists) instead of `frames`. The editor's direction pad and the W, A, S, D keys switch the direction being edited, and **Copy this direction to** with **Mirror** builds the opposite side from the current one.

At runtime the bound clip keeps one variant per direction. Set the facing direction on the animator with Graal `dir` values; the template renderer draws the matching variant:

```ts
animator.play('idle');
animator.setDir(1); // 0 up, 1 left, 2 down (default), 3 right
```

## Complete example

This example reuses the checked-in fixture for two combinations of images. It flips a copy of the source atlas so each preview receives visibly different art. The fixture's `body_art` and `spark_art` keys are arbitrary template IDs; the code can substitute any compatible textures without copying the clip definitions.

```ts
import {
  Game,
  GameObject,
  Scene,
  SpriteAnimationTemplateAsset,
  SpriteAnimationTemplateRenderer,
  SpriteAnimator,
  Vector2D,
} from '@bornengine/engine';

function createTemplateScene(game: Game): Scene {
  const templateSource = game.input.readFile('assets/layered-avatar.spriteanim-template.json');
  if (templateSource.length === 0) throw new Error('Could not read the example template.');
  const template = new SpriteAnimationTemplateAsset(JSON.parse(templateSource) as unknown);
  const original = game.assets.loadTexture('assets/atlas.png');
  const alternateImage = game.assets.createImageData('assets/atlas.png');
  if (template.error !== null || original === null || !original.isLoaded || alternateImage === null ||
      !alternateImage.isLoaded || !alternateImage.flipHorizontal()) {
    throw new Error('Template or source image could not be loaded.');
  }
  const alternate = game.assets.createTexture(alternateImage);
  if (alternate === null || !alternate.isLoaded) throw new Error('Could not create the alternate image.');

  const combinations = [
    template.bind({ body_art: original, spark_art: alternate }),
    template.bind({ body_art: alternate, spark_art: original }),
  ];
  const scene = new Scene(game, { name: 'Template animation' });
  for (let index = 0; index < combinations.length; index++) {
    const result = combinations[index];
    if (!result.ok) throw new Error(result.diagnostics.map((item) => item.message).join('\n'));
    const renderer = new SpriteAnimationTemplateRenderer(result.value, { size: new Vector2D(48, 48) });
    const animator = new SpriteAnimator(renderer, { clips: result.value.clips });
    const character = new GameObject({ position: { x: 260 + index * 280, y: 225, z: 0 } });
    character.addComponent(renderer);
    character.addComponent(animator);
    scene.add(character);
    animator.play('walk');
  }
  game.scenes.changeTo(scene);
  return scene;
}
```

Textures bound to one character must belong to the same `Game`. A binding creates its own frames; separate characters can share the source definition while keeping independent animator playheads.

## Next steps

All layers in one clip share its FPS, frame durations, loop mode, markers, state transitions, and crossfade. V1 does not provide per-layer timing, bones, or skeletal animation. Use the existing concrete `.spriteanim.json` format with `SpriteAnimation` when each frame is a single `SpriteFrame`; that workflow remains compatible.

The asset document should be parsed through your project's existing asset or module-loading workflow before passing it to `SpriteAnimationTemplateAsset`. Binding validation returns diagnostics and does not replace the source document. See the [sprite animation API](../../api/sprites/) for crop, transform, and runtime details.
