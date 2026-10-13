import { GameObject } from './game-object';
import { GameScene } from './game-scene';
import { getActiveGame } from '../core/context';
import type { PhysicsWorld } from '../physics';
import type { Camera2D } from '../core/types';
import type { CameraRig2D } from '../camera2d/camera-rig-2d';
import type { Viewport2D } from '../camera2d/viewport-2d';
import type { Texture } from '../textures/texture';
import { SceneAssetManager } from '../assets/asset-manager';
import { SceneVfx } from '../vfx/scene-vfx';

/** Lifecycle state of a Scene: created, running, paused by its manager, or torn down. */
export type SceneState = 'ready' | 'active' | 'paused' | 'unloaded';

/** Options for creating a Scene. */
export interface SceneOptions {
  /** Display name. Defaults to an empty string. */
  name?: string;
}

/** A resource whose lifetime follows a Scene: it is updated each frame and disposed when the scene unloads. */
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

/** A GameScene managed by a SceneManager, with lifecycle hooks, asset loading, VFX and a 2D camera. Subclass it and override the hooks to build a level or screen. */
export class Scene extends GameScene {
  /** Display name given at construction. */
  readonly name: string;
  /** Loads assets that are released when the scene unloads. */
  readonly assets: SceneAssetManager;
  /** Visual effects owned by the scene, disposed on unload. */
  readonly vfx: SceneVfx;
  /** Viewport used when rendering the scene in 2D; null uses the full target. */
  viewport2D: Viewport2D | null = null;
  private cameraValue: Camera2D | null = null;
  private fallbackCameraValue: Camera2D | null = null;
  private boundCameraRig: CameraRig2D | null = null;

  private currentState: SceneState = 'ready';
  private ownedResources: SceneOwnedResource[] = [];
  private managerOwner: object | null = null;
  private inLifecycleHook = false;
  private unloading = false;
  private hasEntered = false;
  private hasExited = false;

  /** Creates a scene in the 'ready' state for the active Game; hand it to SceneManager.changeTo() to run it. */
  constructor(options: SceneOptions = {}) {
    super(getActiveGame());
    this.name = options.name === undefined ? '' : options.name;
    this.assets = new SceneAssetManager(getActiveGame());
    this.vfx = new SceneVfx(getActiveGame(), this);
  }

  override _loadTexture(path: string): Texture | null {
    return this.assets.loadTexture(path);
  }

  override _reloadTexture(path: string): Texture | null {
    return this.assets._reloadTexture(path);
  }

  /** Camera used to render the scene in 2D. An active bound CameraRig2D takes precedence over the value set here. */
  get camera2D(): Camera2D | null {
    const rig = this.boundCameraRig;
    if (
      rig !== null &&
      rig.error === null &&
      rig.isActiveAndEnabled &&
      rig.gameObject !== null &&
      rig.gameObject.scene === this
    ) {
      return rig.camera;
    }
    return this.boundCameraRig === null ? this.cameraValue : this.fallbackCameraValue;
  }

  /** Sets the fallback 2D camera; null renders without a camera. */
  set camera2D(camera: Camera2D | null) {
    this.cameraValue = camera;
    if (this.boundCameraRig !== null) this.fallbackCameraValue = camera;
  }

  /** Binds a live component camera, retaining the camera for restoration. */
  bindCameraRig2D(rig: CameraRig2D | null): boolean {
    if (this.state === 'unloaded') return false;
    if (
      rig !== null &&
      (rig.destroyed || rig.gameObject === null || rig.gameObject.scene !== this || rig.error !== null)
    )
      return false;
    if (rig === this.boundCameraRig) return true;
    if (this.boundCameraRig === null) this.fallbackCameraValue = this.cameraValue;
    if (this.boundCameraRig !== null) this.cameraValue = this.fallbackCameraValue;
    this.boundCameraRig = rig;
    if (rig === null) {
      this.cameraValue = this.fallbackCameraValue;
      this.fallbackCameraValue = null;
    }
    return true;
  }

  /** Current lifecycle state. */
  get state(): SceneState {
    return this.currentState;
  }

  /**
   * Adds a root object to the scene, like add(), but refuses while the scene is unloading or unloaded.
   * @returns the node, or null when it cannot be added.
   */
  addNode<T extends GameObject>(node: T): T | null {
    if (this.unloading || this.currentState === 'unloaded') return null;
    return super.add(node);
  }

