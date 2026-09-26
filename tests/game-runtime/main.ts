import { Game } from '../../src/core/game';
import { GameComponent } from '../../src/game/game-component';
import { GameObject } from '../../src/game/game-object';
import { GameScene } from '../../src/game/game-scene';

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

const game = new Game();
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

const scene = new GameScene(game);
const otherScene = new GameScene(game);
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

function expectEvents(actual: string[], expected: string[], label: string): void {
  if (actual.length !== expected.length) {
    expect(false, label + ' length');
    return;
  }
  for (let index = 0; index < expected.length; index++) {
    if (actual[index] !== expected[index]) {
      expect(false, label + ' order');
      return;
    }
  }
}

function clearEvents(log: string[]): void {
  log.length = 0;
}

function hasEvent(log: string[], label: string): boolean {
  for (let index = 0; index < log.length; index++) {
    if (log[index] === label) return true;
  }
  return false;
}

class LifecycleObject extends GameObject {
  readonly log: string[];
  awakeAction: (() => void) | null = null;
  action: (() => void) | null = null;

  constructor(name: string, log: string[]) {
    super({ name });
    this.log = log;
  }

  onAwake(): void {
    this.log.push(this.name + '.awake');
    const action = this.awakeAction;
    this.awakeAction = null;
    if (action !== null) action();
  }
  onStart(): void { this.log.push(this.name + '.start'); }
  update(_dt: number): void {
    this.log.push(this.name + '.update');
    const action = this.action;
    this.action = null;
    if (action !== null) action();
  }
  fixedUpdate(_dt: number): void { this.log.push(this.name + '.fixed'); }
  onDestroy(): void { this.log.push(this.name + '.destroy'); }
}

class LifecycleComponent extends GameComponent {
  readonly label: string;
  readonly log: string[];
  awakeAction: (() => void) | null = null;

  constructor(label: string, log: string[]) {
    super();
    this.label = label;
    this.log = log;
  }

  onAwake(): void {
    this.log.push(this.label + '.awake');
    const action = this.awakeAction;
    this.awakeAction = null;
    if (action !== null) action();
  }
  onStart(): void { this.log.push(this.label + '.start'); }
  update(_dt: number): void { this.log.push(this.label + '.update'); }
  fixedUpdate(_dt: number): void { this.log.push(this.label + '.fixed'); }
  onDestroy(): void { this.log.push(this.label + '.destroy'); }
}

const lifecycleEvents: string[] = [];
const lifecycleScene = new GameScene(game);
const lifecycleParent = new LifecycleObject('parent', lifecycleEvents);
const lifecycleParentComponent = new LifecycleComponent('parent-component', lifecycleEvents);
const lifecycleChild = new LifecycleObject('child', lifecycleEvents);
const lifecycleChildComponent = new LifecycleComponent('child-component', lifecycleEvents);
lifecycleParent.addComponent(lifecycleParentComponent);
lifecycleParent.addChild(lifecycleChild, { preserveWorldTransform: false });
lifecycleChild.addComponent(lifecycleChildComponent);
expect(lifecycleScene.add(lifecycleParent) === lifecycleParent,
  'scene accepts a live hierarchy root');
expectEvents(lifecycleEvents, [
  'parent.awake', 'parent-component.awake', 'child.awake', 'child-component.awake',
], 'scene attachment awakens parent before components and children');

const childAwakeEvents: string[] = [];
const childAwakeScene = new GameScene(game);
const childAwakeRoot = new LifecycleObject('awake-root', childAwakeEvents);
const firstAwakeChild = new LifecycleObject('first-child', childAwakeEvents);
const secondAwakeChild = new LifecycleObject('second-child', childAwakeEvents);
const addedAwakeChild = new LifecycleObject('added-child', childAwakeEvents);
firstAwakeChild.awakeAction = () => {
  expect(childAwakeRoot.addChild(addedAwakeChild, { preserveWorldTransform: false }) === addedAwakeChild,
    'onAwake can attach another child');
};
childAwakeRoot.addChild(firstAwakeChild, { preserveWorldTransform: false });
childAwakeRoot.addChild(secondAwakeChild, { preserveWorldTransform: false });
childAwakeScene.add(childAwakeRoot);
expectEvents(childAwakeEvents, [
  'awake-root.awake', 'first-child.awake', 'second-child.awake', 'added-child.awake',
], 'children added during onAwake awaken in child attachment order');

