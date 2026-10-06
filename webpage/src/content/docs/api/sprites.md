---
title: Sprites and animation
description: Build 2D atlas sprites, state-driven animation, and marker-triggered particle effects.
section: API / Sprites
order: 35
---

The 2D sprite stack is made from reusable `SpriteSheet` frames and scene components. Add a `SpriteRenderer`, `SpriteAnimator`, or `ParticleEmitter2D` to a `GameObject`; an active `Scene` draws those components automatically.

## Atlas frames

`SpriteSheet` references a loaded, Game-owned `Texture`. It does not dispose the texture. Use a regular grid when every cell has the same size, or define named rectangles when the atlas has trimmed or irregular frames.

```ts
import { Game, SpriteSheet } from '@bornengine/engine';

const game = new Game();
const texture = game.assets.loadTexture('assets/hero-atlas.png');
const sheet = texture !== null && texture.isLoaded
  ? new SpriteSheet(texture, {
    frameWidth: 32,
    frameHeight: 32,
    margin: { x: 2, y: 2 },
    spacing: { x: 1, y: 1 },
  })
  : null;
const idle = sheet === null ? null : sheet.gridFrame(0, 0);
const step = sheet === null ? null : sheet.gridFrame(1, 0);
```

`gridFrame(column, row)` returns a cached frame or `null` for an invalid cell. Named frames use `{ name, source, pivot?, trim? }`; `source` is a pixel rectangle inside the texture. `pivot` is normalized to the original frame size. Trim metadata stores the packed-pixel offset and the original untrimmed dimensions. `SpriteFrame.pivot`, `originalSize`, `trim.offset`, and `trim.originalSize`, along with `SpriteSheet.margin` and `spacing`, are detached `Vector2D` snapshots with the class's vector helpers. Mutating a returned snapshot does not change the atlas frame. Use `SpriteFrameTrimDefinition` for trim input data; its coordinates can be plain `{ x, y }` values.

`Texture.drawRegion(source, destination, origin, rotation, tint)` uses a top-left destination rectangle. `origin` is a local pivot measured from that corner, so the object's world position is `destination + origin` when the region rotates.

Check `texture.isLoaded` and `sheet.error` before building gameplay objects. The sheet keeps a reference to the texture; dispose the texture through its owning `Game` lifecycle.

## Sprite components and camera

`SpriteRenderer` draws its current frame during scene rendering. Its default size and pivot come from the frame; set `size`, `pivot`, `tint`, `flipX`, `flipY`, `visible`, or `renderOrder` when needed. The object's world position, scale, and Z rotation are applied by the renderer.

```ts
import { Game, GameObject, Scene, SpriteRenderer, SpriteSheet } from '@bornengine/engine';

const game = new Game();
const texture = game.assets.loadTexture('assets/hero-atlas.png');
const sheet = texture !== null && texture.isLoaded
  ? new SpriteSheet(texture, { frameWidth: 32, frameHeight: 32 })
  : null;
const idle = sheet === null ? null : sheet.gridFrame(0, 0);
if (game.isReady && texture !== null && texture.isLoaded && idle !== null) {
  const scene = new Scene(game, { name: 'Level' });
  const player = new GameObject({ name: 'Player', position: { x: 160, y: 120, z: 0 } });
  const sprite = new SpriteRenderer(idle, { size: { x: 64, y: 64 }, renderOrder: 0 });
  player.addComponent(sprite);
  scene.add(player);
  game.scenes.changeTo(scene);
}
```

Set `scene.camera2D` to a `Camera2D` record to draw the scene inside a 2D camera pass. The base `Game.render()` draws the current scene; subclasses can clear first and call `super.render()` where scene drawing should happen. Scene simulation remains explicit: call `this.scenes.update(deltaTime)` from the `Game.loop()` override.

## Animation and state machines

`SpriteAnimation` is immutable playback data. Each keyframe contains a `sprite`, optional `duration` in seconds, and optional marker names. `fps` supplies the default duration; `loop` is `'loop'`, `'once'`, or `'ping-pong'`.

