import { MouseButton } from '../../core/keys';
import { GUIEventType } from '../events';
import { GUI } from '../gui';
import { GuiPanel } from './layout';
import { GUIProfiles } from '../profile';
import { GuiControlKind } from '../commands';
import type { GuiControlKindCode } from '../commands';
import { validateGuiCoordinate } from '../layout';
import type { GUIControlOptions } from '../types';

/** Identifier of a list, menu, or tab item: a non-empty string or a safe integer. */
export type GuiItemId = string | number;

/** Item of an item-based control: a unique ID and its display label. */
export interface GuiArrayItem {
  id: GuiItemId;
  label: string;
}

/** Base class for controls that show a list of items with unique IDs. */
export abstract class GuiArray extends GUI {
  protected items: GuiArrayItem[] = [];
  private selectionRevision = 0;

  protected constructor(
    options: GUIControlOptions = {},
    kind: GuiControlKindCode = GuiControlKind.Control,
    profile = 'default',
  ) {
    super(options);
    this._guiCommandKind = kind;
    this.setProfile(GUIProfiles.get(profile));
  }

  /** Returns a copy of the items in insertion order. */
  getItems(): readonly GuiArrayItem[] {
    return this.items.map((item) => ({ ...item }));
  }
  /** Returns the number of items. */
  getItemCount(): number {
    return this.items.length;
  }
  _captureValueRevision(): number {
    return this.selectionRevision;
  }
  protected _matchesNativeSelectionRevision(revision: number): boolean {
    return revision === this.selectionRevision;
  }
  protected _markNativeSelectionRevision(): void {
    this.selectionRevision++;
  }

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
    this._guiCommandItems = this.items.map((item) => ({ ...item, depth: 0 }));
    this._markNativeSelectionRevision();
  }
}

/** Drop-down menu that lets the user pick one item. */
export class GuiPopUpMenu extends GuiArray {
  private selectedId: GuiItemId | null = null;

  /** Creates the control with the given options. */
  constructor(options: GUIControlOptions = {}) {
    super(options, GuiControlKind.PopUpMenu, 'popup');
  }

  /**
   * Appends an item.
   *
   * @throws Error if the ID already exists. Throws TypeError or RangeError if the ID is invalid.
   */
  add(label: string, id: GuiItemId): this {
    this.insertItem(label, id);
    this.syncSelection();
    return this;
  }

  /** Removes all items and clears the selection. */
  clear(): this {
    this.items = [];
    this.selectedId = null;
    this.syncItems();
    return this;
  }

  /**
   * Selects the item with the given ID, or clears the selection with null.
   *
   * @throws Error if no item has that ID.
   */
  setSelected(id: GuiItemId | null): this {
    if (id !== null && this.findItem(id) < 0) throw new Error(`Unknown GUI item ID: ${String(id)}`);
    this.selectedId = id;
    this.syncSelection();
    return this;
  }

  /** Returns the selected item ID, or null if nothing is selected. */
  getSelected(): GuiItemId | null {
    return this.selectedId;
  }
  /** Returns the label of the selected item, or null if nothing is selected. */
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

  _applyNativeSelectionIndex(index: number, commandRevision = this._captureValueRevision()): void {
    if (!this._matchesNativeSelectionRevision(commandRevision)) return;
    const item = Number.isInteger(index) ? this.items[index] : undefined;
    if (item !== undefined) this._applyNativeSelection(item.id);
  }

  protected syncSelection(): void {
    this.syncItems(this.selectedId === null ? -1 : this.findItem(this.selectedId));
    this._guiCommandText = this.getSelectedText() ?? '';
  }
}

/** Drop-down menu with an editable text field. */
export class GuiPopUpEdit extends GuiPopUpMenu {
  private text = '';
  private textRevision = 0;

  /** Creates the control with the given options. */
  constructor(options: GUIControlOptions = {}) {
    super(options);
    this._guiCommandKind = GuiControlKind.PopUpEdit;
  }

  /** Sets the text shown in the edit field. */
  setText(text: string): this {
    this.text = text;
    this.textRevision++;
    this._guiCommandText = text;
    return this;
  }

  /** Returns the text in the edit field. */
  getText(): string {
    return this.text;
  }

  /** @internal Captures the text revision associated with an emitted command. */
  _captureTextRevision(): number {
    return this.textRevision;
  }

