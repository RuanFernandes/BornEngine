import { GameContext, CONTEXT_ALREADY_ACTIVE_ERROR } from './context';
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
import { beginDrawing, endDrawing, getPlatform, runGame, setTargetFPS, Platform } from './internal';

export interface GameOptions {
  window?: WindowOptions;
  targetFps?: number;
}

export interface GameLoopCallbacks {
  update(deltaTime: number): void;
  render(): void;
  onStop?: () => void;
}

function validTargetFps(value: number): boolean {
  return value > 0 && value !== Infinity && value !== -Infinity && value === value;
}

/** Root owner for one BornEngine runtime and all of its services/resources. */
export class Game {
  readonly context: GameContext;
  readonly window: Window;
  readonly renderer: Renderer;
  readonly input: InputSystem;
  readonly audio: AudioSystem;
  readonly scenes: SceneManager;
  readonly sceneGraph: SceneGraph;
  readonly mobile: TouchControls;
  readonly ui: Ui;
  readonly debugUi: DebugUi;

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
    this.context = runtime === null
      ? GameContext.createFailed(CONTEXT_ALREADY_ACTIVE_ERROR)
      : runtime;

    if (options.targetFps !== undefined && !validTargetFps(options.targetFps)) {
      const configurationError = 'targetFps must be a positive finite number.';
      this.configurationError = configurationError;
      this.context.markFailed(configurationError);
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

    if (this.context.isReady) {
      if (options.targetFps !== undefined) setTargetFPS(options.targetFps);
      this.activateServices();
    }
  }

  get isReady(): boolean { return this.context.isReady && !this.context.isDisposed && !this.disposed; }
  get isRunning(): boolean { return this.hasRun && !this.runCompleted && !this.disposed; }
  get isDisposed(): boolean { return this.disposed; }
  get error(): string | null { return this.context.error; }

  /** Start the engine-owned native loop or the browser's animation-frame loop. */
  run(callbacks: GameLoopCallbacks): void {
    if (!this.isReady || !this.window.isOpen || this.hasRun || this.runCompleted || this.window.mode === 'embedded') return;
    this.hasRun = true;
    this.stopRequested = false;
    this.callbacks = callbacks;
    this.webRuntime = getPlatform() === Platform.WEB;
    runGame((deltaTime) => this.dispatchFrame(deltaTime, callbacks), () => this.shouldContinue());
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
    beginDrawing();
    this.dispatchFrame(deltaTime, callbacks);
    endDrawing();
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
    if (!this.canActivateServices() || !this.context.isReady) return;
    this.context.register(this.scenes);
    this.context.register(this.sceneGraph);
    this.context.register(this.mobile);
    this.context.register(this.ui);
    this.context.register(this.debugUi);
    this.audio.activate();
  }

  /** @internal Validates an embedded attach before it reaches the native runtime. */
  canActivateServices(): boolean {
    return this.configurationError === null && this.context.isActiveOwner() && !this.context.isDisposed;
  }

  private dispatchFrame(deltaTime: number, callbacks: GameLoopCallbacks): void {
    if (!this.isReady || this.stopRequested) return;
    this.inFrame = true;
    this.input.update();
    this.context.updateFrameServices(deltaTime);
    this.audio.update(deltaTime);
    this.mobile.update();
    callbacks.update(deltaTime);
    callbacks.render();
    this.inFrame = false;
    if (this.webRuntime && this.stopRequested) this.scheduleCompleteRun();
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

  private disposeInternal(): void {
    if (this.disposed) return;
    this.scenes.dispose();
    this.sceneGraph.dispose();
    this.mobile.dispose();
    this.ui.dispose();
    this.debugUi.dispose();
    this.audio.dispose();
    this.input.dispose();
    this.renderer.dispose();
    this.context.dispose();
    this.window.close();
    this.disposed = true;
    this.runCompleted = true;
    this.callbacks = null;
  }
}
