import { getGameContext } from '../core/context';
import { Scene } from './scene';
import type { GameContext, ContextResource } from '../core/context';
import type { Game } from '../core/game';
import type { PhysicsWorld } from '../physics';

export class SceneManager implements ContextResource {
  readonly context: GameContext;
  private scene: Scene | null = null;
  private transitioning = false;

  constructor(owner: Game) {
    this.context = getGameContext(owner);
    this.context.register(this);
  }

  get currentScene(): Scene | null {
    if (this.scene === null || this.scene.state === 'unloaded') return null;
    return this.scene;
  }

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

  pause(): boolean {
    if (this.transitioning) return false;
    const scene = this.currentScene;
    if (scene === null) return false;
    this.transitioning = true;
    const paused = scene._pause(this);
    this.transitioning = false;
    return paused;
  }

  resume(): boolean {
    if (this.transitioning) return false;
    const scene = this.currentScene;
    if (scene === null) return false;
    this.transitioning = true;
    const resumed = scene._resume(this);
    this.transitioning = false;
    return resumed;
  }

  update(dt: number): void {
    if (this.transitioning) return;
    const scene = this.currentScene;
    if (scene === null) return;

    scene._updateOwnedResources(dt);
    if (this.currentScene !== scene || scene.state !== 'active') return;
    scene.update(dt);
  }

  updateFixed(fixedDt: number): void {
    if (this.transitioning) return;
    const scene = this.currentScene;
    if (scene === null || scene.state !== 'active') return;
    scene.updateFixed(fixedDt);
  }

  syncPhysicsBeforeStep(world: PhysicsWorld, fixedDt: number): void {
    if (this.transitioning) return;
    const scene = this.currentScene;
    if (scene === null || scene.state !== 'active') return;
    scene._syncPhysicsBeforeStep(this, world, fixedDt);
  }

  syncPhysicsAfterStep(world: PhysicsWorld): void {
    if (this.transitioning) return;
    const scene = this.currentScene;
    if (scene === null || scene.state !== 'active') return;
    scene._syncPhysicsAfterStep(this, world);
  }

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

  dispose(): void {
    this.unloadCurrent();
    this.context.unregister(this);
  }
}
