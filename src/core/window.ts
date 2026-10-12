import * as native from './internal';
import { GameContext, getGameContext } from './context';
import type { Game } from './game';

/** Window backing: `windowed` opens a native window, `embedded` waits for a host to attach a native surface. */
export type WindowMode = 'windowed' | 'embedded';

/** Options for creating a Window. */
export interface WindowOptions {
  /** Initial width. Defaults to 800 and must be greater than zero. */
  width?: number;
  /** Initial height. Defaults to 600 and must be greater than zero. */
  height?: number;
  /** Initial window title. Defaults to 'BornEngine'. */
  title?: string;
  /** Start in fullscreen. Defaults to false. */
  fullscreen?: boolean;
  /** Window backing. Defaults to 'windowed'. */
  mode?: WindowMode;
}

const DEFAULT_WIDTH = 800;
const DEFAULT_HEIGHT = 600;
const DEFAULT_TITLE = 'BornEngine';

function isPositiveFinite(value: number): boolean {
  return value > 0 && value !== Infinity && value !== -Infinity && value === value;
}

/** Context-owned facade over BornEngine's native window or host surface. */
export class Window {
  /** Whether this window is a native window or an embedded host surface. */
  readonly mode: WindowMode;
  private readonly owner: Game;
  private context: GameContext;
  private widthValue: number;
  private heightValue: number;
  private titleValue: string;
  private openValue = false;
  private initialized = false;
  private closeCalled = false;

  /** Creates the window for a Game. In windowed mode it opens immediately; invalid dimensions mark the Game as failed. */
  constructor(owner: Game, options: WindowOptions = {}) {
    this.owner = owner;
    this.context = getGameContext(owner);
    this.mode = options.mode || 'windowed';
    this.widthValue = options.width === undefined ? DEFAULT_WIDTH : options.width;
    this.heightValue = options.height === undefined ? DEFAULT_HEIGHT : options.height;
    this.titleValue = options.title || DEFAULT_TITLE;

    if (this.context.error !== null) return;

    if (!isPositiveFinite(this.widthValue) || !isPositiveFinite(this.heightValue)) {
      this.context.markFailed('Window width and height must be greater than zero.');
      return;
    }

    if (this.mode === 'windowed') {
      native.initWindow(this.widthValue, this.heightValue, this.titleValue, options.fullscreen || false);
      this.initialized = true;
      this.openValue = true;
      this.context.markReady();
    }
  }

  /** Current window width. */
  get width(): number {
    return this.widthValue;
  }
  /** Current window height. */
  get height(): number {
    return this.heightValue;
  }
  /** Current window title. */
  get title(): string {
    return this.titleValue;
  }
  /** True while the window is open and its Game is ready and not disposed. */
  get isOpen(): boolean {
    return this.openValue && this.initialized && this.context.isReady && !this.context.isDisposed;
  }

  /** Returns true when the window is closed or the user has asked to close it. */
  shouldClose(): boolean {
    if (!this.isOpen) return true;
    if (native.windowShouldClose()) {
      this.openValue = false;
      return true;
    }
    return false;
  }

  /** Attach to a host-owned native view/window/surface and let the host drive frames. */
  attachNativeSurface(handle: number, width: number, height: number): boolean {
    if (
      this.mode !== 'embedded' ||
      !this.owner.canActivateServices() ||
      this.context.isDisposed ||
      !isPositiveFinite(handle) ||
      !isPositiveFinite(width) ||
      !isPositiveFinite(height)
    )
      return false;
    if (this.initialized) return true;

    const attached = native.attachToNativeView(handle, width, height);
    if (!attached) {
      this.context.markFailed('BornEngine could not attach to the native surface.');
      return false;
    }

    this.widthValue = width;
    this.heightValue = height;
    this.initialized = true;
    this.openValue = true;
    this.context.markReady();
    this.owner.activateServices();
    return true;
  }

  /** Resizes the window to the given size, multiplied by `pixelRatio` for the drawing surface. Returns false if the window is closed or an argument is invalid. */
  resize(width: number, height: number, pixelRatio = 1): boolean {
    if (!this.isOpen || !isPositiveFinite(width) || !isPositiveFinite(height) || !isPositiveFinite(pixelRatio))
      return false;
    native.resize(width * pixelRatio, height * pixelRatio, width, height);
    this.widthValue = width;
    this.heightValue = height;
    return true;
  }

  /** Changes the window title. Returns false if the window is not open. */
  setTitle(title: string): boolean {
    if (!this.isOpen) return false;
    native.setWindowTitle(title);
    this.titleValue = title;
    return true;
  }

  /** Sets the window icon from an image file path. Returns false if the window is not open. */
  setIcon(path: string): boolean {
    if (!this.isOpen) return false;
    native.setWindowIcon(path);
    return true;
  }

  /** Switches between fullscreen and windowed display. Returns false if the window is not open. */
  toggleFullscreen(): boolean {
    if (!this.isOpen) return false;
    native.toggleFullscreen();
    return true;
  }

  /** Closes the window. Closing a standalone Game window stops its run loop. */
  close(): void {
    if (!this.initialized || this.closeCalled) return;
    native.closeWindow();
    this.closeCalled = true;
    this.openValue = false;
    this.owner._onWindowClosed();
  }
}
