import { GameComponent, GameObject } from '../../src/game';

function expect(value: boolean, label: string): void {
  if (!value) {
    console.error('FAIL: ' + label);
    process.exit(1);
  }
}

class Player extends GameObject {
  constructor(name: string) {
    super({ name });
  }
}

class Health extends GameComponent {
  value = 100;
}

class Armor extends Health {
  points = 50;
}

const player = new Player('Player');
const health = new Health();
const secondHealth = new Health();
const armor = new Armor();

expect(player.name === 'Player', 'subclass constructor forwards options');
expect(player.active, 'objects are active by default');
expect(player.activeInHierarchy, 'unattached root reports local activation');
expect(player.scene === null && player.parent === null, 'new object is unattached');
expect(player.children.length === 0, 'new object has no children');
expect(player.addComponent(health) === health, 'addComponent returns same component');
expect(player.addComponent(secondHealth) === secondHealth, 'duplicate component type is allowed');
expect(player.addComponent(armor) === armor, 'subclass component is allowed');
expect(player.getComponent(Health) === health, 'getComponent returns first matching component');
expect(player.getComponents(Health).length === 3, 'getComponents includes derived component types');
expect(player.getComponents(GameComponent).length === 3, 'base lookup finds every component');
expect(health.gameObject === player, 'component reports its owner');
expect(health.enabled && !health.destroyed, 'components start enabled and alive');
expect(player.id !== new GameObject().id, 'runtime identities are distinct');

const other = new GameObject();
expect(other.addComponent(health) === null, 'one component cannot have two owners');

const inputPosition = { x: 4, y: 5, z: 6 };
const positioned = new GameObject({ position: inputPosition, active: false });
inputPosition.x = 99;
expect(positioned.transform.position.x === 4, 'object copies constructor transform options');
expect(!positioned.active && !positioned.activeInHierarchy, 'inactive option is respected');

class DestructionProbe extends GameComponent {
  destroyedCount = 0;
  retainedOwnerDuringDestroy = false;

  onDestroy(): void {
    this.destroyedCount++;
    this.retainedOwnerDuringDestroy = this.gameObject !== null;
  }
}

const removableObject = new GameObject();
const removable = new DestructionProbe();
removableObject.addComponent(removable);
expect(removableObject.removeComponent(removable), 'owned component can be removed');
expect(removable.destroyedCount === 1 && removable.destroyed,
  'component removal destroys exactly once');
expect(removable.retainedOwnerDuringDestroy,
  'component keeps owner during its destruction callback');
expect(removable.gameObject === null, 'removed component releases its owner');
expect(!removableObject.removeComponent(removable), 'removed component cannot be removed twice');
