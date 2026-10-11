---
title: Build a 2D game
description: Build a small arena game with a sprite hero, animation states, particle effects, and a following camera.
section: Guides
order: 70
---

This guide builds a small 2D game. A hero walks around an arena, plays idle, walk, and attack animations from one sprite atlas, throws sparks when its feet or its attack touch the ground, and is followed by a camera. You write one `Game`, one `Scene`, and one hero object.

Each section adds one piece. The last section has the complete `main.ts`.

## What you will build

- A hero you move with `WASD` or the arrow keys and attack with `Space`.
- Idle, walk, and attack animations, chosen by a small state machine.
- Bursts of particles at the hero's feet and on the attack frame.
- A camera that follows the hero inside a 640 by 360 arena, shown through a 320 by 180 view.
- A line of text that stays fixed on screen.

## Words you will see

- **Atlas**: one image that holds many small pictures in a grid. A `SpriteSheet` cuts it into frames.
- **Frame**: one picture cut from the atlas, a `SpriteFrame`.
- **Clip**: an ordered list of frames with timings, a `SpriteAnimation`.
- **Marker**: a name attached to one frame of a clip. When playback reaches that frame, the animator calls your code.
- **Camera rig**: a `CameraRig2D`, a component that moves the 2D camera to follow an object.

## Setup

Create a 2D project and an `assets` folder:

```sh
bornengine new TinyArena
cd TinyArena
mkdir assets
```

The game needs one image, `assets/atlas.png`, with six cells that are 32 by 32 pixels in a single row. The picture is 192 by 32 pixels:

| Cell | Used for |
| --- | --- |
| 0 | Idle |
| 1 and 2 | The two walk frames. Cell 2 is also the attack wind-up |
| 3 | The moment the attack hits |
| 4 and 5 | Spark pictures for the particles |

`examples/sprite-animation/assets/atlas.png` in the BornEngine repository has this layout. Copy it for a quick start, or draw your own.

## Game loop

Start with a hero that moves. This is a complete `main.ts`:

```ts
import {
  Colors,
  FILTER_NEAREST,
  Game,
  GameObject,
  Key,
  Scene,
  SpriteRenderer,
  SpriteSheet,
  Vector2D,
} from '@bornengine/engine';
import type { InputActionMap, SpriteFrame } from '@bornengine/engine';

const WALK_SPEED = 90;

class Hero extends GameObject {
  private readonly controls: InputActionMap;

  constructor(controls: InputActionMap, frame: SpriteFrame) {
    super({ name: 'Hero', position: { x: 160, y: 90, z: 0 } });
    this.controls = controls;
    this.addComponent(new SpriteRenderer(frame, { size: new Vector2D(32, 32) }));
  }

  override update(deltaTime: number): void {
    const move = this.controls.readVector2('move-x', 'move-y').clampedMagnitude(1);
    this.transform.position.x += move.x * WALK_SPEED * deltaTime;
    this.transform.position.y += move.y * WALK_SPEED * deltaTime;
  }
}

class ArenaGame extends Game {
  constructor() {
    super({ window: { title: 'Tiny arena', width: 960, height: 540 }, targetFps: 60 });
  }

  protected override onStart(): void {
    const texture = this.assets.loadTexture('assets/atlas.png');
    if (texture === null || !texture.isLoaded) throw new Error(texture?.error ?? 'Could not load assets/atlas.png');
    texture.setFilter(FILTER_NEAREST);

    const sheet = new SpriteSheet(texture, { frameWidth: 32, frameHeight: 32 });
    const idle = sheet.gridFrame(0, 0);
    if (idle === null) throw new Error(sheet.error ?? 'assets/atlas.png needs cells of 32 by 32 pixels.');

    const controls = this.input.createActionMap();
    controls.bindAxis('move-x', {
      negative: [{ kind: 'key', key: Key.LEFT }, { kind: 'key', key: Key.A }],
      positive: [{ kind: 'key', key: Key.RIGHT }, { kind: 'key', key: Key.D }],
    });
    controls.bindAxis('move-y', {
      negative: [{ kind: 'key', key: Key.UP }, { kind: 'key', key: Key.W }],
      positive: [{ kind: 'key', key: Key.DOWN }, { kind: 'key', key: Key.S }],
    });

    const scene = new Scene(this, { name: 'arena' });
    scene.addNode(new Hero(controls, idle));
    this.scenes.changeTo(scene);
  }

  protected override loop(deltaTime: number): void {
    this.scenes.update(deltaTime);
  }

  protected override render(): void {
    this.renderer.clear(Colors.DARKBLUE);
    super.render();
  }
}

new ArenaGame().run();
```

