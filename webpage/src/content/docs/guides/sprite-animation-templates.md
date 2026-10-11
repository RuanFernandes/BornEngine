---
title: Reusable sprite animation templates
description: Share one set of layered animation clips between characters by binding different images to named image parameters.
section: Guides
order: 77
---

A **sprite animation template** stores how a character animates, not how it looks. It lists named image slots, such as a body and a held item, and clips whose frames are stacks of cropped layers. At run time you bind real pictures to the slots. A knight and a mage can then share the same walk cycle while they wear different art.

This guide builds a small parade of three characters from one template. Each section adds one piece. The last section has the complete `main.ts`.

## What you will build

- One template file with two image parameters, `body_art` and `held_item`, and two clips, `idle` and `walk`.
- A knight with a sword that you move with `A`/`D` or the arrow keys.
- A mage with a staff and a squire without an item, both walking in place at different speeds.

## Words you will see

- **Image parameter**: a named slot for a picture, such as `body_art`. The template never contains the picture. Parameter IDs are yours to choose.
- **Layer**: a crop of one parameter's image, with an optional offset, rotation, and scale. A frame is a list of layers drawn back to front.
- **Binding**: the result of giving a template real textures. You create one binding for each combination of pictures.
- **Playhead**: the position of an animation in time. Each `SpriteAnimator` has its own.

## Setup

Create a 2D project and a folder for the art:

```sh
bornengine new Parade
cd Parade
mkdir -p assets/animations
```

The template in this guide needs four pictures in `assets`. Every body uses the same layout, so one template fits them all:

| File | Size | Contents |
| --- | --- | --- |
| `knight.png` | 96 by 32 | Three 32 by 32 cells: idle, walk A, walk B |
| `mage.png` | 96 by 32 | The same three cells for another character |
| `sword.png` | 16 by 16 | The knight's item |
| `staff.png` | 16 by 16 | The mage's item |

Any pictures work. A picture only has to be at least as large as the crops that the template takes from it.

### Create the template

You can create the template with the BornEngineTools extension for VS Code or write it by hand. It is plain JSON. Save this as `assets/animations/hero.spriteanim-template.json`:

```json
{
  "format": "bornengine.spriteanim-template",
  "version": 1,
  "id": "hero",
  "name": "Hero",
  "description": "Idle and walk clips for a body with an optional held item.",
  "imageParameters": [
    { "id": "body_art", "label": "Body", "required": true, "tags": ["character"] },
    { "id": "held_item", "label": "Held item", "required": false, "tags": ["equipment"] }
  ],
  "clips": [
    {
      "name": "idle",
      "fps": 4,
      "loop": "loop",
      "canvasSize": { "width": 32, "height": 32 },
      "frames": [
        {
          "layers": [
            { "parameter": "body_art", "source": { "x": 0, "y": 0, "width": 32, "height": 32 } },
            {
              "parameter": "held_item",
              "source": { "x": 0, "y": 0, "width": 16, "height": 16 },
              "transform": { "offset": { "x": 9, "y": 4 } }
            }
          ]
        }
      ]
    },
    {
      "name": "walk",
      "fps": 8,
      "loop": "loop",
      "canvasSize": { "width": 32, "height": 32 },
      "frames": [
        {
          "duration": 0.12,
          "markers": ["step"],
          "layers": [
            { "parameter": "body_art", "source": { "x": 32, "y": 0, "width": 32, "height": 32 } },
            {
              "parameter": "held_item",
              "source": { "x": 0, "y": 0, "width": 16, "height": 16 },
              "transform": { "offset": { "x": 9, "y": 3 }, "rotation": 10, "pivot": { "x": 0.5, "y": 0.75 } }
            }
          ]
        },
        {
          "duration": 0.12,
          "layers": [
            { "parameter": "body_art", "source": { "x": 64, "y": 0, "width": 32, "height": 32 } },
            {
              "parameter": "held_item",
              "source": { "x": 0, "y": 0, "width": 16, "height": 16 },
              "transform": { "offset": { "x": 9, "y": 5 }, "rotation": -10, "pivot": { "x": 0.5, "y": 0.75 } }
            }
          ]
        }
      ]
    }
  ]
}
```

The fields mean:

- `format` and `version` identify the file. Only version `1` is supported. `id` and `name` are required text. The text must have no leading or trailing spaces.
- `imageParameters` lists the slots. Each has a unique `id`, and `required` says whether `template.bind` must receive a picture for it. `label` and `tags` are optional and only help editors. They do not change playback.
- Each clip has a unique `name`, `fps` above zero, a `loop` mode (`loop`, `once`, or `ping-pong`), and a `canvasSize` in whole pixels. The canvas is the size of the finished picture before scaling.
- A frame lasts `duration` seconds, or `1 / fps` seconds when you leave `duration` out. `markers` are names that `animator.onMarker` receives when playback enters the frame.
- A layer names a `parameter` and a `source` crop in whole pixels of that parameter's image. Layers are drawn in the order listed, so the first layer is at the back.
- `transform` is optional. Its parts and their defaults are `offset` (canvas pixels, `0, 0`), `stretch` (`1, 1`, where a negative value mirrors), `zoom` (`1`), `rotation` (degrees, `0`), and `pivot` (`0.5, 0.5`, measured from 0 to 1 across the crop). A layer is placed with its pivot at the object's position plus `offset`, so a layer with no offset is centered on the object. `visible: false` hides a layer.
- Unknown fields are errors, so a typo is reported instead of ignored.

### Edit it with BornEngineTools

The BornEngineTools extension opens files that end in `.spriteanim-template.json` in a visual editor. The **BornEngineTools: New Sprite Animation Template** command asks for a name and proposes a path in `assets/animations/` inside the workspace folder.

The editor has panels for clips, image inputs, frames, and layers. You can drag crops out of a preview picture, move layers on a preview, and play the clip. The preview pictures are only for the editor and are never saved in the template. The editor checks the file with the engine's own validator and shows problems in the Problems panel. It saves compact JSON and leaves out transform and visibility values that equal the defaults. The engine fills them in again when it loads the file. If the file is not valid, the editor shows the problems and does not rewrite it.

## Bind images to the template

Loading has two steps. First you read the file and check it. Then you call `template.bind` once for each combination of pictures:

```ts
import { FILTER_NEAREST, Game, SpriteAnimationTemplateAsset } from '@bornengine/engine';
import type { SpriteAnimationTemplateBoundAnimation, Texture } from '@bornengine/engine';

function loadTexture(game: Game, path: string): Texture {
  const texture = game.assets.loadTexture(path);
  if (texture === null || !texture.isLoaded) throw new Error(texture?.error ?? 'Could not load ' + path);
  texture.setFilter(FILTER_NEAREST);
  return texture;
}

function loadTemplate(game: Game, path: string): SpriteAnimationTemplateAsset {
  const source = game.input.readFile(path);
  if (source.length === 0) throw new Error('Could not read ' + path);
  let document: unknown;
  try {
    document = JSON.parse(source) as unknown;
  } catch {
    throw new Error(path + ' is not valid JSON.');
  }
  const template = new SpriteAnimationTemplateAsset(document);
  if (template.error !== null) throw new Error(path + ': ' + template.error);
  return template;
}

function bindImages(
  template: SpriteAnimationTemplateAsset,
  images: Record<string, Texture>,
): SpriteAnimationTemplateBoundAnimation {
  const result = template.bind(images);
  if (!result.ok) throw new Error(result.diagnostics.map((item) => item.path + ': ' + item.message).join('\n'));
  return result.value;
}
```

- `new SpriteAnimationTemplateAsset(document)` validates the parsed JSON. It does not throw. `template.error` holds the first problem, and `template.diagnostics` lists all of them with a JSON pointer `path`, a `code`, and a `message`.
- `template.bind(images)` takes an object keyed by parameter ID. The keys are the names, not positions, so the order of the parameters in the file does not matter. It returns `{ ok: true, value }` or `{ ok: false, diagnostics }`.
- A required parameter must be present. Leaving out an optional one is fine, and only the layers that use it are skipped. A key that the template does not declare is an error.
- Each texture must be loaded, and all of them must belong to the same `Game`. Every crop must fit inside its image, otherwise `bind` reports a `binding.crop` problem with the path of the layer. A body picture that is too small fails here, before anything is drawn.
- The result is a bound animation. It holds the cut frames and the timing, and it does not change after it is created. Several characters can share one binding.

## Game loop

A bound animation is drawn by a `SpriteAnimationTemplateRenderer` and played by a `SpriteAnimator`. The renderer is a component that draws every visible layer of the current frame. The animator is the same class that plays ordinary sprite clips. It advances the clip and tells the renderer which frame to show. Both are components, so the scene's update and render do the work. You only choose which clip plays.

