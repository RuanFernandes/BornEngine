import { MouseButton } from '../../core/keys';
import { GUIEventType } from '../events';
import { GUI } from '../gui';
import { GuiPanel } from './layout';
import { GUIProfiles } from '../profile';
import { GuiControlKind } from '../commands';
import { validateGuiCoordinate } from '../layout';
import type { GUIControlOptions } from '../types';

export type GuiItemId = string | number;

export interface GuiArrayItem {
  id: GuiItemId;
  label: string;
}

export abstract class GuiArray extends GUI {
  protected items: GuiArrayItem[] = [];

  protected constructor(options: GUIControlOptions = {}, kind = GuiControlKind.Control, profile = 'default') {
    super(options);
    this._guiCommandKind = kind;
    this.setProfile(GUIProfiles.get(profile));
  }

  getItems(): readonly GuiArrayItem[] { return this.items.map((item) => ({ ...item })); }
  getItemCount(): number { return this.items.length; }

  protected insertItem(label: string, id: GuiItemId): void {
    this.validateId(id);
    if (this.findItem(id) >= 0) throw new Error(`GUI item ID already exists: ${String(id)}`);
    this.items.push({ id, label });
    this.syncItems();
  }

  protected findItem(id: GuiItemId): number {
    return this.items.findIndex((item) => item.id === id);
  }

  protected validateId(id: GuiItemId): void {
    if (typeof id === 'string') {
      if (id.length === 0) throw new TypeError('GUI item IDs cannot be empty.');
      return;
    }
    if (!Number.isSafeInteger(id)) throw new RangeError('Numeric GUI item IDs must be safe integers.');
  }

  protected syncItems(selectedIndex = -1): void {
    this._guiCommandValues = [this.items.length, selectedIndex];
    this._guiCommandText = '';
  }
}

export class GuiPopUpMenu extends GuiArray {
  private selectedId: GuiItemId | null = null;

  constructor(options: GUIControlOptions = {}) {
    super(options, GuiControlKind.PopUpMenu, 'popup');
  }

  add(label: string, id: GuiItemId): this {
    this.insertItem(label, id);
    this.syncSelection();
    return this;
  }

  clear(): this {
    this.items = [];
    this.selectedId = null;
    this.syncItems();
    return this;
  }

  setSelected(id: GuiItemId | null): this {
    if (id !== null && this.findItem(id) < 0) throw new Error(`Unknown GUI item ID: ${String(id)}`);
    this.selectedId = id;
    this.syncSelection();
    return this;
  }

  getSelected(): GuiItemId | null { return this.selectedId; }
  getSelectedText(): string | null {
    const index = this.selectedId === null ? -1 : this.findItem(this.selectedId);
    return index < 0 ? null : this.items[index].label;
  }

  /** @internal Applies an egui selection response while preserving typed IDs. */
  _applyNativeSelection(id: GuiItemId): void {
    if (this.findItem(id) < 0 || this.selectedId === id) return;
    this.selectedId = id;
    this.syncSelection();
    const manager = this._getManager();
    if (manager !== null) manager.dispatchEvent(this, GUIEventType.Change);
  }

  protected syncSelection(): void {
    this.syncItems(this.selectedId === null ? -1 : this.findItem(this.selectedId));
    this._guiCommandText = this.getSelectedText() ?? '';
  }
}

export class GuiPopUpEdit extends GuiPopUpMenu {
  private text = '';

  constructor(options: GUIControlOptions = {}) {
    super(options);
    this._guiCommandKind = GuiControlKind.PopUpEdit;
  }

  setText(text: string): this {
    this.text = text;
    this._guiCommandText = text;
    return this;
  }

  getText(): string { return this.text; }

  protected override syncSelection(): void {
    super.syncSelection();
    this._guiCommandText = this.text;
  }
}

export interface GuiTreeNode {
  id: GuiItemId;
  label: string;
  value?: GuiItemId;
  path: string;
  children: GuiTreeNode[];
}

export const GUI_TREE_MAX_PATH_LENGTH = 4096;
export const GUI_TREE_MAX_PATH_SEGMENTS = 128;

