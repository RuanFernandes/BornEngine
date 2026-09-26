import { GameComponent } from './game-component';
import { GameObject } from './game-object';
import type { ContextReference, GameContext, ContextResource } from '../core/context';
import { resolveContext } from '../core/context';
import type { PhysicsWorld } from '../physics';

function removeAt<T>(values: T[], index: number): void {
  for (let current = index; current + 1 < values.length; current++) {
    values[current] = values[current + 1];
  }
  values.pop();
}

export class GameScene implements ContextResource {
  readonly context: GameContext;
  private sceneObjects: GameObject[] = [];
  private pendingAwakeRoots: GameObject[] = [];
  private isAwakening = false;
  private nextAttachmentGeneration = 1;
  private wasDestroyed = false;

  constructor(owner: ContextReference) {
    this.context = resolveContext(owner);
    this.context.register(this);
  }

  get objects(): readonly GameObject[] {
    return this.sceneObjects.slice();
  }

  add<T extends GameObject>(object: T): T | null {
    if (this.wasDestroyed || object.destroyed || object.scene !== null || object.parent !== null ||
        !this._canAttachSubtree(object)) {
      return null;
    }
    return this._attachSubtree(object) ? object : null;
  }

  remove(object: GameObject): boolean {
    if (this.wasDestroyed || object.destroyed || object.scene !== this) return false;
    if (object.parent !== null && !object.parent.removeChild(object)) return false;

    const subtree = this._collectSubtree(object);
    for (let index = this.sceneObjects.length - 1; index >= 0; index--) {
      if (subtree.indexOf(this.sceneObjects[index]) >= 0) {
        removeAt(this.sceneObjects, index);
      }
    }
    for (let index = 0; index < subtree.length; index++) {
      subtree[index]._setScene(null);
    }
    this._syncSubtreeAdapters(object);
    return true;
  }

  update(dt: number): void {
    if (this.wasDestroyed) return;
    const objects = this.sceneObjects.slice();
    const generations: number[] = [];
    const componentSnapshots: GameComponent[][] = [];
    for (let index = 0; index < objects.length; index++) {
      generations.push(objects[index]._getAttachmentGeneration());
      componentSnapshots.push(objects[index]._componentsSnapshot());
    }

    for (let objectIndex = 0; objectIndex < objects.length; objectIndex++) {
      const object = objects[objectIndex];
      const generation = generations[objectIndex];
      if (!this._isEligibleObject(object, generation)) continue;

      if (object._markStarted()) {
        const dynamicObject: any = object;
        dynamicObject.onStart();
      }
      if (this._isEligibleObject(object, generation)) {
        const dynamicObject: any = object;
        dynamicObject.update(dt);
      }

      const components = componentSnapshots[objectIndex];
      for (let componentIndex = 0; componentIndex < components.length; componentIndex++) {
        const component = components[componentIndex];
        if (!this._isEligibleComponent(object, component, generation)) continue;
        if (component._markStarted()) {
          const dynamicComponent: any = component;
          dynamicComponent.onStart();
        }
        if (this._isEligibleComponent(object, component, generation)) {
          const dynamicComponent: any = component;
          dynamicComponent.update(dt);
        }
      }
    }
    this._syncRuntimeAdapters();
  }

  updateFixed(fixedDt: number): void {
    if (this.wasDestroyed) return;
    const objects = this.sceneObjects.slice();
    const generations: number[] = [];
    const componentSnapshots: GameComponent[][] = [];
    for (let index = 0; index < objects.length; index++) {
      generations.push(objects[index]._getAttachmentGeneration());
      componentSnapshots.push(objects[index]._componentsSnapshot());
    }

    for (let objectIndex = 0; objectIndex < objects.length; objectIndex++) {
      const object = objects[objectIndex];
      const generation = generations[objectIndex];
      if (!this._isEligibleObject(object, generation)) continue;

      const dynamicObject: any = object;
      dynamicObject.fixedUpdate(fixedDt);

      const components = componentSnapshots[objectIndex];
      for (let componentIndex = 0; componentIndex < components.length; componentIndex++) {
        const component = components[componentIndex];
        if (!this._isEligibleComponent(object, component, generation)) continue;
        const dynamicComponent: any = component;
        dynamicComponent.fixedUpdate(fixedDt);
      }
    }
    this._syncRuntimeAdapters();
  }

  syncPhysicsBeforeStep(world: PhysicsWorld, fixedDt: number): void {
    if (this.wasDestroyed) return;
    const objects = this.sceneObjects.slice();
    for (let objectIndex = 0; objectIndex < objects.length; objectIndex++) {
      const object = objects[objectIndex];
      if (object.scene !== this || object.destroyed) continue;
      const components = object._componentsSnapshot();
      for (let componentIndex = 0; componentIndex < components.length; componentIndex++) {
        const component = components[componentIndex];
        if (component.gameObject !== object || component.destroyed) continue;
        const dynamicComponent: any = component;
        dynamicComponent._syncPhysicsBeforeStep(world, fixedDt);
      }
    }
  }

  syncPhysicsAfterStep(world: PhysicsWorld): void {
    if (this.wasDestroyed) return;
    const objects = this.sceneObjects.slice();
    for (let objectIndex = 0; objectIndex < objects.length; objectIndex++) {
      const object = objects[objectIndex];
      if (object.scene !== this || object.destroyed) continue;
      const components = object._componentsSnapshot();
      for (let componentIndex = 0; componentIndex < components.length; componentIndex++) {
        const component = components[componentIndex];
        if (component.gameObject !== object || component.destroyed) continue;
        const dynamicComponent: any = component;
        dynamicComponent._syncPhysicsAfterStep(world);
      }
    }
    this._syncRuntimeAdapters();
  }

