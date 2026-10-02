import { GameContext, bindGameContext } from '../../src/core/context';
import type { Game } from '../../src/core/game';
import type { Renderer } from '../../src/core/renderer';
import type { Camera2D } from '../../src/core/types';
import { GameComponent } from '../../src/game/game-component';
import { GameObject } from '../../src/game/game-object';
import { GameScene } from '../../src/game/game-scene';
import { Scene } from '../../src/game/scene';
import { SceneManager } from '../../src/game/scene-manager';

function expect(value: boolean, label: string): void {
  if (!value) {
    console.error('FAIL: ' + label);
    process.exit(1);
  }
}

const game = {} as Game;
const context = GameContext.create();
if (context === null) {
  console.error('FAIL: test Game context is available');
  process.exit(1);
}
bindGameContext(game, context);
const manager = new SceneManager(game);
const renderEvents: string[] = [];

class RenderProbe extends GameComponent {
  readonly label: string;

  constructor(label: string, order = 0) {
    super();
    this.label = label;
    this.renderOrder = order;
  }

  render(_renderer: Renderer): void {
    renderEvents.push(this.label);
  }
}

const scene = new GameScene(game);
const first = new GameObject();
const second = new GameObject();
first.addComponent(new RenderProbe('first-high', 5));
first.addComponent(new RenderProbe('first-low', -1));
first.addComponent(new RenderProbe('first-tie', 5));
second.addComponent(new RenderProbe('second-tie', 5));
scene.add(first);
scene.add(second);

const disabled = new RenderProbe('disabled', 0);
disabled.enabled = false;
first.addComponent(disabled);
const inactiveOwner = new GameObject({ active: false });
inactiveOwner.addComponent(new RenderProbe('inactive-owner', -10));
scene.add(inactiveOwner);
const removedOwner = new GameObject();
removedOwner.addComponent(new RenderProbe('removed-owner', -20));
scene.add(removedOwner);
scene.remove(removedOwner);
const removedComponent = new RenderProbe('removed-component', -30);
first.addComponent(removedComponent);
first.removeComponent(removedComponent);

const camera: Camera2D = {
  offset: { x: 12, y: 34 },
  target: { x: 2, y: 3 },
  rotation: 15,
  zoom: 2,
};
const cameraEvents: string[] = [];
const renderer = {
  _beginSceneRender(): void {},
  begin2D(value: Camera2D): boolean {
    cameraEvents.push(value === camera ? 'begin' : 'wrong-camera');
    return true;
  },
  end2D(): boolean {
    cameraEvents.push('end');
    return true;
  },
} as any as Renderer;

scene.render(renderer, camera);
expect(renderEvents.join(',') === 'first-low,first-high,first-tie,second-tie',
  'scene renders enabled attached components in renderOrder with stable ties: ' + renderEvents.join(','));
expect(cameraEvents.join(',') === 'begin,end', 'scene wraps camera rendering in begin2D/end2D');

const managed = new Scene(game);
const managedProbe = new RenderProbe('managed');
const managedObject = new GameObject();
managedObject.addComponent(managedProbe);
managed.addNode(managedObject);
expect(manager.changeTo(managed), 'manager activates the scene');
manager.render(renderer);
expect(renderEvents[renderEvents.length - 1] === 'managed', 'manager renders its active scene');
const lateManaged = new GameObject();
lateManaged.addComponent(new RenderProbe('managed-late'));
expect(managed.addNode(lateManaged) === lateManaged, 'active scene accepts a late visual object');
manager.render(renderer);
expect(renderEvents[renderEvents.length - 1] === 'managed-late',
  'manager renders objects attached after scene activation');
expect(manager.pause(), 'manager pauses the scene');
manager.render(renderer);
expect(renderEvents[renderEvents.length - 1] === 'managed', 'manager continues rendering its paused scene');

console.log('PASS: scene component rendering');
