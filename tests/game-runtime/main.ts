import { GameComponent, GameObject, GameScene } from '../../src/game';

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

const localRoot = new GameObject({ position: { x: 10, y: 0, z: 0 } });
const localChild = new GameObject({ position: { x: 2, y: 0, z: 0 } });
expect(localRoot.addChild(localChild, { preserveWorldTransform: false }) === localChild,
  'unattached objects can be parented');
expect(localChild.parent === localRoot && localRoot.children[0] === localChild,
  'parent and child views stay in sync');
expect(localChild.transform.position.x === 2 && localChild.transform.worldPosition.x === 12,
  'preserve-local keeps the child local transform');
expect(localRoot.removeChild(localChild), 'removeChild detaches an owned child');
expect(localChild.parent === null && localChild.transform.worldPosition.x === 12,
  'removeChild preserves world transform by default');

const scene = new GameScene();
const otherScene = new GameScene();
const left = new GameObject({ position: { x: 5, y: 0, z: 0 } });
const right = new GameObject({ position: { x: 20, y: 0, z: 0 } });
const sceneChild = new GameObject({ position: { x: 2, y: 0, z: 0 } });
expect(scene.add(left) === left && scene.add(right) === right && scene.add(sceneChild) === sceneChild,
  'scene accepts unattached root objects');
const originalSceneOrder = scene.objects.slice();
const childWorldX = sceneChild.transform.worldPosition.x;
expect(right.addChild(sceneChild) === sceneChild, 'same-scene reparent succeeds');
expect(sceneChild.transform.worldPosition.x === childWorldX,
  'default reparent preserves world position');
expect(sceneChild.scene === scene, 'same-scene reparent preserves ownership');
expect(scene.objects[0] === originalSceneOrder[0] &&
  scene.objects[1] === originalSceneOrder[1] &&
  scene.objects[2] === originalSceneOrder[2],
  'same-scene reparent preserves insertion order');
expect(left.children.length === 0 && right.children[0] === sceneChild,
  'same-scene reparent updates both child lists');

const sceneSnapshot = scene.objects;
sceneSnapshot.pop();
const childrenSnapshot = right.children;
childrenSnapshot.pop();
expect(scene.objects.length === 3 && right.children.length === 1,
  'scene and child collections return snapshots');
expect(left.addChild(sceneChild) === sceneChild && sceneChild.transform.worldPosition.x === childWorldX,
  'same-scene objects can be reparented while preserving world transform');

const attachedElsewhere = new GameObject();
expect(otherScene.add(attachedElsewhere) === attachedElsewhere,
  'second scene accepts its own root');
expect(left.addChild(attachedElsewhere) === null && attachedElsewhere.scene === otherScene,
  'cross-scene parenting is rejected without changing ownership');
const unattachedParent = new GameObject();
expect(unattachedParent.addChild(sceneChild) === null && sceneChild.parent === left,
  'unattached parent cannot take an attached child');
expect(sceneChild.addChild(sceneChild) === null,
  'an object cannot parent itself');
expect(sceneChild.addChild(left) === null && left.parent === null,
  'ancestor cycles are rejected');

const middle = new GameObject();
const leaf = new GameObject();
expect(left.addChild(middle, { preserveWorldTransform: false }) === middle,
  'attached parent adopts an unattached subtree');
expect(middle.addChild(leaf, { preserveWorldTransform: false }) === leaf &&
  leaf.scene === scene, 'scene ownership propagates through descendants');
expect(scene.remove(middle), 'scene can remove a descendant subtree');
expect(middle.scene === null && leaf.scene === null && leaf.parent === middle,
  'removing a subtree clears scene ownership and preserves internal links');
expect(scene.add(middle) === middle && middle.scene === scene && leaf.scene === scene,
  'removed subtree can be attached to a scene again');
const removedAgain = scene.remove(middle);
const readdedAgain = scene.add(middle);
expect(removedAgain && readdedAgain === middle,
  'scene removal and re-addition succeeds');
expect(scene.objects[scene.objects.length - 2] === middle &&
  scene.objects[scene.objects.length - 1] === leaf,
  're-added subtree is appended in parent-first order');

const singularParent = new GameObject({ scale: { x: 0, y: 1, z: 1 } });
const singularChild = new GameObject({ position: { x: 3, y: 4, z: 5 } });
expect(singularParent.addChild(singularChild) === null && singularChild.parent === null &&
  singularParent.children.length === 0 && singularChild.transform.position.x === 3,
  'singular preserve-world reparent fails atomically');

const scaledParent = new GameObject({ scale: { x: 2, y: 1, z: 1 } });
const rotatedChild = new GameObject({
  position: { x: 3, y: 4, z: 5 },
  rotation: { x: 0, y: 0, z: 0.38268343, w: 0.9238795 },
});
expect(scaledParent.addChild(rotatedChild) === null && rotatedChild.parent === null &&
  scaledParent.children.length === 0 && rotatedChild.transform.position.x === 3,
  'shear-producing preserve-world reparent fails atomically');

expect(scene.remove(sceneChild), 'scene removes a root or parented object');
expect(sceneChild.scene === null && sceneChild.parent === null,
  'scene removal unparents its root and clears subtree ownership');
expect(scene.add(sceneChild) === sceneChild && scene.objects[scene.objects.length - 1] === sceneChild,
  'removed object receives a new insertion position when re-added');