Run it with `bornengine run main.ts`. The hero is one sprite that you can move around.

How the loop works:

- `onStart()` loads the atlas, cuts it into 32 by 32 frames, binds the keys, and activates a scene. A missing file stops the game and reports the message in `game.error`.
- An **action map** gives names to inputs. `move-x` and `move-y` are axes: each is `-1`, `0`, or `1`, depending on which keys are down. `readVector2` combines two axes into a vector, and `clampedMagnitude(1)` keeps diagonal movement from being faster than straight movement.
- `loop(deltaTime)` calls `this.scenes.update(deltaTime)`. The scene calls `Hero.update()`, and the hero moves by `speed * deltaTime`.
- `render()` clears the screen, then `super.render()` draws the scene. A `SpriteRenderer` draws its frame centered on the object's position.
- `texture.setFilter(FILTER_NEAREST)` keeps pixel art sharp when it is scaled up.

## Sprites and animation

An animation has two layers. A `SpriteAnimation` is a clip: frames, durations, and a loop mode. A `SpriteAnimator` plays clips on a `SpriteRenderer`. It can also run a small state machine that chooses the clip for you.

```ts
import { SpriteAnimation, SpriteAnimator, SpriteRenderer } from '@bornengine/engine';
import type { SpriteFrame } from '@bornengine/engine';

interface HeroFrames {
  idle: SpriteFrame;
  walk: SpriteFrame[];
  hit: SpriteFrame;
}

function createAnimator(sprite: SpriteRenderer, frames: HeroFrames): SpriteAnimator {
  const idle = new SpriteAnimation({ frames: [{ sprite: frames.idle }], fps: 2, loop: 'loop' });
  const walk = new SpriteAnimation({
    frames: [
      { sprite: frames.walk[0], duration: 0.12 },
      { sprite: frames.walk[1], duration: 0.12, markers: ['footstep'] },
    ],
    loop: 'loop',
  });
  const attack = new SpriteAnimation({
    frames: [
      { sprite: frames.walk[1], duration: 0.1 },
      { sprite: frames.hit, duration: 0.15, markers: ['impact'] },
      { sprite: frames.walk[1], duration: 0.1 },
    ],
    loop: 'once',
  });

  const animator = new SpriteAnimator(sprite, {
    clips: { idle, walk, attack },
    states: [
      {
        name: 'idle',
        clip: 'idle',
        transitions: [
          { to: 'attack', conditions: [{ type: 'trigger', name: 'attack' }], fade: 0.05 },
          { to: 'walk', conditions: [{ type: 'bool', name: 'moving', value: true }], fade: 0.08 },
        ],
      },
      {
        name: 'walk',
        clip: 'walk',
        transitions: [
          { to: 'attack', conditions: [{ type: 'trigger', name: 'attack' }], fade: 0.05 },
          { to: 'idle', conditions: [{ type: 'bool', name: 'moving', value: false }], fade: 0.08 },
        ],
      },
      {
        name: 'attack',
        clip: 'attack',
        transitions: [{ to: 'idle', conditions: [{ type: 'callback', test: (current) => !current.isPlaying }] }],
      },
    ],
    initialState: 'idle',
  });
  if (animator.error !== null) throw new Error(animator.error);
  return animator;
}
```

- A frame without `duration` lasts `1 / fps` seconds. The `loop` mode is `'loop'`, `'once'`, or `'ping-pong'`. A `'once'` clip stops on its last frame, and `animator.isPlaying` becomes `false`.
- A **state** names a clip and lists transitions. Each frame the animator checks the transitions of the current state in order and takes the first one whose conditions all hold. `fade` is a crossfade time in seconds.
- Your code drives the conditions. `setBool('moving', ...)` sets a flag that a `bool` condition reads. `setTrigger('attack')` sets a one-shot flag: the transition that uses it clears it. A `callback` condition runs your function, here to leave the attack once the clip has finished.
- A **marker** on a frame makes `animator.onMarker` run when playback enters that frame. The next section uses `footstep` and `impact`.
- The constructor does not throw. A bad clip, state, or transition sets `animator.error`, so check it once after you build the animator.