export class GuiTreeView extends GuiArray {
  private rootNodes: GuiTreeNode[] = [];
  private selectedNode: GuiTreeNode | null = null;

  constructor(options: GUIControlOptions = {}) {
    super(options, GuiControlKind.TreeView, 'tree');
  }

  addNode(label: string, value?: GuiItemId): GuiTreeNode {
    const trimmed = label.trim();
    if (trimmed.length === 0) throw new TypeError('Tree node labels cannot be empty.');
    this.validateId(value ?? trimmed);
    if (this.rootNodes.some((node) => node.label === trimmed)) throw new Error(`Tree node already exists: ${trimmed}`);
    const node: GuiTreeNode = { id: value ?? trimmed, label: trimmed, value, path: trimmed, children: [] };
    this.rootNodes.push(node);
    this.selectedNode = node;
    this.syncTreeCommand();
    return node;
  }

  addNodeByPath(path: string, value?: GuiItemId): GuiTreeNode {
    if (path.length === 0 || path.length > GUI_TREE_MAX_PATH_LENGTH) {
      throw new RangeError(`Tree paths must contain between 1 and ${GUI_TREE_MAX_PATH_LENGTH} characters.`);
    }
    const parts = path.split('/');
    if (parts.length > GUI_TREE_MAX_PATH_SEGMENTS) throw new RangeError('Tree path has too many segments.');
    if (parts.some((part) => part.trim().length === 0)) throw new TypeError('Tree path segments cannot be empty.');
    if (value !== undefined) this.validateId(value);

    let siblings = this.rootNodes;
    let parentPath = '';
    let selected: GuiTreeNode | null = null;
    for (let index = 0; index < parts.length; index++) {
      const label = parts[index].trim();
      parentPath = parentPath.length === 0 ? label : `${parentPath}/${label}`;
      let node = siblings.find((item) => item.label === label) ?? null;
      if (node === null) {
        node = { id: index === parts.length - 1 ? (value ?? parentPath) : parentPath, label, path: parentPath, children: [] };
        if (index === parts.length - 1 && value !== undefined) node.value = value;
        siblings.push(node);
      } else if (index === parts.length - 1 && value !== undefined) {
        node.value = value;
        node.id = value;
      }
      selected = node;
      siblings = node.children;
    }
    this.selectedNode = selected;
    this.syncTreeCommand();
    return selected as GuiTreeNode;
  }

  clearNodes(): this {
    this.rootNodes = [];
    this.selectedNode = null;
    this.syncTreeCommand();
    return this;
  }

  getSelected(): GuiTreeNode | null { return this.selectedNode; }
  getSelectedPath(): string | null { return this.selectedNode?.path ?? null; }
  getRootNodes(): readonly GuiTreeNode[] { return this.rootNodes.slice(); }

  setSelectedPath(path: string | null): this {
    if (path === null) this.selectedNode = null;
    else {
      const parts = path.split('/');
      let siblings = this.rootNodes;
      let found: GuiTreeNode | null = null;
      for (const part of parts) {
        found = siblings.find((node) => node.label === part) ?? null;
        if (found === null) throw new Error(`Unknown tree node path: ${path}`);
        siblings = found.children;
      }
      this.selectedNode = found;
    }
    this.syncTreeCommand();
    return this;
  }

  private syncTreeCommand(): void {
    this._guiCommandValues = [this.rootNodes.length, this.selectedNode === null ? -1 : this.rootNodes.indexOf(this.selectedNode)];
    this._guiCommandText = this.selectedNode?.path ?? '';
  }
}

export class GuiTextList extends GuiArray {
  private selectedId: GuiItemId | null = null;

  constructor(options: GUIControlOptions = {}) {
    super(options, GuiControlKind.TextList, 'list');
  }

  addRow(id: GuiItemId, text: string): this {
    this.insertItem(text, id);
    this.syncRows();
    return this;
  }