const componentAwakeEvents: string[] = [];
const componentAwakeScene = new GameScene(game);
const componentAwakeObject = new LifecycleObject('component-owner', componentAwakeEvents);
const firstAwakeComponent = new LifecycleComponent('first-component', componentAwakeEvents);
const secondAwakeComponent = new LifecycleComponent('second-component', componentAwakeEvents);
const addedAwakeComponent = new LifecycleComponent('added-component', componentAwakeEvents);
firstAwakeComponent.awakeAction = () => {
  expect(componentAwakeObject.addComponent(addedAwakeComponent) === addedAwakeComponent,
    'onAwake can attach another component');
};
componentAwakeObject.addComponent(firstAwakeComponent);
componentAwakeObject.addComponent(secondAwakeComponent);
componentAwakeScene.add(componentAwakeObject);
expectEvents(componentAwakeEvents, [
  'component-owner.awake', 'first-component.awake',
  'second-component.awake', 'added-component.awake',
], 'components added during onAwake awaken in attachment order');

clearEvents(lifecycleEvents);
lifecycleScene.updateFixed(0.25);
expectEvents(lifecycleEvents, [
  'parent.fixed', 'parent-component.fixed', 'child.fixed', 'child-component.fixed',
], 'fixed update dispatches without starting objects');

clearEvents(lifecycleEvents);
lifecycleScene.update(0.5);
expectEvents(lifecycleEvents, [
  'parent.start', 'parent.update', 'parent-component.start', 'parent-component.update',
  'child.start', 'child.update', 'child-component.start', 'child-component.update',
], 'regular lifecycle starts each instance immediately before its first update');

clearEvents(lifecycleEvents);
const lateComponent = new LifecycleComponent('late-component', lifecycleEvents);
expect(lifecycleParent.addComponent(lateComponent) === lateComponent,
  'started object accepts a late component');
expectEvents(lifecycleEvents, ['late-component.awake'],
  'component onAwake runs immediately when attached to an awake object');
clearEvents(lifecycleEvents);
lifecycleScene.update(0.5);
expectEvents(lifecycleEvents, [
  'parent.update', 'parent-component.update', 'late-component.start',
  'late-component.update', 'child.update', 'child-component.update',
], 'late component starts immediately before its first eligible update');

const activationEvents: string[] = [];
const activationScene = new GameScene(game);
const inactiveObject = new LifecycleObject('inactive', activationEvents);
const disabledComponent = new LifecycleComponent('disabled-component', activationEvents);
inactiveObject.active = false;
disabledComponent.enabled = false;
inactiveObject.addComponent(disabledComponent);
activationScene.add(inactiveObject);
expectEvents(activationEvents, ['inactive.awake', 'disabled-component.awake'],
  'inactive objects still receive awake on scene attachment');
clearEvents(activationEvents);
activationScene.update(0.5);
activationScene.updateFixed(0.25);
expectEvents(activationEvents, [], 'inactive objects receive no update callbacks');
inactiveObject.active = true;
activationScene.update(0.5);
expectEvents(activationEvents, ['inactive.start', 'inactive.update'],
  'disabled components wait while their active object starts');
disabledComponent.enabled = true;
clearEvents(activationEvents);
activationScene.update(0.5);
expectEvents(activationEvents, [
  'inactive.update', 'disabled-component.start', 'disabled-component.update',
], 'enabled component starts when it first becomes eligible');

const addedDuringUpdateEvents: string[] = [];
const addedDuringUpdateScene = new GameScene(game);
const addingObject = new LifecycleObject('adding', addedDuringUpdateEvents);
let addedObject: LifecycleObject | null = null;
addingObject.action = () => {
  addedObject = new LifecycleObject('added', addedDuringUpdateEvents);
  addedDuringUpdateScene.add(addedObject);
};
addedDuringUpdateScene.add(addingObject);
clearEvents(addedDuringUpdateEvents);
addedDuringUpdateScene.update(0.5);
expect(addedObject !== null && hasEvent(addedDuringUpdateEvents, 'added.awake') &&
  !hasEvent(addedDuringUpdateEvents, 'added.update'),
  'object added during update awakens immediately but waits for the next snapshot');
clearEvents(addedDuringUpdateEvents);
addedDuringUpdateScene.update(0.5);
expect(hasEvent(addedDuringUpdateEvents, 'added.update'),
  'object added during a phase updates on the next phase');

const lateComponentEvents: string[] = [];
const lateComponentScene = new GameScene(game);
const componentAddingObject = new LifecycleObject('component-adder', lateComponentEvents);
const componentLaterObject = new LifecycleObject('component-later', lateComponentEvents);
let componentAddedDuringUpdate: LifecycleComponent | null = null;
componentAddingObject.action = () => {
  componentAddedDuringUpdate = new LifecycleComponent('added-component', lateComponentEvents);
  componentLaterObject.addComponent(componentAddedDuringUpdate);
};
lateComponentScene.add(componentAddingObject);
lateComponentScene.add(componentLaterObject);
clearEvents(lateComponentEvents);
lateComponentScene.update(0.5);
expect(hasEvent(lateComponentEvents, 'added-component.awake') &&
  !hasEvent(lateComponentEvents, 'added-component.update'),
  'component added to a later object waits outside the current component snapshot');
