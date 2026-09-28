import { GameContext, CONTEXT_ALREADY_ACTIVE_ERROR, bindGameContext, getGameContext } from './context';
import { Window } from './window';
import type { WindowOptions } from './window';
import { Renderer } from './renderer';
import { InputSystem } from '../input/input-system';
import { AudioSystem } from '../audio/audio-system';
import { SceneManager } from '../game/scene-manager';
import { SceneGraph } from '../scene/scene-graph';
import { TouchControls } from '../mobile';
import { Ui } from '../ui';
import { DebugUi } from '../debug-ui';
import { GameInspector } from '../debug-ui/game-inspector';
import { AssetManager } from '../assets';
import { beginDrawing, endDrawing, getPlatform, runGame, setTargetFPS, Platform } from './internal';

export interface GameOptions {
  window?: WindowOptions;
  targetFps?: number;
  /** Opt-in engine inspector backed by the optional Dear ImGui desktop build. */
  debug?: boolean | GameDebugOptions;
}

export interface GameDebugOptions {
  /** Enable the built-in inspector. Defaults to false. */
  enabled?: boolean;
  /** Show frame timing and renderer statistics. Defaults to true. */
  metrics?: boolean;
  /** Show the active scene and its GameObject hierarchy. Defaults to true. */
  sceneHierarchy?: boolean;
  /** Show the loaded asset summary. Defaults to true. */
  assets?: boolean;
}

export interface GameLoopCallbacks {
  update(deltaTime: number): void;
  render(): void;
  onStop?: () => void;
}

function validTargetFps(value: number): boolean {
  return value > 0 && value !== Infinity && value !== -Infinity && value === value;
}

// Consumer subclasses live in separate modules, so lifecycle calls must keep
// a dynamic receiver for Perry's native method dispatcher.
function dispatchGameStart(game: any): void { game.onStart(); }
function dispatchGameLoop(game: any, deltaTime: number): void { game.loop(deltaTime); }
function dispatchGameRender(game: any): void { game.render(); }
function dispatchGameStop(game: any): void { game.onStop(); }

/** Root owner for one BornEngine runtime and all of its services/resources. */
export class Game {
  readonly window: Window;
  readonly renderer: Renderer;
  readonly input: InputSystem;
  readonly audio: AudioSystem;
  readonly scenes: SceneManager;
  readonly sceneGraph: SceneGraph;
  readonly mobile: TouchControls;
  readonly ui: Ui;
  readonly debugUi: DebugUi;
  readonly assets: AssetManager;

  private readonly inspector: GameInspector;
  private disposed = false;
  private configurationError: string | null = null;
  private disposeRequested = false;
  private hasRun = false;
  private runCompleted = false;
  private stopRequested = false;
  private inFrame = false;
  private completionScheduled = false;
  private webRuntime = false;
  private callbacks: GameLoopCallbacks | null = null;

  constructor(options: GameOptions = {}) {
    const runtime = GameContext.create();
    const context = runtime === null
      ? GameContext.createFailed(CONTEXT_ALREADY_ACTIVE_ERROR)
      : runtime;
    bindGameContext(this, context);

    if (options.targetFps !== undefined && !validTargetFps(options.targetFps)) {
      const configurationError = 'targetFps must be a positive finite number.';
      this.configurationError = configurationError;
      getGameContext(this).markFailed(configurationError);
    }

    this.window = new Window(this, options.window);
    this.renderer = new Renderer(this);
    this.input = new InputSystem(this);
    this.audio = new AudioSystem(this);
    this.scenes = new SceneManager(this);
    this.sceneGraph = new SceneGraph(this);
    this.mobile = new TouchControls(this);
    this.ui = new Ui(this);
    this.debugUi = new DebugUi(this);
    this.assets = new AssetManager(this);
    this.inspector = new GameInspector(this, options.debug);

    if (getGameContext(this).isReady) {
      if (options.targetFps !== undefined) setTargetFPS(options.targetFps);
      this.activateServices();
    }
  }

  get isReady(): boolean { return getGameContext(this).isReady && !getGameContext(this).isDisposed && !this.disposed; }
  get isRunning(): boolean { return this.hasRun && !this.runCompleted && !this.disposed; }
  get isDisposed(): boolean { return this.disposed; }
  get error(): string | null { return getGameContext(this).error; }

  /** Called once before a subclass-driven run starts. */
  protected onStart(): void {}

  /** Advance subclass-owned gameplay state. Delta time is measured in seconds. */
  protected loop(_deltaTime: number): void {}

  /** Draw one frame when using the subclass-driven run lifecycle. */
  protected render(): void {
    this.scenes.render(this.renderer);
  }

  /** Called once when a subclass-driven run ends, before the Game is disposed. */
  protected onStop(): void {}

