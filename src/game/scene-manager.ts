import { getGameContext } from '../core/context';
import { Scene } from './scene';
import type { GameContext, ContextResource } from '../core/context';
import type { Game } from '../core/game';
import type { PhysicsWorld } from '../physics';
import type { Renderer } from '../core/renderer';

/** Holds the current Scene of a game and handles switching, pausing and unloading it. */
export class SceneManager implements ContextResource {
  /** The game runtime this manager belongs to. */
  readonly context: GameContext;
  private scene: Scene | null = null;
  private transitioning = false;

  /** Creates a manager bound to the given game. */
  constructor(owner: Game) {
    this.context = getGameContext(owner);
    this.context.register(this);
  }

  /** The loaded scene, or null when none is active or paused. */
  get currentScene(): Scene | null {
    if (this.scene === null || this.scene.state === 'unloaded') return null;
    return this.scene;
  }

  /**
   * Unloads the current scene and activates the replacement, calling its onEnter.
   * @returns true when the replacement is active; false when a transition is in progress, the scene is not fresh or belongs to another game, or the current scene refused to unload.
   */
  changeTo<T extends Scene>(replacement: T): boolean {
    if (this.transitioning) return false;
    const previous = this.currentScene;
    if (replacement === previous) return true;
    if (replacement.context !== this.context || !replacement._canActivate()) return false;

    this.transitioning = true;
    if (previous !== null && !previous.unload()) {
      this.transitioning = false;
      return false;
    }

    this.scene = replacement;
    const activated = replacement._activate(this);
    if (!activated) this.scene = null;
    this.transitioning = false;
    return activated;
  }

  /**
   * Pauses the current scene, calling its onPause. Paused scenes still render but do not update.
   * @returns false when there is no active scene.
   */
  pause(): boolean {
    if (this.transitioning) return false;
    const scene = this.currentScene;
    if (scene === null) return false;
    this.transitioning = true;
    const paused = scene._pause(this);
    this.transitioning = false;
    return paused;
  }

  /**
   * Resumes a paused scene, calling its onResume.
   * @returns false when there is no paused scene.
   */
  resume(): boolean {
    if (this.transitioning) return false;
    const scene = this.currentScene;
    if (scene === null) return false;
    this.transitioning = true;
    const resumed = scene._resume(this);
    this.transitioning = false;
    return resumed;
  }

  /**
   * Updates the current scene's owned resources and objects. Does nothing unless the scene is active.
   * @param dt Time elapsed since the previous frame.
   */
  update(dt: number): void {
    if (this.transitioning) return;
    const scene = this.currentScene;
    if (scene === null) return;

    scene._updateOwnedResources(dt);
    if (this.currentScene !== scene || scene.state !== 'active') return;
    scene.update(dt);
  }

  /** Draws the current active or paused scene. */
  render(renderer: Renderer): void {
    if (this.transitioning) return;
    const scene = this.currentScene;
    if (scene === null) return;
    scene.render(renderer, scene.camera2D, scene.viewport2D);
  }

  /** Runs the fixed-timestep update of the current scene when it is active. */
  updateFixed(fixedDt: number): void {
    if (this.transitioning) return;
    const scene = this.currentScene;
    if (scene === null || scene.state !== 'active') return;
    scene.updateFixed(fixedDt);
  }

  /** Pushes the active scene's component state into the physics world; call it before stepping. */
  syncPhysicsBeforeStep(world: PhysicsWorld, fixedDt: number): void {
    if (this.transitioning) return;
    const scene = this.currentScene;
    if (scene === null || scene.state !== 'active') return;
    scene._syncPhysicsBeforeStep(this, world, fixedDt);
  }

  /** Pulls simulated physics state into the active scene's components; call it after stepping. */
  syncPhysicsAfterStep(world: PhysicsWorld): void {
    if (this.transitioning) return;
    const scene = this.currentScene;
    if (scene === null || scene.state !== 'active') return;
    scene._syncPhysicsAfterStep(this, world);
  }

  /**
   * Unloads the current scene, calling its onExit and onUnload.
   * @returns false when there is no scene or the unload was refused.
   */
  unloadCurrent(): boolean {
    if (this.transitioning) return false;
    const scene = this.currentScene;
    if (scene === null) {
      this.scene = null;
      return false;
    }

    this.transitioning = true;
    const unloaded = scene.unload();
    if (unloaded) this.scene = null;
    this.transitioning = false;
    return unloaded;
  }

  /** Unloads the current scene and unregisters the manager. */
  dispose(): void {
    this.unloadCurrent();
    this.context.unregister(this);
  }
}