  /** @internal Applies native edits without overwriting newer TypeScript text. */
  _applyNativeText(text: string, commandRevision: number): boolean {
    if (commandRevision !== this.textRevision) return false;
    if (text === this.text) return false;
    this.setText(text);
    const manager = this._getManager();
    if (manager !== null) manager.dispatchEvent(this, GUIEventType.Change);
    return true;
  }

  protected override syncSelection(): void {
    super.syncSelection();
    this._guiCommandText = this.text;
  }
}

/** Node of a GuiTreeView. The path joins the labels from the root with "/". */
export interface GuiTreeNode {
  id: GuiItemId;
  label: string;
  value?: GuiItemId;
  path: string;
  children: GuiTreeNode[];
}

/** Maximum number of characters in a tree node path. */
export const GUI_TREE_MAX_PATH_LENGTH = 4096;
/** Maximum number of segments in a tree node path. */
export const GUI_TREE_MAX_PATH_SEGMENTS = 128;

/** Hierarchical view of nodes addressed by "/"-separated paths. */
export class GuiTreeView extends GuiArray {
  private rootNodes: GuiTreeNode[] = [];
  private selectedNode: GuiTreeNode | null = null;

  /** Creates the control with the given options. */
  constructor(options: GUIControlOptions = {}) {
    super(options, GuiControlKind.TreeView, 'tree');
  }

  /**
   * Adds a root-level node, selects it, and returns it. The label is trimmed and used as the ID unless a value is given.
   *
   * @throws TypeError if the label is empty. Throws Error if a root node with that label exists.
   */
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

  /**
   * Adds a node at a "/"-separated path, creating missing parent nodes, and selects it. Existing nodes along the path are reused.
   *
   * @param value Optional ID and value assigned to the last node.
   * @throws RangeError if the path is empty or exceeds the length or segment limits. Throws TypeError if a segment is empty.
   */
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
        node = {
          id: index === parts.length - 1 ? (value ?? parentPath) : parentPath,
          label,
          path: parentPath,
          children: [],
        };
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

  /** Removes all nodes and clears the selection. */
  clearNodes(): this {
    this.rootNodes = [];
    this.selectedNode = null;
    this.syncTreeCommand();
    return this;
  }

  /** Returns the selected node, or null if none is selected. */
  getSelected(): GuiTreeNode | null {
    return this.selectedNode;
  }
  /** Returns the path of the selected node, or null if none is selected. */
  getSelectedPath(): string | null {
    return this.selectedNode?.path ?? null;
  }
  /** Returns the root-level nodes. */
  getRootNodes(): readonly GuiTreeNode[] {
    return this.rootNodes.slice();
  }

  /**
   * Selects the node at the given path, or clears the selection with null.
   *
   * @throws Error if no node exists at the path.
   */
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
    const flattened: { node: GuiTreeNode; depth: number }[] = [];
    const visit = (nodes: readonly GuiTreeNode[], depth: number): void => {
      for (const node of nodes) {
        flattened.push({ node, depth });
        visit(node.children, depth + 1);
      }
    };
    visit(this.rootNodes, 0);
    this._guiCommandValues = [
      flattened.length,
      this.selectedNode === null ? -1 : flattened.findIndex((entry) => entry.node === this.selectedNode),
    ];
    this._guiCommandText = this.selectedNode?.path ?? '';
    this._guiCommandItems = flattened.map(({ node, depth }) => ({ id: node.id, label: node.label, depth }));
    this._markNativeSelectionRevision();
  }

  _applyNativeSelectionIndex(index: number, commandRevision = this._captureValueRevision()): void {
    if (!this._matchesNativeSelectionRevision(commandRevision)) return;
    const flattened: GuiTreeNode[] = [];
    const visit = (nodes: readonly GuiTreeNode[]): void => {
      for (const node of nodes) {
        flattened.push(node);
        visit(node.children);
      }
    };
    visit(this.rootNodes);
    const selected = Number.isInteger(index) ? flattened[index] : undefined;
    if (selected !== undefined && selected !== this.selectedNode) {
      this.selectedNode = selected;
      this.syncTreeCommand();
      const manager = this._getManager();
      if (manager !== null) manager.dispatchEvent(this, GUIEventType.Change);
    }
  }
}

/** Scrollable list of text rows with single selection. */
export class GuiTextList extends GuiArray {
  private selectedId: GuiItemId | null = null;

