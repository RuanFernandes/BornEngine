---
title: Your first player
description: Build a player object that moves with the keyboard, draws a sprite, and is followed by a camera.
section: Getting Started
order: 4
---

This tutorial builds a player character one piece at a time. You write a `Game`, put a `Scene` inside it, and create a `Player` object that reads the keyboard every frame. The second step adds a sprite and a camera that follows the player across a larger room.

Each step is one complete `main.ts` file. Replace the whole file at each step.

## Before you start

- Finish [Installation](../installation/) and [Quickstart](../quickstart/).
- Use a project that runs with `bornengine run main.ts`. The quickstart creates one.
- For step 2, save any small PNG as `assets/player.png` inside the project. A 48 by 48 pixel image works well.

## Four words you will see

- **Game**: the application. It owns the window, renderer, input, and assets. You subclass it and call `run()`.
- **Scene**: one screen or level. A scene holds game objects.
- **GameObject**: something in a scene, such as a player. It has a `transform` that stores its position.
- **GameComponent**: a behavior attached to a game object. A component draws with `render()` or runs logic with `update()`.

## Step 1: Move a rectangle

Replace `main.ts` with this file:

```ts
import { Colors, Game, GameComponent, GameObject, Key, Renderer, Scene, Vec3 } from '@bornengine/engine';
import type { InputSystem } from '@bornengine/engine';

const SPEED = 180;
const SIZE = 48;

class PlayerView extends GameComponent {
  override render(renderer: Renderer): void {
    const owner = this.gameObject;
    if (owner === null) return;
    const position = owner.transform.worldPosition;
    renderer.drawRectangle({ x: position.x, y: position.y, width: SIZE, height: SIZE }, Colors.ORANGE);
  }
}

class Player extends GameObject {
  private readonly input: InputSystem;

  constructor(input: InputSystem) {
    super({ name: 'Player', position: new Vec3(120, 200, 0) });
    this.input = input;
    this.addComponent(new PlayerView());
  }

  override update(deltaTime: number): void {
    let x = 0;
    let y = 0;
    if (this.input.isKeyDown(Key.LEFT)) x -= 1;
    if (this.input.isKeyDown(Key.RIGHT)) x += 1;
    if (this.input.isKeyDown(Key.UP)) y -= 1;
    if (this.input.isKeyDown(Key.DOWN)) y += 1;
    this.transform.position.x += x * SPEED * deltaTime;
    this.transform.position.y += y * SPEED * deltaTime;
  }
}

class Level extends Scene {
  constructor(game: Game) {
    super(game, { name: 'level' });
    this.addNode(new Player(game.input));
  }
}

class FirstPlayerGame extends Game {
  constructor() {
    super({ window: { title: 'First player', width: 800, height: 450 }, targetFps: 60 });
  }

  protected override onStart(): void {
    this.scenes.changeTo(new Level(this));
  }

  protected override loop(deltaTime: number): void {
    this.scenes.update(deltaTime);
  }

  protected override render(): void {
    this.renderer.clear(Colors.DARKBLUE);
    super.render();
  }
}

new FirstPlayerGame().run();
```

Run it with `bornengine run main.ts`. The arrow keys move the orange square.

What each part does:

- `onStart()` runs once, after the window and renderer exist. It creates the level and makes it the active scene.
- `loop(deltaTime)` runs every frame. `deltaTime` is the time since the last frame, in seconds. The game does not update scenes for you, so `loop` calls `this.scenes.update(deltaTime)`.
- `render()` runs every frame after `loop`. The renderer does not clear the screen automatically, so the first line clears it. `super.render()` then draws the active scene.
- `Player.update()` runs every frame for each active game object. Multiplying by `SPEED * deltaTime` keeps the speed the same at any frame rate.
- `PlayerView.render()` draws the square. Game objects do not draw themselves; components do.

Diagonal movement is faster than straight movement in this version. Normalize the direction if your game needs equal speed in every direction.

## Step 2: Add a sprite, a camera, and a room

This version replaces the rectangle with `assets/player.png`, draws a grid room that is larger than the window, and adds a camera that follows the player.

