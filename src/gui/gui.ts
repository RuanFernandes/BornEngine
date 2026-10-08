import {
  addGuiPoints,
  centeredCoordinate,
  clampGuiSize,
  subtractGuiPoints,
  validateGuiCoordinate,
  validateGuiDimension,
} from './layout';
import { GUIEvent, GUIEventType } from './events';
import {
  GuiControlKind,
  intersectGuiRects,
  type GuiClipCommand,
  type GuiControlCommand,
  type GuiControlItemCommand,
  type GuiDrawingPayload,
} from './commands';
import { GUIProfiles, GuiProfile } from './profile';
import {
  allocateGUIId,
  type GUIControlOptions,
  type GuiCursor,
  type GuiPoint,
  type GuiRect,
  type GuiSize,
} from './types';
import type { GUIManager } from './manager';

export class GUI {
  readonly id: number;

  private _parent: GUI | null = null;
  private _controls: GUI[] = [];
  private _manager: GUIManager | null = null;
  private _x = 0;
  private _y = 0;
  private _width = 0;
  private _height = 0;
  private _minimumSize: GuiSize = { width: 0, height: 0 };
  private geometryRevision = 0;
  private nativeGeometryManaged = false;
  private _centerHorizontal = false;
  private _centerVertical = false;
  private _visible = true;
  private _active = true;
  private _clipChildren = false;
  private _clipToBounds = false;
  private _hint = '';
  private _cursor: GuiCursor = 'arrow';
  private _focused = false;
  private _firstResponder = false;
  private _destroyed = false;
  private _profile: GuiProfile | null = null;
  protected _guiCommandKind: number = GuiControlKind.Control;
  protected _guiCommandValues: number[] = [];
  protected _guiCommandText = '';
  protected _guiCommandItems: GuiControlItemCommand[] = [];
  protected _guiCommandDrawings: GuiDrawingPayload[] = [];

  constructor(options: GUIControlOptions = {}) {
    this.id = allocateGUIId();
    const x = validateGuiCoordinate(options.x ?? 0, 'x');
    const y = validateGuiCoordinate(options.y ?? 0, 'y');
    const width = validateGuiDimension(options.width ?? 0, 'width');
    const height = validateGuiDimension(options.height ?? 0, 'height');
    this._x = x;
    this._y = y;
    this._width = width;
    this._height = height;
    this._visible = options.visible ?? true;
    this._active = options.active ?? true;
    this._clipChildren = options.clipChildren ?? false;
    this._clipToBounds = options.clipToBounds ?? false;
  }

  get parent(): GUI | null {
    return this._parent;
  }

  getControls(): readonly GUI[] {
    return this._controls.slice();
  }
  getParent(): GUI | null {
    return this._parent;
  }

  getRoot(): GUI {
    let root: GUI = this;
    while (root._parent !== null) root = root._parent;
    return root;
  }

  getX(): number {
    return this._x;
  }
  setX(x: number): this {
    validateGuiCoordinate(x, 'x');
    this._centerHorizontal = false;
    this.applyGeometry(x, this._y, this._width, this._height);
    return this;
  }

  getY(): number {
    return this._y;
  }
  setY(y: number): this {
    validateGuiCoordinate(y, 'y');
    this._centerVertical = false;
    this.applyGeometry(this._x, y, this._width, this._height);
    return this;
  }

  getWidth(): number {
    return this._width;
  }
  setWidth(width: number): this {
    this.applyGeometry(this._x, this._y, width, this._height);
    this.reflowOwnCenter();
    return this;
  }

  getHeight(): number {
    return this._height;
  }
  setHeight(height: number): this {
    this.applyGeometry(this._x, this._y, this._width, height);
    this.reflowOwnCenter();
    return this;
  }

  getPosition(): GuiPoint {
    return { x: this._x, y: this._y };
  }
  setPosition(x: number, y: number): this {
    validateGuiCoordinate(x, 'x');
    validateGuiCoordinate(y, 'y');
    this._centerHorizontal = false;
    this._centerVertical = false;
    this.applyGeometry(x, y, this._width, this._height);
    return this;
  }