  /** Creates the control with the given options. */
  constructor(options: GUIControlOptions = {}) {
    super(options, GuiControlKind.TextList, 'list');
  }

  /**
   * Appends a row with the given ID and text.
   *
   * @throws Error if the ID already exists. Throws TypeError or RangeError if the ID is invalid.
   */
  addRow(id: GuiItemId, text: string): this {
    this.insertItem(text, id);
    this.syncRows();
    return this;
  }

  /**
   * Removes the row with the given ID, clearing the selection if it was selected.
   *
   * @returns True if a row was removed.
   */
  removeRow(id: GuiItemId): boolean {
    const index = this.findItem(id);
    if (index < 0) return false;
    this.items.splice(index, 1);
    if (this.selectedId === id) this.selectedId = null;
    this.syncRows();
    return true;
  }

  /** Removes all rows and clears the selection. */
  clearRows(): this {
    this.items = [];
    this.selectedId = null;
    this.syncRows();
    return this;
  }

  /**
   * Selects the row with the given ID, or clears the selection with null.
   *
   * @throws Error if no row has that ID.
   */
  setSelected(id: GuiItemId | null): this {
    if (id !== null && this.findItem(id) < 0) throw new Error(`Unknown GUI row ID: ${String(id)}`);
    this.selectedId = id;
    this.syncRows();
    return this;
  }

  /** Returns the selected row ID, or null if nothing is selected. */
  getSelected(): GuiItemId | null {
    return this.selectedId;
  }
  /** Returns the number of rows. */
  getRowCount(): number {
    return this.items.length;
  }
  /** Returns the text of the selected row, or null if nothing is selected. */
  getSelectedText(): string | null {
    const index = this.selectedId === null ? -1 : this.findItem(this.selectedId);
    return index < 0 ? null : this.items[index].label;
  }

  private syncRows(): void {
    this.syncItems(this.selectedId === null ? -1 : this.findItem(this.selectedId));
    this._guiCommandText = this.getSelectedText() ?? '';
  }

  _applyNativeSelectionIndex(index: number, commandRevision = this._captureValueRevision()): void {
    if (!this._matchesNativeSelectionRevision(commandRevision)) return;
    const item = Number.isInteger(index) ? this.items[index] : undefined;
    if (item !== undefined && item.id !== this.selectedId) {
      this.selectedId = item.id;
      this.syncRows();
      const manager = this._getManager();
      if (manager !== null) manager.dispatchEvent(this, GUIEventType.Change);
    }
  }
}

/** Tab control where each tab owns a page panel; only the selected page is visible. */
export class GuiTab extends GuiArray {
  private static readonly TAB_BAR_HEIGHT = 28;
  private selectedId: GuiItemId | null = null;
  private pages = new Map<GuiItemId, GuiPanel>();

  /** Creates the control with the given options. */
  constructor(options: GUIControlOptions = {}) {
    super(options, GuiControlKind.Tab, 'default');
  }

  /**
   * Adds a tab and returns its page panel for adding content. The first tab added becomes selected.
   *
   * @throws Error if the ID already exists. Throws TypeError or RangeError if the ID is invalid.
   */
  addTab(label: string, id: GuiItemId): GuiPanel {
    this.validateId(id);
    if (this.findItem(id) >= 0) throw new Error(`GUI tab ID already exists: ${String(id)}`);
    const page = new GuiPanel({
      x: 0,
      y: GuiTab.TAB_BAR_HEIGHT,
      width: this.getWidth(),
      height: Math.max(0, this.getHeight() - GuiTab.TAB_BAR_HEIGHT),
      visible: this.selectedId === null,
    });
    this.insertItem(label, id);
    this.pages.set(id, page);
    this.addControl(page);
    if (this.selectedId === null) this.selectedId = id;
    page.setVisible(this.selectedId === id);
    this.syncTabs();
    return page;
  }

  /**
   * Selects a tab and shows its page.
   *
   * @throws Error if no tab has that ID.
   */
  setSelected(id: GuiItemId): this {
    if (this.findItem(id) < 0) throw new Error(`Unknown GUI tab ID: ${String(id)}`);
    this.selectedId = id;
    for (const [tabId, page] of this.pages) page.setVisible(tabId === id);
    this.syncTabs();
    return this;
  }

