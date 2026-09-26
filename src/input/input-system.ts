import { GameContext } from '../core/context';
import * as native from '../core/internal';
import type { Camera2D } from '../core/types';
import { InputActionMap } from './input-action-map';

export class InputSystem {
  private actionMaps: InputActionMap[] = [];
  private disposed = false;

  constructor(private readonly context: GameContext) {}

  get isReady(): boolean { return this.context.isReady && !this.context.isDisposed && !this.disposed; }

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

  isKeyPressed(key: number): boolean { return this.isReady && native.isKeyPressed(key); }
  isKeyRepeated(key: number): boolean { return this.isReady && native.isKeyRepeated(key); }
  isKeyDown(key: number): boolean { return this.isReady && native.isKeyDown(key); }
  isKeyReleased(key: number): boolean { return this.isReady && native.isKeyReleased(key); }
  isMouseButtonPressed(button: number): boolean { return this.isReady && native.isMouseButtonPressed(button); }
  isMouseButtonDown(button: number): boolean { return this.isReady && native.isMouseButtonDown(button); }
  isMouseButtonReleased(button: number): boolean { return this.isReady && native.isMouseButtonReleased(button); }
  getMouseX(): number { return this.isReady ? native.getMouseX() : 0; }
  getMouseY(): number { return this.isReady ? native.getMouseY() : 0; }
  getMousePosition(): { x: number; y: number } {
    return this.isReady ? native.getMousePosition() : { x: 0, y: 0 };
  }
  getMouseDeltaX(): number { return this.isReady ? native.getMouseDeltaX() : 0; }
  getMouseDeltaY(): number { return this.isReady ? native.getMouseDeltaY() : 0; }
  getMouseWheel(): number { return this.isReady ? native.getMouseWheel() : 0; }
  getCharPressed(): number { return this.isReady ? native.getCharPressed() : 0; }
  isGamepadAvailable(id?: number): boolean { return this.isReady && native.isGamepadAvailable(id); }
  getGamepadAxis(axis: number): number { return this.isReady ? native.getGamepadAxis(axis) : 0; }
  getGamepadAxisValue(id: number, axis: number): number {
    return this.isReady ? native.getGamepadAxisValue(id, axis) : 0;
  }
  getGamepadAxisCount(): number { return this.isReady ? native.getGamepadAxisCount() : 0; }
  isGamepadButtonPressed(button: number): boolean {
    return this.isReady && native.isGamepadButtonPressed(button);
  }
  isGamepadButtonDown(button: number): boolean { return this.isReady && native.isGamepadButtonDown(button); }
  isGamepadButtonReleased(button: number): boolean {
    return this.isReady && native.isGamepadButtonReleased(button);
  }
  rumbleGamepad(low: number, high: number, seconds: number): boolean {
    if (!this.isReady) return false;
    native.gamepadRumble(low, high, seconds);
    return true;
  }
  getTouchPosition(index: number): { x: number; y: number } {
    return this.isReady ? native.getTouchPosition(index) : { x: 0, y: 0 };
  }
  getTouchX(index: number): number { return this.isReady ? native.getTouchX(index) : 0; }
  getTouchY(index: number): number { return this.isReady ? native.getTouchY(index) : 0; }
  getTouchCount(): number { return this.isReady ? native.getTouchCount() : 0; }
  getTouchPointCount(): number { return this.isReady ? native.getTouchPointCount() : 0; }
  isTouchActive(index: number): boolean { return this.isReady && native.isTouchActive(index); }
  getMaxTouchPoints(): number { return this.isReady ? native.getMaxTouchPoints() : 0; }
  isAnyInputPressed(): boolean { return this.isReady && native.isAnyInputPressed(); }
  getCrownRotation(): number { return this.isReady ? native.getCrownRotation() : 0; }
  getPlatform(): number { return this.isReady ? native.getPlatform() : native.Platform.UNKNOWN; }
  getLanguage(): number { return this.isReady ? native.getLanguage() : 0; }
  isMobile(): boolean { return this.isReady && native.isMobile(); }
  isTV(): boolean { return this.isReady && native.isTV(); }
  isWatch(): boolean { return this.isReady && native.isWatch(); }
  getScreenWidth(): number { return this.isReady ? native.getScreenWidth() : 0; }
  getScreenHeight(): number { return this.isReady ? native.getScreenHeight() : 0; }
  screenToWorld(position: { x: number; y: number }, camera: Camera2D): { x: number; y: number } | null {
    return this.isReady ? native.getScreenToWorld2D(position, camera) : null;
  }
  worldToScreen(position: { x: number; y: number }, camera: Camera2D): { x: number; y: number } | null {
    return this.isReady ? native.getWorldToScreen2D(position, camera) : null;
  }
  injectKeyDown(key: number): boolean { if (!this.isReady) return false; native.injectKeyDown(key); return true; }
  injectKeyUp(key: number): boolean { if (!this.isReady) return false; native.injectKeyUp(key); return true; }
  injectGamepadAxis(axis: number, value: number): boolean {
    if (!this.isReady) return false;
    native.injectGamepadAxis(axis, value);
    return true;
  }
  injectGamepadButtonDown(button: number): boolean {
    if (!this.isReady) return false;
    native.injectGamepadButtonDown(button);
    return true;
  }
  injectGamepadButtonUp(button: number): boolean {
    if (!this.isReady) return false;
    native.injectGamepadButtonUp(button);
    return true;
  }
  disableCursor(): boolean { if (!this.isReady) return false; native.disableCursor(); return true; }
  enableCursor(): boolean { if (!this.isReady) return false; native.enableCursor(); return true; }
  setCursorShape(shape: number): boolean {
    if (!this.isReady) return false;
    native.setCursorShape(shape);
    return true;
  }
  setClipboardText(text: string): boolean {
    if (!this.isReady) return false;
    native.setClipboardText(text);
    return true;
  }
  getClipboardText(): string { return this.isReady ? native.getClipboardText() : ''; }
  openFileDialog(filter: string, title: string): string {
    return this.isReady ? native.openFileDialog(filter, title) : '';
  }
  saveFileDialog(defaultName: string, title: string): string {
    return this.isReady ? native.saveFileDialog(defaultName, title) : '';
  }
  writeFile(path: string, data: string): boolean {
    return this.isReady && native.writeFile(path, data);
  }
  fileExists(path: string): boolean { return this.isReady && native.fileExists(path); }
  readFile(path: string): string { return this.isReady ? native.readFile(path) : ''; }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    for (let index = 0; index < this.actionMaps.length; index++) this.actionMaps[index].clear();
    this.actionMaps.length = 0;
  }
}