  getSize(): GuiSize {
    return { width: this._width, height: this._height };
  }
  setSize(width: number, height: number): this {
    this.applyGeometry(this._x, this._y, width, height);
    this.reflowOwnCenter();
    return this;
  }

  resize(x: number, y: number, width: number, height: number): this {
    validateGuiCoordinate(x, 'x');
    validateGuiCoordinate(y, 'y');
    validateGuiDimension(width, 'width');
    validateGuiDimension(height, 'height');
    this._centerHorizontal = false;
    this._centerVertical = false;
    this.applyGeometry(x, y, width, height);
    return this;
  }

  center(): this {
    this._centerHorizontal = true;
    this._centerVertical = true;
    this.reflowOwnCenter();
    return this;
  }

  centerHorizontal(): this {
    this._centerHorizontal = true;
    this.reflowOwnCenter();
    return this;
  }

  centerVertical(): this {
    this._centerVertical = true;
    this.reflowOwnCenter();
    return this;
  }

  localToGlobal(point: GuiPoint): GuiPoint {
    validateGuiCoordinate(point.x, 'point.x');
    validateGuiCoordinate(point.y, 'point.y');
    let mapped: GuiPoint = { x: this._x + point.x, y: this._y + point.y };
    let ancestor = this._parent;
    while (ancestor !== null) {
      const insets = ancestor._getContentInsets();
      mapped = ancestor._transformChildPoint({ x: mapped.x + insets.left, y: mapped.y + insets.top });
      mapped = addGuiPoints(mapped, { x: ancestor._x, y: ancestor._y });
      ancestor = ancestor._parent;
    }
    return mapped;
  }

  globalToLocal(point: GuiPoint): GuiPoint {
    validateGuiCoordinate(point.x, 'point.x');
    validateGuiCoordinate(point.y, 'point.y');
    const ancestors: GUI[] = [];
    for (let ancestor = this._parent; ancestor !== null; ancestor = ancestor._parent) ancestors.push(ancestor);
    let mapped = { ...point };
    for (const ancestor of ancestors.reverse()) {
      mapped = subtractGuiPoints(mapped, { x: ancestor._x, y: ancestor._y });
      mapped = ancestor._inverseTransformChildPoint(mapped);
      const insets = ancestor._getContentInsets();
      mapped = subtractGuiPoints(mapped, { x: insets.left, y: insets.top });
    }
    return subtractGuiPoints(mapped, { x: this._x, y: this._y });
  }

  /** @internal Maps a child point through this control's layout transform. */
  _transformChildPoint(point: GuiPoint): GuiPoint {
    return { ...point };
  }

  /** @internal Reverses this control's child layout transform. */
  _inverseTransformChildPoint(point: GuiPoint): GuiPoint {
    return { ...point };
  }

  /** @internal Maps a child size through this control's layout transform. */
  _transformChildSize(size: GuiSize): GuiSize {
    return { ...size };
  }

  /** @internal Reverses a child size through this control's layout transform. */
  _inverseTransformChildSize(size: GuiSize): GuiSize {
    return { ...size };
  }

  /** @internal Virtual dimensions available to centered child controls. */
  _getChildLayoutSize(): GuiSize {
    return this.getSize();
  }

  private localToGlobalSize(size: GuiSize): GuiSize {
    let mapped = { ...size };
    for (let ancestor = this._parent; ancestor !== null; ancestor = ancestor._parent) {
      mapped = ancestor._transformChildSize(mapped);
    }
    return mapped;
  }

  /** @internal Converts a submitted physical size back into this content's virtual space. */
  _globalToLocalSize(size: GuiSize): GuiSize {
    let mapped = { ...size };
    for (let ancestor: GUI | null = this; ancestor !== null; ancestor = ancestor._parent) {
      mapped = ancestor._inverseTransformChildSize(mapped);
    }
    return mapped;
  }

