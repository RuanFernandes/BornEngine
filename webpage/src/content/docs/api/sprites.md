---
title: Sprites and animation
description: Draw atlas frames as sprites, animate them with clips and state machines, and spawn 2D particles.
section: API
order: 35
---

A sprite is a 2D picture that the game draws at a position in the scene. Most games keep many small pictures in one large image, called an atlas, so the game loads a single texture and draws different rectangles of it. This page covers the classes that do that work:

- `SpriteSheet` cuts an atlas texture into frames.
- `SpriteRenderer` draws one frame.
- `SpriteAnimation` stores a clip, which is an ordered list of frames with durations. `SpriteAnimator` plays clips on a renderer and can run a state machine.
- `SpriteAnimationTemplateAsset` and `SpriteAnimationTemplateRenderer` play layered animations that you can reuse with different images.
- `ParticleEmitter2D` draws bursts of small sprites.

All of them are exported from `@bornengine/engine` and from `@bornengine/engine/sprites`. The renderers, the animator, and the emitter are components that you attach to a `GameObject` in a scene. If scenes, game objects, and components are new to you, read [Scenes, objects, and components](../../concepts/scenes-and-objects/) first.

Four words appear throughout the page:

- **Texture**: an image that the game has loaded. `game.assets.loadTexture(path)` returns one.
- **Atlas**: one texture that holds many frames.
- **Frame**: one rectangle of an atlas. In code it is a `SpriteFrame`.
- **Clip**: an ordered list of frames that plays over time.

## Atlas frames

A `SpriteSheet` wraps a loaded texture and hands out `SpriteFrame` objects. There are two ways to describe the frames, and you can use both in one sheet:

- A **grid** for atlases in which every cell has the same size. You give the cell size and ask for a cell by column and row.
- **Named frames** for atlases with frames of different sizes, such as the output of a packing tool. You give each frame a name and a rectangle.

These are the options:

| Option | Meaning |
| --- | --- |
| `frameWidth`, `frameHeight` | Size of one grid cell in texture pixels. Give both or neither. |
| `margin` | An unused border in pixels: `x` on the left and right edges of the texture, and `y` on the top and bottom edges. |
| `spacing` | `{ x, y }` gap between neighboring cells. |
| `frames` | Named frames: `{ name, source, pivot?, trim? }`. `source` is a pixel rectangle inside the texture. |

`gridFrame(column, row)` returns the frame in a grid cell, and it returns the same object every time for the same cell. It returns `null` when the cell does not exist. `columns` and `rows` tell you how many cells the grid has. `getFrame(name)` returns a named frame or `null`. Frames from a grid have no name to look up, so `getFrame` cannot find them.

A `SpriteFrame` has these read-only fields:

- `name`: the name you gave it. Grid frames are called `grid:<column>:<row>`.
- `sheet`: the sheet that made it.
- `source`: the rectangle in the texture, in pixels.
- `pivot`: a point in the original, untrimmed frame, written as fractions. `{ x: 0.5, y: 0.5 }` is the center, which is the default. `{ x: 0.5, y: 1 }` is the middle of the bottom edge, which suits a character that stands on the ground. Values outside 0 to 1 are allowed.
- `trim` and `originalSize`: atlas packing tools often cut transparent borders from frames. `trim.offset` tells where the packed pixels sit inside the original frame, and `originalSize` is the size before trimming. When a frame is not trimmed, `trim` is `null` and `originalSize` is the size of `source`.

`pivot`, `originalSize`, and the vectors inside `trim` are copies, so changing one does not change the frame.

The constructor does not throw. If the texture is not loaded, a margin or spacing value is negative, the grid does not fit, a name is empty or repeated, or a rectangle lies outside the texture, the sheet sets `error` and both lookup methods return `null`. Check `sheet.error` before you build objects from a sheet.

A sheet keeps a reference to its texture and does not own it. The asset manager that loaded the texture owns it: `game.assets` keeps it until the game ends, and `scene.assets` releases it when the scene unloads. Create a sheet from a texture that lives at least as long as the sprites that use it. When the texture is released, those sprites stop drawing.

The first function below cuts a grid and collects the first row of frames. The second describes two frames by name, with a pivot at the feet and trim data for the second frame.

```ts
import { FILTER_NEAREST, Game, SpriteSheet } from '@bornengine/engine';
import type { SpriteFrame } from '@bornengine/engine';

function loadHeroFrames(game: Game): SpriteFrame[] | null {
  const texture = game.assets.loadTexture('assets/hero-atlas.png');
  if (texture === null || !texture.isLoaded) {
    console.error(texture === null ? 'Assets are unavailable.' : texture.error);
    return null;
  }
  texture.setFilter(FILTER_NEAREST);

  const sheet = new SpriteSheet(texture, {
    frameWidth: 32,
    frameHeight: 32,
    margin: { x: 2, y: 2 },
    spacing: { x: 1, y: 1 },
  });
  if (sheet.error !== null) {
    console.error(sheet.error);
    return null;
  }

  const frames: SpriteFrame[] = [];
  for (let column = 0; column < sheet.columns; column++) {
    const frame = sheet.gridFrame(column, 0);
    if (frame !== null) frames.push(frame);
  }
  return frames;
}
```

