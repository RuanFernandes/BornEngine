import {
  Colors,
  Game,
  GameObject,
  ParticleEmitter2D,
  Scene,
  ScriptComponent,
  SpriteRenderer,
  SpriteSheet,
  Vector2D,
} from '@bornengine/engine';
import type { ScriptPermission, SpriteFrame } from '@bornengine/engine';
import { actorScriptSource } from './src/actor-script';

const PLAYER_PERMISSIONS: ScriptPermission[] = [
  'log',
  'self.particles.emit',
  'self.read',
  'self.transform.write',
];

const RESTRICTED_PROBE_SOURCE = `export default {
  onStart(ctx) {
    ctx.log('Restricted probe: transform=' + typeof ctx.self.moveBy + ', particles=' + typeof ctx.particles);
  },
}`;

class ScriptedActorScene extends Scene {
  constructor(game: Game, actorFrame: SpriteFrame, particleFrame: SpriteFrame) {
    super(game, { name: 'Scripted actor' });

    const actor = new GameObject({
      name: 'Player',
      position: { x: 150, y: 220, z: 0 },
    });
    const particles = new ParticleEmitter2D({
      frames: [particleFrame],
      capacity: 80,
      shape: { type: 'circle', radius: 3 },
      lifetime: { min: 0.2, max: 0.55 },
      speed: { min: 28, max: 92 },
      startSize: { min: 4, max: 8 },
      endSize: { min: 0, max: 2 },
      direction: new Vector2D(1, -0.2),
      startColor: { r: 255, g: 224, b: 116, a: 255 },
      endColor: { r: 255, g: 112, b: 62, a: 0 },
      space: 'local',
    });
    particles.renderOrder = -1;

    const sprite = new SpriteRenderer(actorFrame, { size: new Vector2D(64, 64) });
    const behavior = new ScriptComponent(game.scripting, actorScriptSource, {
      permissions: PLAYER_PERMISSIONS,
    });

    if (actor.addComponent(particles) === null ||
        actor.addComponent(sprite) === null ||
        actor.addComponent(behavior) === null ||
        this.add(actor) === null) {
      console.error('Could not create the scripted player.');
      return;
    }

    const restrictedProbe = new GameObject({ name: 'Restricted probe' });
    const restrictedBehavior = new ScriptComponent(game.scripting, RESTRICTED_PROBE_SOURCE, {
      permissions: ['log'],
    });
    if (restrictedProbe.addComponent(restrictedBehavior) === null ||
        this.add(restrictedProbe) === null) {
      console.error('Could not create the restricted script probe.');
    }
  }
}

class ScriptedActorGame extends Game {
  constructor() {
    super({
      window: { title: 'BornEngine · Scripted actor', width: 800, height: 450 },
      targetFps: 60,
      debug: {
        enabled: true,
        metrics: false,
        sceneHierarchy: true,
        assets: true,
        scripts: true,
      },
    });

    this.initializeExample();
  }

  private initializeExample(): void {
    if (!this.isReady) {
      console.error(this.error || 'Could not start BornEngine.');
      this.dispose();
      return;
    }

    const texture = this.assets.loadTexture('assets/atlas.png');
    if (texture === null || !texture.isLoaded) {
      console.error(texture === null ? 'Could not access the asset manager.' : texture.error || 'Could not load the sprite atlas.');
      this.dispose();
      return;
    }

    const sheet = new SpriteSheet(texture, { frameWidth: 32, frameHeight: 32 });
    const actorFrame = sheet.gridFrame(0, 0);
    const particleFrame = sheet.gridFrame(5, 0);
    if (sheet.error !== null || actorFrame === null || particleFrame === null) {
      console.error(sheet.error || 'The sprite atlas is missing one of the required frames.');
      this.dispose();
      return;
    }

    const scene = new ScriptedActorScene(this, actorFrame, particleFrame);
    if (!this.scenes.changeTo(scene)) {
      console.error('Could not activate the scripted actor scene.');
      this.dispose();
    }
  }

  protected override loop(deltaTime: number): void {
    this.scenes.update(deltaTime);
  }

  protected override render(): void {
    this.renderer.clear(Colors.NAVY);
    super.render();
    this.renderer.drawText('The guest moves the player and bursts attached 2D particles.', new Vector2D(18, 18), 16, Colors.WHITE);
  }
}

new ScriptedActorGame().run();
