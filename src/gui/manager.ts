import type { Game } from '../core/game';
import { getGameContext } from '../core/context';
import type { ContextFrameService, GameContext } from '../core/context';
import type { Texture } from '../textures';
import { GUIEvent, GUIEventType, type GUIEventOptions } from './events';
import type { GUI } from './gui';
import type { GuiSize } from './types';
import { GuiNativeBridge } from './native-bridge';

const GUI_FOCUS_SENTINEL = -1_247_107_654;

type NativeValueControl = GUI & {
  _captureValueRevision?: () => number;
  _captureTextRevision?: () => number;
  _captureGeometryRevision?: () => number;
  _applyNativeValue?: (value: number | boolean, commandRevision: number) => void;
  _applyNativeText?: (text: string, commandRevision: number) => boolean;
  _applyNativeGeometry?: (rect: { x: number; y: number; width: number; height: number }, commandRevision: number) => void;
  _applyNativeSelectionIndex?: (index: number, commandRevision?: number) => void;
  getValue?: () => number | boolean;
};

export class GUIManager implements ContextFrameService {
  readonly game: Game;
  private controls: GUI[] = [];
  private focusedControl: GUI | null = null;
  private viewport: GuiSize = { width: 0, height: 0 };
  private disposed = false;
  private readonly bridge: GuiNativeBridge;
  private readonly context: GameContext | null;
  private submittedControls = new Map<number, { control: GUI; revision: number; textRevision: number; geometryRevision: number }>();
  private pendingNativeFocus: { controlId: number; focused: boolean } | null = null;

  constructor(game: Game, bridge: GuiNativeBridge = new GuiNativeBridge()) {
    this.game = game;
    this.bridge = bridge;
    try { this.context = getGameContext(game); }
    catch { this.context = null; }
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
    const readbackManagedControls = new Set<number>();
    for (const [id, entry] of this.submittedControls) {
      const response = this.bridge.response(id);
      if (!response.present) continue;
      const control = entry.control as NativeValueControl;
      if (control._getManager() !== this || !control._isInputEligible()) continue;
      if (control._applyNativeSelectionIndex !== undefined
        || control._applyNativeValue !== undefined
        || control._applyNativeText !== undefined) {
        readbackManagedControls.add(id);
      }
      if (control._applyNativeSelectionIndex !== undefined) {
        control._applyNativeSelectionIndex(response.value, entry.revision);
      } else if (control._applyNativeValue !== undefined) {
        const currentValue = control.getValue?.();
        const value = typeof currentValue === 'boolean' ? response.value > 0.5 : response.value;
        control._applyNativeValue(value, entry.revision);
      }
      control._applyNativeText?.(response.text, entry.textRevision);
      control._applyNativeGeometry?.(response.rect, entry.geometryRevision);
    }

    for (const nativeEvent of this.bridge.events()) {
      const control = this.submittedControls.get(nativeEvent.controlId)?.control;
      if (control === undefined) continue;
      const eventOptions = {
        local: { x: nativeEvent.localX, y: nativeEvent.localY },
        global: { x: nativeEvent.globalX, y: nativeEvent.globalY },
        key: nativeEvent.key,
        button: nativeEvent.button,
        wheelX: nativeEvent.wheelX,
        wheelY: nativeEvent.wheelY,
        modifiers: nativeEvent.modifiers,
      };
      if (nativeEvent.type === GUIEventType.Focus) {
        this._focusControl(control, eventOptions);
        continue;
      }
      if (nativeEvent.type === GUIEventType.Blur) {
        this._blurControl(control, eventOptions);
        continue;
      }
      if (nativeEvent.type === GUIEventType.Change && readbackManagedControls.has(nativeEvent.controlId)) continue;
      if (nativeEvent.type === GUIEventType.PointerDown) this.openContextMenuForPointer(control, eventOptions);
      this.dispatchEvent(control, nativeEvent.type, eventOptions);
    }
  }