## Particle effects

A `ParticleEmitter2D` is a component that draws a pool of small sprites. The pool is allocated up front, so `capacity` limits how many particles are alive at once.

```ts
import { ParticleEmitter2D, SpriteAnimator, SpriteRenderer, Vector2D } from '@bornengine/engine';
import type { SpriteFrame } from '@bornengine/engine';

function createPuffs(frames: SpriteFrame[]): ParticleEmitter2D {
  const puffs = new ParticleEmitter2D({
    frames,
    capacity: 64,
    lifetime: { min: 0.2, max: 0.5 },
    speed: { min: 20, max: 60 },
    startSize: { min: 6, max: 10 },
    endSize: { min: 0, max: 2 },
    startColor: { r: 255, g: 230, b: 120, a: 255 },
    endColor: { r: 255, g: 120, b: 60, a: 0 },
    space: 'world',
  });
  if (puffs.error !== null) throw new Error(puffs.error);
  puffs.renderOrder = -1;
  return puffs;
}

function emitOnMarkers(animator: SpriteAnimator, sprite: SpriteRenderer, puffs: ParticleEmitter2D): void {
  animator.onMarker = (marker) => {
    if (marker === 'footstep') {
      puffs.emitBurst(3, { position: new Vector2D(0, 12), direction: new Vector2D(0, -1) });
    } else if (marker === 'impact') {
      puffs.emitBurst(16, { direction: new Vector2D(sprite.flipX ? -1 : 1, 0) });
    }
  };
}
```

- Every particle picks one of the `frames`. All frames must come from the same `SpriteSheet`.
- `lifetime`, `speed`, and the sizes are ranges. Each particle takes a random value between `min` and `max`. Sizes are widths in world units.
- `emitBurst(count, options)` spawns particles now. `position` is an offset from the object, and `direction` is where they head. Without a direction, particles go up.
- `space: 'world'` leaves the particles where they spawned when the hero walks away. With `'local'`, which is the default, they move with the object.
- `renderOrder` sorts the components that draw. The puffs use `-1` so that they draw behind the hero, whose sprite uses the default `0`.
- The emitter also has `emissionRate` and `play()` for a continuous stream. This game only uses bursts.

## Camera presentation

The world here is 640 by 360 units, twice the size of the view. A **viewport** fixes the size of what the player sees, and a camera rig moves that view around the world.

```ts
import { CameraRig2D, GameObject, Scene, Vector2D, Viewport2D } from '@bornengine/engine';

const VIEW_WIDTH = 320;
const VIEW_HEIGHT = 180;
const WORLD_WIDTH = 640;
const WORLD_HEIGHT = 360;

function addFollowCamera(scene: Scene, target: GameObject): void {
  scene.viewport2D = new Viewport2D({ width: VIEW_WIDTH, height: VIEW_HEIGHT, mode: 'integer' });

  const cameraObject = new GameObject({ name: 'Camera' });
  const rig = new CameraRig2D({
    target,
    offset: new Vector2D(VIEW_WIDTH / 2, VIEW_HEIGHT / 2),
    cameraTarget: new Vector2D(WORLD_WIDTH / 2, WORLD_HEIGHT / 2),
    smoothing: 0.12,
    bounds: { x: 0, y: 0, width: WORLD_WIDTH, height: WORLD_HEIGHT },
  });
  if (rig.error !== null) throw new Error(rig.error);
  cameraObject.addComponent(rig);
  scene.addNode(cameraObject);
  if (!scene.bindCameraRig2D(rig)) throw new Error('Could not bind the camera to the scene.');
}
```