  removeRow(id: GuiItemId): boolean {
    const index = this.findItem(id);
    if (index < 0) return false;
    this.items.splice(index, 1);
    if (this.selectedId === id) this.selectedId = null;
    this.syncRows();
    return true;
  }

  clearRows(): this {
    this.items = [];
    this.selectedId = null;
    this.syncRows();
    return this;
  }

  setSelected(id: GuiItemId | null): this {
    if (id !== null && this.findItem(id) < 0) throw new Error(`Unknown GUI row ID: ${String(id)}`);
    this.selectedId = id;
    this.syncRows();
    return this;
  }

  getSelected(): GuiItemId | null { return this.selectedId; }
  getRowCount(): number { return this.items.length; }
  getSelectedText(): string | null {
    const index = this.selectedId === null ? -1 : this.findItem(this.selectedId);
    return index < 0 ? null : this.items[index].label;
  }

  private syncRows(): void {
    this.syncItems(this.selectedId === null ? -1 : this.findItem(this.selectedId));
    this._guiCommandText = this.getSelectedText() ?? '';
  }
}

export class GuiTab extends GuiArray {
  private selectedId: GuiItemId | null = null;
  private pages = new Map<GuiItemId, GuiPanel>();

  constructor(options: GUIControlOptions = {}) {
    super(options, GuiControlKind.Tab, 'default');
  }

  addTab(label: string, id: GuiItemId): GuiPanel {
    this.validateId(id);
    if (this.findItem(id) >= 0) throw new Error(`GUI tab ID already exists: ${String(id)}`);
    const page = new GuiPanel({ width: this.getWidth(), height: this.getHeight(), visible: this.selectedId === null });
    this.insertItem(label, id);
    this.pages.set(id, page);
    this.addControl(page);
    if (this.selectedId === null) this.selectedId = id;
    page.setVisible(this.selectedId === id);
    this.syncTabs();
    return page;
  }

  setSelected(id: GuiItemId): this {
    if (this.findItem(id) < 0) throw new Error(`Unknown GUI tab ID: ${String(id)}`);
    this.selectedId = id;
    for (const [tabId, page] of this.pages) page.setVisible(tabId === id);
    this.syncTabs();
    return this;
  }

  getSelected(): GuiItemId | null { return this.selectedId; }
  getTab(id: GuiItemId): GuiPanel | null { return this.pages.get(id) ?? null; }

  private syncTabs(): void {
    this.syncItems(this.selectedId === null ? -1 : this.findItem(this.selectedId));
    const index = this.selectedId === null ? -1 : this.findItem(this.selectedId);
    this._guiCommandText = index < 0 ? '' : this.items[index].label;
  }
}

export class GuiMenu extends GuiPopUpMenu {
  private callbacks = new Map<GuiItemId, (() => void) | null>();

  constructor(options: GUIControlOptions = {}) {
    super(options);
    this._guiCommandKind = GuiControlKind.Menu;
  }

  override add(label: string, id: GuiItemId, callback: (() => void) | null = null): this {
    super.add(label, id);
    this.callbacks.set(id, callback);
    return this;
  }

  activateItem(id: GuiItemId): boolean {
    if (this.items.findIndex((item) => item.id === id) < 0) return false;
    this.setSelected(id);
    this.callbacks.get(id)?.();
    const manager = this._getManager();
    if (manager !== null) manager.dispatchEvent(this, GUIEventType.Action);
    return true;
  }
}

export class GuiContextMenu extends GuiMenu {
  constructor(options: GUIControlOptions = {}) {
    super(options);
    this._guiCommandKind = GuiControlKind.ContextMenu;
    this.hide();
  }

  openAt(x: number, y: number, button: number): boolean {
    if (button !== MouseButton.RIGHT) return false;
    validateGuiCoordinate(x, 'x');
    validateGuiCoordinate(y, 'y');
    this.setPosition(x, y).show();
    return true;
  }

  isOpen(): boolean { return this.isVisible(); }

  override activateItem(id: GuiItemId): boolean {
    if (!this.isOpen()) return false;
    const activated = super.activateItem(id);
    if (activated) this.hide();
    return activated;
  }
}
