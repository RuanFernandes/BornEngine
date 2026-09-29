import {
  CameraRig2D,
  Colors,
  FILTER_NEAREST,
  Game,
  GameComponent,
  GameObject,
  Key,
  Renderer,
  Scene,
  SpriteSheet,
  Vector2D,
  Viewport2D,
} from '@bornengine/engine';
import type { AssetGroup, Color } from '@bornengine/engine';
import { AudioEmitter2D } from '@bornengine/engine/audio';
import type { Sound } from '@bornengine/engine/audio';
import type { InputActionMap } from '@bornengine/engine/input';
import { formatWorld2DDiagnostics, World2DLoader } from '@bornengine/engine/world2d';

const ROOM_SIZE = new Vector2D(640, 384);
const PLAYER_SPEED = 150;
const ATLAS_PATH = 'assets/atlas.png';
const ROOM_PATH = 'assets/moonlit-pier.world2d.json';
const PICKUP_SOUND_PATH = 'assets/pickup.wav';

class RoomBackdrop extends GameComponent {
  readonly size: Vector2D;
  readonly color: Color;

  constructor(size: Vector2D) {
    super();
    this.size = size.clone();
    this.color = { r: 17, g: 42, b: 58, a: 255 };
    this.renderOrder = -100;
  }

  override render(renderer: Renderer): void {
    if (!this.isActiveAndEnabled) return;
    const position = this.gameObject?.transform.worldPosition;
    if (position === null || position === undefined) return;
    renderer.drawRectangle({
      x: position.x - this.size.x * 0.5,
      y: position.y - this.size.y * 0.5,
      width: this.size.x,
      height: this.size.y,
    }, this.color);
  }
}

class PierScene extends Scene {
  readonly player: GameObject | null;
  readonly error: string | null;

  constructor(
    game: Game,
    source: string,
    sheet: SpriteSheet,
    sound: Sound,
    preloadGroup: { dispose(): void },
  ) {
    super(game, { name: 'Moonlit Pier' });
    this.viewport2D = new Viewport2D({ width: ROOM_SIZE.x, height: ROOM_SIZE.y, mode: 'fit' });
    this.own(preloadGroup);

    const background = new GameObject({
      name: 'Water',
      position: { x: ROOM_SIZE.x * 0.5, y: ROOM_SIZE.y * 0.5, z: 0 },
    });
    background.addComponent(new RoomBackdrop(ROOM_SIZE));
    this.addNode(background);

    const loader = new World2DLoader(undefined, {
      resolveSpriteFrame: (tileset, tileId, resolvedImagePath) => {
        if (resolvedImagePath !== ATLAS_PATH || tileset.id !== 'room-atlas') return null;
        return sheet.gridFrame(tileId, 0);
      },
    });
    const result = loader.loadJSON(source, this);
    if (!result.ok) {
      this.error = formatWorld2DDiagnostics(result.diagnostics);
      this.player = null;
      return;
    }

    let player: GameObject | null = null;
    for (let index = 0; index < result.instances.length; index++) {
      const instance = result.instances[index];
      if (instance.sourceId === 'player') {
        player = instance.gameObject;
        break;
      }
    }
    if (player === null) {
      this.error = 'The room document must contain an object with id player.';
      this.player = null;
      return;
    }
    this.player = player;
    this.error = null;

    const listener = game.audio.listener2D;
    if (listener !== null) {
      player.addComponent(new AudioEmitter2D(sound, listener, {
        refDist: 24,
        maxDist: 360,
        rolloff: 1,
      }));
    }

    const cameraObject = new GameObject({ name: 'Follow camera' });
    const camera = new CameraRig2D({
      target: player,
      offset: new Vector2D(ROOM_SIZE.x * 0.5, ROOM_SIZE.y * 0.5),
      smoothing: 0.18,
      bounds: { x: 0, y: 0, width: ROOM_SIZE.x, height: ROOM_SIZE.y },
    });
    cameraObject.addComponent(camera);
    this.addNode(cameraObject);
    if (!this.bindCameraRig2D(camera)) this.error = 'Could not bind the room camera.';
  }
}

class MoonlitPierGame extends Game {
  private controls: InputActionMap | null = null;
  private room: PierScene | null = null;

  constructor() {
    super({
      window: { title: 'BornEngine · Moonlit Pier', width: 960, height: 576 },
      targetFps: 60,
    });
  }

