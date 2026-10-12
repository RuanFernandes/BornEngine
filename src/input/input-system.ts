import { GameContext, getGameContext } from '../core/context';
import type { Game } from '../core/game';
import * as native from '../core/internal';
import type { Camera2D } from '../core/types';
import type { Viewport2D } from '../camera2d/viewport-2d';
import { InputActionMap } from './input-action-map';

function finite(value: number): boolean {
  return value === value && value !== Infinity && value !== -Infinity;
}

function validCamera(camera: Camera2D): boolean {
  return (
    camera !== null &&
    camera !== undefined &&
    camera.offset !== null &&
    camera.offset !== undefined &&
    camera.target !== null &&
    camera.target !== undefined &&
    finite(camera.offset.x) &&
    finite(camera.offset.y) &&
    finite(camera.target.x) &&
    finite(camera.target.y) &&
    finite(camera.rotation) &&
    finite(camera.zoom) &&
    camera.zoom > 0
  );
}

function validPoint(position: { x: number; y: number }): boolean {
  return position !== null && position !== undefined && finite(position.x) && finite(position.y);
}

/**
 * Keyboard, mouse, gamepad, touch, clipboard, file-dialog, and platform queries for a Game. Queries return `false`, `0`, an empty string, or `null` while the game is not ready or after the system is disposed.
 */
export class InputSystem {
  private actionMaps: InputActionMap[] = [];
  private disposed = false;
  private readonly context: GameContext;
  private readonly owner: Game;

  /** Creates the input system for the given game. */
  constructor(owner: Game) {
    this.owner = owner;
    this.context = getGameContext(owner);
  }

  /** True while the owning game is ready and neither the game nor this input system has been disposed. */
  get isReady(): boolean {
    return this.context.isReady && !this.context.isDisposed && !this.disposed;
  }

  /** Creates an action map that is advanced automatically each frame and cleared when this input system is disposed. */
  createActionMap(): InputActionMap {
    const map = new InputActionMap(this);
    this.actionMaps.push(map);
    return map;
  }

  /** Advance every action map once at the start of a game frame. */
  update(): void {
    if (!this.isReady) return;
    for (let index = 0; index < this.actionMaps.length; index++) this.actionMaps[index].update();
  }

