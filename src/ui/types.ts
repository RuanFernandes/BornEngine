import type { Color, Texture } from '../core/types';

export type UiId = number;

export interface UiResponse {
  /** Whether this ID produced a response in the last completed UI frame. */
  present: boolean;
  clicked: boolean;
  changed: boolean;
  hovered: boolean;
  focused: boolean;
  dragged: boolean;
  value: number;
  text: string;
}

export interface UiApi {
  beginWindow(id: UiId, title: string, x?: number, y?: number, width?: number, height?: number): void;
  endWindow(id?: UiId): void;
  setWindowPosition(id: UiId, x: number, y: number): void;
  setWindowSize(id: UiId, width: number, height: number): void;
  beginPanel(id: UiId): void;
  endPanel(id?: UiId): void;
  beginHorizontal(id: UiId): void;
  endHorizontal(id?: UiId): void;
  beginVertical(id: UiId): void;
  endVertical(id?: UiId): void;
  spacing(amount?: number): void;
  separator(): void;
  label(id: UiId, text: string): void;
  link(id: UiId, text: string): boolean;
  button(id: UiId, text: string): boolean;
  checkbox(id: UiId, label: string, checked: boolean): boolean;
  radioButton(id: UiId, label: string, selected: boolean): boolean;
  sliderFloat(id: UiId, label: string, value: number, min: number, max: number): number;
  sliderInt(id: UiId, label: string, value: number, min: number, max: number): number;
  dragFloat(id: UiId, prefix: string, value: number, speed?: number, min?: number, max?: number): number;
  textEditSingleline(id: UiId, label: string, value: string): string;
  beginCombo(id: UiId, label: string, selectedText: string): void;
  endCombo(id?: UiId): void;
  selectable(id: UiId, label: string, selected: boolean): boolean;
  beginCollapsingHeader(id: UiId, label: string): boolean;
  endCollapsingHeader(id?: UiId): void;
  beginScrollArea(id: UiId): void;
  endScrollArea(id?: UiId): void;
  beginTabBar(id: UiId): void;
  endTabBar(id?: UiId): void;
  beginTabItem(id: UiId, label: string): boolean;
  endTabItem(id?: UiId): void;
  progressBar(id: UiId, fraction: number, label?: string): void;
  registerTexture(texture: Texture): number;
  image(id: UiId, texture: Texture | number, width?: number, height?: number): void;
  paintLine(id: UiId, x1: number, y1: number, x2: number, y2: number, color: Color, thickness?: number): void;
  paintRect(id: UiId, x: number, y: number, width: number, height: number, color: Color): void;
  paintCircle(id: UiId, x: number, y: number, radius: number, color: Color, thickness?: number): void;
  paintText(id: UiId, text: string, x: number, y: number, size: number, color: Color): void;
  paintPolyline(id: UiId, points: Array<{ x: number; y: number }>, color: Color, thickness?: number): void;
  paintPolygon(id: UiId, points: Array<{ x: number; y: number }>, color: Color, thickness?: number): void;
  setTheme(theme: 'dark' | 'light'): void;
  loadFont(id: UiId, family: string, fontBytes: number[]): void;
  setFont(id: UiId): void;
  beginMenuBar(id: UiId): void;
  endMenuBar(id?: UiId): void;
  beginMenu(id: UiId, label: string): void;
  endMenu(id?: UiId): void;
  menuItem(id: UiId, label: string): boolean;
  beginTreeNode(id: UiId, label: string): boolean;
  endTreeNode(id?: UiId): void;
  beginTable(id: UiId, columns: number): void;
  endTable(id?: UiId): void;
  tableNextRow(): void;
  tableNextColumn(): void;
  demoWindow(id?: UiId): void;
  metricsWindow(id?: UiId): void;
  response(id: UiId): UiResponse;
  isAvailable(): boolean;
  wantsPointerInput(): boolean;
  wantsKeyboardInput(): boolean;
  injectText(text: string): void;
}

export type UiColor = Color;
