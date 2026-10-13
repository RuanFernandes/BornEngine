---
title: 2D physics and tilemaps
description: Build a one-screen platformer level from tilemap data, static colliders, a character body, and a bouncing ball.
section: Guides
order: 64
---

This guide builds a small platformer level. You describe the level as rows of text, turn the `#` cells into a `Tilemap`, and create a physics body for each solid area. A player runs and jumps with `CharacterBody2D`, and a ball falls and bounces in a `PhysicsWorld2D`.

The sections add one piece at a time. The last section has the complete `main.ts`.

## What you will build

- A 20 by 12 tile level that is drawn from a sprite atlas.
- Static physics bodies that match the solid tiles.
- A player you move with `A`/`D` or the arrow keys and jump with `Space`.
- A ball that bounces on the tiles. The game counts the bounces.

## Words you will see

- **Tilemap**: a component that draws a grid of tiles from a sprite sheet. Each cell holds a tile ID. ID `0` means an empty cell.
- **Physics world**: a `PhysicsWorld2D`. It owns the bodies and moves them in fixed time steps.
- **Body**: a `PhysicsBody2D`, a component with a shape. A **static** body never moves. A **dynamic** body is moved by gravity and collisions. A **kinematic** body is moved by your code.
- **Character body**: a `CharacterBody2D`. You give it a velocity and it slides along solid surfaces. It also tells you when it stands on the floor.

## Setup

Create a 2D project and an `assets` folder:

```sh
bornengine new TilePhysics
cd TilePhysics
mkdir assets
```

The level needs one image, `assets/tiles.png`, with three cells that are 32 by 32 pixels in a single row. The picture is 96 by 32 pixels:

| Cell | Used for |
| --- | --- |
| 0 | The ground tile |
| 1 | The player |
| 2 | The ball |

Any three small pictures work. For a quick test, the first three cells of `examples/sprite-animation/assets/atlas.png` in the BornEngine repository work as placeholders.

## Game loop

A scene updates its objects, and the physics world moves its bodies. The world does not step by itself, so the scene steps it. Create the world once, hand it to the scene with `own()`, and step it after the scene has updated its objects:

```ts
import { Game, PhysicsWorld2D, Scene, Vector2D } from '@bornengine/engine';

class Level extends Scene {
  private readonly physics: PhysicsWorld2D;

  constructor(game: Game) {
    super({ name: 'level' });
    const physics = this.own(
      new PhysicsWorld2D(game, {
        gravity: new Vector2D(0, 900),
        fixedTimeStep: 1 / 60,
        maxSubSteps: 5,
      }),
    );
    if (physics === null || !physics.isReady) {
      throw new Error(physics === null ? 'The scene could not own the physics world.' : (physics.error ?? 'The physics world is not ready.'));
    }
    this.physics = physics;
  }

  override update(deltaTime: number): void {
    super.update(deltaTime);
    this.physics.step(deltaTime);
  }
}
```

How this works:

- `gravity` is in world units per second squared. The y axis points down on screen, so a positive y pulls bodies down. The default is `(0, 980)`.
- `step(deltaTime)` adds the frame time to an accumulator and runs whole fixed steps of `fixedTimeStep` seconds. The simulation advances in equal steps whatever the frame rate. The call returns the number of steps it ran.
- `maxSubSteps` limits the steps for one call. If a frame is longer than `fixedTimeStep * maxSubSteps`, the extra time is dropped and added to `droppedTime`. A long pause cannot make the world run hundreds of steps.
- `own()` ties the world to the scene. When another scene replaces this one, the scene disposes the world and all of its bodies. `own()` returns `null` if the scene is already unloading or if another scene owns the object.
- A world that cannot be created has `isReady` set to `false` and describes the reason in `error`.

## Tile collisions

A `Tilemap` draws tiles. It does not create bodies. You choose which tiles collide, and you create the bodies yourself. That keeps the map and the physics separate, so a decoration tile never blocks the player.

Each tile definition decides its own collision:

```ts
import { SpriteSheet, Tilemap } from '@bornengine/engine';

function createMap(sheet: SpriteSheet): Tilemap | null {
  const block = sheet.gridFrame(0, 0);
  const slab = sheet.gridFrame(1, 0);
  const grass = sheet.gridFrame(2, 0);
  if (block === null || slab === null || grass === null) return null;

  const tilemap = new Tilemap(sheet, {
    columns: 4,
    rows: 2,
    tileWidth: 32,
    tileHeight: 32,
    tiles: [
      { id: 1, frame: block, solid: true },
      { id: 2, frame: slab, collision: { x: 0, y: 16, width: 32, height: 16 } },
      { id: 3, frame: grass },
    ],
    data: [0, 3, 3, 0, 1, 2, 2, 1],
  });
  return tilemap.error === null ? tilemap : null;
}
```

- `solid: true` makes the whole cell solid.
- `collision` is one rectangle, measured from the top-left corner of the cell. The `slab` tile above is solid only in its lower half.
- A tile with neither is decoration. Tile ID `0` is always empty, so definitions use IDs from `1`.
- `data` lists the cells row by row. It must hold exactly `columns * rows` numbers, and every number must be `0` or a defined ID. Otherwise the map reports a message in `error` and does not draw.

After you create the map, ask it for its solid shapes. `getSolidRegions()` merges neighboring full-cell solids into larger rectangles, so a floor of twenty tiles becomes one body instead of twenty. Tiles with a custom `collision` rectangle stay separate. Use `getSolidTiles()` instead when you need the column, row, and tile ID of each solid cell.

```ts
import { GameObject, PhysicsWorld2D, Scene, Tilemap } from '@bornengine/engine';

function addTileColliders(scene: Scene, physics: PhysicsWorld2D, mapObject: GameObject, tilemap: Tilemap): void {
  const origin = mapObject.transform.worldPosition;
  for (const region of tilemap.getSolidRegions()) {
    const collider = new GameObject({
      name: 'Solid region',
      position: {
        x: origin.x + region.x + region.width / 2,
        y: origin.y + region.y + region.height / 2,
        z: 0,
      },
    });
    collider.addComponent(
      physics.createBody({
        type: 'static',
        shape: { type: 'box', width: region.width, height: region.height },
        restitution: 0.7,
      }),
    );
    scene.addNode(collider);
  }
}
```

Three details matter here:

- The rectangles are in the map's own coordinates, measured from its top-left corner. A body is positioned at its center, so the code adds half the width and height and the map object's world position.
- The rectangles are not scaled or rotated with the map object. Keep a map that has colliders at scale 1 and with no rotation.
- The bodies are not linked to the map. If you change a cell with `setTile()`, rebuild the bodies for that area.

## Complete example

Replace `main.ts` with this file. It combines the world, the map, the colliders, a player, and a ball:

```ts
import {
  CharacterBody2D,
  Colors,
  FILTER_NEAREST,
  Game,
  GameObject,
  Key,
  PhysicsWorld2D,
  Scene,
  SpriteRenderer,
  SpriteSheet,
  Tilemap,
  Vector2D,
} from '@bornengine/engine';
import type { InputActionMap, PhysicsBody2D, SpriteFrame } from '@bornengine/engine';

const TILE = 32;
const GRAVITY = 900;
const RUN_SPEED = 160;
const JUMP_SPEED = 380;
const BOUNCE = 0.7;

const LEVEL = [
  '....................',
  '....................',
  '....................',
  '....................',
  '........####........',
  '....................',
  '....................',
  '..####..........##..',
  '....................',
  '....................',
  '....................',
  '####################',
];

interface LevelFrames {
  ground: SpriteFrame;
  player: SpriteFrame;
  ball: SpriteFrame;
}

class Player extends GameObject {
  private readonly controls: InputActionMap;
  private readonly body: CharacterBody2D;

  constructor(controls: InputActionMap, physics: PhysicsWorld2D, frame: SpriteFrame) {
    super({ name: 'Player', position: { x: 80, y: 300, z: 0 } });
    this.controls = controls;
    this.body = new CharacterBody2D(physics, { width: 24, height: 28 });
    if (this.body.error !== null) throw new Error(this.body.error);
    this.addComponent(new SpriteRenderer(frame, { size: new Vector2D(28, 28) }));
    this.addComponent(this.body);
  }

  override update(deltaTime: number): void {
    const velocity = this.body.velocity;
    velocity.x = this.controls.readAxis('move-x') * RUN_SPEED;
    velocity.y += GRAVITY * deltaTime;
    if (this.controls.wasPressed('jump') && this.body.isOnFloor) velocity.y = -JUMP_SPEED;
    this.body.moveAndSlide(velocity, deltaTime);
  }
}

class Level extends Scene {
  bounces = 0;
  private readonly physics: PhysicsWorld2D;
  private readonly ball: PhysicsBody2D;

  constructor(game: Game, controls: InputActionMap, frames: LevelFrames) {
    super({ name: 'level' });

    const physics = this.own(new PhysicsWorld2D(game, { gravity: new Vector2D(0, GRAVITY) }));
    if (physics === null || !physics.isReady) {
      throw new Error(physics === null ? 'The scene could not own the physics world.' : (physics.error ?? 'The physics world is not ready.'));
    }
    this.physics = physics;

    const data: number[] = [];
    for (const row of LEVEL) {
      for (const cell of row) data.push(cell === '#' ? 1 : 0);
    }
    const tilemap = new Tilemap(frames.ground.sheet, {
      columns: LEVEL[0].length,
      rows: LEVEL.length,
      tileWidth: TILE,
      tileHeight: TILE,
      tiles: [{ id: 1, frame: frames.ground, solid: true }],
      data,
    });
    if (tilemap.error !== null) throw new Error(tilemap.error);

    const mapObject = new GameObject({ name: 'Tilemap' });
    mapObject.addComponent(tilemap);
    this.addNode(mapObject);
    this.addTileColliders(tilemap, mapObject);

    this.addNode(new Player(controls, physics, frames.player));
    this.ball = this.addBall(frames.ball);
  }

  override update(deltaTime: number): void {
    super.update(deltaTime);
    this.physics.step(deltaTime);
    for (const contact of this.physics.popContacts()) {
      const touchesBall = contact.bodyA === this.ball || contact.bodyB === this.ball;
      if (touchesBall && contact.phase === 'enter') this.bounces += 1;
    }
  }

  private addTileColliders(tilemap: Tilemap, mapObject: GameObject): void {
    const origin = mapObject.transform.worldPosition;
    for (const region of tilemap.getSolidRegions()) {
      const collider = new GameObject({
        name: 'Solid region',
        position: {
          x: origin.x + region.x + region.width / 2,
          y: origin.y + region.y + region.height / 2,
          z: 0,
        },
      });
      collider.addComponent(
        this.physics.createBody({
          type: 'static',
          shape: { type: 'box', width: region.width, height: region.height },
          restitution: BOUNCE,
        }),
      );
      this.addNode(collider);
    }
  }

  private addBall(frame: SpriteFrame): PhysicsBody2D {
    const ball = new GameObject({ name: 'Ball', position: { x: 480, y: 40, z: 0 } });
    ball.addComponent(new SpriteRenderer(frame, { size: new Vector2D(24, 24) }));
    const body = this.physics.createBody({
      type: 'dynamic',
      shape: { type: 'circle', radius: 12 },
      restitution: BOUNCE,
    });
    ball.addComponent(body);
    this.addNode(ball);
    return body;
  }
}

class PlatformerGame extends Game {
  private level: Level | null = null;

  constructor() {
    super({ window: { title: 'Tilemap and physics', width: 640, height: 384 }, targetFps: 60 });
  }

  protected override onStart(): void {
    const texture = this.assets.loadTexture('assets/tiles.png');
    if (texture === null || !texture.isLoaded) throw new Error(texture?.error ?? 'Could not load assets/tiles.png');
    texture.setFilter(FILTER_NEAREST);

    const sheet = new SpriteSheet(texture, { frameWidth: TILE, frameHeight: TILE });
    const ground = sheet.gridFrame(0, 0);
    const player = sheet.gridFrame(1, 0);
    const ball = sheet.gridFrame(2, 0);
    if (ground === null || player === null || ball === null) {
      throw new Error(sheet.error ?? 'assets/tiles.png needs three cells of 32 by 32 pixels.');
    }

    const controls = this.input.createActionMap();
    controls.bindAxis('move-x', {
      negative: [{ kind: 'key', key: Key.LEFT }, { kind: 'key', key: Key.A }],
      positive: [{ kind: 'key', key: Key.RIGHT }, { kind: 'key', key: Key.D }],
    });
    controls.bindAction('jump', [{ kind: 'key', key: Key.SPACE }, { kind: 'key', key: Key.UP }]);

    const level = new Level(this, controls, { ground, player, ball });
    if (!this.scenes.changeTo(level)) throw new Error('Could not activate the level.');
    this.level = level;
  }

  protected override loop(deltaTime: number): void {
    this.scenes.update(deltaTime);
  }

  protected override render(): void {
    this.renderer.clear({ r: 20, g: 26, b: 37, a: 255 });
    super.render();
    const bounces = this.level === null ? 0 : this.level.bounces;
    this.renderer.drawText('A/D move   Space jump   Ball bounces: ' + bounces, { x: 12, y: 12 }, 18, Colors.WHITE);
  }
}

const game = new PlatformerGame();
game.run().then(() => {
  if (game.error !== null) console.error(game.error);
});
```