  /** True on the frame the key goes from up to down. */
  isKeyPressed(key: number): boolean {
    return this.isReady && native.isKeyPressed(key);
  }
  /** True on frames where the OS auto-repeats the held key; use together with `isKeyPressed` for hold-to-repeat UI. */
  isKeyRepeated(key: number): boolean {
    return this.isReady && native.isKeyRepeated(key);
  }
  /** True while the key is held. */
  isKeyDown(key: number): boolean {
    return this.isReady && native.isKeyDown(key);
  }
  /** True on the frame the key is released. */
  isKeyReleased(key: number): boolean {
    return this.isReady && native.isKeyReleased(key);
  }
  /** True on the frame the mouse button goes from up to down. */
  isMouseButtonPressed(button: number): boolean {
    return this.isReady && native.isMouseButtonPressed(button);
  }
  /** True while the mouse button is held. */
  isMouseButtonDown(button: number): boolean {
    return this.isReady && native.isMouseButtonDown(button);
  }
  /** True on the frame the mouse button is released. */
  isMouseButtonReleased(button: number): boolean {
    return this.isReady && native.isMouseButtonReleased(button);
  }
  /** Current mouse x position. */
  getMouseX(): number {
    return this.isReady ? native.getMouseX() : 0;
  }
  /** Current mouse y position. */
  getMouseY(): number {
    return this.isReady ? native.getMouseY() : 0;
  }
  /** Current mouse position as an `{ x, y }` object. */
  getMousePosition(): { x: number; y: number } {
    return this.isReady ? native.getMousePosition() : { x: 0, y: 0 };
  }
  /** Horizontal mouse movement since the previous frame. */
  getMouseDeltaX(): number {
    return this.isReady ? native.getMouseDeltaX() : 0;
  }
  /** Vertical mouse movement since the previous frame. */
  getMouseDeltaY(): number {
    return this.isReady ? native.getMouseDeltaY() : 0;
  }
  /**
   * Vertical scroll-wheel movement accumulated since the last call; positive means scrolling up. Reading consumes the value, so call it once per frame.
   */
  getMouseWheel(): number {
    return this.isReady ? native.getMouseWheel() : 0;
  }
  /**
   * Hides and captures the cursor when `captured` is true, or restores it when false. Returns false if the system is not ready.
   */
  setCursorCaptured(captured: boolean): boolean {
    if (!this.isReady) return false;
    if (captured) native.disableCursor();
    else native.enableCursor();
    return true;
  }
  /**
   * Dequeues the next typed character as a Unicode code point, or 0 when none is pending. Call it in a loop to drain the queue.
   */
  getCharPressed(): number {
    return this.isReady ? native.getCharPressed() : 0;
  }
  /** True when a gamepad is connected. */
  isGamepadAvailable(id?: number): boolean {
    return this.isReady && native.isGamepadAvailable(id);
  }
  /** Current value of the given gamepad axis. */
  getGamepadAxis(axis: number): number {
    return this.isReady ? native.getGamepadAxis(axis) : 0;
  }
  /** Current value of the given axis on the gamepad with the given id. */
  getGamepadAxisValue(id: number, axis: number): number {
    return this.isReady ? native.getGamepadAxisValue(id, axis) : 0;
  }
  /** Number of axes reported by the gamepad. */
  getGamepadAxisCount(): number {
    return this.isReady ? native.getGamepadAxisCount() : 0;
  }
  /** True on the frame the gamepad button goes from up to down. */
  isGamepadButtonPressed(button: number): boolean {
    return this.isReady && native.isGamepadButtonPressed(button);
  }
  /** True while the gamepad button is held. */
  isGamepadButtonDown(button: number): boolean {
    return this.isReady && native.isGamepadButtonDown(button);
  }
  /** True on the frame the gamepad button is released. */
  isGamepadButtonReleased(button: number): boolean {
    return this.isReady && native.isGamepadButtonReleased(button);
  }
  /**
   * Vibrates the gamepad for `seconds`. `low` drives the low-frequency motor and `high` the high-frequency motor. Returns false if the system is not ready.
   */
  rumbleGamepad(low: number, high: number, seconds: number): boolean {
    if (!this.isReady) return false;
    native.gamepadRumble(low, high, seconds);
    return true;
  }
  /** Position of the touch in the given slot as an `{ x, y }` object. */
  getTouchPosition(index: number): { x: number; y: number } {
    return this.isReady ? native.getTouchPosition(index) : { x: 0, y: 0 };
  }
  /** X position of the touch in the given slot. */
  getTouchX(index: number): number {
    return this.isReady ? native.getTouchX(index) : 0;
  }
  /** Y position of the touch in the given slot. */
  getTouchY(index: number): number {
    return this.isReady ? native.getTouchY(index) : 0;
  }
  /**
   * Number of active touches. Slots can be sparse, so scan `0..getMaxTouchPoints()` with `isTouchActive` to enumerate fingers.
   */
  getTouchCount(): number {
    return this.isReady ? native.getTouchCount() : 0;
  }
  /** Number of active touches; returns the same value as `getTouchCount`. */
  getTouchPointCount(): number {
    return this.isReady ? native.getTouchPointCount() : 0;
  }
  /** True when the touch slot currently holds a live finger. */
  isTouchActive(index: number): boolean {
    return this.isReady && native.isTouchActive(index);
  }
  /** Number of touch slots the device reports. */
  getMaxTouchPoints(): number {
    return this.isReady ? native.getMaxTouchPoints() : 0;
  }
  /** True when any input is pressed this frame. */
  isAnyInputPressed(): boolean {
    return this.isReady && native.isAnyInputPressed();
  }
  /**
   * Digital Crown rotation in radians accumulated since the last call, positive when clockwise; 0 on platforms without a crown. Reading consumes the value.
   */
  getCrownRotation(): number {
    return this.isReady ? native.getCrownRotation() : 0;
  }
  /** Current platform as a `Platform` constant, or `Platform.UNKNOWN` when not ready. */
  getPlatform(): number {
    return this.isReady ? native.getPlatform() : native.Platform.UNKNOWN;
  }
  /**
   * User's preferred OS language packed as a 2-letter code (`c0 * 256 + c1`, lowercase ASCII ISO-639 primary subtag).
   */
  getLanguage(): number {
    return this.isReady ? native.getLanguage() : 0;
  }
  /** True on iOS and Android. */
  isMobile(): boolean {
    return this.isReady && native.isMobile();
  }
  /** True on tvOS. */
  isTV(): boolean {
    return this.isReady && native.isTV();
  }
  /** True on watchOS. */
  isWatch(): boolean {
    return this.isReady && native.isWatch();
  }
  /** Current screen width. */
  getScreenWidth(): number {
    return this.isReady ? native.getScreenWidth() : 0;
  }
  /** Current screen height. */
  getScreenHeight(): number {
    return this.isReady ? native.getScreenHeight() : 0;
  }
  /**
   * Converts a screen position to 2D world coordinates. Uses the current scene's camera and viewport unless `camera` or `viewport` is given (pass `null` for `viewport` to ignore the scene viewport). Returns null when not ready or when the position or camera is invalid.
   */
  screenToWorld(
    position: { x: number; y: number },
    camera?: Camera2D,
    viewport?: Viewport2D | null,
  ): { x: number; y: number } | null {
    if (!this.isReady) return null;
    const scene = this.owner.scenes.currentScene;
    const selectedViewport = viewport === undefined ? (scene === null ? null : scene.viewport2D) : viewport;
    const sceneCamera = scene === null ? null : scene.camera2D;
    const selectedCamera =
      camera === undefined
        ? sceneCamera === null && selectedViewport !== null
          ? { offset: { x: 0, y: 0 }, target: { x: 0, y: 0 }, rotation: 0, zoom: 1 }
          : sceneCamera
        : camera;
    if (selectedCamera === null || !validCamera(selectedCamera) || !validPoint(position)) return null;
    if (selectedViewport !== null) {
      return selectedViewport.screenToWorld(
        position,
        selectedCamera,
        this.owner.window.width,
        this.owner.window.height,
      );
    }
    return native.getScreenToWorld2D(position, selectedCamera);
  }
  /**
   * Converts a 2D world position to screen coordinates. Uses the current scene's camera and viewport unless `camera` or `viewport` is given (pass `null` for `viewport` to ignore the scene viewport). Returns null when not ready or when the position or camera is invalid.
   */
  worldToScreen(
    position: { x: number; y: number },
    camera?: Camera2D,
    viewport?: Viewport2D | null,
  ): { x: number; y: number } | null {
    if (!this.isReady) return null;
    const scene = this.owner.scenes.currentScene;
    const selectedViewport = viewport === undefined ? (scene === null ? null : scene.viewport2D) : viewport;
    const sceneCamera = scene === null ? null : scene.camera2D;
    const selectedCamera =
      camera === undefined
        ? sceneCamera === null && selectedViewport !== null
          ? { offset: { x: 0, y: 0 }, target: { x: 0, y: 0 }, rotation: 0, zoom: 1 }
          : sceneCamera
        : camera;
    if (selectedCamera === null || !validCamera(selectedCamera) || !validPoint(position)) return null;
    if (selectedViewport !== null) {
      return selectedViewport.worldToScreen(
        position,
        selectedCamera,
        this.owner.window.width,
        this.owner.window.height,
      );
    }
    return native.getWorldToScreen2D(position, selectedCamera);
  }
  /** Simulates the key being pressed. Returns false if the system is not ready. */
  injectKeyDown(key: number): boolean {
    if (!this.isReady) return false;
    native.injectKeyDown(key);
    return true;
  }
  /** Simulates the key being released. Returns false if the system is not ready. */
  injectKeyUp(key: number): boolean {
    if (!this.isReady) return false;
    native.injectKeyUp(key);
    return true;
  }
  /** Simulates a gamepad axis value. Returns false if the system is not ready. */
  injectGamepadAxis(axis: number, value: number): boolean {
    if (!this.isReady) return false;
    native.injectGamepadAxis(axis, value);
    return true;
  }
  /** Simulates a gamepad button press. Returns false if the system is not ready. */
  injectGamepadButtonDown(button: number): boolean {
    if (!this.isReady) return false;
    native.injectGamepadButtonDown(button);
    return true;
  }
  /** Simulates a gamepad button release. Returns false if the system is not ready. */
  injectGamepadButtonUp(button: number): boolean {
    if (!this.isReady) return false;
    native.injectGamepadButtonUp(button);
    return true;
  }
  /** Hides and captures the cursor. Returns false if the system is not ready. */
  disableCursor(): boolean {
    if (!this.isReady) return false;
    native.disableCursor();
    return true;
  }
  /** Shows and releases the cursor. Returns false if the system is not ready. */
  enableCursor(): boolean {
    if (!this.isReady) return false;
    native.enableCursor();
    return true;
  }
  /** Sets the mouse cursor shape using a `CursorShape` value. Returns false if the system is not ready. */
  setCursorShape(shape: number): boolean {
    if (!this.isReady) return false;
    native.setCursorShape(shape);
    return true;
  }
  /** Copies text to the system clipboard. Returns false if the system is not ready. */
  setClipboardText(text: string): boolean {
    if (!this.isReady) return false;
    native.setClipboardText(text);
    return true;
  }
  /** Text currently on the system clipboard, or an empty string. */
  getClipboardText(): string {
    return this.isReady ? native.getClipboardText() : '';
  }
  /**
   * Shows a native open-file dialog and returns the chosen path, or an empty string if cancelled. `filter` is a file extension, or empty for all files.
   */
  openFileDialog(filter: string, title: string): string {
    return this.isReady ? native.openFileDialog(filter, title) : '';
  }
  /** Shows a native save-file dialog and returns the chosen path, or an empty string if cancelled. */
  saveFileDialog(defaultName: string, title: string): string {
    return this.isReady ? native.saveFileDialog(defaultName, title) : '';
  }
  /** Writes `data` to the file at `path`. Returns true on success. */
  writeFile(path: string, data: string): boolean {
    return this.isReady && native.writeFile(path, data);
  }
  /** True when a file exists at `path`. */
  fileExists(path: string): boolean {
    return this.isReady && native.fileExists(path);
  }
  /** Contents of the file at `path`, or an empty string. */
  readFile(path: string): string {
    return this.isReady ? native.readFile(path) : '';
  }

  /** Clears all action maps and stops this input system from answering queries. Safe to call more than once. */
  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    for (let index = 0; index < this.actionMaps.length; index++) this.actionMaps[index].clear();
    this.actionMaps.length = 0;
  }
}