```ts
import { SpriteSheet } from '@bornengine/engine';
import type { SpriteFrame, Texture } from '@bornengine/engine';

function createNamedFrames(texture: Texture): SpriteFrame[] | null {
  const atlas = new SpriteSheet(texture, {
    frames: [
      { name: 'idle', source: { x: 0, y: 0, width: 30, height: 32 }, pivot: { x: 0.5, y: 1 } },
      {
        name: 'jump',
        source: { x: 30, y: 0, width: 28, height: 36 },
        pivot: { x: 0.5, y: 1 },
        trim: { offset: { x: 2, y: 0 }, originalSize: { x: 32, y: 36 } },
      },
    ],
  });
  const idle = atlas.getFrame('idle');
  const jump = atlas.getFrame('jump');
  if (atlas.error !== null || idle === null || jump === null) {
    console.error(atlas.error ?? 'A named frame is missing.');
    return null;
  }
  return [idle, jump];
}
```

`texture.setFilter(FILTER_NEAREST)` keeps pixel art sharp when it is scaled. See [Textures](../textures/).

## Sprite components and camera

`SpriteRenderer` is a component that draws one frame. Put it on a `GameObject`. The scene draws it every frame while the object is active. The transform of the object decides how the frame is drawn:

- The world position of the object is where the frame's pivot is drawn.
- The world scale resizes the sprite. A negative scale mirrors it.
- The rotation around the Z axis turns it. Set `transform.rotation` to the quaternion `{ x: 0, y: 0, z: Math.sin(angle / 2), w: Math.cos(angle / 2) }`, where `angle` is in radians.

These are the options of `new SpriteRenderer(frame, options)`:

| Option | Default | Meaning |
| --- | --- | --- |
| `size` | The frame's `originalSize` | The size of the untrimmed frame in world units. |
| `pivot` | The frame's `pivot` | The point of the frame that sits on the object's position. |
| `tint` | White | A color applied to the frame. White leaves it unchanged. |
| `flipX`, `flipY` | `false` | Mirror the sprite. |
| `visible` | `true` | `false` hides the sprite. |
| `renderOrder` | `0` | Components with a lower value draw first. Equal values draw in the order they were added. |

The renderer takes its size and pivot from the first frame it shows, and every later frame is scaled so that its untrimmed size fills that same `size`. `setFrame(frame)`, `setSize(size)`, and `setPivot(pivot)` change the renderer later. They return `false` and set `error` if a value is invalid, and a renderer with an `error` draws nothing.

The next program shows a hero in a scene. It needs `assets/hero-atlas.png`, an atlas of 32 by 32 pixel cells. The scene has a camera, so the world coordinates of the hero no longer have to match the window.

```ts
import { Colors, Game, GameObject, Scene, SpriteRenderer, SpriteSheet, Vector2D } from '@bornengine/engine';
import type { SpriteFrame } from '@bornengine/engine';

class HeroScene extends Scene {
  constructor(game: Game, idle: SpriteFrame) {
    super(game, { name: 'hero' });
    this.camera2D = {
      offset: new Vector2D(400, 225),
      target: new Vector2D(160, 120),
      rotation: 0,
      zoom: 1,
    };

    const hero = new GameObject({ name: 'Hero', position: { x: 160, y: 120, z: 0 } });
    hero.addComponent(new SpriteRenderer(idle, { size: new Vector2D(64, 64), pivot: new Vector2D(0.5, 1) }));
    this.addNode(hero);
  }
}

class SpriteDemo extends Game {
  constructor() {
    super({ window: { title: 'Sprites', width: 800, height: 450 }, targetFps: 60 });
  }

  protected override onStart(): void {
    const texture = this.assets.loadTexture('assets/hero-atlas.png');
    if (texture === null || !texture.isLoaded) {
      console.error(texture?.error ?? 'Could not load assets/hero-atlas.png');
      this.stop();
      return;
    }
    const sheet = new SpriteSheet(texture, { frameWidth: 32, frameHeight: 32 });
    const idle = sheet.gridFrame(0, 0);
    if (idle === null) {
      console.error(sheet.error ?? 'The atlas has no frame at column 0, row 0.');
      this.stop();
      return;
    }
    this.scenes.changeTo(new HeroScene(this, idle));
  }

  protected override loop(deltaTime: number): void {
    this.scenes.update(deltaTime);
  }

  protected override render(): void {
    this.renderer.clear(Colors.DARKBLUE);
    super.render();
  }
}

new SpriteDemo().run();
```