clearEvents(lateComponentEvents);
lateComponentScene.update(0.5);
expect(hasEvent(lateComponentEvents, 'added-component.update'),
  'late component updates on the following phase');

const removalEvents: string[] = [];
const removalScene = new GameScene(game);
const removingObject = new LifecycleObject('remover', removalEvents);
const removedLaterObject = new LifecycleObject('removed-later', removalEvents);
removingObject.action = () => { removalScene.remove(removedLaterObject); };
removalScene.add(removingObject);
removalScene.add(removedLaterObject);
clearEvents(removalEvents);
removalScene.update(0.5);
expect(!hasEvent(removalEvents, 'removed-later.update'),
  'removed later object is skipped from the active update snapshot');

const selfDestroyEvents: string[] = [];
const selfDestroyScene = new GameScene(game);
const selfDestroying = new LifecycleObject('self-destroying', selfDestroyEvents);
const selfDestroyingComponent = new LifecycleComponent('self-component', selfDestroyEvents);
selfDestroying.addComponent(selfDestroyingComponent);
selfDestroying.action = () => {
  expect(selfDestroying.destroy(), 'first destroy call succeeds');
  expect(!selfDestroying.destroy(), 'repeated destroy call is idempotent');
};
selfDestroyScene.add(selfDestroying);
clearEvents(selfDestroyEvents);
selfDestroyScene.update(0.5);
expectEvents(selfDestroyEvents, [
  'self-destroying.start', 'self-destroying.update',
  'self-destroying.destroy', 'self-component.destroy',
], 'self destruction suppresses later component callbacks in the phase');

const ancestorDestroyEvents: string[] = [];
const ancestorDestroyScene = new GameScene(game);
const destroyingParent = new LifecycleObject('destroying-parent', ancestorDestroyEvents);
const destroyedChild = new LifecycleObject('destroyed-child', ancestorDestroyEvents);
destroyingParent.addChild(destroyedChild, { preserveWorldTransform: false });
destroyingParent.action = () => { destroyingParent.destroy(); };
ancestorDestroyScene.add(destroyingParent);
clearEvents(ancestorDestroyEvents);
ancestorDestroyScene.update(0.5);
expectEvents(ancestorDestroyEvents, [
  'destroying-parent.start', 'destroying-parent.update',
  'destroyed-child.destroy', 'destroying-parent.destroy',
], 'destroying a parent suppresses later child callbacks in the phase');

const readdEvents: string[] = [];
const readdScene = new GameScene(game);
const readdingObject = new LifecycleObject('readding', readdEvents);
const readdedLaterObject = new LifecycleObject('readded-later', readdEvents);
readdingObject.action = () => {
  readdScene.remove(readdedLaterObject);
  readdScene.add(readdedLaterObject);
};
readdScene.add(readdingObject);
readdScene.add(readdedLaterObject);
clearEvents(readdEvents);
readdScene.update(0.5);
expect(!hasEvent(readdEvents, 'readded-later.update') &&
  !hasEvent(readdEvents, 'readded-later.awake'),
  'remove and re-add invalidates the old snapshot without repeating onAwake');
clearEvents(readdEvents);
readdScene.update(0.5);
expect(hasEvent(readdEvents, 'readded-later.update'),
  're-added object updates in the next phase');

const disableEvents: string[] = [];
const disableScene = new GameScene(game);
const disablingParent = new LifecycleObject('disabling-parent', disableEvents);
const disabledChild = new LifecycleObject('disabled-child', disableEvents);
const disabledDuringPhase = new LifecycleComponent('disabled-during-phase', disableEvents);
disablingParent.addComponent(disabledDuringPhase);
disablingParent.addChild(disabledChild, { preserveWorldTransform: false });
disablingParent.action = () => {
  disablingParent.active = false;
  disabledDuringPhase.enabled = false;
};
disableScene.add(disablingParent);
clearEvents(disableEvents);
disableScene.update(0.5);
expectEvents(disableEvents, ['disabling-parent.start', 'disabling-parent.update'],
  'activation and enabled state are rechecked before each callback');

const destructionEvents: string[] = [];
const destructionScene = new GameScene(game);
class DestructionOrderComponent extends GameComponent {
  readonly label: string;
  readonly expectedOwner: GameObject;
  readonly log: string[];

  constructor(label: string, expectedOwner: GameObject, log: string[]) {
    super();
    this.label = label;
    this.expectedOwner = expectedOwner;
    this.log = log;
  }