```ts
import {
  CameraRig2D,
  Colors,
  Game,
  GameComponent,
  GameObject,
  InputSystem,
  Key,
  Renderer,
  Scene,
  Texture,
  Vec3,
  Viewport2D,
} from '@bornengine/engine';
import { Asset } from '@bornengine/engine/annotations';

const SPEED = 180;
const ROOM_WIDTH = 1600;
const ROOM_HEIGHT = 900;
const GRID = 64;

class RoomView extends GameComponent {
  override render(renderer: Renderer): void {
    renderer.drawRectangle({ x: 0, y: 0, width: ROOM_WIDTH, height: ROOM_HEIGHT }, Colors.DARKBLUE);
    for (let x = 0; x <= ROOM_WIDTH; x += GRID) {
      renderer.drawLine({ x, y: 0 }, { x, y: ROOM_HEIGHT }, Colors.SKYBLUE);
    }
    for (let y = 0; y <= ROOM_HEIGHT; y += GRID) {
      renderer.drawLine({ x: 0, y }, { x: ROOM_WIDTH, y }, Colors.SKYBLUE);
    }
  }
}

class PlayerView extends GameComponent {
  private readonly player: Player;

  constructor(player: Player) {
    super();
    this.player = player;
  }

  override render(renderer: Renderer): void {
    const position = this.player.transform.worldPosition;
    renderer.drawTexture(this.player.image, { x: position.x, y: position.y });
  }
}

class Player extends GameObject {
  @Asset('assets/player.png')
  readonly image!: Texture;

  private readonly input: InputSystem;

  constructor(input: InputSystem) {
    super({ name: 'Player', position: new Vec3(ROOM_WIDTH / 2, ROOM_HEIGHT / 2, 0) });
    this.input = input;
    this.addComponent(new PlayerView(this));
  }

  override update(deltaTime: number): void {
    let x = 0;
    let y = 0;
    if (this.input.isKeyDown(Key.LEFT)) x -= 1;
    if (this.input.isKeyDown(Key.RIGHT)) x += 1;
    if (this.input.isKeyDown(Key.UP)) y -= 1;
    if (this.input.isKeyDown(Key.DOWN)) y += 1;
    this.transform.position.x += x * SPEED * deltaTime;
    this.transform.position.y += y * SPEED * deltaTime;
  }
}

class Level extends Scene {
  constructor(game: Game) {
    super(game, { name: 'level' });
    this.viewport2D = new Viewport2D({ width: 800, height: 450, mode: 'fit' });

    const room = new GameObject({ name: 'Room' });
    room.addComponent(new RoomView());
    this.addNode(room);

    const player = new Player(game.input);
    this.addNode(player);

    const camera = new GameObject({ name: 'Camera' });
    const rig = new CameraRig2D({
      target: player,
      offset: { x: 400, y: 225 },
      smoothing: 0.1,
      bounds: { x: 0, y: 0, width: ROOM_WIDTH, height: ROOM_HEIGHT },
    });
    camera.addComponent(rig);
    this.addNode(camera);
    this.bindCameraRig2D(rig);
  }
}

class FirstPlayerGame extends Game {
  constructor() {
    super({ window: { title: 'First player', width: 800, height: 450 }, targetFps: 60 });
  }

  protected override onStart(): void {
    this.scenes.changeTo(new Level(this));
  }

  protected override loop(deltaTime: number): void {
    this.scenes.update(deltaTime);
  }

  protected override render(): void {
    this.renderer.clear(Colors.DARKBLUE);
    super.render();
  }
}

const game = new FirstPlayerGame();
game.run().then(() => {
  if (game.error !== null) console.error(game.error);
});
```

### What changed

- `@Asset('assets/player.png')` on the `image` field loads the texture when the `Player` is added to the scene. The field is filled before the object's `onAwake()` runs.
- `PlayerView` keeps a reference to its player and draws the player's texture at the player's position.
- `RoomView` draws the floor and a grid. The room is 1600 by 900 units, twice the width of the window.
- `CameraRig2D` follows `target` and keeps the view inside `bounds`. `offset` is the screen position where the target appears. `{ x: 400, y: 225 }` puts it in the middle of the 800 by 450 view. Without it, the target appears in the top-left corner. `bindCameraRig2D` must be called after the camera's object has been added to the scene.
- `viewport2D` scales the logical 800 by 450 view to the window.

### Decorators and editor support

`@Asset` uses TypeScript's legacy decorator syntax. Perry compiles it without extra configuration. Your editor needs a `tsconfig.json` to accept the syntax:

```json
{
  "compilerOptions": {
    "experimentalDecorators": true,
    "emitDecoratorMetadata": true
  }
}
```

`@GameComponent()` reads the field's class type at runtime, so it needs `emitDecoratorMetadata`. Only `GameObject` subclasses can use `@Asset` and `@GameComponent()`. Components do not bind annotations.

### If the sprite fails to load

The sprite loads when the `Player` is added to the scene. If `assets/player.png` is missing or cannot be read, the scene cannot be built, the game stops during startup, and the window closes. The last lines of the file print the reason. For a missing file, the output is `Unable to load texture: assets/player.png`. Check the file name and the folder first: the path is relative to the project folder, and the name is case-sensitive on Linux.

## Next steps

- [Scenes, objects, and components](../../concepts/scenes-and-objects/) explains the lifecycle hooks used above in detail.
- [Assets](../../concepts/assets/) explains paths, `game.assets`, and `scene.assets`.
- [2D game](../../guides/2d-game/) builds a complete 2D level with sprites and particles.
- [Physics 2D and tilemaps](../../guides/physics2d-tilemap/) adds collisions so the player stops at walls.
- [Audio and UI](../../guides/audio-and-ui/) adds sound effects and a heads-up display.