The scene draws inside a 2D camera pass when `camera2D` or `viewport2D` is set. In a `Camera2D` record, `target` is the world point the camera looks at, and `offset` is the screen position where that point appears. Here the target is the position of the hero, and the offset is the center of an 800 by 450 window, so that position appears in the middle of the window. Without a camera or a viewport, the scene draws in screen pixels. To follow an object, use `CameraRig2D` and `bindCameraRig2D`. See [Camera 2D](../camera2d/).

The game never updates scenes for you. `loop` calls `this.scenes.update(deltaTime)`, as in every example on this page.

### Culling and statistics

Inside a camera pass, `SpriteRenderer`, `SpriteAnimationTemplateRenderer`, and `Tilemap` skip anything that is outside the view. `renderer.isRectVisibleIn2D(bounds)` tells a custom component whether a world rectangle is in view. It returns `true` when there is no camera pass. `renderer.stats.spritesDrawn` and `renderer.stats.spritesCulled` count the sprite quads and tiles of the latest scene render. Particles from `ParticleEmitter2D` are not counted.

## Animation and state machines

A `SpriteAnimation` is a clip. Each keyframe has a `sprite`, an optional `duration` in seconds, and optional `markers`, which are names that the animator announces when playback reaches the keyframe.

- `fps` is the default frames per second. A keyframe without a `duration` lasts `1 / fps` seconds. The default is 12.
- `loop` is `'loop'` to start again after the last frame, `'once'` to stop on the last frame, or `'ping-pong'` to play forward and then backward. A ping-pong clip with frames 0, 1, and 2 plays 0, 1, 2, 1, 0, 1, and so on.

A clip never changes after you create it, so any number of objects can share it. The constructor does not throw. If a keyframe or an option is invalid, the clip has an `error` and no frames.

`SpriteAnimator` is the component that plays clips. Give it the `SpriteRenderer` that shows the frames and an object of named clips, and add it to the same object as the renderer. A scene updates it each frame after the object's own `update`, so parameters that your object sets in `update` take effect in the same frame.

An animator can run a **state machine**. A state names a clip. A state also lists transitions, which say when to move to another state. You change parameters from your game code, and the animator moves between states by itself.

There are four kinds of transition conditions:

| Condition | True when |
| --- | --- |
| `{ type: 'bool', name, value }` | The bool parameter `name`, set with `setBool`, equals `value`. A parameter that was never set is `false`. |
| `{ type: 'number', name, operator, value }` | The number parameter, set with `setNumber`, compares to `value`. `operator` is `'eq'`, `'gt'`, `'gte'`, `'lt'`, or `'lte'`. A parameter that was never set is 0. |
| `{ type: 'trigger', name }` | `setTrigger(name)` was called and no transition has used it since. |
| `{ type: 'callback', test }` | `test(animator)` returns `true`. |

The rules for transitions are:

- All conditions of one transition must be true. A transition with no conditions is always true, so the animator takes it on the next update.
- Once per update, the animator checks the transitions of the current state in the order you wrote them and takes the first one that is true. It takes at most one transition per update.
- A trigger stays set until a transition that uses it is taken, or until you call `resetTrigger(name)`. A trigger that no transition of the current state uses waits for a later state that does.
- `fade` on a transition is a crossfade in seconds. The old frame fades out while the new frame fades in. A transition has no fade by default.
- There is no wait for a clip to end. To leave a `'once'` clip when it finishes, use a `callback` condition such as `(animator) => !animator.isPlaying`.

This `Hero` object idles, walks while the right or left arrow key is held, and attacks when you press Space. The attack clip plays once, then the animator goes back to idle.