```ts
import { GameObject, SpriteAnimationTemplateRenderer, SpriteAnimator, Vector2D } from '@bornengine/engine';
import type { InputActionMap, SpriteAnimationTemplateBoundAnimation } from '@bornengine/engine';

class Walker extends GameObject {
  private readonly controls: InputActionMap;
  private readonly animator: SpriteAnimator;

  constructor(controls: InputActionMap, animation: SpriteAnimationTemplateBoundAnimation) {
    super({ name: 'Walker', position: { x: 200, y: 200, z: 0 } });
    this.controls = controls;
    const renderer = new SpriteAnimationTemplateRenderer(animation, { size: new Vector2D(64, 64) });
    this.animator = new SpriteAnimator(renderer, { clips: animation.clips });
    if (this.animator.error !== null) throw new Error(this.animator.error);
    this.addComponent(renderer);
    this.addComponent(this.animator);
    this.animator.play('idle');
  }

  override update(deltaTime: number): void {
    const direction = this.controls.readAxis('move-x');
    this.transform.position.x += direction * 80 * deltaTime;
    if (direction !== 0) this.transform.scale.x = direction < 0 ? -1 : 1;
    this.animator.play(direction === 0 ? 'idle' : 'walk');
  }
}
```

- `size` is the size in world units of the clip canvas. Here a 32 by 32 canvas is drawn at 64 by 64, so everything is scaled by 2. Offsets in the template scale with it. Without `size`, the canvas of the first clip is used at its own pixel size.
- `animation.clips` is an object of clips keyed by name. It goes straight into the animator. `play('walk')` starts that clip. Playing the clip that is already playing does nothing, so it is safe to call every frame.
- A template character has no `flipX`. To face left, set a negative `transform.scale.x`. The layers and their offsets mirror with the object.
- A clip plays on one shared frame schedule: the clip's `fps`, the frame durations, the loop mode, and the markers. The animator picks one frame number, and the renderer draws all layers of that frame together. A template has no timing per layer and no bones.
- A binding holds pictures and frame data only. Each character has its own animator, so characters that use the same binding have independent animator playheads. They can play different clips, or the same clip at different speeds or positions, such as with `animator.setSpeed(1.5)`.

## Directional clips

A clip can hold four frame lists, `up`, `left`, `down`, and `right`, under `directions` instead of `frames`. In the editor, turn on **4 directions** for the clip. The animator then plays the list that matches its direction. The number follows this order: `0` is up, `1` is left, `2` is down, and `3` is right. The default is down.

```ts
import { SpriteAnimator } from '@bornengine/engine';

function faceMovement(animator: SpriteAnimator, dx: number, dy: number): void {
  if (dx === 0 && dy === 0) return;
  if (Math.abs(dx) > Math.abs(dy)) animator.setDir(dx < 0 ? 1 : 3);
  else animator.setDir(dy < 0 ? 0 : 2);
}
```

`setDir` switches to the other list at the same frame number and time. It does not restart the clip or send its markers again. Every direction needs at least one frame.

## Complete example

Replace `main.ts` with this file. It expects the four pictures and the template from the setup section:

```ts
import {
  Colors,
  FILTER_NEAREST,
  Game,
  GameObject,
  Key,
  Scene,
  SpriteAnimationTemplateAsset,
  SpriteAnimationTemplateRenderer,
  SpriteAnimator,
  Vector2D,
} from '@bornengine/engine';
import type { InputActionMap, SpriteAnimationTemplateBoundAnimation, Texture } from '@bornengine/engine';

const TEMPLATE_PATH = 'assets/animations/hero.spriteanim-template.json';

function loadTexture(game: Game, path: string): Texture {
  const texture = game.assets.loadTexture(path);
  if (texture === null || !texture.isLoaded) throw new Error(texture?.error ?? 'Could not load ' + path);
  texture.setFilter(FILTER_NEAREST);
  return texture;
}

function loadTemplate(game: Game, path: string): SpriteAnimationTemplateAsset {
  const source = game.input.readFile(path);
  if (source.length === 0) throw new Error('Could not read ' + path);
  let document: unknown;
  try {
    document = JSON.parse(source) as unknown;
  } catch {
    throw new Error(path + ' is not valid JSON.');
  }
  const template = new SpriteAnimationTemplateAsset(document);
  if (template.error !== null) throw new Error(path + ': ' + template.error);
  return template;
}

function bindImages(
  template: SpriteAnimationTemplateAsset,
  images: Record<string, Texture>,
): SpriteAnimationTemplateBoundAnimation {
  const result = template.bind(images);
  if (!result.ok) throw new Error(result.diagnostics.map((item) => item.path + ': ' + item.message).join('\n'));
  return result.value;
}

class Character extends GameObject {
  protected readonly animator: SpriteAnimator;

  constructor(name: string, x: number, animation: SpriteAnimationTemplateBoundAnimation) {
    super({ name, position: { x, y: 220, z: 0 } });
    const renderer = new SpriteAnimationTemplateRenderer(animation, { size: new Vector2D(64, 64) });
    this.animator = new SpriteAnimator(renderer, { clips: animation.clips });
    if (this.animator.error !== null) throw new Error(this.animator.error);
    this.addComponent(renderer);
    this.addComponent(this.animator);
  }
}

class Walker extends Character {
  private readonly controls: InputActionMap;

  constructor(controls: InputActionMap, x: number, animation: SpriteAnimationTemplateBoundAnimation) {
    super('Knight', x, animation);
    this.controls = controls;
    this.animator.play('idle');
  }

  override update(deltaTime: number): void {
    const direction = this.controls.readAxis('move-x');
    this.transform.position.x += direction * 80 * deltaTime;
    if (direction !== 0) this.transform.scale.x = direction < 0 ? -1 : 1;
    this.animator.play(direction === 0 ? 'idle' : 'walk');
  }
}

class Marcher extends Character {
  constructor(name: string, x: number, animation: SpriteAnimationTemplateBoundAnimation, speed: number) {
    super(name, x, animation);
    this.animator.setSpeed(speed);
    this.animator.play('walk');
  }
}

class TemplateGame extends Game {
  constructor() {
    super({ window: { title: 'Animation templates', width: 640, height: 360 }, targetFps: 60 });
  }

  protected override onStart(): void {
    const template = loadTemplate(this, TEMPLATE_PATH);
    const knight = loadTexture(this, 'assets/knight.png');
    const mage = loadTexture(this, 'assets/mage.png');
    const sword = loadTexture(this, 'assets/sword.png');
    const staff = loadTexture(this, 'assets/staff.png');

    const knightWithSword = bindImages(template, { body_art: knight, held_item: sword });
    const mageWithStaff = bindImages(template, { body_art: mage, held_item: staff });
    const unarmedKnight = bindImages(template, { body_art: knight });

    const controls = this.input.createActionMap();
    controls.bindAxis('move-x', {
      negative: [{ kind: 'key', key: Key.LEFT }, { kind: 'key', key: Key.A }],
      positive: [{ kind: 'key', key: Key.RIGHT }, { kind: 'key', key: Key.D }],
    });

    const scene = new Scene(this, { name: 'parade' });
    scene.addNode(new Walker(controls, 160, knightWithSword));
    scene.addNode(new Marcher('Mage', 320, mageWithStaff, 1.5));
    scene.addNode(new Marcher('Squire', 480, unarmedKnight, 1));
    if (!this.scenes.changeTo(scene)) throw new Error('Could not activate the scene.');
  }

  protected override loop(deltaTime: number): void {
    this.scenes.update(deltaTime);
  }

  protected override render(): void {
    this.renderer.clear(Colors.DARKBLUE);
    super.render();
    this.renderer.drawText('A/D or arrows: move the knight', { x: 12, y: 12 }, 18, Colors.WHITE);
  }
}

const game = new TemplateGame();
game.run().then(() => {
  if (game.error !== null) console.error(game.error);
});
```

Run it with `bornengine run main.ts`.

What each part does:

- `loadTemplate()` reads the file with `game.input.readFile()`, which returns an empty string when the file is missing. It parses the text and hands the result to `SpriteAnimationTemplateAsset`.
- `onStart()` binds three combinations of pictures: the knight with the sword, the mage with the staff, and the knight alone. The third call leaves out `held_item`, so the squire has no item and the template needs no change.
- `Character` creates the renderer and the animator and adds both as components. `Walker` is the character you steer. `Marcher` walks in place, and the mage walks 1.5 times faster than the squire.
- If a picture, the template, or a binding is wrong, `onStart()` throws. The game stops and `game.error` holds the message, which includes the JSON path of the layer for a binding problem.

## Limits to know

- Templates describe layered sprites in 2D. They have no per-layer timing, no bones, and no skeletal animation. For 3D models, see [Skeletal animation](../skeletal-animation/).
- A renderer is created for one bound animation and cannot switch to another. To change the pictures of a character, for example when it picks up new equipment, call `template.bind` again and replace the character's renderer and animator.
- `bind` checks a template against the real size of each texture, so a crop that is outside the picture is caught at load time. `validateSpriteAnimationTemplate(input)` checks only the file, which is useful in tests and tools.

## Next steps

- [Sprites API](../../api/sprites/) lists the template classes, the diagnostic codes, and the animator members.
- [Build a 2D game](../2d-game/) uses a state machine, markers, and particles with ordinary sprite clips.
- [Assets](../../concepts/assets/) explains paths and how textures are cached.
