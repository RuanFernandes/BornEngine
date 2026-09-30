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
import { ScriptRuntime } from '../scripting/script-runtime';
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

/** Callbacks for a host that owns an embedded surface and frame scheduler. */
export interface EmbeddedFrameCallbacks {
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
  readonly scripting: ScriptRuntime;

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
  private callbacks: EmbeddedFrameCallbacks | null = null;
  private standaloneRun = false;
  private completion: Promise<void> | null = null;
  private resolveCompletion: (() => void) | null = null;

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
    this.scripting = new ScriptRuntime(this);
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

  /** Run the subclass lifecycle and resolve after shutdown and cleanup. */
  run(): Promise<void> {
    if (this.completion !== null) return this.completion;
    if (this.hasRun || this.runCompleted) return Promise.resolve();
    if (!this.isReady || !this.window.isOpen) {
      // An unattached embedded surface can still become ready. A failed
      // configuration or windowed startup cannot, so release its context.
      if (this.window.mode !== 'embedded' || this.error !== null) this.disposeInternal();
      return Promise.resolve();
    }
    if (this.window.mode === 'embedded') {
      return Promise.resolve();
    }
    const completion = new Promise<void>((resolve) => { this.resolveCompletion = resolve; });
    this.completion = completion;
    const activeCallbacks: EmbeddedFrameCallbacks = {
      update: (deltaTime: number) => dispatchGameLoop(this, deltaTime),
      render: () => dispatchGameRender(this),
      onStop: () => dispatchGameStop(this),
    };
    this.hasRun = true;
    this.standaloneRun = true;
    this.stopRequested = false;
    this.callbacks = activeCallbacks;
    this.webRuntime = getPlatform() === Platform.WEB;
    try {
      dispatchGameStart(this);
    } catch (error) {
      this.failRun(error);
    }
    if (this.runCompleted) return completion;
    try {
      runGame((deltaTime) => {
        this.dispatchFrame(deltaTime, activeCallbacks);
      }, () => this.shouldContinue());
    } catch (error) {
      this.failRun(error);
    }
    if (!this.webRuntime && !this.runCompleted) this.completeRun();
    return completion;
  }

  /** Drive one frame from a host-owned embedded surface. */
  runFrame(deltaTime: number, callbacks: EmbeddedFrameCallbacks): boolean {
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
    try {
      this.dispatchFrame(deltaTime, callbacks);
    } finally {
      endDrawing();
    }
    if (this.stopRequested) this.completeRun();
    return !this.runCompleted;
  }

  /** Request orderly loop shutdown. The current frame finishes before onStop. */
  stop(): void {
    if (this.runCompleted) return;
    this.stopRequested = true;
    if (this.inFrame) return;
    if (!this.hasRun) {
      this.disposeInternal();
      return;
    }
    if (this.webRuntime) this.completeRun();
  }

  /** @internal Window calls this when its public close method is used. */
  _onWindowClosed(): void {
    if (this.standaloneRun && !this.runCompleted) this.stop();
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

  private dispatchFrame(deltaTime: number, callbacks: EmbeddedFrameCallbacks): void {
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
      this.recordRunError(error);
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
    } catch (error) {
      this.recordRunError(error);
    }
    try {
      if (this.standaloneRun || this.disposeRequested) this.disposeInternal();
      else this.window.close();
    } catch (error) {
      this.recordRunError(error);
    }
    if (this.resolveCompletion !== null) {
      const resolve = this.resolveCompletion;
      this.resolveCompletion = null;
      resolve();
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

  private failRun(error: unknown): void {
    this.stopRequested = true;
    this.recordRunError(error);
    if (!this.runCompleted) this.completeRun();
  }

  private recordRunError(error: unknown): void {
    const context = getGameContext(this);
    if (context.error !== null) return;
    context.error = error instanceof Error ? error.message : String(error);
  }

  private disposeInternal(): void {
    if (this.disposed) return;
    try {
      try { this.scenes.dispose(); } catch (error) { this.recordRunError(error); }
      try { this.scripting.dispose(); } catch (error) { this.recordRunError(error); }
      try { this.sceneGraph.dispose(); } catch (error) { this.recordRunError(error); }
      try { this.mobile.dispose(); } catch (error) { this.recordRunError(error); }
      try { this.assets.dispose(); } catch (error) { this.recordRunError(error); }
      try { this.inspector.dispose(); } catch (error) { this.recordRunError(error); }
      try { this.ui.dispose(); } catch (error) { this.recordRunError(error); }
      try { this.debugUi.dispose(); } catch (error) { this.recordRunError(error); }
      try { this.audio.dispose(); } catch (error) { this.recordRunError(error); }
      try { this.input.dispose(); } catch (error) { this.recordRunError(error); }
      try { this.renderer.dispose(); } catch (error) { this.recordRunError(error); }
      try { getGameContext(this).dispose(); } catch (error) { this.recordRunError(error); }
    } finally {
      try { this.window.close(); } catch (error) { this.recordRunError(error); }
      this.disposed = true;
      this.runCompleted = true;
      this.callbacks = null;
    }
  }
}
