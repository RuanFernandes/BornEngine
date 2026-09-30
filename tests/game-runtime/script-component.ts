import {
  Game,
  GameObject,
  GameScene,
  ScriptComponent,
} from '../../src/index';
import type { ScriptContext, ScriptPermission } from '../../src/index';

const permissions: ScriptPermission[] = [
  'log',
  'self.read',
  'self.transform.write',
  'self.particles.emit',
];

const guestModule = `export default {
  onStart(ctx) {
    ctx.log('script started');
  },
  update(ctx, deltaTime) {
    ctx.self.moveBy(deltaTime, 0, 0);
  },
  onDestroy(ctx) {
    ctx.log('script stopped');
  },
}`;

const unprivilegedContext: ScriptContext = { self: {} };

export function readUnprivilegedContext(): string {
  return unprivilegedContext.self.id || 'anonymous';
}

export class ScriptedActorGame extends Game {
  actor: GameObject | null = null;
  behavior: ScriptComponent | null = null;

  protected override onStart(): void {
    const scene = new GameScene(this);
    const actor = new GameObject({ name: 'Scripted actor' });
    const behavior = new ScriptComponent(this.scripting, guestModule, {
      permissions,
    });

    if (actor.addComponent(behavior) === null) return;
    if (scene.add(actor) === null) return;

    this.actor = actor;
    this.behavior = behavior;
  }
}

export function createScriptedActorGame(): ScriptedActorGame {
  return new ScriptedActorGame();
}
