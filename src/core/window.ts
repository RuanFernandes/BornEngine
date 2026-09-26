import * as native from './internal';
import { GameContext, getGameContext } from './context';
import type { Game } from './game';

export type WindowMode = 'windowed' | 'embedded';

export interface WindowOptions {
  width?: number;
  height?: number;
  title?: string;
  fullscreen?: boolean;
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
  readonly mode: WindowMode;
  private readonly owner: Game;
  private context: GameContext;
  private widthValue: number;
  private heightValue: number;
  private titleValue: string;
  private openValue = false;
  private initialized = false;
  private closeCalled = false;

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

  get width(): number { return this.widthValue; }
  get height(): number { return this.heightValue; }
  get title(): string { return this.titleValue; }
  get isOpen(): boolean {
    return this.openValue && this.initialized && this.context.isReady && !this.context.isDisposed;
  }

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
    if (this.mode !== 'embedded' || !this.owner.canActivateServices() || this.context.isDisposed || !isPositiveFinite(handle) ||
        !isPositiveFinite(width) || !isPositiveFinite(height)) return false;
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

  resize(width: number, height: number, pixelRatio = 1): boolean {
    if (!this.isOpen || !isPositiveFinite(width) || !isPositiveFinite(height) ||
        !isPositiveFinite(pixelRatio)) return false;
    native.resize(width * pixelRatio, height * pixelRatio, width, height);
    this.widthValue = width;
    this.heightValue = height;
    return true;
  }

  setTitle(title: string): boolean {
    if (!this.isOpen) return false;
    native.setWindowTitle(title);
    this.titleValue = title;
    return true;
  }

  setIcon(path: string): boolean {
    if (!this.isOpen) return false;
    native.setWindowIcon(path);
    return true;
  }

  toggleFullscreen(): boolean {
    if (!this.isOpen) return false;
    native.toggleFullscreen();
    return true;
  }

  close(): void {
    if (!this.initialized || this.closeCalled) return;
    native.closeWindow();
    this.closeCalled = true;
    this.openValue = false;
  }
}