  addControl(control: GUI): GUI {
    this.assertCanAttach(control);
    control._parent = this;
    this._controls.push(control);
    control.assignManagerRecursively(this._manager);
    control.reflowOwnCenter();
    control.onAdd();
    if (control._isLocallyAwake()) control.onWake();
    return control;
  }

  removeControl(control: GUI): boolean {
    const index = this._controls.indexOf(control);
    if (index < 0) return false;
    this._manager?._clearFocusWithin(control);
    this._controls.splice(index, 1);
    control._parent = null;
    if (control._isLocallyAwake()) control.onSleep();
    control.assignManagerRecursively(null);
    control.onRemove();
    return true;
  }

  clearControls(): void {
    for (const control of this._controls.slice()) this.removeControl(control);
  }

  isVisible(): boolean {
    return this._visible;
  }
  setVisible(value: boolean): this {
    if (this._visible === value) return this;
    this._visible = value;
    if (value) {
      this.onShow();
      if (this._isLocallyAwake()) this.onWake();
    } else {
      if (this._active) this.onSleep();
      this.onHide();
      this._manager?._clearFocusWithin(this);
    }
    return this;
  }

  isActive(): boolean {
    return this._active;
  }
  setActive(value: boolean): this {
    if (this._active === value) return this;
    this._active = value;
    if (value) {
      if (this._visible) this.onWake();
    } else {
      if (this._visible) this.onSleep();
      this._manager?._clearFocusWithin(this);
    }
    return this;
  }

  show(): this {
    return this.setVisible(true);
  }
  hide(): this {
    return this.setVisible(false);
  }

  setClipChildren(value: boolean): this {
    this._clipChildren = value;
    return this;
  }
  getClipChildren(): boolean {
    return this._clipChildren;
  }
  setClipToBounds(value: boolean): this {
    this._clipToBounds = value;
    return this;
  }
  getClipToBounds(): boolean {
    return this._clipToBounds;
  }

  getMinimumSize(): GuiSize {
    return { ...this._minimumSize };
  }
  setMinimumSize(width: number, height: number): this {
    const minimum = {
      width: validateGuiDimension(width, 'minimum width'),
      height: validateGuiDimension(height, 'minimum height'),
    };
    this._minimumSize = minimum;
    this.applyGeometry(this._x, this._y, Math.max(this._width, width), Math.max(this._height, height));
    this.reflowOwnCenter();
    return this;
  }

  getHint(): string {
    return this._hint;
  }
  setHint(text: string): this {
    this._hint = text;
    return this;
  }
  getCursor(): GuiCursor {
    return this._cursor;
  }
  setCursor(cursor: GuiCursor): this {
    this._cursor = cursor;
    return this;
  }

  getProfile(): GuiProfile {
    return this._profile ?? GUIProfiles.get('default');
  }
  setProfile(profile: GuiProfile | null): this {
    if (profile !== null && !(profile instanceof GuiProfile))
      throw new TypeError('setProfile expects a GuiProfile or null.');
    this._profile = profile;
    return this;
  }

  setOwnProfile(profile?: GuiProfile): GuiProfile {
    const source = profile ?? this._profile ?? GUIProfiles.get('default');
    this._profile = source.clone();
    return this._profile;
  }