- `Viewport2D` gives the scene a fixed logical size. The scene draws in logical units, and the viewport scales the result to the window. `fit` keeps the shape and adds bars on the sides or on the top and bottom. `integer` does the same, but only with whole-number scales, which keeps pixel art crisp. `stretch` fills the window and can distort the picture. This game uses `integer`: the 960 by 540 window is exactly three times the 320 by 180 view.
- `offset` is the point of the view where the target appears. Use half of the view size to keep the hero in the middle. The default is `(0, 0)`, which would put the hero in the top-left corner.
- `cameraTarget` is where the camera starts. Without it, the camera starts at the origin and glides across the world on the first frames.
- `smoothing` is a time constant in seconds. A larger value makes the camera lag further behind the hero. `0` snaps to the target.
- `bounds` keeps the view inside the world. Near an edge the camera stops moving, so the hero walks toward the edge of the screen instead.
- `bindCameraRig2D` tells the scene to draw with the rig's camera. Call it after the rig's object is in the scene, and add the hero to the scene before the camera so that the camera updates after the hero has moved.
- Drawing that happens after `super.render()` is in window pixels and ignores the camera. The HUD in the next section uses that. To turn a mouse position into world coordinates, call `this.input.screenToWorld(position)`. It uses the current scene's camera and viewport, and returns `null` when the position is outside the picture.

## Complete example

Replace `main.ts` with this file:

```ts
import {
  CameraRig2D,
  Colors,
  FILTER_NEAREST,
  Game,
  GameComponent,
  GameObject,
  Key,
  Mathf,
  ParticleEmitter2D,
  Renderer,
  Scene,
  SpriteAnimation,
  SpriteAnimator,
  SpriteRenderer,
  SpriteSheet,
  Vector2D,
  Viewport2D,
} from '@bornengine/engine';
import type { InputActionMap, SpriteFrame } from '@bornengine/engine';

const VIEW_WIDTH = 320;
const VIEW_HEIGHT = 180;
const WORLD_WIDTH = 640;
const WORLD_HEIGHT = 360;
const WALK_SPEED = 90;
const HERO_SIZE = 32;

interface HeroFrames {
  idle: SpriteFrame;
  walk: SpriteFrame[];
  hit: SpriteFrame;
  sparks: SpriteFrame[];
}

class ArenaFloor extends GameComponent {
  constructor() {
    super();
    this.renderOrder = -10;
  }

  override render(renderer: Renderer): void {
    const line = { r: 44, g: 60, b: 84, a: 255 };
    renderer.drawRectangle({ x: 0, y: 0, width: WORLD_WIDTH, height: WORLD_HEIGHT }, { r: 32, g: 44, b: 62, a: 255 });
    for (let x = 0; x <= WORLD_WIDTH; x += 32) {
      renderer.drawLine({ x, y: 0 }, { x, y: WORLD_HEIGHT }, line);
    }
    for (let y = 0; y <= WORLD_HEIGHT; y += 32) {
      renderer.drawLine({ x: 0, y }, { x: WORLD_WIDTH, y }, line);
    }
  }
}

function createAnimator(sprite: SpriteRenderer, frames: HeroFrames): SpriteAnimator {
  const idle = new SpriteAnimation({ frames: [{ sprite: frames.idle }], fps: 2, loop: 'loop' });
  const walk = new SpriteAnimation({
    frames: [
      { sprite: frames.walk[0], duration: 0.12 },
      { sprite: frames.walk[1], duration: 0.12, markers: ['footstep'] },
    ],
    loop: 'loop',
  });
  const attack = new SpriteAnimation({
    frames: [
      { sprite: frames.walk[1], duration: 0.1 },
      { sprite: frames.hit, duration: 0.15, markers: ['impact'] },
      { sprite: frames.walk[1], duration: 0.1 },
    ],
    loop: 'once',
  });

  const animator = new SpriteAnimator(sprite, {
    clips: { idle, walk, attack },
    states: [
      {
        name: 'idle',
        clip: 'idle',
        transitions: [
          { to: 'attack', conditions: [{ type: 'trigger', name: 'attack' }], fade: 0.05 },
          { to: 'walk', conditions: [{ type: 'bool', name: 'moving', value: true }], fade: 0.08 },
        ],
      },
      {
        name: 'walk',
        clip: 'walk',
        transitions: [
          { to: 'attack', conditions: [{ type: 'trigger', name: 'attack' }], fade: 0.05 },
          { to: 'idle', conditions: [{ type: 'bool', name: 'moving', value: false }], fade: 0.08 },
        ],
      },
      {
        name: 'attack',
        clip: 'attack',
        transitions: [{ to: 'idle', conditions: [{ type: 'callback', test: (current) => !current.isPlaying }] }],
      },
    ],
    initialState: 'idle',
  });
  if (animator.error !== null) throw new Error(animator.error);
  return animator;
}

function createPuffs(frames: SpriteFrame[]): ParticleEmitter2D {
  const puffs = new ParticleEmitter2D({
    frames,
    capacity: 64,
    lifetime: { min: 0.2, max: 0.5 },
    speed: { min: 20, max: 60 },
    startSize: { min: 6, max: 10 },
    endSize: { min: 0, max: 2 },
    startColor: { r: 255, g: 230, b: 120, a: 255 },
    endColor: { r: 255, g: 120, b: 60, a: 0 },
    space: 'world',
  });
  if (puffs.error !== null) throw new Error(puffs.error);
  puffs.renderOrder = -1;
  return puffs;
}

function emitOnMarkers(animator: SpriteAnimator, sprite: SpriteRenderer, puffs: ParticleEmitter2D): void {
  animator.onMarker = (marker) => {
    if (marker === 'footstep') {
      puffs.emitBurst(3, { position: new Vector2D(0, 12), direction: new Vector2D(0, -1) });
    } else if (marker === 'impact') {
      puffs.emitBurst(16, { direction: new Vector2D(sprite.flipX ? -1 : 1, 0) });
    }
  };
}

class Hero extends GameObject {
  private readonly controls: InputActionMap;
  private readonly sprite: SpriteRenderer;
  private readonly animator: SpriteAnimator;

  constructor(controls: InputActionMap, frames: HeroFrames) {
    super({ name: 'Hero', position: { x: WORLD_WIDTH / 2, y: WORLD_HEIGHT / 2, z: 0 } });
    this.controls = controls;
    this.sprite = new SpriteRenderer(frames.idle, { size: new Vector2D(HERO_SIZE, HERO_SIZE) });
    this.animator = createAnimator(this.sprite, frames);
    const puffs = createPuffs(frames.sparks);
    emitOnMarkers(this.animator, this.sprite, puffs);

    this.addComponent(puffs);
    this.addComponent(this.sprite);
    this.addComponent(this.animator);
  }

  override update(deltaTime: number): void {
    const move = this.controls.readVector2('move-x', 'move-y').clampedMagnitude(1);
    const half = HERO_SIZE / 2;
    const position = this.transform.position;
    position.x = Mathf.clamp(position.x + move.x * WALK_SPEED * deltaTime, half, WORLD_WIDTH - half);
    position.y = Mathf.clamp(position.y + move.y * WALK_SPEED * deltaTime, half, WORLD_HEIGHT - half);

    if (move.x !== 0) this.sprite.flipX = move.x < 0;
    this.animator.setBool('moving', move.x !== 0 || move.y !== 0);
    if (this.controls.wasPressed('attack') && this.animator.currentState !== 'attack') {
      this.animator.setTrigger('attack');
    }
  }
}

function addFollowCamera(scene: Scene, target: GameObject): void {
  scene.viewport2D = new Viewport2D({ width: VIEW_WIDTH, height: VIEW_HEIGHT, mode: 'integer' });

  const cameraObject = new GameObject({ name: 'Camera' });
  const rig = new CameraRig2D({
    target,
    offset: new Vector2D(VIEW_WIDTH / 2, VIEW_HEIGHT / 2),
    cameraTarget: new Vector2D(WORLD_WIDTH / 2, WORLD_HEIGHT / 2),
    smoothing: 0.12,
    bounds: { x: 0, y: 0, width: WORLD_WIDTH, height: WORLD_HEIGHT },
  });
  if (rig.error !== null) throw new Error(rig.error);
  cameraObject.addComponent(rig);
  scene.addNode(cameraObject);
  if (!scene.bindCameraRig2D(rig)) throw new Error('Could not bind the camera to the scene.');
}

class Arena extends Scene {
  constructor(game: Game, controls: InputActionMap, frames: HeroFrames) {
    super(game, { name: 'arena' });

    const floor = new GameObject({ name: 'Floor' });
    floor.addComponent(new ArenaFloor());
    this.addNode(floor);

    const hero = new Hero(controls, frames);
    this.addNode(hero);
    addFollowCamera(this, hero);
  }
}

class ArenaGame extends Game {
  constructor() {
    super({ window: { title: 'Tiny arena', width: 960, height: 540 }, targetFps: 60 });
  }

  protected override onStart(): void {
    const texture = this.assets.loadTexture('assets/atlas.png');
    if (texture === null || !texture.isLoaded) throw new Error(texture?.error ?? 'Could not load assets/atlas.png');
    texture.setFilter(FILTER_NEAREST);

    const sheet = new SpriteSheet(texture, { frameWidth: 32, frameHeight: 32 });
    const idle = sheet.gridFrame(0, 0);
    const walkA = sheet.gridFrame(1, 0);
    const walkB = sheet.gridFrame(2, 0);
    const hit = sheet.gridFrame(3, 0);
    const sparkA = sheet.gridFrame(4, 0);
    const sparkB = sheet.gridFrame(5, 0);
    if (idle === null || walkA === null || walkB === null || hit === null || sparkA === null || sparkB === null) {
      throw new Error(sheet.error ?? 'assets/atlas.png needs six cells of 32 by 32 pixels in one row.');
    }

    const controls = this.input.createActionMap();
    controls.bindAxis('move-x', {
      negative: [{ kind: 'key', key: Key.LEFT }, { kind: 'key', key: Key.A }],
      positive: [{ kind: 'key', key: Key.RIGHT }, { kind: 'key', key: Key.D }],
    });
    controls.bindAxis('move-y', {
      negative: [{ kind: 'key', key: Key.UP }, { kind: 'key', key: Key.W }],
      positive: [{ kind: 'key', key: Key.DOWN }, { kind: 'key', key: Key.S }],
    });
    controls.bindAction('attack', { kind: 'key', key: Key.SPACE });

    const frames: HeroFrames = { idle, walk: [walkA, walkB], hit, sparks: [sparkA, sparkB] };
    if (!this.scenes.changeTo(new Arena(this, controls, frames))) throw new Error('Could not activate the arena.');
  }

  protected override loop(deltaTime: number): void {
    this.scenes.update(deltaTime);
  }

  protected override render(): void {
    this.renderer.clear(Colors.BLACK);
    super.render();
    this.renderer.drawText('WASD or arrows: move   Space: attack', { x: 12, y: 12 }, 18, Colors.WHITE);
  }
}

const game = new ArenaGame();
game.run().then(() => {
  if (game.error !== null) console.error(game.error);
});
```

