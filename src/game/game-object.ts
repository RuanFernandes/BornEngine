import { Vec3, Quat } from '../core/types';
import { GameComponent, GameComponentType } from './game-component';
import { Transform, TransformOptions } from './transform';
import type { GameScene } from './game-scene';

export interface GameObjectOptions extends TransformOptions {
  name?: string;
  active?: boolean;
}

let nextGameObjectId = 1;

function copyVec3(value: Vec3): Vec3 {
  return { x: value.x, y: value.y, z: value.z };
}

function copyQuat(value: Quat): Quat {
  return { x: value.x, y: value.y, z: value.z, w: value.w };
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

  addComponent<T extends GameComponent>(component: T): T | null {
    if (this.destroyed || component.destroyed || component.gameObject !== null) return null;
    if (!component._setGameObject(this)) return null;
    this.components.push(component);
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
    // Perry's statically-known cross-module calls can bypass subclass
    // overrides. Keep this callback dynamic so user component classes dispatch.
    const dynamicComponent: any = component;
    dynamicComponent.onDestroy();
    component._finishDestroy();
    const index = this.components.indexOf(component);
    if (index >= 0) this.components.splice(index, 1);
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

  /** @internal Mutable child storage is managed only by hierarchy methods. */
  _childList(): GameObject[] {
    return this.childObjects;
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
}