  /** @internal Flattens this control and its descendants to typed render commands. */
  _emitCommands(
    commands: GuiControlCommand[],
    inheritedProfile: GuiProfile | null = null,
    clip: GuiRect | null = null,
    parentId = 0,
    clipStack: GuiClipCommand[] = [],
  ): void {
    if (!this._visible || !this._active || this._destroyed) return;
    const profile = this._profile ?? inheritedProfile ?? GUIProfiles.get('default');
    const origin = this.localToGlobal({ x: 0, y: 0 });
    const size = this.localToGlobalSize({ width: this._width, height: this._height });
    const rect: GuiRect = { x: origin.x, y: origin.y, width: size.width, height: size.height };
    const ownClip = this._clipToBounds ? (clip === null ? rect : intersectGuiRects(clip, rect)) : clip;
    const ownClipStack = this._clipToBounds ? [...clipStack, { ownerId: this.id, rect: { ...rect } }] : clipStack;
    commands.push({
      kind: this._guiCommandKind,
      id: this.id,
      parentId,
      rect,
      clip: ownClip,
      clips: ownClipStack.map((entry) => ({ ownerId: entry.ownerId, rect: { ...entry.rect } })),
      backgroundTextureHandle: 0,
      profile: profile.clone(),
      values: this._guiCommandValues.slice(),
      text: this._guiCommandText,
      items: this._guiCommandItems.map((item) => ({ ...item })),
      drawings: this._guiCommandDrawings.map((drawing) => ({ ...drawing, values: drawing.values.slice() })),
    });
    const childClip = this._clipChildren ? (clip === null ? rect : intersectGuiRects(clip, rect)) : clip;
    const childClipStack = this._clipChildren ? [...clipStack, { ownerId: this.id, rect: { ...rect } }] : clipStack;
    for (const child of this._controls) child._emitCommands(commands, profile, childClip, this.id, childClipStack);
  }

  focus(): this {
    this._manager?._focusControl(this);
    return this;
  }

  blur(): this {
    this._manager?._blurControl(this);
    return this;
  }

  isFocused(): boolean {
    return this._focused && this._manager !== null;
  }

  makeFirstResponder(enabled = true): this {
    this._firstResponder = enabled;
    if (enabled) this.focus();
    else this.blur();
    return this;
  }

  isFirstResponder(): boolean {
    return this._firstResponder && this.isFocused();
  }

  tabFirst(): this {
    const first = this.findFirstFocusableDescendant();
    first?.focus();
    return this;
  }

  bringToFront(): this {
    if (this._parent !== null) this._parent.reorderControl(this, true);
    else this._manager?._reorderControl(this, true);
    return this;
  }

  pushToBack(): this {
    if (this._parent !== null) this._parent.reorderControl(this, false);
    else this._manager?._reorderControl(this, false);
    return this;
  }

  destroy(): void {
    if (this._destroyed) return;
    const parent = this._parent;
    const manager = this._manager;
    if (parent !== null) parent.removeControl(this);
    else manager?.removeControl(this);
    this.clearControls();
    this._destroyed = true;
  }

  protected onAdd(): void {}
  protected onRemove(): void {}
  protected onShow(): void {}
  protected onHide(): void {}
  protected onWake(): void {}
  protected onSleep(): void {}
  protected onMove(): void {}
  protected onResize(): void {}
  protected onAction(_event: GUIEvent): void {}
  protected onChange(_event: GUIEvent): void {}
  protected onFocus(_event: GUIEvent): void {}
  protected onBlur(_event: GUIEvent): void {}
  protected onPointerEnter(_event: GUIEvent): void {}
  protected onPointerLeave(_event: GUIEvent): void {}
  protected onPointerMove(_event: GUIEvent): void {}
  protected onPointerDown(_event: GUIEvent): void {}
  protected onPointerUp(_event: GUIEvent): void {}
  protected onPointerDrag(_event: GUIEvent): void {}
  protected onWheel(_event: GUIEvent): void {}
  protected onKeyDown(_event: GUIEvent): void {}
  protected onKeyUp(_event: GUIEvent): void {}

