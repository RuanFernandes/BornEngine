import type { Color } from '../core/types';
import type { Texture } from '../textures';

/** Caller-chosen numeric id of a widget. Use the same id for the same widget on every frame. */
export type UiId = number;

/** State of a widget as of the last completed UI frame. */
export interface UiResponse {
  /** Whether this ID produced a response in the last completed UI frame. */
  present: boolean;
  /** True when the widget was clicked. */
  clicked: boolean;
  /** True when the user changed the widget's value. */
  changed: boolean;
  /** True when the pointer is over the widget. */
  hovered: boolean;
  /** True when the widget has keyboard focus. */
  focused: boolean;
  /** True when the widget is being dragged. */
  dragged: boolean;
  /** Numeric result of the widget, such as a slider value or a 0 or 1 open or checked state. */
  value: number;
  /** Text result of the widget, such as edited text. */
  text: string;
}

/** Immediate-mode UI commands, issued every frame. Widgets that take user input return their current result. */
export interface UiApi {
  /** Begins a window. Position and size default to (16, 16) and 320 by 240. Close it with `endWindow`. */
  beginWindow(id: UiId, title: string, x?: number, y?: number, width?: number, height?: number): void;
  /** Ends the window begun with the same id. */
  endWindow(id?: UiId): void;
  /** Moves the window with the given id. */
  setWindowPosition(id: UiId, x: number, y: number): void;
  /** Resizes the window with the given id. */
  setWindowSize(id: UiId, width: number, height: number): void;
  /** Begins a panel. Close it with `endPanel`. */
  beginPanel(id: UiId): void;
  /** Ends the panel begun with the same id. */
  endPanel(id?: UiId): void;
  /** Begins a horizontal layout group. Close it with `endHorizontal`. */
  beginHorizontal(id: UiId): void;
  /** Ends the horizontal group begun with the same id. */
  endHorizontal(id?: UiId): void;
  /** Begins a vertical layout group. Close it with `endVertical`. */
  beginVertical(id: UiId): void;
  /** Ends the vertical group begun with the same id. */
  endVertical(id?: UiId): void;
  /** Adds empty vertical space. Defaults to 8. */
  spacing(amount?: number): void;
  /** Draws a separator line. */
  separator(): void;
  /** Draws a text label. */
  label(id: UiId, text: string): void;
  /** Draws a link-style text. Returns true when it is clicked. */
  link(id: UiId, text: string): boolean;
  /** Draws a button. Returns true when it is clicked. */
  button(id: UiId, text: string): boolean;
  /** Draws a checkbox. Returns the new checked state when the user toggled it, otherwise `checked`. */
  checkbox(id: UiId, label: string, checked: boolean): boolean;
  /** Draws a radio button. Returns true when it is clicked. */
  radioButton(id: UiId, label: string, selected: boolean): boolean;
  /** Draws a float slider. Returns the new value when the user changed it, otherwise `value`. */
  sliderFloat(id: UiId, label: string, value: number, min: number, max: number): number;
  /** Draws an integer slider. Returns the new value when the user changed it, otherwise `value`. */
  sliderInt(id: UiId, label: string, value: number, min: number, max: number): number;
  /**
   * Draws a draggable float field. Returns the new value when the user changed it, otherwise `value`.
   * `min` and `max` default to NaN, meaning unbounded.
   */
  dragFloat(id: UiId, prefix: string, value: number, speed?: number, min?: number, max?: number): number;
  /** Draws a single-line text field. Returns the edited text when the user changed it, otherwise `value`. */
  textEditSingleline(id: UiId, label: string, value: string): string;
  /** Begins a combo box showing `selectedText`. Fill it with `selectable` and close it with `endCombo`. */
  beginCombo(id: UiId, label: string, selectedText: string): void;
  /** Ends the combo box begun with the same id. */
  endCombo(id?: UiId): void;
  /** Draws a selectable entry. Returns true when it is clicked. */
  selectable(id: UiId, label: string, selected: boolean): boolean;
  /** Begins a collapsing header. Returns true when it is open. Close it with `endCollapsingHeader`. */
  beginCollapsingHeader(id: UiId, label: string): boolean;
  /** Ends the collapsing header begun with the same id. */
  endCollapsingHeader(id?: UiId): void;
  /** Begins a scrollable area. Close it with `endScrollArea`. */
  beginScrollArea(id: UiId): void;
  /** Ends the scroll area begun with the same id. */
  endScrollArea(id?: UiId): void;
  /** Begins a tab bar. Close it with `endTabBar`. */
  beginTabBar(id: UiId): void;
  /** Ends the tab bar begun with the same id. */
  endTabBar(id?: UiId): void;
  /** Begins a tab. Returns true when it is the selected tab. Close it with `endTabItem`. */
  beginTabItem(id: UiId, label: string): boolean;
  /** Ends the tab begun with the same id. */
  endTabItem(id?: UiId): void;
  /** Draws a progress bar for `fraction` with an optional label. */
  progressBar(id: UiId, fraction: number, label?: string): void;
  /** Registers a texture for use in the UI. `image` does this automatically. */
  registerTexture(texture: Texture): void;
  /** Draws a texture. Width and height default to the texture's size. */
  image(id: UiId, texture: Texture, width?: number, height?: number): void;
  /** Paints a line from (x1, y1) to (x2, y2). */
  paintLine(id: UiId, x1: number, y1: number, x2: number, y2: number, color: Color, thickness?: number): void;
  /** Paints a rectangle. */
  paintRect(id: UiId, x: number, y: number, width: number, height: number, color: Color): void;
  /** Paints a circle. */
  paintCircle(id: UiId, x: number, y: number, radius: number, color: Color, thickness?: number): void;
  /** Paints text with its top-left at (x, y). */
  paintText(id: UiId, text: string, x: number, y: number, size: number, color: Color): void;
  /** Paints a connected line through `points`. Ignored when fewer than 2 points are given. */
  paintPolyline(id: UiId, points: Array<{ x: number; y: number }>, color: Color, thickness?: number): void;
  /** Paints a polygon through `points`. Ignored when fewer than 3 points are given. */
  paintPolygon(id: UiId, points: Array<{ x: number; y: number }>, color: Color, thickness?: number): void;
  /** Switches between the dark and light UI theme. */
  setTheme(theme: 'dark' | 'light'): void;
  /** Loads a font from the bytes of a font file and stores it under `id`. */
  loadFont(id: UiId, family: string, fontBytes: number[]): void;
  /** Selects the font loaded under `id` for later widgets. */
  setFont(id: UiId): void;
  /** Begins a menu bar. Close it with `endMenuBar`. */
  beginMenuBar(id: UiId): void;
  /** Ends the menu bar begun with the same id. */
  endMenuBar(id?: UiId): void;
  /** Begins a menu. Close it with `endMenu`. */
  beginMenu(id: UiId, label: string): void;
  /** Ends the menu begun with the same id. */
  endMenu(id?: UiId): void;
  /** Draws a menu item. Returns true when it is clicked. */
  menuItem(id: UiId, label: string): boolean;
  /** Begins a tree node. Returns true when it is expanded. Close it with `endTreeNode`. */
  beginTreeNode(id: UiId, label: string): boolean;
  /** Ends the tree node begun with the same id. */
  endTreeNode(id?: UiId): void;
  /** Begins a table with the given number of columns. Close it with `endTable`. */
  beginTable(id: UiId, columns: number): void;
  /** Ends the table begun with the same id. */
  endTable(id?: UiId): void;
  /** Moves to the next table row. */
  tableNextRow(): void;
  /** Moves to the next table column. */
  tableNextColumn(): void;
  /** Shows the backend's built-in demo window. */
  demoWindow(id?: UiId): void;
  /** Shows the backend's built-in metrics window. */
  metricsWindow(id?: UiId): void;
  /** Returns the state of the widget with this id from the last completed UI frame. */
  response(id: UiId): UiResponse;
  /** True when the UI is active and its backend is available on this platform. */
  isAvailable(): boolean;
  /** True when the UI wants pointer input, for example while the mouse is over it. */
  wantsPointerInput(): boolean;
  /** True when the UI wants keyboard input, for example while a text field has focus. */
  wantsKeyboardInput(): boolean;
  /** Sends text to the UI as keyboard input. */
  injectText(text: string): void;
}

/** Color type used by UI painting. */
export type UiColor = Color;
