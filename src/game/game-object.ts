import { Vec3, Quat } from '../core/types';
import { mat4Multiply } from '../math/internal';
import { GameComponent, GameComponentType } from './game-component';
import {
  decomposeTransformMatrix,
  invertTransformMatrix,
  Transform,
  TransformOptions,
} from './transform';
import type { GameScene } from './game-scene';

export interface GameObjectOptions extends TransformOptions {
  name?: string;
  active?: boolean;
}

export interface ParentOptions {
  preserveWorldTransform?: boolean;
}

let nextGameObjectId = 1;

function copyVec3(value: Vec3): Vec3 {
  return { x: value.x, y: value.y, z: value.z };
}

function copyQuat(value: Quat): Quat {
  return { x: value.x, y: value.y, z: value.z, w: value.w };
}

function removeAt<T>(values: T[], index: number): void {
  for (let current = index; current + 1 < values.length; current++) {
    values[current] = values[current + 1];
  }
  values.pop();
}

export class GameObject {
  readonly id: number;
  readonly transform: Transform;
  name: string;
  active: boolean;

  private ownerScene: GameScene | null = null;
  private parentObject: GameObject | null = null;
  private childObjects: GameObject[] = [];
  private components: GameComponent[] = [];
  private wasDestroyed = false;
  private isDestroying = false;
  private wasAwake = false;
  private awakeningDepth = 0;
  private wasStarted = false;
  private attachmentGeneration = 0;

  constructor(options: GameObjectOptions = {}) {
    this.id = nextGameObjectId++;
    this.name = options.name || '';
    this.active = options.active === undefined ? true : options.active;
    this.transform = new Transform({
      position: options.position === undefined ? undefined : copyVec3(options.position),
      rotation: options.rotation === undefined ? undefined : copyQuat(options.rotation),
      scale: options.scale === undefined ? undefined : copyVec3(options.scale),
    });
  }

  get activeInHierarchy(): boolean {
    if (this.destroyed || !this.active) return false;
    if (this.parentObject === null) return true;
    return this.parentObject.activeInHierarchy;
  }

  get destroyed(): boolean {
    return this.wasDestroyed || this.isDestroying;
  }

  get scene(): GameScene | null {
    return this.ownerScene;
  }

  get parent(): GameObject | null {
    return this.parentObject;
  }

  get children(): readonly GameObject[] {
    return this.childObjects.slice();
  }

  onAwake(): void {}

  onStart(): void {}

  update(_dt: number): void {}

  fixedUpdate(_dt: number): void {}

  onDestroy(): void {}

  addChild<T extends GameObject>(child: T, options: ParentOptions = {}): T | null {
    if (this.destroyed || child.destroyed || child === this) return null;
    if (child.parentObject === this) return child;

    let ancestor: GameObject | null = this;
    while (ancestor !== null) {
      if (ancestor === child) return null;
      ancestor = ancestor.parentObject;
    }

    const targetScene = this.ownerScene;
    const childScene = child.ownerScene;
    if (childScene !== null && childScene !== targetScene) return null;
    if (targetScene === null && childScene !== null) return null;
    if (targetScene !== null && childScene === null &&
        !targetScene._canAttachSubtree(child)) return null;

    let nextLocalPosition: Vec3 | null = null;
    let nextLocalRotation: Quat | null = null;
    let nextLocalScale: Vec3 | null = null;
    if (options.preserveWorldTransform !== false) {
      const childWorld = child.transform.worldMatrix;
      const inverseParent = invertTransformMatrix(this.transform.worldMatrix);
      if (inverseParent === null) return null;
      const nextLocalMatrix = mat4Multiply(inverseParent, childWorld);
      const localTRS = decomposeTransformMatrix(nextLocalMatrix);
      if (localTRS === null) return null;
      nextLocalPosition = localTRS.position;
      nextLocalRotation = localTRS.rotation;
      nextLocalScale = localTRS.scale;
    }

    const previousParent = child.parentObject;
    if (!child._setParent(this)) return null;
    if (previousParent !== null) {
      const previousIndex = previousParent.childObjects.indexOf(child);
      if (previousIndex >= 0) removeAt(previousParent.childObjects, previousIndex);
    }
    this.childObjects.push(child);
    if (nextLocalPosition !== null && nextLocalRotation !== null &&
        nextLocalScale !== null) {
      child.transform._setLocalTRS(nextLocalPosition, nextLocalRotation, nextLocalScale);
    }
    if (targetScene !== null && childScene === null) {
      targetScene._attachSubtree(child);
    }
    return child;
  }

  removeChild(child: GameObject, options: ParentOptions = {}): boolean {
    if (this.destroyed || child.destroyed || child.parentObject !== this) return false;

    let nextLocalPosition: Vec3 | null = null;
    let nextLocalRotation: Quat | null = null;
    let nextLocalScale: Vec3 | null = null;
    if (options.preserveWorldTransform !== false) {
      const worldTRS = decomposeTransformMatrix(child.transform.worldMatrix);
      if (worldTRS === null) return false;
      nextLocalPosition = worldTRS.position;
      nextLocalRotation = worldTRS.rotation;
      nextLocalScale = worldTRS.scale;
    }

    const index = this.childObjects.indexOf(child);
    if (index < 0 || !child._setParent(null)) return false;
    removeAt(this.childObjects, index);
    if (nextLocalPosition !== null && nextLocalRotation !== null &&
        nextLocalScale !== null) {
      child.transform._setLocalTRS(nextLocalPosition, nextLocalRotation, nextLocalScale);
    }
    return true;
  }