Run it with `bornengine run main.ts`. Walk with `WASD` or the arrows, and press `Space` to attack.

What changed from the first version:

- `Hero` builds its own sprite, animator, and particle emitter, and adds all three as components. The animator is the only one that changes the sprite's frame.
- `Hero.update()` still moves the hero, and now it also feeds the animator. It sets the `moving` flag, flips the sprite when the hero moves left, and sets the `attack` trigger on `Space`. It skips the trigger while the attack is already playing, so the attack cannot queue up another one.
- `ArenaFloor` is a component that draws the ground with `renderOrder = -10`, so it draws before everything else. Game objects do not draw themselves. Components do.
- `Arena` is a `Scene` that creates the floor, the hero, and the camera, in that order.
- `render()` draws the HUD text after `super.render()`, so the text stays in window pixels while the world scrolls.

If the atlas fails to load, `onStart()` throws. The game stops, `run()` resolves, and `game.error` holds the message. The last lines of the file print it.

## Next steps

- [Scenes, objects, and components](../../concepts/scenes-and-objects/) explains the hooks used by `Hero` and `Arena`.
- [Sprites API](../../api/sprites/) covers named atlas frames, directional clips, crossfades, condition types, and emitter shapes.
- [2D camera API](../../api/camera2d/) covers dead zones, zoom, camera shake, and parallax layers.
- [Input API](../../api/input/) covers action maps, gamepad bindings, and touch regions.
- [Physics 2D and tilemaps](../physics2d-tilemap/) adds a tile level and collisions to a 2D scene.
- [Add audio and UI](../audio-and-ui/) adds sound effects and a menu.
- [Reusable sprite animation templates](../sprite-animation-templates/) shares one set of clips between characters that wear different art.
