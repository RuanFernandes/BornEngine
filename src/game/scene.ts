import { GameObject } from './game-object';
import { GameScene } from './game-scene';
import type { WorldHandle } from '../physics';

export type SceneState = 'ready' | 'active' | 'paused' | 'unloaded';

export interface SceneOptions {
  name?: string;
}

export interface SceneOwnedResource {
  update?(dt: number): void;
  dispose(): void;
}

interface ResourceOwner {
  resource: SceneOwnedResource;
  scene: object;
}

const resourceOwners: ResourceOwner[] = [];

function removeAt<T>(values: T[], index: number): void {
  for (let current = index; current + 1 < values.length; current++) {
    values[current] = values[current + 1];
  }
  values.pop();
}

export class Scene extends GameScene {
  readonly name: string;

  private currentState: SceneState = 'ready';
  private ownedResources: SceneOwnedResource[] = [];
  private managerOwner: object | null = null;
  private inLifecycleHook = false;
  private unloading = false;
  private hasEntered = false;
  private hasExited = false;

  constructor(options: SceneOptions = {}) {
    super();
    this.name = options.name === undefined ? '' : options.name;
  }

  get state(): SceneState {
    return this.currentState;
  }

  addNode<T extends GameObject>(node: T): T | null {
    if (this.unloading || this.currentState === 'unloaded') return null;
    return super.add(node);
  }

  own<T extends SceneOwnedResource>(resource: T): T | null {
    if (this.unloading || this.currentState === 'unloaded') return null;
    for (let index = 0; index < resourceOwners.length; index++) {
      if (resourceOwners[index].resource === resource) return null;
    }
    this.ownedResources.push(resource);
    resourceOwners.push({ resource, scene: this });
    return resource;
  }

  unload(): boolean {
    if (this.inLifecycleHook || this.unloading || this.currentState === 'unloaded') return false;
    this.unloading = true;

    if (this.hasEntered && !this.hasExited) {
      this.hasExited = true;
      this.invokeLifecycleHook('exit');
    }
    this.invokeLifecycleHook('unload');

    super.destroy();

    for (let index = this.ownedResources.length - 1; index >= 0; index--) {
      const resource = this.ownedResources[index];
      resource.dispose();
      for (let ownerIndex = resourceOwners.length - 1; ownerIndex >= 0; ownerIndex--) {
        const owner = resourceOwners[ownerIndex];
        if (owner.resource === resource && owner.scene === this) {
          removeAt(resourceOwners, ownerIndex);
          break;
        }
      }
    }
    this.ownedResources = [];
    this.currentState = 'unloaded';
    this.managerOwner = null;
    this.unloading = false;
    return true;
  }

  destroy(): void {
    this.unload();
  }

  onEnter(): void {}
  onPause(): void {}
  onResume(): void {}
  onExit(): void {}
  onUnload(): void {}

  /** @internal Assigns the scene to one manager and runs its enter hook. */
  _activate(manager: object): boolean {
    if (this.currentState !== 'ready' || this.managerOwner !== null ||
        this.unloading || this.inLifecycleHook) return false;
    this.managerOwner = manager;
    this.currentState = 'active';
    this.hasEntered = true;
    this.invokeLifecycleHook('enter');
    return true;
  }

  /** @internal Changes state before dispatching the pause hook. */
  _pause(manager: object): boolean {
    if (this.managerOwner !== manager || this.currentState !== 'active' ||
        this.unloading || this.inLifecycleHook) return false;
    this.currentState = 'paused';
    this.invokeLifecycleHook('pause');
    return true;
  }

  /** @internal Changes state before dispatching the resume hook. */
  _resume(manager: object): boolean {
    if (this.managerOwner !== manager || this.currentState !== 'paused' ||
        this.unloading || this.inLifecycleHook) return false;
    this.currentState = 'active';
    this.invokeLifecycleHook('resume');
    return true;
  }

  /** @internal Reports whether the given manager currently owns this scene. */
  _isManagedBy(manager: object): boolean {
    return this.managerOwner === manager;
  }

  /** @internal Advances scene-owned resources from the manager's frame loop. */
  _updateOwnedResources(dt: number): void {
    if (this.currentState !== 'active' && this.currentState !== 'paused') return;
    const resources = this.ownedResources.slice();
    for (let index = 0; index < resources.length; index++) {
      if (this.currentState === 'unloaded') return;
      const resource: any = resources[index];
      if (resource.update !== undefined) resource.update(dt);
    }
  }

  /** @internal Delegates physics synchronization without stepping the world. */
  _syncPhysicsBeforeStep(manager: object, world: WorldHandle, fixedDt: number): void {
    if (this.managerOwner !== manager || this.currentState !== 'active') return;
    super.syncPhysicsBeforeStep(world, fixedDt);
  }

  /** @internal Delegates physics synchronization without stepping the world. */
  _syncPhysicsAfterStep(manager: object, world: WorldHandle): void {
    if (this.managerOwner !== manager || this.currentState !== 'active') return;
    super.syncPhysicsAfterStep(world);
  }

  private invokeLifecycleHook(hook: 'enter' | 'pause' | 'resume' | 'exit' | 'unload'): void {
    this.inLifecycleHook = true;
    const dynamicScene: any = this;
    if (hook === 'enter') dynamicScene.onEnter();
    else if (hook === 'pause') dynamicScene.onPause();
    else if (hook === 'resume') dynamicScene.onResume();
    else if (hook === 'exit') dynamicScene.onExit();
    else dynamicScene.onUnload();
    this.inLifecycleHook = false;
  }
}
