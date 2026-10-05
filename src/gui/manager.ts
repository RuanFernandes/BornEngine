import type { Game } from '../core/game';
import { GUIEvent, GUIEventType, type GUIEventOptions } from './events';
import type { GUI } from './gui';
import type { GuiSize } from './types';
import { GuiNativeBridge } from './native-bridge';

type NativeValueControl = GUI & {
  _captureValueRevision?: () => number;
  _applyNativeValue?: (value: number | boolean, commandRevision: number) => void;
  getValue?: () => number | boolean;
};

export class GUIManager {
  readonly game: Game;
  private controls: GUI[] = [];
  private focusedControl: GUI | null = null;
  private viewport: GuiSize = { width: 0, height: 0 };
  private disposed = false;
  private readonly bridge: GuiNativeBridge;
  private submittedControls = new Map<number, { control: GUI; revision: number }>();

  constructor(game: Game, bridge: GuiNativeBridge = new GuiNativeBridge()) {
    this.game = game;
    this.bridge = bridge;
  }

  getControls(): readonly GUI[] { return this.controls.slice(); }
  getFocusedControl(): GUI | null { return this.focusedControl; }

  addControl(control: GUI): GUI {
    if (control.parent !== null || control._getManager() !== null) {
      throw new Error('GUI control already has a parent or owner.');
    }
    if (control._isDestroyed()) throw new Error('Destroyed GUI controls cannot be attached.');
    this.controls.push(control);
    control._setManager(this);
    control._attachedToManager();
    control._reflowFromManager();
    return control;
  }

  removeControl(control: GUI): boolean {
    const index = this.controls.indexOf(control);
    if (index < 0) return false;
    this._clearFocusWithin(control);
    this.controls.splice(index, 1);
    control._detachedFromManager();
    return true;
  }

  clearControls(): void {
    for (const control of this.controls.slice()) this.removeControl(control);
  }

  updateFrame(_deltaTime: number): void {
    if (this.disposed || !this.bridge.isAvailable()) return;
    for (const [id, entry] of this.submittedControls) {
      const response = this.bridge.response(id);
      if (!response.present) continue;
      const control = entry.control as NativeValueControl;
      if (control._applyNativeValue !== undefined) {
        const currentValue = control.getValue?.();
        const value = typeof currentValue === 'boolean' ? response.value > 0.5 : response.value;
        control._applyNativeValue(value, entry.revision);
      }
    }

    for (const nativeEvent of this.bridge.events()) {
      const control = this.submittedControls.get(nativeEvent.controlId)?.control;
      if (control === undefined) continue;
      this.dispatchEvent(control, nativeEvent.type, {
        local: { x: nativeEvent.localX, y: nativeEvent.localY },
        global: { x: nativeEvent.globalX, y: nativeEvent.globalY },
        key: nativeEvent.key,
        button: nativeEvent.button,
        wheelX: nativeEvent.wheelX,
        wheelY: nativeEvent.wheelY,
        modifiers: nativeEvent.modifiers,
      });
    }
  }

  renderFrame(): void {
    if (this.disposed || !this.bridge.isAvailable()) return;
    const commands: import('./commands').GuiControlCommand[] = [];
    this.submittedControls.clear();
    for (const root of this.controls) {
      root._emitCommands(commands);
      const emittedIds = new Set(commands.map((command) => command.id));
      this.collectSubmittedControls(root, emittedIds);
    }
    this.bridge.submit(commands);
  }

  isAvailable(): boolean { return !this.disposed && this.bridge.isAvailable(); }
  wantsPointerInput(): boolean { return !this.disposed && this.bridge.wantsPointerInput(); }
  wantsKeyboardInput(): boolean { return !this.disposed && this.bridge.wantsKeyboardInput(); }

  dispatchEvent(target: GUI, type: number, options: GUIEventOptions = {}): GUIEvent | null {
    if (this.disposed || target._getManager() !== this || !target._isInputEligible()) return null;
    const event = new GUIEvent(type, target, options);
    let current: GUI | null = target;
    while (current !== null) {
      if (!current._isInputEligible()) break;
      event.currentTarget = current;
      current._dispatchGuiEvent(event);
      if (event.isPropagationStopped()) break;
      current = current.parent;
    }
    return event;
  }

  dispose(): void {
    if (this.disposed) return;
    this.clearControls();
    this.disposed = true;
  }

  /** @internal Moves an owned root to the front or back of the root list. */
  _reorderControl(control: GUI, toFront: boolean): void {
    const index = this.controls.indexOf(control);
    if (index < 0) return;
    this.controls.splice(index, 1);
    if (toFront) this.controls.push(control);
    else this.controls.unshift(control);
  }

  /** @internal Changes keyboard focus and dispatches the matching event. */
  _focusControl(control: GUI): void {
    if (this.disposed || control._getManager() !== this || !control._isInputEligible()) return;
    if (this.focusedControl === control) return;
    const previous = this.focusedControl;
    this.focusedControl = control;
    if (previous !== null) {
      previous._setFocused(false);
      this.dispatchEvent(previous, GUIEventType.Blur);
    }
    control._setFocused(true);
    this.dispatchEvent(control, GUIEventType.Focus);
  }

  /** @internal Removes focus only when the requested control currently owns it. */
  _blurControl(control: GUI): void {
    if (this.focusedControl !== control) return;
    this.focusedControl = null;
    control._setFocused(false);
    if (control._getManager() === this && control._isInputEligible()) this.dispatchEvent(control, GUIEventType.Blur);
  }

  /** @internal Clears focused descendants before a subtree is detached or hidden. */
  _clearFocusWithin(subtree: GUI): void {
    const focused = this.focusedControl;
    if (focused === null || !subtree._containsControl(focused)) return;
    this.focusedControl = null;
    focused._setFocused(false);
    if (focused._getManager() === this && focused._isInputEligible()) this.dispatchEvent(focused, GUIEventType.Blur);
  }

  /** @internal Viewport bounds are supplied by Game integration. */
  _getViewportSize(): GuiSize { return { ...this.viewport }; }

  private collectSubmittedControls(control: GUI, emittedIds: Set<number>): void {
    if (emittedIds.has(control.id)) {
      const valueControl = control as NativeValueControl;
      this.submittedControls.set(control.id, {
        control,
        revision: valueControl._captureValueRevision?.() ?? 0,
      });
    }
    for (const child of control.getControls()) this.collectSubmittedControls(child, emittedIds);
  }

  /** @internal Updates centered root controls after a viewport resize. */
  _setViewportSize(width: number, height: number): void {
    this.viewport = { width, height };
    for (const control of this.controls) control._reflowFromManager();
  }
}