```ts
import { GameObject, Key, SpriteAnimation, SpriteAnimator, SpriteRenderer } from '@bornengine/engine';
import type { InputSystem, SpriteFrame } from '@bornengine/engine';

class Hero extends GameObject {
  private readonly input: InputSystem;
  private readonly sprite: SpriteRenderer;
  private readonly animator: SpriteAnimator;

  constructor(input: InputSystem, idle: SpriteFrame, walkA: SpriteFrame, walkB: SpriteFrame, attack: SpriteFrame) {
    super({ name: 'Hero', position: { x: 200, y: 200, z: 0 } });
    this.input = input;
    this.sprite = new SpriteRenderer(idle, { size: { x: 64, y: 64 } });

    const idleClip = new SpriteAnimation({ frames: [{ sprite: idle }], fps: 1 });
    const walkClip = new SpriteAnimation({
      frames: [
        { sprite: walkA, duration: 0.12 },
        { sprite: walkB, duration: 0.12, markers: ['footstep'] },
      ],
      loop: 'loop',
    });
    const attackClip = new SpriteAnimation({
      frames: [{ sprite: attack, duration: 0.3, markers: ['hit'] }],
      loop: 'once',
    });

    this.animator = new SpriteAnimator(this.sprite, {
      clips: { idle: idleClip, walk: walkClip, attack: attackClip },
      states: [
        {
          name: 'idle',
          clip: 'idle',
          transitions: [
            { to: 'attack', conditions: [{ type: 'trigger', name: 'attack' }] },
            { to: 'walk', conditions: [{ type: 'bool', name: 'moving', value: true }], fade: 0.08 },
          ],
        },
        {
          name: 'walk',
          clip: 'walk',
          transitions: [
            { to: 'attack', conditions: [{ type: 'trigger', name: 'attack' }] },
            { to: 'idle', conditions: [{ type: 'bool', name: 'moving', value: false }], fade: 0.08 },
          ],
        },
        {
          name: 'attack',
          clip: 'attack',
          transitions: [
            { to: 'idle', conditions: [{ type: 'callback', test: (animator) => !animator.isPlaying }] },
          ],
        },
      ],
      initialState: 'idle',
    });
    if (this.animator.error !== null) console.error(this.animator.error);

    this.animator.onMarker = (marker) => {
      if (marker === 'footstep') console.log('step');
      if (marker === 'hit') console.log('the swing connects');
    };
    this.addComponent(this.sprite);
    this.addComponent(this.animator);
  }

  override update(deltaTime: number): void {
    const direction = (this.input.isKeyDown(Key.RIGHT) ? 1 : 0) - (this.input.isKeyDown(Key.LEFT) ? 1 : 0);
    this.transform.position.x += direction * 120 * deltaTime;
    if (direction !== 0) this.sprite.flipX = direction < 0;

    this.animator.setBool('moving', direction !== 0);
    if (this.input.isKeyPressed(Key.SPACE)) this.animator.setTrigger('attack');
  }
}
```

The constructor of `SpriteAnimator` does not throw either. It sets `error` if the renderer has an error, if a clip is invalid, or if a state names an unknown clip or an unknown target state.

`clips` is optional for a `SpriteAnimationTemplateRenderer`. It defaults to every clip of the bound animation. `autoplay: 'idle'` plays one clip right away, without a state machine, so a template with one clip needs only `new SpriteAnimator(renderer, { autoplay: 'idle' })`.

### Control playback directly

You can skip the state machine and play clips by name:

| Member | What it does |
| --- | --- |
| `play(name, { restart, fade })` | Starts a clip. If that clip is already the current clip, nothing happens unless `restart` is `true`, even if the clip has ended or you stopped it. `fade` is a crossfade in seconds, 0 by default. It returns `false` and sets `error` when the clip does not exist. Calling `play` leaves the state machine: `currentState` becomes `null` and transitions stop until you call `setState`. |
| `setState(name, fade)` | Enters a state and plays its clip at once. This is also how you go back to the state machine after `play`. |
| `pause()`, `resume()` | Freeze and continue the playhead and any crossfade. |
| `stop()` | Stops and shows the first frame. Transitions wait until you call `setState` or `play(name, { restart: true })`. |
| `seek(seconds, emitMarkers)` | Jumps to a time in the clip. Markers that the jump passes are silent unless `emitMarkers` is `true`. |
| `setSpeed(value)` | Multiplies playback speed. 0 freezes the clip. It does not change the speed of a crossfade. |

You can read `currentClip`, `currentState`, `currentFrameIndex`, `currentTime`, `normalizedTime`, `isPlaying`, `isPaused`, `speed`, `dir`, and `error`.

The animator reports events through three properties, each holding one function or `null`:

- `onMarker(marker, clip, frameIndex)` runs when playback enters a keyframe that has markers. If one update crosses several keyframes, the calls come in order.
- `onComplete(clip)` runs once when a `'once'` clip reaches the end of its last frame.
- `onStateChanged(next, previous)` runs when the state machine moves from one state to a different one, by a transition or by `setState`. It does not run for `initialState`.

### Directional clips

A clip can hold separate keyframes for four facing directions. Pass `directions` instead of `frames`. All four lists are required, each needs at least one keyframe, and they may have different lengths. `dir` selects the variant: 0 is up, 1 is left, 2 is down, and 3 is right, which is the order that Graal uses. The default is 2.

```ts
import { SpriteAnimation, SpriteAnimator, SpriteRenderer } from '@bornengine/engine';
import type { SpriteFrame } from '@bornengine/engine';

function createFacingAnimator(sprite: SpriteRenderer, up: SpriteFrame, left: SpriteFrame, down: SpriteFrame, right: SpriteFrame): SpriteAnimator {
  const idle = new SpriteAnimation({
    directions: {
      up: [{ sprite: up }],
      left: [{ sprite: left }],
      down: [{ sprite: down }],
      right: [{ sprite: right }],
    },
    fps: 6,
  });
  const animator = new SpriteAnimator(sprite, { clips: { idle } });
  animator.setDir(3);
  animator.play('idle');
  return animator;
}
```

