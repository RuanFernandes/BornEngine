import {
  Colors,
  Game,
  GameObject,
  FILTER_NEAREST,
  Key,
  ParticleEmitter2D,
  Scene,
  SpriteAnimation,
  SpriteAnimator,
  SpriteRenderer,
  SpriteSheet,
  Texture,
} from '@bornengine/engine';
import type { InputActionMap } from '@bornengine/engine/input';
import type { SpriteFrame } from '@bornengine/engine/sprites';

class SpriteDemoScene extends Scene {
  readonly player: GameObject;
  readonly sprite: SpriteRenderer;
  readonly animator: SpriteAnimator;
  readonly particles: ParticleEmitter2D;

  constructor(game: Game, idle: SpriteFrame, walk: SpriteFrame[], attack: SpriteFrame[], sparks: SpriteFrame[]) {
    super(game, { name: 'Sprite animation' });
    this.camera2D = {
      offset: { x: 400, y: 225 },
      target: { x: 400, y: 225 },
      rotation: 0,
      zoom: 1,
    };

    this.player = new GameObject({ name: 'Player', position: { x: 400, y: 225, z: 0 } });
    this.sprite = new SpriteRenderer(idle, { size: { x: 72, y: 72 } });
    const idleAnimation = new SpriteAnimation({
      frames: [{ sprite: idle }],
      fps: 2,
      loop: 'loop',
    });
    const walkAnimation = new SpriteAnimation({
      frames: [
        { sprite: walk[0], duration: 0.12 },
        { sprite: walk[1], duration: 0.1, markers: ['footstep'] },
        { sprite: walk[2], duration: 0.12 },
      ],
      loop: 'loop',
    });
    const attackAnimation = new SpriteAnimation({
      frames: [
        { sprite: attack[0], duration: 0.12 },
        { sprite: attack[1], duration: 0.1, markers: ['impact'] },
        { sprite: attack[0], duration: 0.18 },
      ],
      loop: 'once',
    });
    this.animator = new SpriteAnimator(this.sprite, {
      clips: { idle: idleAnimation, walk: walkAnimation, attack: attackAnimation },
      states: [
        {
          name: 'idle',
          clip: 'idle',
          transitions: [
            { to: 'attack', conditions: [{ type: 'trigger', name: 'attack' }], fade: 0.06 },
            { to: 'walk', conditions: [{ type: 'bool', name: 'moving', value: true }], fade: 0.1 },
          ],
        },
        {
          name: 'walk',
          clip: 'walk',
          transitions: [
            { to: 'attack', conditions: [{ type: 'trigger', name: 'attack' }], fade: 0.06 },
            { to: 'idle', conditions: [{ type: 'bool', name: 'moving', value: false }], fade: 0.1 },
          ],
        },
        {
          name: 'attack',
          clip: 'attack',
          transitions: [
            { to: 'idle', conditions: [{ type: 'callback', test: (animator) => !animator.isPlaying }], fade: 0.08 },
          ],
        },
      ],
      initialState: 'idle',
    });
    this.particles = new ParticleEmitter2D({
      frames: sparks,
      capacity: 96,
      emissionRate: 3,
      shape: { type: 'circle', radius: 5 },
      direction: { x: 0, y: -1 },
      lifetime: { min: 0.18, max: 0.48 },
      speed: { min: 30, max: 105 },
      startSize: { min: 4, max: 9 },
      endSize: { min: 0, max: 2 },
      startColor: { r: 255, g: 222, b: 94, a: 255 },
      endColor: { r: 255, g: 112, b: 64, a: 0 },
      spin: { min: -180, max: 180 },
      frameRate: 14,
      space: 'local',
    });
    this.particles.renderOrder = -1;
    this.animator.onMarker = (marker) => {
      if (marker === 'footstep') this.particles.emitBurst(3, { direction: { x: 0, y: -1 } });
      if (marker === 'impact') {
        const direction = { x: this.sprite.flipX ? -1 : 1, y: 0 };
        this.particles.emitBurst(18, { direction });
      }
    };

    this.player.addComponent(this.particles);
    this.player.addComponent(this.sprite);
    this.player.addComponent(this.animator);
    this.add(this.player);
  }