  /** Returns the selected tab ID, or null if there are no tabs. */
  getSelected(): GuiItemId | null {
    return this.selectedId;
  }
  /** Returns the page panel of a tab, or null if the ID is unknown. */
  getTab(id: GuiItemId): GuiPanel | null {
    return this.pages.get(id) ?? null;
  }

  override _getContentInsets(): { left: number; top: number; right: number; bottom: number } {
    return { left: 0, top: 0, right: 0, bottom: 0 };
  }

  protected override onResize(): void {
    for (const page of this.pages.values()) {
      page.setPosition(0, GuiTab.TAB_BAR_HEIGHT);
      page.setSize(this.getWidth(), Math.max(0, this.getHeight() - GuiTab.TAB_BAR_HEIGHT));
    }
  }

  private syncTabs(): void {
    this.syncItems(this.selectedId === null ? -1 : this.findItem(this.selectedId));
    const index = this.selectedId === null ? -1 : this.findItem(this.selectedId);
    this._guiCommandText = index < 0 ? '' : this.items[index].label;
  }

  _applyNativeSelectionIndex(index: number, commandRevision = this._captureValueRevision()): void {
    if (!this._matchesNativeSelectionRevision(commandRevision)) return;
    const item = Number.isInteger(index) ? this.items[index] : undefined;
    if (item !== undefined && item.id !== this.selectedId) this.setSelected(item.id);
  }
}

/** Menu whose items can run a callback when activated. */
export class GuiMenu extends GuiPopUpMenu {
  private callbacks = new Map<GuiItemId, (() => void) | null>();
  private skipNextActionCallback = false;

  /** Creates the control with the given options. */
  constructor(options: GUIControlOptions = {}) {
    super(options);
    this._guiCommandKind = GuiControlKind.Menu;
  }

  /** Appends an item with an optional callback run when it is activated. */
  override add(label: string, id: GuiItemId, callback: (() => void) | null = null): this {
    super.add(label, id);
    this.callbacks.set(id, callback);
    return this;
  }

  /**
   * Selects the item, runs its callback, and dispatches an action event.
   *
   * @returns False if no item has that ID.
   */
  activateItem(id: GuiItemId): boolean {
    if (this.items.findIndex((item) => item.id === id) < 0) return false;
    this.setSelected(id);
    this.callbacks.get(id)?.();
    const manager = this._getManager();
    if (manager !== null) {
      this.skipNextActionCallback = true;
      if (manager.dispatchEvent(this, GUIEventType.Action) === null) this.skipNextActionCallback = false;
    }
    return true;
  }

  protected override onAction(): void {
    if (this.skipNextActionCallback) {
      this.skipNextActionCallback = false;
      return;
    }
    const selected = this.getSelected();
    if (selected !== null) this.callbacks.get(selected)?.();
  }
}

/** Menu that starts hidden and opens at the pointer on a right click. */
export class GuiContextMenu extends GuiMenu {
  /** Creates the control with the given options. */
  constructor(options: GUIControlOptions = {}) {
    super(options);
    this._guiCommandKind = GuiControlKind.ContextMenu;
    if (options.width === undefined) this.setWidth(160);
    this.hide();
  }

  /**
   * Shows the menu at the given position if the button is the right mouse button.
   *
   * @returns True if the menu was opened.
   */
  openAt(x: number, y: number, button: number): boolean {
    if (button !== MouseButton.RIGHT) return false;
    validateGuiCoordinate(x, 'x');
    validateGuiCoordinate(y, 'y');
    if (this.getHeight() === 0) {
      const rowHeight = Math.max(24, this.getProfile().font.size + 10);
      const padding = this.getProfile().spacing.padding;
      this.setHeight(Math.max(24, this.getItemCount() * rowHeight + padding * 2));
    }
    this.setPosition(x, y).show();
    return true;
  }

  override _openContextMenuAt(x: number, y: number, button: number): boolean {
    return this.openAt(x, y, button);
  }

  /** Returns whether the menu is currently shown. */
  isOpen(): boolean {
    return this.isVisible();
  }

  /**
   * Activates an item and closes the menu.
   *
   * @returns False if the menu is closed or no item has that ID.
   */
  override activateItem(id: GuiItemId): boolean {
    if (!this.isOpen()) return false;
    const activated = super.activateItem(id);
    if (activated) this.hide();
    return activated;
  }

  protected override onAction(): void {
    super.onAction();
    this.hide();
  }
}