  /** Run subclass lifecycle hooks, or pass callbacks for an explicit frame loop. */
  run(): void;
  run(callbacks: GameLoopCallbacks): void;
  run(callbacks?: GameLoopCallbacks): void {
    if (!this.isReady || !this.window.isOpen || this.hasRun || this.runCompleted || this.window.mode === 'embedded') return;
    const usesSubclassLifecycle = callbacks === undefined;
    const activeCallbacks = callbacks ?? {
      update: (deltaTime: number) => dispatchGameLoop(this, deltaTime),
      render: () => dispatchGameRender(this),
      onStop: () => {
        try {
          dispatchGameStop(this);
        } finally {
          this.dispose();
        }
      },
    };
    this.hasRun = true;
    this.stopRequested = false;
    this.callbacks = activeCallbacks;
    this.webRuntime = getPlatform() === Platform.WEB;
    if (usesSubclassLifecycle) {
      try {
        dispatchGameStart(this);
      } catch (error) {
        this.failRun(error);
      }
    }
    if (this.runCompleted) return;
    try {
      runGame((deltaTime) => {
        try {
          this.dispatchFrame(deltaTime, activeCallbacks);
        } catch (error) {
          if (!this.webRuntime) endDrawing();
          throw error;
        }
      }, () => this.shouldContinue());
    } catch (error) {
      this.failRun(error);
    }
    if (!this.webRuntime && !this.runCompleted) this.completeRun();
  }

  /** Drive one frame from a host-owned embedded surface. */
  runFrame(deltaTime: number, callbacks: GameLoopCallbacks): boolean {
    if (!this.isReady || this.window.mode !== 'embedded' || this.runCompleted) return false;
    if (!this.hasRun) {
      this.hasRun = true;
    }
    this.callbacks = callbacks;
    if (this.stopRequested || this.window.shouldClose()) {
      this.completeRun();
      return false;
    }
    let frameError: unknown = undefined;
    let didThrow = false;
    beginDrawing();
    try {
      this.dispatchFrame(deltaTime, callbacks);
    } catch (error) {
      frameError = error;
      didThrow = true;
    } finally {
      endDrawing();
    }
    if (didThrow) this.failRun(frameError);
    if (this.stopRequested) this.completeRun();
    return !this.runCompleted;
  }

  /** Request orderly loop shutdown. The current frame finishes before onStop. */
  stop(): void {
    if (this.runCompleted) return;
    this.stopRequested = true;
    if (this.inFrame) return;
    if (!this.hasRun || this.webRuntime) this.completeRun();
  }

  /** Close the runtime and release all resources still owned by this Game. */
  dispose(): void {
    if (this.disposed) return;
    if (this.inFrame) {
      this.disposeRequested = true;
      this.stop();
      return;
    }
    if (this.isRunning && !this.runCompleted) {
      this.disposeRequested = true;
      this.stop();
      if (!this.webRuntime) return;
      if (!this.runCompleted) this.completeRun();
      return;
    }
    this.disposeInternal();
  }

  /** @internal Re-register services after an embedded host attaches its surface. */
  activateServices(): void {
    if (!this.canActivateServices() || !getGameContext(this).isReady) return;
    getGameContext(this).register(this.scenes);
    getGameContext(this).register(this.sceneGraph);
    getGameContext(this).register(this.mobile);
    getGameContext(this).register(this.ui);
    getGameContext(this).register(this.debugUi);
    this.audio.activate();
  }

  /** @internal Validates an embedded attach before it reaches the native runtime. */
  canActivateServices(): boolean {
    return this.configurationError === null && getGameContext(this).isActiveOwner() && !getGameContext(this).isDisposed;
  }

  private dispatchFrame(deltaTime: number, callbacks: GameLoopCallbacks): void {
    if (!this.isReady || this.stopRequested) return;
    this.inFrame = true;
    try {
      this.renderer._beginFrame(deltaTime);
      this.input.update();
      getGameContext(this).updateFrameServices(deltaTime);
      this.audio.update(deltaTime);
      this.mobile.update();
      callbacks.update(deltaTime);
      callbacks.render();
      this.inspector.render(deltaTime);
    } catch (error) {
      this.stopRequested = true;
      throw error;
    } finally {
      this.inFrame = false;
      if (this.webRuntime && this.stopRequested) this.scheduleCompleteRun();
    }
  }

  private shouldContinue(): boolean {
    return this.isReady && !this.stopRequested && !this.window.shouldClose();
  }

  private completeRun(): void {
    if (this.runCompleted) return;
    this.runCompleted = true;
    this.stopRequested = true;
    const callbacks = this.callbacks;
    this.callbacks = null;
    try {
      if (callbacks !== null && callbacks.onStop !== undefined) callbacks.onStop();
    } finally {
      if (this.disposeRequested) this.disposeInternal();
      else this.window.close();
    }
  }

  private scheduleCompleteRun(): void {
    if (this.completionScheduled) return;
    this.completionScheduled = true;
    Promise.resolve().then(() => {
      this.completionScheduled = false;
      this.completeRun();
    });
  }

  private failRun(error: unknown): never {
    this.stopRequested = true;
    if (!this.runCompleted) {
      try {
        this.completeRun();
      } catch (shutdownError) {
        console.error('Game shutdown also failed while handling a lifecycle error.', shutdownError);
      }
    }
    throw error;
  }

  private disposeInternal(): void {
    if (this.disposed) return;
    this.scenes.dispose();
    this.sceneGraph.dispose();
    this.mobile.dispose();
    this.assets.dispose();
    this.inspector.dispose();
    this.ui.dispose();
    this.debugUi.dispose();
    this.audio.dispose();
    this.input.dispose();
    this.renderer.dispose();
    getGameContext(this).dispose();
    this.window.close();
    this.disposed = true;
    this.runCompleted = true;
    this.callbacks = null;
  }
}