  /** @internal Used by GUIManager to deliver one event at this bubble level. */
  _dispatchGuiEvent(event: GUIEvent): void {
    switch (event.type) {
      case GUIEventType.Action:
        this.onAction(event);
        break;
      case GUIEventType.Change:
        this.onChange(event);
        break;
      case GUIEventType.Focus:
        this.onFocus(event);
        break;
      case GUIEventType.Blur:
        this.onBlur(event);
        break;
      case GUIEventType.PointerEnter:
        this.onPointerEnter(event);
        break;
      case GUIEventType.PointerLeave:
        this.onPointerLeave(event);
        break;
      case GUIEventType.PointerMove:
        this.onPointerMove(event);
        break;
      case GUIEventType.PointerDown:
        this.onPointerDown(event);
        break;
      case GUIEventType.PointerUp:
        this.onPointerUp(event);
        break;
      case GUIEventType.PointerDrag:
        this.onPointerDrag(event);
        break;
      case GUIEventType.Wheel:
        this.onWheel(event);
        break;
      case GUIEventType.KeyDown:
        this.onKeyDown(event);
        break;
      case GUIEventType.KeyUp:
        this.onKeyUp(event);
        break;
    }
  }

  /** @internal Current manager owner, if attached to a game. */
  _getManager(): GUIManager | null {
    return this._manager;
  }

  /** @internal Native control kind used by GUIManager routing. */
  _getGuiCommandKind(): number {
    return this._guiCommandKind;
  }

  /** @internal Optional right-click hook implemented by context-menu controls. */
  _openContextMenuAt(_x: number, _y: number, _button: number): boolean {
    return false;
  }

  /** @internal True when this control and its full ancestor chain can receive input. */
  _isInputEligible(): boolean {
    let control: GUI | null = this;
    while (control !== null) {
      if (!control._visible || !control._active || control._destroyed) return false;
      control = control._parent;
    }
    return this._manager !== null;
  }

  /** @internal Sets focus as part of a manager-owned focus transition. */
  _setFocused(value: boolean): void {
    this._focused = value;
  }

  /** @internal Allows the manager to set root ownership after validation. */
  _setManager(manager: GUIManager | null): void {
    this.assignManagerRecursively(manager);
  }

  /** @internal Checks subtree identity when focus or ownership changes. */
  _containsControl(control: GUI): boolean {
    if (this === control) return true;
    return this._controls.some((child) => child._containsControl(control));
  }

  /** @internal Runs attach/detach lifecycle for manager-owned roots. */
  _attachedToManager(): void {
    this.onAdd();
    if (this._isLocallyAwake()) this.onWake();
  }

  /** @internal Runs detach lifecycle for manager-owned roots. */
  _detachedFromManager(): void {
    if (this._isLocallyAwake()) this.onSleep();
    this.assignManagerRecursively(null);
    this.onRemove();
  }

  /** @internal Returns the manager root origin dimensions used by centering. */
  _managerViewport(): GuiSize {
    return this._manager?._getViewportSize() ?? { width: 0, height: 0 };
  }

  /** @internal Re-resolves center anchors after root ownership or viewport changes. */
  _reflowFromManager(): void {
    this.reflowOwnCenter();
  }

  /** @internal Captures geometry revision for controls with native geometry. */
  _captureGeometryRevision(): number {
    return this.geometryRevision;
  }

  /** @internal Discards a pending native layout response after parent layout changes. */
  _invalidateNativeGeometry(): void {
    this.geometryRevision++;
  }

  /** @internal Content insets used by child coordinates and centering. */
  _getContentInsets(): { left: number; top: number; right: number; bottom: number } {
    const padding = this.getProfile().spacing.padding;
    return { left: padding, top: padding, right: padding, bottom: padding };
  }

  /** @internal Enables native layout readback for window and frame-set children. */
  _setNativeGeometryManaged(enabled: boolean): void {
    this.nativeGeometryManaged = enabled;
  }