```ts
import {
  Game, GameObject, Scene, SpriteAnimation, SpriteAnimator,
  SpriteRenderer, SpriteSheet,
} from '@bornengine/engine';

const game = new Game();
const atlas = game.assets.loadTexture('assets/hero-atlas.png');
const sheet = atlas !== null && atlas.isLoaded
  ? new SpriteSheet(atlas, { frameWidth: 32, frameHeight: 32 })
  : null;
const idle = sheet === null ? null : sheet.gridFrame(0, 0);
const step = sheet === null ? null : sheet.gridFrame(1, 0);
if (game.isReady && atlas !== null && atlas.isLoaded && idle !== null && step !== null) {
  const scene = new Scene(game, { name: 'Level' });
  const player = new GameObject({ name: 'Player' });
  const sprite = new SpriteRenderer(idle);
  const walk = new SpriteAnimation({
    frames: [
      { sprite: idle, duration: 0.12 },
      { sprite: step, duration: 0.08, markers: ['footstep'] },
    ],
    loop: 'loop',
  });
  const animator = new SpriteAnimator(sprite, {
    clips: { walk },
    states: [{ name: 'walking', clip: 'walk' }],
    initialState: 'walking',
  });
  player.addComponent(sprite);
  player.addComponent(animator);
  scene.add(player);
  game.scenes.changeTo(scene);
}
```

The animator exposes `play`, `pause`, `resume`, `stop`, `seek`, `setSpeed`, and `setState`. `play(name, { restart, fade })` does not restart the current clip unless `restart` is true; fades default to zero seconds. `onMarker`, `onComplete`, and `onStateChanged` receive clip playback events. Seeking is silent by default; pass `true` as the second argument to emit markers crossed by the seek.

States can transition to another state based on bool, number (`eq`, `gt`, `gte`, `lt`, `lte`), trigger, or callback conditions. Conditions on one transition are ANDed. Transitions are checked in declaration order, only one is taken per update, and trigger parameters are consumed only when their transition succeeds. Call `setBool`, `setNumber`, or `setTrigger` to provide parameters; `resetTrigger` clears a trigger manually.

## Reusable animation templates

An animation template stores clip timing and ordered image layers separately from the actual textures. BornEngineTools saves `.spriteanim-template.json` documents using the `bornengine.spriteanim-template` format. Its compact JSON mode removes only defaults such as an implicit frame duration or identity transform; it preserves parameter IDs, tags, frame and layer order, crops, markers, and playback values. Existing `.spriteanim.json` assets and concrete `SpriteAnimation` playback remain supported.

Template authors choose any stable ID for each image parameter. Labels and tags help organize the editor fields; they do not change runtime behavior. Each parameter maps to one loaded texture from the same `Game`. Required parameters must be supplied. An optional parameter may be omitted, in which case only layers that use that parameter are skipped. A frame can combine several parameters, and multiple characters or equipment sets can bind the same clips to different images.

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

function addTemplateCharacters(game: Game): void {
  const templateSource = game.input.readFile('assets/avatar.spriteanim-template.json');
  if (templateSource.length === 0) throw new Error('Could not read the animation template.');
  const template = new SpriteAnimationTemplateAsset(JSON.parse(templateSource) as unknown);
  if (template.error !== null) throw new Error(template.error);

  const bodyTexture = game.assets.loadTexture('assets/body-blue.png');
  const equipmentTexture = game.assets.loadTexture('assets/sword-bronze.png');
  const alternateBodyTexture = game.assets.loadTexture('assets/body-red.png');
  const alternateEquipmentTexture = game.assets.loadTexture('assets/sword-silver.png');
  if (bodyTexture === null || !bodyTexture.isLoaded || equipmentTexture === null || !equipmentTexture.isLoaded ||
      alternateBodyTexture === null || !alternateBodyTexture.isLoaded ||
      alternateEquipmentTexture === null || !alternateEquipmentTexture.isLoaded) {
    throw new Error('The animation images must be loaded before binding.');
  }

  // IDs are defined by this template; they do not have built-in names or positional order.
  const first = template.bind({ body_art: bodyTexture, held_item: equipmentTexture });
  const second = template.bind({ body_art: alternateBodyTexture, held_item: alternateEquipmentTexture });
  if (!first.ok || !second.ok) throw new Error('The template image bindings are invalid.');

  const scene = new Scene(game, { name: 'Characters' });
  for (let index = 0; index < 2; index++) {
    const binding = index === 0 ? first.value : second.value;
    const renderer = new SpriteAnimationTemplateRenderer(binding, { size: new Vector2D(48, 48) });
    const animator = new SpriteAnimator(renderer, { clips: binding.clips });
    const character = new GameObject({ position: { x: 180 + index * 96, y: 120, z: 0 } });
    character.addComponent(renderer);
    character.addComponent(animator);
    scene.add(character);
    animator.play('walk');
  }
  game.scenes.changeTo(scene);
}
```

`SpriteAnimationTemplateAsset` validates parsed JSON and fills documented defaults. `bind()` returns a result with diagnostics instead of throwing for invalid IDs, missing required images, unloaded or foreign-Game textures, and crops outside an image. Read and parse JSON with the application's existing project workflow, such as `game.input.readFile`; the engine does not add a general filesystem JSON loader. The returned bound animation owns per-binding `SpriteSheet` and `SpriteFrame` data, while each `SpriteAnimator` owns its own playback state.

Each clip has one canvas size and one shared FPS/frame schedule. In V1, all visible layers in a frame advance together and share the clip loop, markers, state machine, and crossfade. Bones, independent layer timelines, and skeletal animation are not part of this format. A layer crop uses source-image pixels. Offsets are measured from the clip canvas center in template pixels; the renderer's `size` scales that canvas into world units. Stretch accepts signed values for mirroring, zoom is positive, rotation is in degrees, and pivot is normalized within the source crop. Layers draw in their authored bottom-to-top order.

## 2D particle emitters

`ParticleEmitter2D` is a `GameComponent` backed by a native CPU pool. Its `frames` must come from one `SpriteSheet` and one loaded texture. The scene updates and draws it automatically while its owner is active.

```ts
import { Colors, ParticleEmitter2D } from '@bornengine/engine';

