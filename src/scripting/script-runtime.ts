import { getGameContext } from '../core/context';
import type { GameContext } from '../core/context';
import type { Game } from '../core/game';
import type { ScriptComponent } from './script-component';
import * as scriptOperations from './internal';

/** Game-owned script host. It never passes the Game object into guest code. */
export class ScriptRuntime {
  private readonly context: GameContext;
  private readonly componentValues: ScriptComponent[] = [];
  private readonly supportedValue: boolean;
  private disposed = false;

  /** Creates the script host for `owner`. Check `isSupported` before attaching scripts. */
  constructor(owner: Game) {
    this.context = getGameContext(owner);
    let supported = false;
    try {
      supported = scriptOperations.scriptRuntimeSupported();
    } catch (_error) {
      supported = false;
    }
    this.supportedValue = supported;
  }

  /** True when this target supports embedded JavaScript and the runtime has not been disposed. */
  get isSupported(): boolean {
    return this.supportedValue && !this.disposed;
  }
  /** True once the runtime has been disposed. */
  get isDisposed(): boolean {
    return this.disposed;
  }
  /** Number of live script components registered with this runtime. */
  get scriptCount(): number {
    return this.componentValues.length;
  }

  /** @internal Tracks components so detached scripts are released with Game. */
  _register(component: ScriptComponent): boolean {
    if (this.disposed || this.context.isDisposed || this.context.error !== null) return false;
    if (this.componentValues.indexOf(component) < 0) this.componentValues.push(component);
    return true;
  }

  /** @internal Removes a completed component from Game ownership. */
  _unregister(component: ScriptComponent): void {
    const index = this.componentValues.indexOf(component);
    if (index >= 0) this.componentValues.splice(index, 1);
  }

  /** @internal Components can only attach to scenes owned by this Game. */
  _ownsContext(context: GameContext): boolean {
    return !this.disposed && !this.context.isDisposed && context === this.context;
  }

  /** @internal Snapshot used by the opt-in Game inspector. */
  _componentsSnapshot(): ScriptComponent[] {
    return this.componentValues.slice();
  }

  /** Disposes every registered script component. Safe to call more than once. */
  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    const components = this.componentValues.slice();
    for (let index = components.length - 1; index >= 0; index--) {
      try {
        components[index]._disposeFromRuntime();
      } catch (_error) {
        // Guest failures are reported on their component and cannot block other heaps.
      }
    }
    this.componentValues.length = 0;
  }
}