`setDir(dir)` returns `false` for anything except the whole numbers 0 to 3. When you change the direction during playback, the animator keeps the frame position and the elapsed time, using the last frame if the new list is shorter. It does not restart the clip and does not repeat markers. A clip without `directions` ignores `dir`. For a directional clip, `frames` and `duration` describe the down variant.

## Reusable animation templates

Some games draw a character from layers: a body, a shirt, and a sword, each in its own image. The timing is the same for every character, and only the images differ. An **animation template** stores the clips, the timing, and the layers separately from the images. At run time you bind the template to a set of textures and get an animation for one character. You can bind the same template many times with different textures.

A template lives in a `.spriteanim-template.json` file, with the format name `bornengine.spriteanim-template` and the version number 1. BornEngineTools, the VS Code extension for BornEngine projects, opens these files in a visual editor. You can also write the JSON by hand. The editor saves compact JSON: the whole document on one line, with values left out when they equal the defaults that this page lists. It leaves out `visible` when it is true and any transform field that has its default value. It keeps everything else, including parameter IDs, labels, tags, the order of clips, frames, and layers, crops, markers, durations, and playback settings.

Existing `.spriteanim.json` documents use a different format, in which each frame names its own image. Templates do not change that format, and the editor still opens and saves those documents. The engine does not read either file type for you.

### Image parameters

Each template declares its **image parameters**. A parameter is a named slot for one image. Template authors choose any stable ID for each image parameter, such as `body_art` or `held_item`. The engine gives no meaning to a name, and nothing depends on the order of the list. An ID is non-empty text with no spaces at either end and no control characters, and it is unique in the template. The optional `label` and `tags` only help organize the editor and do not change playback.

Each parameter is either required or optional. When you bind a template, you must supply every required parameter. You can leave out an optional parameter. In that case, only the layers that use that parameter are skipped, and the rest of the animation plays.

### The file format

This file declares a body and a held item, a walk clip, and an idle clip with four directions. It is formatted for reading here.

```json
{
  "format": "bornengine.spriteanim-template",
  "version": 1,
  "id": "hero",
  "name": "Hero",
  "imageParameters": [
    { "id": "body_art", "label": "Body", "required": true },
    { "id": "held_item", "label": "Held item", "required": false, "tags": ["equipment"] }
  ],
  "clips": [
    {
      "name": "walk",
      "fps": 8,
      "loop": "loop",
      "canvasSize": { "width": 32, "height": 32 },
      "frames": [
        {
          "markers": ["footstep"],
          "layers": [
            { "parameter": "body_art", "source": { "x": 0, "y": 0, "width": 32, "height": 32 } },
            {
              "parameter": "held_item",
              "source": { "x": 0, "y": 0, "width": 16, "height": 16 },
              "transform": { "offset": { "x": 10, "y": 2 }, "stretch": { "x": -1, "y": 1 }, "rotation": 15 }
            }
          ]
        },
        {
          "duration": 0.2,
          "layers": [{ "parameter": "body_art", "source": { "x": 32, "y": 0, "width": 32, "height": 32 } }]
        }
      ]
    },
    {
      "name": "idle",
      "fps": 4,
      "loop": "loop",
      "canvasSize": { "width": 32, "height": 32 },
      "directions": {
        "up": [{ "layers": [{ "parameter": "body_art", "source": { "x": 0, "y": 32, "width": 32, "height": 32 } }] }],
        "left": [{ "layers": [{ "parameter": "body_art", "source": { "x": 32, "y": 32, "width": 32, "height": 32 } }] }],
        "down": [{ "layers": [{ "parameter": "body_art", "source": { "x": 64, "y": 32, "width": 32, "height": 32 } }] }],
        "right": [{ "layers": [{ "parameter": "body_art", "source": { "x": 96, "y": 32, "width": 32, "height": 32 } }] }]
      }
    }
  ]
}
```

The rules, which the engine checks when it validates a file:

- The top level has `format`, `version`, `id`, `name`, an optional `description`, `imageParameters`, and `clips`. There must be at least one parameter and one clip. Unknown fields are errors everywhere in the file.
- An image parameter has an `id`, a `required` flag, and optional `label` and `tags`.
- A clip has a unique `name`, `fps` greater than 0, `loop` set to `loop`, `once`, or `ping-pong`, and a `canvasSize` with a positive whole `width` and `height`. It has `frames` or `directions` with the lists `up`, `left`, `down`, and `right`, but not both.
- A frame has at least one layer. Its `duration` in seconds is optional and defaults to `1 / fps`. Its `markers` are optional names.
- A layer names a declared `parameter` and a `source` rectangle in pixels of that image: whole numbers, with `x` and `y` of at least 0 and a `width` and `height` above 0. `visible` is optional and defaults to `true`.
- A layer `transform` is optional, and each field has a default: `offset` is `{ x: 0, y: 0 }`, `stretch` is `{ x: 1, y: 1 }`, `zoom` is 1, `rotation` is 0 degrees, and `pivot` is `{ x: 0.5, y: 0.5 }`.

