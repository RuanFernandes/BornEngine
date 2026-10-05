import { GUI } from '../gui';
import { GUIProfiles } from '../profile';
import { GuiControlKind } from '../commands';
import { validateGuiDimension } from '../layout';
import type { GUIControlOptions, GuiSize } from '../types';

export class GuiPanel extends GUI {
  constructor(options: GUIControlOptions = {}) {
    super(options);
    this._guiCommandKind = GuiControlKind.Panel;
  }
}

export class GuiWindow extends GuiPanel {
  private title = '';
  private movable = true;
  private resizable = true;
  private closable = true;

  constructor(options: GUIControlOptions = {}) {
    super(options);
    this._guiCommandKind = GuiControlKind.Window;
    this.setProfile(GUIProfiles.get('window'));
    this.syncCommand();
  }

  getTitle(): string { return this.title; }
  setTitle(title: string): this { this.title = title; this.syncCommand(); return this; }
  setMovable(enabled: boolean): this { this.movable = enabled; this.syncCommand(); return this; }
  isMovable(): boolean { return this.movable; }
  setResizable(enabled: boolean): this { this.resizable = enabled; this.syncCommand(); return this; }
  isResizable(): boolean { return this.resizable; }
  setClosable(enabled: boolean): this { this.closable = enabled; this.syncCommand(); return this; }
  isClosable(): boolean { return this.closable; }

  private syncCommand(): void {
    this._guiCommandText = this.title;
    this._guiCommandValues = [this.movable ? 1 : 0, this.resizable ? 1 : 0, this.closable ? 1 : 0];
  }
}

export type GuiScrollBarMode = 'alwaysOn' | 'alwaysOff' | 'dynamic';

function scrollModeValue(mode: GuiScrollBarMode): number {
  if (mode === 'alwaysOn') return 1;
  if (mode === 'alwaysOff') return 2;
  return 0;
}

export class GuiScroll extends GuiPanel {
  private horizontalMode: GuiScrollBarMode = 'dynamic';
  private verticalMode: GuiScrollBarMode = 'dynamic';
  private scrollBarThickness = 12;

  constructor(options: GUIControlOptions = {}) {
    super(options);
    this._guiCommandKind = GuiControlKind.Scroll;
    this.setProfile(GUIProfiles.get('scroll'));
    this.setClipChildren(true);
    this.syncCommand();
  }

  setHorizontalScrollBarMode(mode: GuiScrollBarMode): this {
    this.assertMode(mode);
    this.horizontalMode = mode;
    this.syncCommand();
    return this;
  }

  getHorizontalScrollBarMode(): GuiScrollBarMode { return this.horizontalMode; }

  setVerticalScrollBarMode(mode: GuiScrollBarMode): this {
    this.assertMode(mode);
    this.verticalMode = mode;
    this.syncCommand();
    return this;
  }

  getVerticalScrollBarMode(): GuiScrollBarMode { return this.verticalMode; }

  setScrollBarThickness(pixels: number): this {
    this.scrollBarThickness = validateGuiDimension(pixels, 'scroll bar thickness');
    this.syncCommand();
    return this;
  }

  getScrollBarThickness(): number { return this.scrollBarThickness; }

  private assertMode(mode: GuiScrollBarMode): void {
    if (mode !== 'alwaysOn' && mode !== 'alwaysOff' && mode !== 'dynamic') {
      throw new TypeError('Scroll bar mode must be alwaysOn, alwaysOff, or dynamic.');
    }
  }

  private syncCommand(): void {
    this._guiCommandValues = [scrollModeValue(this.horizontalMode), scrollModeValue(this.verticalMode), this.scrollBarThickness];
  }
}

export class GuiBitmapBorder extends GuiPanel {
  private tiled = false;

  constructor(options: GUIControlOptions = {}) {
    super(options);
    this._guiCommandKind = GuiControlKind.BitmapBorder;
    this.syncCommand();
  }

  setTiled(enabled: boolean): this { this.tiled = enabled; this.syncCommand(); return this; }
  isTiled(): boolean { return this.tiled; }
  private syncCommand(): void { this._guiCommandValues = [this.tiled ? 1 : 0]; }
}

export class GuiStretch extends GuiPanel {
  private clientSize: GuiSize = { width: 0, height: 0 };

  constructor(options: GUIControlOptions = {}) {
    super(options);
    this._guiCommandKind = GuiControlKind.Stretch;
    this.syncCommand();
  }

  setClientSize(width: number, height: number): this {
    validateGuiDimension(width, 'client width');
    validateGuiDimension(height, 'client height');
    this.clientSize = { width, height };
    this.syncCommand();
    return this;
  }

  getClientSize(): GuiSize { return { ...this.clientSize }; }
  private syncCommand(): void { this._guiCommandValues = [this.clientSize.width, this.clientSize.height]; }
}

export class GuiFrameSet extends GuiPanel {
  private columns = 1;
  private rows = 1;
  private splitterWidth = 4;

  constructor(options: GUIControlOptions = {}) {
    super(options);
    this._guiCommandKind = GuiControlKind.FrameSet;
    this.syncCommand();
  }

  setColumnCount(count: number): this {
    this.columns = this.validateCount(count, 'column count');
    this.syncCommand();
    return this;
  }

  setRowCount(count: number): this {
    this.rows = this.validateCount(count, 'row count');
    this.syncCommand();
    return this;
  }

  setSplitterWidth(pixels: number): this {
    this.splitterWidth = validateGuiDimension(pixels, 'splitter width');
    this.syncCommand();
    return this;
  }

  getGridSize(): { columns: number; rows: number } { return { columns: this.columns, rows: this.rows }; }
  getSplitterWidth(): number { return this.splitterWidth; }

  private validateCount(value: number, name: string): number {
    if (!Number.isInteger(value) || value < 1) throw new RangeError(`${name} must be a positive integer.`);
    return value;
  }

  private syncCommand(): void { this._guiCommandValues = [this.columns, this.rows, this.splitterWidth]; }
}
