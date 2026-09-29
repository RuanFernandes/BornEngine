import {
  CameraRig2D,
  Colors,
  FILTER_NEAREST,
  Game,
  GameComponent,
  GameObject,
  Key,
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
import type { Color } from '@bornengine/engine';
import { SoundManager } from '@bornengine/engine/audio';
import type { InputActionMap } from '@bornengine/engine/input';
import { CharacterBody2D, PhysicsWorld2D } from '@bornengine/engine/physics2d';
import { Tilemap } from '@bornengine/engine/tilemap';
import type { TilemapSolidTile } from '@bornengine/engine/tilemap';
import type { SpriteFrame } from '@bornengine/engine/sprites';

const WORLD_WIDTH = 40;
const WORLD_HEIGHT = 24;
const TILE_SIZE = 32;
const PLAYER_SIZE = new Vector2D(30, 30);
const CAMERA_OFFSET = new Vector2D(400, 240);
const RUN_MARKER_DIRECTION = new Vector2D(0, 1);
const JUMP_BURST_DIRECTION = new Vector2D(0, 1);
const GRAVITY = 900;
const JUMP_SPEED = 430;
const GRAVITY_VECTOR = new Vector2D(0, GRAVITY);
const PLAYER_START = new Vector2D(350, 650);

class PlatformSurface extends GameComponent {
  readonly width: number;
  readonly height: number;
  readonly color: Color;

  constructor(width: number, height: number) {
    super();
    this.width = width;
    this.height = height;
    this.color = { r: 30, g: 49, b: 72, a: 255 };
    this.renderOrder = -1;
  }

  override render(renderer: Renderer): void {
    const position = this.gameObject?.transform.worldPosition;
    if (!this.isActiveAndEnabled || position === null || position === undefined) return;
    renderer.drawRectangle({
      x: position.x - this.width * 0.5,
      y: position.y - this.height * 0.5,
      width: this.width,
      height: this.height,
    }, this.color);
  }
}

class PlatformerScene extends Scene {
  readonly physics: PhysicsWorld2D | null = null;
  readonly player: GameObject | null = null;
  readonly character: CharacterBody2D | null = null;
  readonly animator: SpriteAnimator | null = null;
  readonly particles: ParticleEmitter2D | null = null;
  readonly sounds: SoundManager | null = null;
  readonly error: string | null = null;

  constructor(
    game: Game,
    physicsWorld: PhysicsWorld2D,
    sheet: SpriteSheet,
    idle: SpriteFrame,
    runFrames: SpriteFrame[],
    sparkFrames: SpriteFrame[],
  ) {
    super(game, { name: 'Cavern run' });
    this.viewport2D = new Viewport2D({ width: 800, height: 480, mode: 'fit' });

    const physics = this.own(physicsWorld);
    if (physics === null || !physics.isReady) {
      this.error = 'The scene could not take ownership of its ready PhysicsWorld2D.';
      return;
    }
    this.physics = physics;

    const cells: number[] = [];
    for (let row = 0; row < WORLD_HEIGHT; row++) {
      for (let column = 0; column < WORLD_WIDTH; column++) {
        const floor = row === 22;
        const lowerStep = row === 19 && column >= 14 && column <= 18;
        const middleStep = row === 16 && column >= 7 && column <= 12;
        const upperStep = row === 13 && column >= 15 && column <= 19;
        cells.push(floor || lowerStep || middleStep || upperStep ? 1 : 0);
      }
    }

    const tilemap = new Tilemap(sheet, {
      columns: WORLD_WIDTH,
      rows: WORLD_HEIGHT,
      tileWidth: TILE_SIZE,
      tileHeight: TILE_SIZE,
      tiles: [{ id: 1, frame: idle, solid: true }],
      data: cells,
      visible: false,
      tint: { r: 92, g: 142, b: 184, a: 255 },
    });
    if (tilemap.error !== null) {
      this.error = tilemap.error;
      return;
    }

    const mapObject = new GameObject({ name: 'Cavern tiles' });
    mapObject.addComponent(tilemap);
    this.addNode(mapObject);
    const solids = tilemap.getSolidTiles();
    for (let index = 0; index < solids.length; index++) this.addSolidTile(solids[index], physics);

    this.player = new GameObject({
      name: 'Explorer',
      position: { x: PLAYER_START.x, y: PLAYER_START.y, z: 0 },
    });
    const sprite = new SpriteRenderer(idle, { size: PLAYER_SIZE });
    const idleClip = new SpriteAnimation({ frames: [{ sprite: idle }], fps: 2, loop: 'loop' });
    const runClip = new SpriteAnimation({
      frames: [
        { sprite: runFrames[0], duration: 0.11 },
        { sprite: runFrames[1], duration: 0.11, markers: ['footstep'] },
        { sprite: runFrames[2], duration: 0.11 },
        { sprite: runFrames[3], duration: 0.11, markers: ['footstep'] },
      ],
      loop: 'loop',
    });
    this.animator = new SpriteAnimator(sprite, {
      clips: { idle: idleClip, run: runClip },
      states: [
        {
          name: 'idle',
          clip: 'idle',
          transitions: [{ to: 'run', conditions: [{ type: 'bool', name: 'moving', value: true }], fade: 0.08 }],
        },
        {
          name: 'run',
          clip: 'run',
          transitions: [{ to: 'idle', conditions: [{ type: 'bool', name: 'moving', value: false }], fade: 0.08 }],
        },
      ],
      initialState: 'idle',
    });
    this.particles = new ParticleEmitter2D({
      frames: sparkFrames,
      capacity: 48,
      emissionRate: 0,
      shape: { type: 'circle', radius: 3 },
      lifetime: { min: 0.18, max: 0.38 },
      speed: { min: 32, max: 95 },
      startSize: { min: 4, max: 8 },
      endSize: { min: 0, max: 2 },
      startColor: { r: 126, g: 224, b: 255, a: 255 },
      endColor: { r: 92, g: 168, b: 255, a: 0 },
      space: 'world',
      frameRate: 12,
    });
    if (this.particles.error !== null) {
      this.error = this.particles.error;
      return;
    }
    this.character = new CharacterBody2D(physics, { width: 22, height: 27 });
    this.player.addComponent(this.particles);
    this.player.addComponent(sprite);
    this.player.addComponent(this.animator);
    this.player.addComponent(this.character);
    this.addNode(this.player);

    const camera = new CameraRig2D({
      target: this.player,
      offset: CAMERA_OFFSET,
      smoothing: 0.12,
      bounds: { x: 0, y: 0, width: WORLD_WIDTH * TILE_SIZE, height: WORLD_HEIGHT * TILE_SIZE },
    });
    const cameraObject = new GameObject({ name: 'Follow camera' });
    cameraObject.addComponent(camera);
    this.addNode(cameraObject);
    if (!this.bindCameraRig2D(camera)) {
      this.error = 'Could not bind the follow camera to the platformer scene.';
      return;
    }

    const sounds = this.own(game.audio.createSoundManager());
    if (sounds === null) {
      this.error = 'Could not register the scene sound manager.';
      return;
    }
    this.sounds = sounds;
    if (this.sounds.loadSound('step', 'assets/pickup.wav', { volume: 0.18, cooldownSeconds: 0.12 }) === null) {
      console.warn('The platformer is running without its optional pickup sound.');
    }
    this.animator.onMarker = (marker) => {
      if (marker !== 'footstep') return;
      this.particles?.emitBurst(4, { direction: RUN_MARKER_DIRECTION });
      this.sounds?.playSound('step');
    };
  }

  private addSolidTile(tile: TilemapSolidTile, physics: PhysicsWorld2D): void {
    const width = tile.bounds.width;
    const height = tile.bounds.height;
    const position = {
      x: tile.bounds.x + width * 0.5,
      y: tile.bounds.y + height * 0.5,
      z: 0,
    };
    const block = new GameObject({ name: 'Cavern platform', position });
    block.addComponent(new PlatformSurface(width, height));
    block.addComponent(physics.createBody({
      type: 'static',
      shape: { type: 'box', width, height },
    }));
    this.addNode(block);
  }
}

class PlatformerGame extends Game {
  private controls: InputActionMap | null = null;
  private level: PlatformerScene | null = null;

  constructor() {
    super({
      window: { title: 'BornEngine · 2D platformer', width: 960, height: 576 },
      targetFps: 60,
    });
  }

  protected override onStart(): void {
    const texture = this.assets.loadTexture('assets/atlas.png');
    if (texture === null || !texture.isLoaded) {
      console.error(texture === null ? 'Asset manager is unavailable.' : texture.error || 'Could not load assets/atlas.png.');
      this.stop();
      return;
    }
    texture.setFilter(FILTER_NEAREST);
    const sheet = new SpriteSheet(texture, { frameWidth: 32, frameHeight: 32 });
    const idle = sheet.gridFrame(0, 0);
    const runA = sheet.gridFrame(1, 0);
    const runB = sheet.gridFrame(2, 0);
    const runC = sheet.gridFrame(3, 0);
    const sparkA = sheet.gridFrame(4, 0);
    const sparkB = sheet.gridFrame(5, 0);
    if (sheet.error !== null || idle === null || runA === null || runB === null ||
        runC === null || sparkA === null || sparkB === null) {
      console.error(sheet.error || 'The atlas is missing one or more expected frames.');
      this.stop();
      return;
    }

    this.controls = this.input.createActionMap();
    this.controls.bindAxis('move-x', {
      negative: [{ kind: 'key', key: Key.LEFT }, { kind: 'key', key: Key.A }],
      positive: [{ kind: 'key', key: Key.RIGHT }, { kind: 'key', key: Key.D }],
    });
    this.controls.bindAction('jump', { kind: 'key', key: Key.SPACE });

    const physics = new PhysicsWorld2D(this, {
      gravity: GRAVITY_VECTOR,
      fixedTimeStep: 1 / 60,
      maxSubSteps: 5,
    });
    if (!physics.isReady) {
      console.error(physics.error || 'Could not create PhysicsWorld2D.');
      physics.dispose();
      this.stop();
      return;
    }

    this.level = new PlatformerScene(this, physics, sheet, idle, [runA, runB, runC, runA], [sparkA, sparkB]);
    if (this.level.error !== null) {
      console.error(this.level.error);
      this.level.unload();
      this.level = null;
      this.stop();
      return;
    }
    if (!this.scenes.changeTo(this.level)) {
      console.error('Could not activate the platformer scene.');
      this.level.unload();
      this.level = null;
      this.stop();
    }
  }

  protected override loop(deltaTime: number): void {
    const controls = this.controls;
    const level = this.level;
    if (controls !== null && level !== null && level.character !== null &&
        level.animator !== null && level.particles !== null && level.sounds !== null &&
        level.physics !== null && level.player !== null) {
      const velocity = level.character.velocity;
      const moveX = controls.readAxis('move-x');
      velocity.x = moveX * 220;
      velocity.y += GRAVITY * deltaTime;
      if (controls.wasPressed('jump') && level.character.isOnFloor) {
        velocity.y = -JUMP_SPEED;
        level.particles.emitBurst(12, { direction: JUMP_BURST_DIRECTION });
        level.sounds.playSound('step');
      }
      level.character.moveAndSlide(velocity, deltaTime);
      level.animator.setBool('moving', moveX !== 0);
      if (moveX !== 0) {
        const sprite = level.player.getComponent(SpriteRenderer);
        if (sprite !== null) sprite.flipX = moveX < 0;
      }
      level.physics.step(deltaTime);
    }
    this.scenes.update(deltaTime);
  }

  protected override render(): void {
    this.renderer.clear({ r: 11, g: 18, b: 31, a: 255 });
    super.render();
    this.renderer.drawText('A / D or arrows: move     Space: jump', { x: 20, y: 18 }, 18, Colors.WHITE);
  }
}

new PlatformerGame().run();