The transform fields work like this. `offset` moves the layer from the center of the clip canvas, in template pixels. `stretch` scales each axis separately, and it accepts signed values: a negative `x` or `y` mirrors the layer on that axis, but the value cannot be 0. `zoom` scales both axes and must be positive. `rotation` is in degrees. `pivot` is a point inside the crop, as fractions from 0 to 1, that sits on the position of the layer and is the center of its rotation and scale. Layers draw in the order they are listed, so the first layer is at the bottom.

To check a file without a running game, call `validateSpriteAnimationTemplate`. Its result is `{ ok: true, value }` with every default filled in, or `{ ok: false, diagnostics }`. Each diagnostic has a `path` that points into the document, a `code`, and a `message`.

`validateSpriteAnimationTemplateBinding(document, imageSizes)` applies the crop rules of `bind` to image sizes that you supply, for example `{ body_art: { width: 192, height: 64 } }`, so that a script can check crops without loading textures. A validated `value` also lists the down frames of a directional clip as `frames`. Pass it through `spriteAnimationTemplateSource(value)` to get back the shape of a file before you validate or save it again. The constants `SPRITE_ANIMATION_TEMPLATE_FORMAT`, `SPRITE_ANIMATION_TEMPLATE_VERSION`, `SPRITE_ANIMATION_DIRECTIONS`, and `SPRITE_ANIMATION_DEFAULT_DIR` are exported as well.

```ts
import { validateSpriteAnimationTemplate } from '@bornengine/engine';

function checkTemplate(text: string): boolean {
  let document: unknown;
  try {
    document = JSON.parse(text) as unknown;
  } catch {
    console.error('The file is not valid JSON.');
    return false;
  }

  const result = validateSpriteAnimationTemplate(document);
  if (!result.ok) {
    for (let index = 0; index < result.diagnostics.length; index++) {
      const item = result.diagnostics[index];
      console.error(item.path + ' [' + item.code + '] ' + item.message);
    }
    return false;
  }
  console.log('Template "' + result.value.name + '" has ' + result.value.clips.length + ' clips.');
  return true;
}
```

### Bind and play a template

`loadSpriteAnimationTemplate(path, images)` reads the template file and binds it to textures you already have. `images` maps image parameter IDs to loaded `Texture` objects, for example from `@Asset` fields. It returns a `SpriteAnimationTemplateBoundAnimation` and throws if the file is missing or the binding is invalid. Each object chooses its own textures, so one template serves many images.

`SpriteAnimator` takes the clip names as a type argument when you pass `clips`, so `play` rejects unknown names at compile time: `new SpriteAnimator<'idle' | 'walk'>(renderer, { clips: { idle, walk } })`. `SpriteAnimationComponent` wraps both steps for a GameObject. Attach it with `@GameComponent<SpriteAnimationComponent<'idle' | 'walk'>>({ template, images, filter?, autoplay? })`. It loads the template and textures when it wakes, adds the renderer and animator to the object, and exposes `play`, `setDir`, `setBool`, `setNumber`, and `setTrigger`. The type argument lists the clip names, so `play` rejects unknown names at compile time.

To validate a document yourself, parse it and give it to `new SpriteAnimationTemplateAsset(document)`. The asset exposes `error`, `diagnostics`, and the validated `definition`. It does not throw.

`template.bind(images)` connects the template to textures. `images` is an object whose keys are image parameter IDs and whose values are loaded textures. It returns `{ ok: true, value }` or `{ ok: false, diagnostics }`. It reports problems in `diagnostics` instead of throwing. A binding fails when:

- A required parameter has no texture, or a key is not a parameter of the template.
- A texture is not loaded.
- The textures do not all belong to the same `Game`.
- A layer crop lies outside its image.

`value` is a `SpriteAnimationTemplateBoundAnimation`. It holds a `SpriteSheet` for each bound image and the frames for this binding, and its `clips` object is keyed by clip name. `getClip(name)` returns one clip or `null`. A bound animation never changes. Give it to a `SpriteAnimationTemplateRenderer`, which draws every visible layer of the current frame, and play it with a `SpriteAnimator` that uses the same clips.

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
import type { Texture } from '@bornengine/engine';

function loadTemplate(game: Game, path: string): SpriteAnimationTemplateAsset | null {
  const text = game.input.readFile(path);
  if (text.length === 0) {
    console.error('Could not read ' + path);
    return null;
  }
  let document: unknown;
  try {
    document = JSON.parse(text) as unknown;
  } catch {
    console.error(path + ' is not valid JSON.');
    return null;
  }
  const template = new SpriteAnimationTemplateAsset(document);
  if (template.error !== null) {
    console.error(template.error);
    return null;
  }
  return template;
}