Run it with `bornengine run main.ts`. The ball drops onto the floor and bounces until it settles. Move the player with `A`/`D` or the arrow keys, and jump with `Space`.

What each part does:

- `LEVEL` is the whole map as text. The loop turns each `#` into tile ID `1` and every other character into `0`. The `Tilemap` draws the tiles, and `addTileColliders` creates four static bodies for the 30 solid cells.
- `Player.update()` builds the velocity for this frame. It sets the horizontal speed from the `move-x` axis, adds gravity, and starts a jump only when `isOnFloor` is true. `moveAndSlide()` moves the object and slides it along the tiles. Afterwards, `this.body.velocity` returns the velocity that is left after the slide, so landing on the floor cancels the fall speed. The next frame starts from that value.
- The `CharacterBody2D` is a component, so it moves its own game object. The `SpriteRenderer` on the same object draws at that position.
- The ball is a dynamic body. The world moves it and writes its position back into the game object's transform after each fixed step, so its sprite follows the body.
- `Level.update()` steps the world after the objects have updated, then reads the contact queue. A contact record has a `phase` of `enter`, `stay`, or `exit`, and the two bodies that touch.
- Both the ball and the ground have `restitution: 0.7`. When two bodies touch, the solver uses the smaller of their two values. A ground body with the default `0` would stop the ball from bouncing.
- Components with the same `renderOrder` draw in the order their objects were added to the scene. The tilemap object is added first, so the player and the ball draw over it.

### The contact queue

The world records a pair for every contact on every fixed step and keeps the records until you call `popContacts()`. Call it once per frame, as the example does, even if you only use the per-body callbacks `onCollisionEnter`, `onCollisionStay`, `onCollisionExit`, and their `onTrigger...` versions. Do not call `clearContacts()` every frame. It also forgets which bodies are touching, so the next step reports them all as new `enter` contacts.

### Limits to know

- Bodies have a position and a velocity, but no rotation. A box or circle stays upright.
- A body is a `box`, a `circle`, a `segment`, or a `convex` polygon. Segments and convex shapes must be static. They are useful for slopes and one-way platforms.
- `CharacterBody2D` always uses a box shape and is a kinematic body: your code decides how far it moves.
- All bodies belong to one world and one `Game`. A body cannot move to another world.

## Next steps

- [Physics 2D API](../../api/physics2d/) lists all shapes, body options, queries such as `raycast`, one-way surfaces, and continuous collision detection.
- [Tilemaps API](../../api/tilemap/) documents `Tilemap` in full, including tile flips and changing cells at runtime.
- [Sprites API](../../api/sprites/) explains sprite sheets and frames.
- [World2D API](../../api/world2d/) loads a map that you author in BornEngineTools, with tile layers, objects, and physics bodies.
- [Build a 2D game](../2d-game/) adds animation, particles, and a camera to a 2D scene.