  addComponent<T extends GameComponent>(component: T): T | null {
    if (this.destroyed || component.destroyed || component.gameObject !== null) return null;
    if (this.ownerScene !== null && !component._canAttachTo(this.ownerScene.context)) return null;
    if (!component._setGameObject(this)) return null;
    this.components.push(component);
    if (this.wasAwake && this.awakeningDepth === 0 && component._markAwake()) {
      const dynamicComponent: any = component;
      dynamicComponent.onAwake();
    }
    return component;
  }

  getComponent<T extends GameComponent>(type: GameComponentType<T>): T | null {
    for (let index = 0; index < this.components.length; index++) {
      const component = this.components[index];
      if (component instanceof type) return component as T;
    }
    return null;
  }

  getComponents<T extends GameComponent>(type: GameComponentType<T>): T[] {
    const result: T[] = [];
    for (let index = 0; index < this.components.length; index++) {
      const component = this.components[index];
      if (component instanceof type) result.push(component as T);
    }
    return result;
  }

  removeComponent(component: GameComponent): boolean {
    if (component.gameObject !== this || !component._beginDestroy()) return false;
    if (component._beginDestroyCallback()) {
      // Perry's statically-known cross-module calls can bypass subclass
      // overrides. Keep this callback dynamic so user component classes dispatch.
      const dynamicComponent: any = component;
      dynamicComponent.onDestroy();
    }
    component._finishDestroy();
    const index = this.components.indexOf(component);
    if (index >= 0) removeAt(this.components, index);
    if (this.ownerScene !== null) this.ownerScene._syncSubtreeAdapters(this);
    return true;
  }

  destroy(): boolean {
    if (!this._beginDestroy()) return false;
    this._markDescendantsDestroying();
    this._destroyMarkedSubtree();
    return true;
  }

  /** @internal Links the transform hierarchy after GameObject validation. */
  _setParent(parent: GameObject | null): boolean {
    let current = parent;
    while (current !== null) {
      if (current === this) return false;
      current = current.parentObject;
    }
    if (!this.transform._setParent(parent === null ? null : parent.transform)) return false;
    this.parentObject = parent;
    return true;
  }

  /** @internal Assigns scene ownership to the object. */
  _setScene(scene: GameScene | null): void {
    this.ownerScene = scene;
  }

  /** @internal Returns a stable component list for scene dispatch. */
  _componentsSnapshot(): GameComponent[] {
    return this.components.slice();
  }

  /** @internal Returns a stable child list for scene traversal. */
  _childrenSnapshot(): GameObject[] {
    return this.childObjects.slice();
  }

  /** @internal Marks the current scene attachment generation. */
  _setAttachmentGeneration(generation: number): void {
    this.attachmentGeneration = generation;
  }

  /** @internal Reads the generation captured in a dispatch snapshot. */
  _getAttachmentGeneration(): number {
    return this.attachmentGeneration;
  }

  /** @internal Marks awake once per object lifetime. */
  _markAwake(): boolean {
    if (this.wasAwake) return false;
    this.wasAwake = true;
    return true;
  }

  /** @internal Tracks the hierarchy traversal that dispatches awake callbacks. */
  _beginAwakening(): void {
    this.awakeningDepth++;
  }

  /** @internal Ends one hierarchy traversal that dispatches awake callbacks. */
  _endAwakening(): void {
    if (this.awakeningDepth > 0) this.awakeningDepth--;
  }

  /** @internal Marks start once per object lifetime. */
  _markStarted(): boolean {
    if (this.wasStarted) return false;
    this.wasStarted = true;
    return true;
  }

  /** @internal Starts the object's exactly-once destruction path. */
  _beginDestroy(): boolean {
    if (this.wasDestroyed || this.isDestroying) return false;
    this.isDestroying = true;
    return true;
  }

  /** @internal Completes destruction after all hooks return. */
  _finishDestroy(): void {
    this.wasDestroyed = true;
    this.isDestroying = false;
  }

  private _markDescendantsDestroying(): void {
    const components = this.components.slice();
    for (let index = 0; index < components.length; index++) {
      components[index]._beginDestroy();
    }
    const children = this.childObjects.slice();
    for (let index = 0; index < children.length; index++) {
      if (children[index]._beginDestroy()) {
        children[index]._markDescendantsDestroying();
      }
    }
  }

  private _destroyMarkedSubtree(): void {
    const children = this.childObjects.slice();
    for (let index = 0; index < children.length; index++) {
      children[index]._destroyMarkedSubtree();
    }

    const dynamicObject: any = this;
    dynamicObject.onDestroy();

    const components = this.components.slice();
    for (let index = components.length - 1; index >= 0; index--) {
      const component = components[index];
      if (component._beginDestroyCallback()) {
        const dynamicComponent: any = component;
        dynamicComponent.onDestroy();
      }
      component._finishDestroy();
      const componentIndex = this.components.indexOf(component);
      if (componentIndex >= 0) removeAt(this.components, componentIndex);
    }

    const previousParent = this.parentObject;
    if (previousParent !== null) {
      const childIndex = previousParent.childObjects.indexOf(this);
      if (childIndex >= 0) removeAt(previousParent.childObjects, childIndex);
    }
    this._setParent(null);
    if (this.ownerScene !== null) this.ownerScene._removeDestroyedObject(this);
    this._finishDestroy();
  }
}