function addCharacter(scene: Scene, template: SpriteAnimationTemplateAsset, body: Texture, item: Texture | null, x: number): void {
  const images: Record<string, Texture> = { body_art: body };
  if (item !== null) images.held_item = item;

  const binding = template.bind(images);
  if (!binding.ok) {
    for (let index = 0; index < binding.diagnostics.length; index++) console.error(binding.diagnostics[index].message);
    return;
  }

  const renderer = new SpriteAnimationTemplateRenderer(binding.value, { size: new Vector2D(64, 64) });
  const animator = new SpriteAnimator(renderer, { clips: binding.value.clips });
  const character = new GameObject({ name: 'Character', position: { x, y: 200, z: 0 } });
  character.addComponent(renderer);
  character.addComponent(animator);
  scene.addNode(character);
  animator.play('walk');
}
```

Call `addCharacter` once for each character, with that character's textures. The characters share the template and its clips but have separate animators, so they play independently. `item` can be `null` because `held_item` is optional in the file above.

`SpriteAnimationTemplateRenderer` accepts `size`, `tint`, `visible`, and `renderOrder`. `size` is the world size of the clip canvas, and it defaults to the pixel size of the canvas of the first clip. Offsets and crops scale with it. Like any component, the renderer follows the world position, scale, and rotation of its object. A negative world scale mirrors the whole character, including the offsets of its layers.

The animator works with template clips exactly as it does with sprite clips: states, transitions, parameters, markers, `fade`, and directions with `setDir`. In version 1 of the format, all layers of a frame share the clip loop, the frame durations, the markers, the state machine, and the crossfade. Independent timing per layer, bones, and skeletal animation are not part of it. For skeletal animation of 3D models, see the [skeletal animation guide](../../guides/skeletal-animation/).

For a complete walkthrough, see [Reusable sprite animation templates](../../guides/sprite-animation-templates/). The repository example `examples/sprite-animation` binds one template to two sets of images.

## 2D particle emitters

A particle is a short-lived sprite: a spark, a puff of smoke, a speck of dust. An emitter creates many particles, moves them, and fades them out. `ParticleEmitter2D` is a component. Its particles are simulated in a native pool and drawn by the scene with the frames you give it.

All frames come from one `SpriteSheet` of one loaded texture. The scene updates and draws the emitter while its object is active. The emitter has `error` and `isLoaded`, and it stops working if its texture is released. Destroying its object disposes the pool. If you create an emitter and never attach it, call `dispose()` yourself.

Each option below is optional except `frames`:

| Option | Default | Meaning |
| --- | --- | --- |
| `frames` | Required | 1 to 1,024 frames from the same sheet. |
| `capacity` | `256` | The number of particle slots, a whole number from 1 to 100,000. When all slots are in use, new particles are skipped until slots free up. |
| `emissionRate` | `0` | Particles per second while the emitter is playing. |
| `shape` | `{ type: 'point' }` | Where particles start: `point`; `circle`, a filled disc with a `radius`; `box` with a `width` and a `height`, centered on the emitter; or `cone` with an `angle` from 0 to 360 degrees, which is the full opening of the cone around the direction. |
| `lifetime` | `{ min: 1, max: 1 }` | Seconds a particle lives. The minimum must be above 0. |
| `speed` | `{ min: 0, max: 0 }` | Starting speed in units per second, along the direction. |
| `startSize`, `endSize` | `{ min: 8, max: 8 }`, same as `startSize` | The width of a particle at birth and at the end of its life. The height follows the proportions of the frame. A particle with a size of 0 or less is not drawn. |
| `acceleration` | `{ x: 0, y: 0 }` | Units per second squared. |
| `drag` | `0` | Slows particles down. Higher values slow them faster. |
| `startColor`, `endColor` | White, and white with an alpha of 0 | Colors with channels from 0 to 255. The color changes in a straight line over the life of a particle. |
| `spin` | `{ min: 0, max: 0 }` | Rotation speed in degrees per second. |
| `direction` | `{ x: 0, y: -1 }` | The direction of emission, in the emitter's own coordinates. This default is up on the screen. A zero vector falls back to the default. |
| `space` | `'local'` | `'local'` makes particles move with the emitter. `'world'` lets particles that have been emitted stay where they are when the emitter moves. |
| `frameRate` | `0` | Frames per second of the frame animation of each particle. 0 picks one frame when the particle is born. |

Every range needs `max` to be at least `min`. An invalid value does not throw: the emitter keeps an `error` message and does nothing.

`direction` is always relative to the emitter. `acceleration` uses the emitter's own axes when `space` is `'local'`, and the world axes when `space` is `'world'`. For gravity that always pulls down the screen, use `'world'` space.

An emitter has four controls:

- `play()` starts continuous emission at `emissionRate`, and `stop()` ends it. Particles that are alive finish their life.
- `emitBurst(count, { position, direction })` creates `count` particles at once, which must be a positive whole number. `position` is an offset from the emitter, and `direction` replaces the emitter's direction for this burst. Both are optional.
- `clear()` removes all live particles and stops continuous emission.
- `liveCount` is the number of live particles.

The next function adds two emitters to an object. One is a one-off spark burst, and the other is a continuous trail of smoke.

```ts
import { Colors, GameObject, ParticleEmitter2D } from '@bornengine/engine';
import type { SpriteFrame } from '@bornengine/engine';

