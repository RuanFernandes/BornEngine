import { Colors, Game, GameObject, Scene, SpriteSheet, SpriteRenderer, Texture } from '@bornengine/engine';
import { PhysicsWorld2D } from '@bornengine/engine/physics2d';
import type { PhysicsBody2D } from '@bornengine/engine/physics2d';
import { Tilemap } from '@bornengine/engine/tilemap';
import type { TilemapSolidTile } from '@bornengine/engine/tilemap';
import type { SpriteFrame } from '@bornengine/engine/sprites';

class PhysicsTilemapScene extends Scene {
  readonly physics: PhysicsWorld2D | null;

  constructor(game: Game, frame: SpriteFrame) {
    super(game, { name: 'Physics2D and tilemap' });
    this.camera2D = {
      offset: { x: 400, y: 250 },
      target: { x: 256, y: 160 },
      rotation: 0,
      zoom: 1,
    };

    const physics = this.own(new PhysicsWorld2D(game, {
      gravity: { x: 0, y: 900 },
      fixedTimeStep: 1 / 60,
      maxSubSteps: 5,
    }));
    if (physics === null || !physics.isReady) {
      console.error(physics === null ? 'Could not own PhysicsWorld2D.' : physics.error);
      this.physics = null;
      return;
    }
    this.physics = physics;

    const data: number[] = [];
    for (let index = 0; index < 16 * 10; index++) data.push(0);
    for (let column = 0; column < 16; column++) data[9 * 16 + column] = 1;
    for (let column = 4; column < 8; column++) data[7 * 16 + column] = 1;

    const tilemap = new Tilemap(frame.sheet, {
      columns: 16,
      rows: 10,
      tileWidth: 32,
      tileHeight: 32,
      tiles: [{ id: 1, frame, solid: true }],
      data,
    });
    const mapObject = new GameObject({ name: 'Tilemap' });
    mapObject.addComponent(tilemap);
    this.add(mapObject);

    const solidTiles = tilemap.getSolidTiles();
    for (let index = 0; index < solidTiles.length; index++) this.addStaticTile(solidTiles[index], physics);

    const player = new GameObject({ name: 'Player', position: { x: 112, y: 80, z: 0 } });
    player.addComponent(new SpriteRenderer(frame, { size: { x: 28, y: 28 } }));
    const playerBody = physics.createBody({
      type: 'dynamic',
      shape: { type: 'box', width: 24, height: 28 },
      friction: 0.5,
      restitution: 0,
    });
    playerBody.onCollisionEnter = (contact) => {
      if (contact.other.type === 'static') console.log('Player landed on a tile.');
    };
    player.addComponent(playerBody);
    this.add(player);
  }

  override update(deltaTime: number): void {
    super.update(deltaTime);
    if (this.physics !== null) this.physics.step(deltaTime);
  }

  private addStaticTile(tile: TilemapSolidTile, physics: PhysicsWorld2D): void {
    const position = {
      x: tile.bounds.x + tile.bounds.width * 0.5,
      y: tile.bounds.y + tile.bounds.height * 0.5,
      z: 0,
    };
    const object = new GameObject({ name: 'Solid tile', position });
    object.addComponent(physics.createBody({
      type: 'static',
      shape: { type: 'box', width: tile.bounds.width, height: tile.bounds.height },
    }));
    this.add(object);
  }
}

class PhysicsTilemapGame extends Game {
  private scene: PhysicsTilemapScene | null = null;

  constructor() {
    super({ window: { title: 'BornEngine · Physics2D and tilemap', width: 800, height: 500 }, targetFps: 60 });
  }

  protected override onStart(): void {
    const texture = new Texture(this, '../sprite-animation/assets/atlas.png');
    if (!texture.isLoaded) {
      console.error(texture.error || 'Could not load the example atlas.');
      this.stop();
      return;
    }
    const sheet = new SpriteSheet(texture, { frameWidth: 32, frameHeight: 32 });
    const frame = sheet.gridFrame(0, 0);
    if (frame === null || sheet.error !== null) {
      console.error(sheet.error || 'The tile atlas frame is missing.');
      this.stop();
      return;
    }
    this.scene = new PhysicsTilemapScene(this, frame);
    if (this.isReady && !this.scenes.changeTo(this.scene)) {
      console.error('Could not activate the physics and tilemap scene.');
      this.stop();
    }
  }

  protected override loop(deltaTime: number): void {
    this.scenes.update(deltaTime);
  }

  protected override render(): void {
    this.renderer.clear({ r: 20, g: 26, b: 37, a: 255 });
    super.render();
    this.renderer.drawText('Fixed-step Physics2D · Static tile colliders', { x: 16, y: 16 }, 18, Colors.WHITE);
  }
}

new PhysicsTilemapGame().run();
