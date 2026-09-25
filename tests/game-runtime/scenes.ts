import { GameComponent } from '../../src/game/game-component';
import { GameObject } from '../../src/game/game-object';
import { Scene } from '../../src/game/scene';

function expect(value: boolean, label: string): void {
  if (!value) { console.error('FAIL: ' + label); process.exit(1); }
}
const events: string[] = [];
class ComponentProbe extends GameComponent {
  onDestroy(): void { events.push('component'); }
}
class ObjectProbe extends GameObject {
  onAwake(): void { events.push('awake'); }
  onDestroy(): void { events.push('object'); }
}
class ResourceProbe {
  constructor(private readonly name: string) {}
  dispose(): void { events.push(`dispose:${this.name}`); }
}
class ProbeScene extends Scene {
  onUnload(): void { events.push('unload'); }
}
const scene = new ProbeScene({ name: 'test' });
const actor = new ObjectProbe();
actor.addComponent(new ComponentProbe());
scene.addNode(actor);
const firstResource = new ResourceProbe('first');
scene.own(firstResource);
scene.own(new ResourceProbe('second'));
expect(new Scene().own(firstResource) === null, 'a resource cannot belong to two scenes');
expect(scene.unload(), 'ready scene unloads');
scene.unload();
expect(events.join(',') === 'awake,unload,object,component,dispose:second,dispose:first',
  'cleanup order is stable and idempotent');
const destroyAlias = new Scene();
destroyAlias.destroy();
expect(destroyAlias.state === 'unloaded', 'destroy uses the same terminal cleanup path');