function addEffects(owner: GameObject, sparkA: SpriteFrame, sparkB: SpriteFrame, puff: SpriteFrame): ParticleEmitter2D | null {
  const sparks = new ParticleEmitter2D({
    frames: [sparkA, sparkB],
    capacity: 128,
    shape: { type: 'cone', angle: 70 },
    direction: { x: 0, y: -1 },
    lifetime: { min: 0.2, max: 0.55 },
    speed: { min: 35, max: 110 },
    startSize: { min: 4, max: 9 },
    endSize: { min: 0, max: 2 },
    startColor: Colors.YELLOW,
    endColor: { r: 255, g: 90, b: 20, a: 0 },
    spin: { min: -180, max: 180 },
    frameRate: 14,
  });
  const smoke = new ParticleEmitter2D({
    frames: [puff],
    capacity: 64,
    emissionRate: 12,
    shape: { type: 'circle', radius: 3 },
    lifetime: { min: 0.8, max: 1.4 },
    speed: { min: 10, max: 25 },
    startSize: { min: 6, max: 10 },
    endSize: { min: 16, max: 24 },
    acceleration: { x: 0, y: -20 },
    drag: 1,
    space: 'world',
  });
  if (sparks.error !== null || smoke.error !== null) {
    console.error(sparks.error ?? smoke.error);
    sparks.dispose();
    smoke.dispose();
    return null;
  }

  owner.addComponent(sparks);
  owner.addComponent(smoke);
  smoke.play();
  return sparks;
}
```

Keep the returned `sparks` emitter, and call `sparks.emitBurst(20)` when something is hit. The smoke emitter keeps producing particles by itself because `play()` is on, and it leaves a trail behind a moving object because its particles live in world space.

## Marker-driven effects

A marker is a name that you attach to a keyframe in an animation, such as `'footstep'` or `'hit'`. When playback reaches that keyframe, the animator calls `onMarker`. Markers let the art decide when an effect happens. Without them, your code would have to count frames, and it would break whenever the animation changes.

- Markers on the first frame of a clip run when the clip starts. Markers on later frames run when playback enters that frame.
- A looping clip runs its markers again each time around.
- `seek` is silent unless you ask for markers.
- An animator has one `onMarker` function. Assign a new one to replace the old one.

The next function connects two markers to two emitters on the same object. Add the emitters to the object that owns the animator, so that the scene updates and draws them together with the animation.

```ts
import { GameObject, ParticleEmitter2D, SpriteAnimator } from '@bornengine/engine';
import type { SpriteFrame } from '@bornengine/engine';

function addAnimationEffects(owner: GameObject, animator: SpriteAnimator, dust: SpriteFrame, spark: SpriteFrame): void {
  const footsteps = new ParticleEmitter2D({
    frames: [dust],
    capacity: 24,
    lifetime: { min: 0.2, max: 0.4 },
    speed: { min: 10, max: 30 },
    startSize: { min: 6, max: 10 },
    endSize: { min: 0, max: 2 },
  });
  const hitSparks = new ParticleEmitter2D({
    frames: [spark],
    capacity: 64,
    shape: { type: 'cone', angle: 60 },
    lifetime: { min: 0.15, max: 0.35 },
    speed: { min: 60, max: 140 },
  });
  if (footsteps.error !== null || hitSparks.error !== null) {
    console.error(footsteps.error ?? hitSparks.error);
    footsteps.dispose();
    hitSparks.dispose();
    return;
  }
  owner.addComponent(footsteps);
  owner.addComponent(hitSparks);

  animator.onMarker = (marker) => {
    if (marker === 'footstep') footsteps.emitBurst(5, { position: { x: 0, y: 14 }, direction: { x: 0, y: -1 } });
    if (marker === 'hit') hitSparks.emitBurst(18, { position: { x: 18, y: 0 }, direction: { x: 1, y: 0 } });
  };
}
```

Markers work the same way for template clips. You can also use the callback to play a sound or to spawn a projectile. For 3D effects, see [VFX](../vfx/).

## Next steps

- [Tilemaps](../tilemap/) draws grids of atlas frames.
- [Camera 2D](../camera2d/) follows a sprite and scales the view to the window.
- [Physics 2D](../physics2d/) moves sprites with collisions.
- [2D game](../../guides/2d-game/) builds a complete level with sprites and particles.
- [Reusable sprite animation templates](../../guides/sprite-animation-templates/) walks through templates step by step.
- [Textures](../textures/) covers loading, filters, and region drawing.
