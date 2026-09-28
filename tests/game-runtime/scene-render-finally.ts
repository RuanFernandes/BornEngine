import { GameContext, bindGameContext } from '../../src/core/context';
import type { Game } from '../../src/core/game';
import type { Renderer } from '../../src/core/renderer';
import type { Camera2D } from '../../src/core/types';
import { GameComponent } from '../../src/game/game-component';
import { GameObject } from '../../src/game/game-object';
import { GameScene } from '../../src/game/game-scene';

const owner = {} as Game;
const context = GameContext.create();
if (context === null) throw new Error('Expected an available test Game context.');
bindGameContext(owner, context);

const calls: string[] = [];
const camera: Camera2D = {
  offset: { x: 0, y: 0 },
  target: { x: 0, y: 0 },
  rotation: 0,
  zoom: 1,
};
const renderer = {
  begin2D(): boolean { calls.push('begin'); return true; },
  end2D(): boolean { calls.push('end'); return true; },
} as any as Renderer;

class FailingRenderer extends GameComponent {
  render(): void { throw new Error('render failure'); }
}

const scene = new GameScene(owner);
const object = new GameObject();
object.addComponent(new FailingRenderer());
scene.add(object);

let caught = false;
try {
  scene.render(renderer, camera);
} catch (_error) {
  caught = true;
}

if (!caught || calls.join(',') !== 'begin,end') {
  throw new Error('Camera mode must close after a render callback throws.');
}
console.log('PASS: scene camera cleanup after render failure');