  protected override onStart(): void {
    this.controls = this.input.createActionMap();
    this.bindMovementPreset(false);
    this.controls.bindAction('toggle-controls', { kind: 'key', key: Key.R });
    this.controls.bindAction('play-chime', { kind: 'key', key: Key.SPACE });

    const group = this.assets.createGroup('moonlit-pier');
    if (group === null || !group.addTexture(ATLAS_PATH) ||
        !group.addSound(PICKUP_SOUND_PATH)) {
      console.error('Could not prepare the room asset group.');
      this.stop();
      return;
    }

    group.load().then((state) => {
      if (state !== 'ready') {
        console.error('Room asset preload failed.');
        group.dispose();
        this.stop();
        return;
      }
      this.openRoom(group);
    });
  }

  protected override loop(deltaTime: number): void {
    const controls = this.controls;
    const room = this.room;
    const player = room === null ? null : room.player;
    if (controls !== null && player !== null) {
      if (controls.wasPressed('toggle-controls')) {
        this.alternateControls = !this.alternateControls;
        this.bindMovementPreset(this.alternateControls);
      }
      if (controls.wasPressed('play-chime')) {
        const emitter = player.getComponent(AudioEmitter2D);
        if (emitter !== null) emitter.play();
      }

      const movement = controls.readVector2('move-x', 'move-y');
      const magnitude = Math.sqrt(movement.x * movement.x + movement.y * movement.y);
      if (magnitude > 1) {
        movement.x /= magnitude;
        movement.y /= magnitude;
      }
      const position = player.transform.position;
      position.x += movement.x * PLAYER_SPEED * deltaTime;
      position.y += movement.y * PLAYER_SPEED * deltaTime;
      position.x = Math.max(16, Math.min(ROOM_SIZE.x - 16, position.x));
      position.y = Math.max(16, Math.min(ROOM_SIZE.y - 16, position.y));
    }
    this.scenes.update(deltaTime);
  }

  protected override render(): void {
    this.renderer.clear({ r: 7, g: 19, b: 31, a: 255 });
    super.render();
    this.renderer.drawText(
      'WASD / arrows: move     R: switch layout     Space: chime',
      new Vector2D(18, 18),
      17,
      Colors.WHITE,
    );
  }

  private alternateControls = false;

  private bindMovementPreset(alternate: boolean): void {
    const controls = this.controls;
    if (controls === null) return;
    const left: Array<{ kind: 'key'; key: number }> = alternate
      ? [{ kind: 'key', key: Key.J }]
      : [{ kind: 'key', key: Key.A }, { kind: 'key', key: Key.LEFT }];
    const right: Array<{ kind: 'key'; key: number }> = alternate
      ? [{ kind: 'key', key: Key.L }]
      : [{ kind: 'key', key: Key.D }, { kind: 'key', key: Key.RIGHT }];
    const up: Array<{ kind: 'key'; key: number }> = alternate
      ? [{ kind: 'key', key: Key.I }]
      : [{ kind: 'key', key: Key.W }, { kind: 'key', key: Key.UP }];
    const down: Array<{ kind: 'key'; key: number }> = alternate
      ? [{ kind: 'key', key: Key.K }]
      : [{ kind: 'key', key: Key.S }, { kind: 'key', key: Key.DOWN }];
    controls.bindAxis('move-x', { negative: left, positive: right });
    controls.bindAxis('move-y', { negative: up, positive: down });
  }

  private openRoom(preloadGroup: { dispose(): void }): void {
    const texture = this.assets.getTexture(ATLAS_PATH);
    const soundEntry = this.findSoundEntry(preloadGroup);
    if (texture === null || !texture.isLoaded || soundEntry === null || !soundEntry.isLoaded) {
      console.error('The room atlas or positional sound is unavailable.');
      preloadGroup.dispose();
      this.stop();
      return;
    }
    texture.setFilter(FILTER_NEAREST);
    const sheet = new SpriteSheet(texture, { frameWidth: 32, frameHeight: 32 });
    const source = this.input.readFile(ROOM_PATH);
    if (sheet.error !== null || source.length === 0) {
      console.error(sheet.error || 'Could not read the room document.');
      preloadGroup.dispose();
      this.stop();
      return;
    }

    const room = new PierScene(this, source, sheet, soundEntry, preloadGroup);
    if (room.error !== null) {
      console.error(room.error);
      room.unload();
      this.stop();
      return;
    }
    this.room = room;
    if (!this.scenes.changeTo(room)) {
      console.error('Could not activate the room scene.');
      room.unload();
      this.room = null;
      this.stop();
    }
  }

  private findSoundEntry(group: AssetGroup): Sound | null {
    for (let index = 0; index < group.entries.length; index++) {
      const entry = group.entries[index];
      if (entry.kind === 'sound' && entry.path === PICKUP_SOUND_PATH &&
          entry.result !== null && entry.result.isLoaded === true) {
        return entry.result as Sound;
      }
    }
    return null;
  }
}

new MoonlitPierGame().run();