  onDestroy(): void {
    this.log.push(this.label + '.destroy');
    expect(this.gameObject === this.expectedOwner,
      this.label + ' keeps its owner through onDestroy');
    const attachedAtDestroy = this.expectedOwner.getComponents(DestructionOrderComponent);
    let found = false;
    for (let index = 0; index < attachedAtDestroy.length; index++) {
      if (attachedAtDestroy[index] === this) found = true;
    }
    expect(found, this.label + ' remains queryable through onDestroy');
  }
}
class DestructionOrderObject extends GameObject {
  readonly log: string[];
  readonly expectedParent: GameObject | null;

  constructor(name: string, log: string[], expectedParent: GameObject | null = null) {
    super({ name });
    this.log = log;
    this.expectedParent = expectedParent;
  }

  onDestroy(): void {
    this.log.push(this.name + '.destroy');
    expect(this.parent === this.expectedParent,
      this.name + ' retains its parent through onDestroy');
    expect(this.scene === destructionScene,
      this.name + ' retains its scene through onDestroy');
    if (this.name === 'destroy-parent') {
      expect(this.children.length === 0,
        'destroyed parent has no children after child hooks finish');
      expect(this.getComponents(DestructionOrderComponent).length === 2,
        'components remain queryable during GameObject.onDestroy');
    }
  }
}
const destructionParent = new DestructionOrderObject('destroy-parent', destructionEvents);
const destructionChild = new DestructionOrderObject(
  'destroy-child', destructionEvents, destructionParent);
const parentComponentOne = new DestructionOrderComponent(
  'parent-component-one', destructionParent, destructionEvents);
const parentComponentTwo = new DestructionOrderComponent(
  'parent-component-two', destructionParent, destructionEvents);
const childDestructionComponent = new DestructionOrderComponent(
  'child-component', destructionChild, destructionEvents);
destructionParent.addComponent(parentComponentOne);
destructionParent.addComponent(parentComponentTwo);
destructionParent.addChild(destructionChild, { preserveWorldTransform: false });
destructionChild.addComponent(childDestructionComponent);
destructionScene.add(destructionParent);
expect(destructionParent.destroy(), 'live hierarchy can be destroyed synchronously');
expectEvents(destructionEvents, [
  'destroy-child.destroy', 'child-component.destroy', 'destroy-parent.destroy',
  'parent-component-two.destroy', 'parent-component-one.destroy',
], 'destruction runs child-first and components in reverse attachment order');
expect(destructionParent.destroyed && destructionChild.destroyed &&
  destructionParent.scene === null && destructionParent.parent === null &&
  destructionParent.children.length === 0,
  'destroyed hierarchy clears scene and parent links after callbacks');
expect(destructionParent.getComponents(DestructionOrderComponent).length === 0 &&
  parentComponentOne.gameObject === null && destructionScene.objects.length === 0,
  'destroyed components detach and scene membership is removed');

const sceneDestroyEvents: string[] = [];
const sceneToDestroy = new GameScene(game);
const firstDestroyRoot = new LifecycleObject('first-root', sceneDestroyEvents);
const destroyRootChild = new LifecycleObject('root-child', sceneDestroyEvents);
const secondDestroyRoot = new LifecycleObject('second-root', sceneDestroyEvents);
firstDestroyRoot.addChild(destroyRootChild, { preserveWorldTransform: false });
sceneToDestroy.add(firstDestroyRoot);
sceneToDestroy.add(secondDestroyRoot);
clearEvents(sceneDestroyEvents);
sceneToDestroy.destroy();
expectEvents(sceneDestroyEvents, [
  'root-child.destroy', 'first-root.destroy', 'second-root.destroy',
], 'scene destruction visits roots in insertion order and destroys children first');
expect(firstDestroyRoot.destroyed && destroyRootChild.destroyed &&
  secondDestroyRoot.destroyed && sceneToDestroy.objects.length === 0 &&
  sceneToDestroy.add(new GameObject()) === null,
  'destroyed scene destroys its roots and rejects future additions');
sceneToDestroy.destroy();

const shearRemovalScene = new GameScene(game);
const shearRemovalParent = new GameObject({ scale: { x: 2, y: 1, z: 1 } });
const shearRemovalChild = new GameObject({
  rotation: { x: 0, y: 0, z: 0.38268343, w: 0.9238795 },
});
shearRemovalParent.addChild(shearRemovalChild, { preserveWorldTransform: false });
shearRemovalScene.add(shearRemovalParent);
expect(!shearRemovalScene.remove(shearRemovalChild) &&
  shearRemovalChild.scene === shearRemovalScene &&
  shearRemovalChild.parent === shearRemovalParent &&
  shearRemovalParent.children[0] === shearRemovalChild,
  'scene removal preserves ownership when world transform cannot become local TRS');

game.dispose();