  /**
   * Hands a resource to the scene so it is updated each frame and disposed on unload, in reverse order.
   * @returns the resource, or null when the scene is unloading, the resource belongs to another game or scene, or is incompatible.
   */
  own<T extends SceneOwnedResource>(resource: T): T | null {
    if (this.unloading || this.currentState === 'unloaded') return null;
    const boundResource: any = resource;
    if (boundResource.context !== undefined && boundResource.context !== this.context) return null;
    if (boundResource._canAttachTo !== undefined && !boundResource._canAttachTo(this.context)) return null;
    for (let index = 0; index < resourceOwners.length; index++) {
      if (resourceOwners[index].resource === resource) return null;
    }
    this.ownedResources.push(resource);
    resourceOwners.push({ resource, scene: this });
    return resource;
  }

  /**
   * Tears the scene down: calls onExit and onUnload, destroys its objects and disposes its assets, VFX and owned resources.
   * @returns false when called from inside a lifecycle hook or when the scene is already unloading or unloaded.
   */
  unload(): boolean {
    if (this.inLifecycleHook || this.unloading || this.currentState === 'unloaded') return false;
    this.unloading = true;

    if (this.hasEntered && !this.hasExited) {
      this.hasExited = true;
      this.invokeLifecycleHook('exit');
    }
    this.invokeLifecycleHook('unload');

    super.destroy();
    this.vfx.dispose();
    this.assets.dispose();

    if (this.boundCameraRig !== null) {
      this.cameraValue = this.fallbackCameraValue;
      this.boundCameraRig = null;
      this.fallbackCameraValue = null;
    }

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

  /** Same as unload(). */
  destroy(): void {
    this.unload();
  }

  /** Override to build the scene. Called when a SceneManager activates it. */
  onEnter(): void {}
  /** Override to react to the manager pausing the scene. */
  onPause(): void {}
  /** Override to react to the manager resuming the scene. */
  onResume(): void {}
  /** Override for cleanup when the scene is replaced or unloaded after having been entered. */
  onExit(): void {}
  /** Override to free scene-specific data. Called during unload, after onExit and before objects are destroyed. */
  onUnload(): void {}

  /** @internal Assigns the scene to one manager and runs its enter hook. */
  _activate(manager: object): boolean {
    if (!this._canActivate()) return false;
    this.managerOwner = manager;
    this.currentState = 'active';
    this.hasEntered = true;
    this.invokeLifecycleHook('enter');
    return true;
  }

  /** @internal Changes state before dispatching the pause hook. */
  _pause(manager: object): boolean {
    if (this.managerOwner !== manager || this.currentState !== 'active' || this.unloading || this.inLifecycleHook)
      return false;
    this.currentState = 'paused';
    this.invokeLifecycleHook('pause');
    return true;
  }

  /** @internal Changes state before dispatching the resume hook. */
  _resume(manager: object): boolean {
    if (this.managerOwner !== manager || this.currentState !== 'paused' || this.unloading || this.inLifecycleHook)
      return false;
    this.currentState = 'active';
    this.invokeLifecycleHook('resume');
    return true;
  }

  /** @internal Validates a fresh scene before a manager unloads its current one. */
  _canActivate(): boolean {
    return this.currentState === 'ready' && this.managerOwner === null && !this.unloading && !this.inLifecycleHook;
  }

  /** @internal Advances scene-owned resources from the manager's frame loop. */
  _updateOwnedResources(dt: number): void {
    if (this.currentState !== 'active' && this.currentState !== 'paused') return;
    this.vfx.update(dt);
    const resources = this.ownedResources.slice();
    for (let index = 0; index < resources.length; index++) {
      if (this.isUnloaded()) return;
      const resource: any = resources[index];
      if (resource.update !== undefined) resource.update(dt);
    }
  }

  /** @internal Delegates physics synchronization without stepping the world. */
  _syncPhysicsBeforeStep(manager: object, world: PhysicsWorld, fixedDt: number): void {
    if (this.managerOwner !== manager || this.currentState !== 'active') return;
    super.syncPhysicsBeforeStep(world, fixedDt);
  }

  /** @internal Delegates physics synchronization without stepping the world. */
  _syncPhysicsAfterStep(manager: object, world: PhysicsWorld): void {
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

  private isUnloaded(): boolean {
    return this.currentState === 'unloaded';
  }

  /** @internal Scoped managers use this to reject allocations during unload. */
  _canCreateScopedResources(): boolean {
    return !this.unloading && this.currentState !== 'unloaded';
  }
}