const sparkA = sheet.gridFrame(4, 0);
const sparkB = sheet.gridFrame(5, 0);
if (sparkA !== null && sparkB !== null) {
  const sparks = new ParticleEmitter2D({
    frames: [sparkA, sparkB],
    capacity: 128,
    emissionRate: 0,
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
    space: 'local',
  });
  player.addComponent(sparks);
  sparks.emitBurst(20);
}
```

Shapes are `point`, `circle` (`radius`), `box` (`width` and `height`), or `cone` (`angle` in degrees). Ranges define per-particle lifetime, speed, start/end size, and spin; color channels use the engine's 0–255 range. `acceleration` and `drag` alter motion. A zero `frameRate` picks an atlas frame at spawn; a positive rate cycles frames.

`space: 'local'` makes particles follow the emitter's transform. `'world'` stores the spawn transform so particles drift away as the emitter moves. `play()` starts continuous emission at `emissionRate`; `stop()` stops new continuous emission while live particles finish. `emitBurst(count, { position, direction })` spawns a one-off burst in emitter-local coordinates. `clear()` stops and removes live particles; `liveCount` reports the current count; `dispose()` releases the pool. Destroying the owning object disposes the component automatically.

## Marker-driven effects

In a scene setup, attach effect emitters to the animated object and use markers to trigger frame-synced bursts without coupling an animation clip to a specific emitter:

```ts
import { GameObject, ParticleEmitter2D, SpriteAnimator, SpriteSheet } from '@bornengine/engine';

function addAnimationEffects(player: GameObject, animator: SpriteAnimator, sheet: SpriteSheet): void {
  const dustFrame = sheet.gridFrame(2, 0);
  const sparkFrame = sheet.gridFrame(5, 0);
  if (dustFrame === null || sparkFrame === null) return;

  const footstepEmitter = new ParticleEmitter2D({ frames: [dustFrame], capacity: 24 });
  const hitSparks = new ParticleEmitter2D({ frames: [sparkFrame], capacity: 64 });
  player.addComponent(footstepEmitter);
  player.addComponent(hitSparks);

  animator.onMarker = (marker) => {
    if (marker === 'footstep') footstepEmitter.emitBurst(5);
    if (marker === 'impact') hitSparks.emitBurst(18, { direction: { x: 1, y: 0 } });
  };
}
```

Attach each emitter to the same player object as the sprite and animator so the scene updates and draws it with the animation.

The same callback may call the existing 3D `ParticleSystem.emit()` for a world-space effect. The 3D model `Animation` API and its model playback remain separate from `SpriteAnimation`.

## Camera culling and renderer metrics

The scene renderer skips sprite quads outside the active `camera2D` viewport. `renderer.isRectVisibleIn2D(bounds)` exposes the same world-space test to custom components. `renderer.stats` reports timing for the current game frame, `drawSubmissions2D`, submitted sprite quads, and culled quads; tilemap cells are included. Sprite counts reset even when a custom `Game.render()` omits `super.render()`. The 2D submission count is backend-defined: WGPU counts texture/uniform batches while watchOS counts drawable Canvas commands, so compare it across frames on the same backend rather than treating it as a cross-platform draw-call total.

For a complete scene, see the [2D game guide](../../guides/2d-game/) and the `examples/sprite-animation` project.
