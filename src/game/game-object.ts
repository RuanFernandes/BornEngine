import { Vec3, Quat } from '../core/types';
import { mat4Multiply } from '../math/internal';
import { GameComponent, GameComponentType } from './game-component';
import { decomposeTransformMatrix, invertTransformMatrix, Transform, TransformOptions } from './transform';
import type { GameScene } from './game-scene';

/** Options for creating a GameObject, on top of the initial transform values. */
export interface GameObjectOptions extends TransformOptions {
  /** Display name. Defaults to an empty string. */
  name?: string;
  /** Whether the object starts active. Defaults to true. */
  active?: boolean;
}

/** Options for changing an object's parent. */
export interface ParentOptions {
  /** Keep the child's world pose when reparenting by adjusting its local transform. Defaults to true. */
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

/** A node in the scene hierarchy that owns a Transform and a list of components. Subclass it to add object-level behavior. */
export class GameObject {
  /** Unique numeric id assigned at construction. */
  readonly id: number;
  /** The object's position, rotation and scale. */
  readonly transform: Transform;
  /** Display name; free for the game to use. */
  name: string;
  /** When false, this object and its descendants are skipped by updates and rendering. */
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

  /** Creates a detached object. Add it to a scene or to a parent GameObject to run it. */
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

  /** True when this object and all of its ancestors are active and the object is not destroyed. */
  get activeInHierarchy(): boolean {
    if (this.destroyed || !this.active) return false;
    if (this.parentObject === null) return true;
    return this.parentObject.activeInHierarchy;
  }

  /** True once destruction has started or finished. */
  get destroyed(): boolean {
    return this.wasDestroyed || this.isDestroying;
  }

  /** The scene the object is attached to, or null when detached. */
  get scene(): GameScene | null {
    return this.ownerScene;
  }

  /** The parent object, or null for a root. */
  get parent(): GameObject | null {
    return this.parentObject;
  }

  /** A copy of the child list; changes to it do not affect the hierarchy. */
  get children(): readonly GameObject[] {
    return this.childObjects.slice();
  }

  /** Override to initialize the object. Called once when it enters a scene, before its components' onAwake. */
  onAwake(): void {}

  /** Override for setup that runs once, just before the first update() while the object is active in the hierarchy. */
  onStart(): void {}

  /**
   * Override for per-frame logic. Runs every frame while active, before the components' update.
   * @param _dt Time elapsed since the previous frame.
   */
  update(_dt: number): void {}

  /**
   * Override for fixed-timestep logic. Runs while active, before the components' fixedUpdate.
   * @param _dt Length of the fixed timestep.
   */
  fixedUpdate(_dt: number): void {}

  /** Override to release resources. Called once on destroy(), after the children are destroyed and before the components' onDestroy. */
  onDestroy(): void {}

  /**
   * Makes the object a child of this one, moving it from its previous parent.
   * @returns the child, or null when it is destroyed, would create a cycle, belongs to another scene, or its world transform cannot be preserved.
   * @throws Error when this object is in a scene and the child has an async @Asset errCallback; use scene.add() instead.
   */
  addChild<T extends GameObject>(child: T, options: ParentOptions = {}): T | null {
    if (this.destroyed || child.destroyed || (child as GameObject) === this) return null;
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
    if (targetScene !== null && childScene === null && !targetScene._canAttachSubtree(child)) return null;
    if (targetScene !== null && childScene === null && targetScene._bindSubtree(child) !== null) {
      throw new Error('addChild: async @Asset errCallback requires scene.add()');
    }

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
    if (nextLocalPosition !== null && nextLocalRotation !== null && nextLocalScale !== null) {
      child.transform._setLocalTRS(nextLocalPosition, nextLocalRotation, nextLocalScale);
    }
    if (targetScene !== null && childScene === null) {
      targetScene._attachSubtree(child);
    }
    return child;
  }

  /**
   * Detaches a direct child, leaving it as a root object.
   * @returns true when the child was detached.
   */
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
    if (nextLocalPosition !== null && nextLocalRotation !== null && nextLocalScale !== null) {
      child.transform._setLocalTRS(nextLocalPosition, nextLocalRotation, nextLocalScale);
    }
    return true;
  }

  /**
   * Attaches a component to this object; a component can only have one owner.
   * @returns the component, or null when it is destroyed, already attached, or incompatible with the scene's game.
   */
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

  /** Returns the first attached component that is an instance of the given class, or null. */
  getComponent<T extends GameComponent>(type: GameComponentType<T>): T | null {
    for (let index = 0; index < this.components.length; index++) {
      const component = this.components[index];
      if (component instanceof type) return component as T;
    }
    return null;
  }

  /** Returns every attached component that is an instance of the given class, in attachment order. */
  getComponents<T extends GameComponent>(type: GameComponentType<T>): T[] {
    const result: T[] = [];
    for (let index = 0; index < this.components.length; index++) {
      const component = this.components[index];
      if (component instanceof type) result.push(component as T);
    }
    return result;
  }

  /**
   * Removes and destroys a component of this object, calling its onDestroy.
   * @returns false when the component does not belong to this object or is already being destroyed.
   */
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

  /**
   * Destroys this object, its children and all their components, then removes them from the hierarchy and scene.
   * @returns false when destruction was already started.
   */
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