  renderFrame(): void {
    if (this.disposed || !this.bridge.isAvailable()) return;
    const commands: import('./commands').GuiControlCommand[] = [];
    this.submittedControls.clear();
    for (const root of this.controls) {
      root._emitCommands(commands);
    }
    const emittedIds = new Set(commands.map((command) => command.id));
    const controlsById = new Map<number, GUI>();
    for (const root of this.controls) {
      this.collectControls(root, controlsById);
      this.collectSubmittedControls(root, emittedIds);
    }
    const registeredTextures = new Set<number>();
    for (const command of commands) {
      const control = controlsById.get(command.id);
      command.backgroundTextureHandle = this.registerTexture(command.profile.background, registeredTextures);
      if (command.kind === 4 && command.backgroundTextureHandle !== 0 && command.profile.background !== null) {
        const textureSize = command.profile.background;
        command.values = [command.values[0] ?? 0, textureSize.width, textureSize.height];
      }
      if (control !== undefined && (command.kind === 24 || command.kind === 25)) {
        const texture = (control as any)._getTexture?.() as Texture | null | undefined;
        command.values[7] = this.registerTexture(texture ?? null, registeredTextures);
      }
      if (control !== undefined && command.kind === 10) {
        const textures = (control as any)._getButtonTextures?.();
        if (textures !== undefined) {
          command.values = [textures.normal, textures.hover, textures.pressed, textures.disabled]
            .map((texture) => this.registerTexture(texture ?? null, registeredTextures));
        }
      }
      command.drawings = command.drawings.filter((drawing) => {
        if (drawing.texture === undefined) return true;
        drawing.textureHandle = this.registerTexture(drawing.texture, registeredTextures);
        return drawing.textureHandle !== 0;
      });
    }
    let focusRequestSubmitted = false;
    if (this.pendingNativeFocus !== null) {
      const focusCommand = commands.find((command) => command.id === this.pendingNativeFocus?.controlId);
      if (focusCommand !== undefined) {
        focusCommand.values.push(GUI_FOCUS_SENTINEL, this.pendingNativeFocus.focused ? 1 : 2);
        focusRequestSubmitted = true;
      }
    }
    this.bridge.submit(commands);
    if (focusRequestSubmitted) this.pendingNativeFocus = null;
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
    this.context?.unregisterFrameService(this);
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
  _focusControl(control: GUI, eventOptions?: GUIEventOptions): void {
    if (this.disposed || control._getManager() !== this || !control._isInputEligible()) return;
    if (this.focusedControl === control) return;
    if (eventOptions === undefined) this.pendingNativeFocus = { controlId: control.id, focused: true };
    const nativeEventOptions = eventOptions ?? {};
    const previous = this.focusedControl;
    this.focusedControl = control;
    if (previous !== null) {
      previous._setFocused(false);
      this.dispatchEvent(previous, GUIEventType.Blur, nativeEventOptions);
    }
    control._setFocused(true);
    this.dispatchEvent(control, GUIEventType.Focus, nativeEventOptions);
  }

  /** @internal Removes focus only when the requested control currently owns it. */
  _blurControl(control: GUI, eventOptions?: GUIEventOptions): void {
    if (this.focusedControl !== control) return;
    if (eventOptions === undefined) this.pendingNativeFocus = { controlId: control.id, focused: false };
    this.focusedControl = null;
    control._setFocused(false);
    if (control._getManager() === this && control._isInputEligible()) this.dispatchEvent(control, GUIEventType.Blur, eventOptions ?? {});
  }

  /** @internal Clears focused descendants before a subtree is detached or hidden. */
  _clearFocusWithin(subtree: GUI): void {
    const focused = this.focusedControl;
    if (focused === null || !subtree._containsControl(focused)) return;
    this.focusedControl = null;
    this.pendingNativeFocus = { controlId: focused.id, focused: false };
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
        textRevision: valueControl._captureTextRevision?.() ?? 0,
        geometryRevision: valueControl._captureGeometryRevision?.() ?? 0,
      });
    }
    for (const child of control.getControls()) this.collectSubmittedControls(child, emittedIds);
  }

  private collectControls(control: GUI, result: Map<number, GUI>): void {
    result.set(control.id, control);
    for (const child of control.getControls()) this.collectControls(child, result);
  }

  private registerTexture(texture: Texture | null, registered: Set<number>): number {
    if (texture === null || this.context === null || !this.context.owns(texture) || texture.isLoaded !== true) return 0;
    const handle = (texture as any).handleValue;
    if (typeof handle !== 'number' || !Number.isFinite(handle) || handle <= 0) return 0;
    if (!registered.has(handle)) {
      this.game.ui.registerTexture(texture);
      registered.add(handle);
    }
    return handle;
  }

  private openContextMenuForPointer(target: GUI, event: GUIEventOptions): void {
    if (event.button !== 1) return;
    const candidates: Array<{ menu: GUI; owner: GUI | null; depth: number }> = [];
    const visit = (control: GUI): void => {
      if (control._getGuiCommandKind() === 23) {
        const owner = control.parent;
        if (owner === null || owner._containsControl(target)) {
          let depth = 0;
          for (let ancestor = owner; ancestor !== null; ancestor = ancestor.parent) depth++;
          candidates.push({ menu: control, owner, depth });
        }
      }
      for (const child of control.getControls()) visit(child);
    };
    for (const root of this.controls) visit(root);
    candidates.sort((left, right) => right.depth - left.depth);
    const selected = candidates[0];
    if (selected === undefined) return;
    let x = event.global?.x ?? 0;
    let y = event.global?.y ?? 0;
    if (selected.owner !== null) {
      const local = selected.owner.globalToLocal({ x, y });
      const insets = selected.owner._getContentInsets();
      x = local.x - insets.left;
      y = local.y - insets.top;
    }
    selected.menu._openContextMenuAt(x, y, event.button);
  }

  /** @internal Updates centered root controls after a viewport resize. */
  _setViewportSize(width: number, height: number): void {
    this.viewport = { width, height };
    for (const control of this.controls) control._reflowFromManager();
  }
}