  destroy(): void {
    if (this.wasDestroyed) return;
    this.wasDestroyed = true;
    const objects = this.sceneObjects.slice();
    for (let index = 0; index < objects.length; index++) {
      const object = objects[index];
      if (object.scene === this && object.parent === null) object.destroy();
    }
    this.context.unregister(this);
  }

  dispose(): void { this.destroy(); }

  /** @internal Validates a detached subtree before an atomic scene attachment. */
  _canAttachSubtree(root: GameObject): boolean {
    const subtree = this._collectSubtree(root);
    for (let index = 0; index < subtree.length; index++) {
      if (subtree[index].destroyed || subtree[index].scene !== null) return false;
      const components = subtree[index]._componentsSnapshot();
      for (let componentIndex = 0; componentIndex < components.length; componentIndex++) {
        if (!components[componentIndex]._canAttachTo(this.context)) return false;
      }
    }
    return true;
  }

  /** @internal Attaches a detached subtree in parent-first insertion order. */
  _attachSubtree(root: GameObject): boolean {
    if (this.wasDestroyed || !this._canAttachSubtree(root)) return false;
    const subtree = this._collectSubtree(root);
    for (let index = 0; index < subtree.length; index++) {
      const object = subtree[index];
      object._setScene(this);
      object._setAttachmentGeneration(this.nextAttachmentGeneration++);
      this.sceneObjects.push(object);
    }
    if (this.isAwakening) {
      this.pendingAwakeRoots.push(root);
    } else {
      this.isAwakening = true;
      this._awakenSubtree(root);
      let pendingIndex = 0;
      while (pendingIndex < this.pendingAwakeRoots.length) {
        this._awakenSubtree(this.pendingAwakeRoots[pendingIndex]);
        pendingIndex++;
      }
      this.pendingAwakeRoots.length = 0;
      this.isAwakening = false;
    }
    return true;
  }

  /** @internal Removes an object after all of its destruction callbacks return. */
  _removeDestroyedObject(object: GameObject): void {
    const index = this.sceneObjects.indexOf(object);
    if (index >= 0) removeAt(this.sceneObjects, index);
    object._setScene(null);
  }

  /** @internal Synchronizes renderer nodes in a detached hierarchy. */
  _syncSubtreeAdapters(root: GameObject): void {
    const subtree = this._collectSubtree(root);
    for (let index = 0; index < subtree.length; index++) {
      if (!subtree[index].destroyed) this._syncObjectAdapters(subtree[index]);
    }
  }

  private _awakenSubtree(object: GameObject): void {
    if (object.destroyed || object.scene !== this) return;
    object._beginAwakening();
    if (object._markAwake()) {
      const dynamicObject: any = object;
      dynamicObject.onAwake();
    }
    if (object.destroyed || object.scene !== this) {
      object._endAwakening();
      return;
    }

    this._awakenComponents(object);
    if (object.destroyed || object.scene !== this) {
      object._endAwakening();
      return;
    }

    const children = object._childrenSnapshot();
    for (let index = 0; index < children.length; index++) {
      this._awakenSubtree(children[index]);
    }
    if (!object.destroyed && object.scene === this) {
      this._awakenComponents(object);
    }
    object._endAwakening();
  }

  private _awakenComponents(object: GameObject): void {
    while (!object.destroyed && object.scene === this) {
      const components = object._componentsSnapshot();
      let next: GameComponent | null = null;
      for (let index = 0; index < components.length; index++) {
        const component = components[index];
        if (component.gameObject !== object || component.destroyed) continue;
        if (component._markAwake()) {
          next = component;
          break;
        }
      }
      if (next === null) return;
      const dynamicComponent: any = next;
      dynamicComponent.onAwake();
    }
  }

  private _isEligibleObject(object: GameObject, generation: number): boolean {
    return object.scene === this && !object.destroyed &&
      object._getAttachmentGeneration() === generation && object.activeInHierarchy;
  }

  private _isEligibleComponent(
    object: GameObject,
    component: GameComponent,
    generation: number,
  ): boolean {
    return this._isEligibleObject(object, generation) &&
      component.gameObject === object && !component.destroyed && component.enabled &&
      object.activeInHierarchy;
  }

  private _syncRuntimeAdapters(): void {
    for (let index = 0; index < this.sceneObjects.length; index++) {
      const object = this.sceneObjects[index];
      if (!object.destroyed && object.scene === this) {
        this._syncObjectAdapters(object);
      }
    }
  }

  private _syncObjectAdapters(object: GameObject): void {
    const components = object._componentsSnapshot();
    for (let index = 0; index < components.length; index++) {
      const component = components[index];
      if (component.gameObject !== object || component.destroyed) continue;
      const dynamicComponent: any = component;
      dynamicComponent._syncRuntimeAfterPhase();
    }
  }

  private _collectSubtree(root: GameObject): GameObject[] {
    const result: GameObject[] = [];
    const visit = (object: GameObject): void => {
      result.push(object);
      const children = object._childrenSnapshot();
      for (let index = 0; index < children.length; index++) {
        visit(children[index]);
      }
    };
    visit(root);
    return result;
  }
}