  /** @internal Applies a native layout rectangle if TypeScript geometry is unchanged. */
  _applyNativeGeometry(rect: GuiRect, commandRevision: number): void {
    if (!this.nativeGeometryManaged || commandRevision !== this.geometryRevision) return;
    if (![rect.x, rect.y, rect.width, rect.height].every(Number.isFinite)) return;
    const parent = this._parent;
    const position = parent?.globalToLocal({ x: rect.x, y: rect.y }) ?? { x: rect.x, y: rect.y };
    const size = parent?._globalToLocalSize({ width: rect.width, height: rect.height }) ?? {
      width: rect.width,
      height: rect.height,
    };
    const insets = parent?._getContentInsets() ?? { left: 0, top: 0, right: 0, bottom: 0 };
    const x = position.x - insets.left;
    const y = position.y - insets.top;
    const horizontalChanged = x !== this._x || size.width !== this._width;
    const verticalChanged = y !== this._y || size.height !== this._height;
    if (!horizontalChanged && !verticalChanged) return;
    if (horizontalChanged) this._centerHorizontal = false;
    if (verticalChanged) this._centerVertical = false;
    this.applyGeometry(x, y, size.width, size.height);
  }

  /** @internal Executes a handler corresponding to the event type. */
  _isDestroyed(): boolean {
    return this._destroyed;
  }

  private applyGeometry(x: number, y: number, width: number, height: number): void {
    validateGuiCoordinate(x, 'x');
    validateGuiCoordinate(y, 'y');
    validateGuiDimension(width, 'width');
    validateGuiDimension(height, 'height');
    const size = clampGuiSize({ width, height }, this._minimumSize);
    const moved = this._x !== x || this._y !== y;
    const resized = this._width !== size.width || this._height !== size.height;
    if (!moved && !resized) return;
    this._x = x;
    this._y = y;
    this._width = size.width;
    this._height = size.height;
    this.geometryRevision++;
    if (moved) this.onMove();
    if (resized) {
      this.onResize();
      for (const child of this._controls) {
        child._invalidateNativeGeometry();
        child.reflowOwnCenter();
      }
    }
  }

  private reflowOwnCenter(): void {
    if (!this._centerHorizontal && !this._centerVertical) return;
    const parentSize = this._parent?._getChildLayoutSize() ?? this._managerViewport();
    const insets = this._parent?._getContentInsets() ?? { left: 0, top: 0, right: 0, bottom: 0 };
    const x = this._centerHorizontal
      ? insets.left + centeredCoordinate(parentSize.width - insets.left - insets.right, this._width)
      : this._x;
    const y = this._centerVertical
      ? insets.top + centeredCoordinate(parentSize.height - insets.top - insets.bottom, this._height)
      : this._y;
    this.applyGeometry(x, y, this._width, this._height);
  }

  /** @internal Reflows this control after a virtual parent layout changes. */
  _reflowFromParent(): void {
    this.reflowOwnCenter();
  }

  private assignManagerRecursively(manager: GUIManager | null): void {
    this._manager = manager;
    for (const child of this._controls) child.assignManagerRecursively(manager);
  }

  private assertCanAttach(control: GUI): void {
    if (!(control instanceof GUI)) throw new TypeError('Only GUI controls can be attached.');
    if (this._destroyed || control._destroyed) throw new Error('Destroyed GUI controls cannot be attached.');
    for (let ancestor: GUI | null = this; ancestor !== null; ancestor = ancestor._parent) {
      if (ancestor === control) throw new Error('Attaching this control would create a GUI cycle.');
    }
    if (control._parent !== null) throw new Error('GUI control already has a parent.');
    if (control._manager !== null) {
      throw new Error(
        control._manager === this._manager
          ? 'GUI control is already owned by this game; remove it before reparenting.'
          : 'GUI control is already owned by another game.',
      );
    }
  }

  private _isLocallyAwake(): boolean {
    return this._visible && this._active && !this._destroyed;
  }

  private reorderControl(control: GUI, toFront: boolean): void {
    const index = this._controls.indexOf(control);
    if (index < 0) return;
    this._controls.splice(index, 1);
    if (toFront) this._controls.push(control);
    else this._controls.unshift(control);
  }

  private findFirstFocusableDescendant(): GUI | null {
    for (const child of this._controls) {
      if (child._isInputEligible()) return child;
      const nested = child.findFirstFocusableDescendant();
      if (nested !== null) return nested;
    }
    return null;
  }
}