  onEnter(): void {
    this.particles.play();
  }

  onExit(): void {
    this.particles.stop();
  }
}

class SpriteAnimationGame extends Game {
  private controls: InputActionMap | null = null;
  private level: SpriteDemoScene | null = null;

  constructor() {
    super({
      window: { title: 'BornEngine · Sprite animation', width: 800, height: 450 },
      targetFps: 60,
    });
    this.initializeDemo();
  }

  private initializeDemo(): void {
    if (!this.isReady) {
      console.error(this.error || 'Could not start BornEngine.');
      return;
    }

    const texture = new Texture(this, 'assets/atlas.png');
    if (!texture.isLoaded) {
      console.error(texture.error || 'Could not load assets/atlas.png.');
      this.dispose();
      return;
    }
    texture.setFilter(FILTER_NEAREST);

    const sheet = new SpriteSheet(texture, { frameWidth: 32, frameHeight: 32 });
    const idle = sheet.gridFrame(0, 0);
    const walkA = sheet.gridFrame(1, 0);
    const walkB = sheet.gridFrame(2, 0);
    const attackA = sheet.gridFrame(2, 0);
    const attackB = sheet.gridFrame(3, 0);
    const sparkA = sheet.gridFrame(4, 0);
    const sparkB = sheet.gridFrame(5, 0);
    if (sheet.error !== null || idle === null || walkA === null || walkB === null ||
        attackA === null || attackB === null || sparkA === null || sparkB === null) {
      console.error(sheet.error || 'The atlas does not contain the expected frames.');
      this.dispose();
      return;
    }

    this.controls = this.input.createActionMap();
    this.controls.bindAxis('move-x', {
      negative: [{ kind: 'key', key: Key.LEFT }, { kind: 'key', key: Key.A }],
      positive: [{ kind: 'key', key: Key.RIGHT }, { kind: 'key', key: Key.D }],
    });
    this.controls.bindAxis('move-y', {
      negative: [{ kind: 'key', key: Key.UP }, { kind: 'key', key: Key.W }],
      positive: [{ kind: 'key', key: Key.DOWN }, { kind: 'key', key: Key.S }],
    });
    this.controls.bindAction('attack', { kind: 'key', key: Key.SPACE });

    this.level = new SpriteDemoScene(this, idle, [walkA, walkB, walkA], [attackA, attackB], [sparkA, sparkB]);
    if (!this.scenes.changeTo(this.level)) {
      console.error('Could not activate the sprite demo scene.');
      this.dispose();
    }
  }

  protected override loop(deltaTime: number): void {
    const controls = this.controls;
    const level = this.level;
    if (controls !== null && level !== null) {
      let moveX = controls.readAxis('move-x');
      let moveY = controls.readAxis('move-y');
      const length = Math.sqrt(moveX * moveX + moveY * moveY);
      if (length > 1) {
        moveX /= length;
        moveY /= length;
      }
      level.player.transform.position.x += moveX * 190 * deltaTime;
      level.player.transform.position.y += moveY * 190 * deltaTime;
      if (moveX !== 0) level.sprite.flipX = moveX < 0;
      level.animator.setBool('moving', moveX !== 0 || moveY !== 0);
      if (controls.wasPressed('attack')) level.animator.setTrigger('attack');
    }
    this.scenes.update(deltaTime);
  }

  protected override render(): void {
    this.renderer.clear({ r: 14, g: 24, b: 38, a: 255 });
    super.render();
    this.renderer.drawText('WASD / arrows: move     Space: attack', { x: 18, y: 18 }, 18, Colors.WHITE);
  }
}

new SpriteAnimationGame().run();
