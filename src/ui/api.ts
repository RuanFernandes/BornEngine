import type { Color, Texture } from '../core/types';
import { UiOpcode, type UiBackendId } from './opcodes';
import type { UiApi, UiId, UiResponse } from './types';

declare function bloom_ui_command(backend: number, opcode: number, id: number, a: number, b: number, c: number, d: number, text: number): number;
declare function bloom_ui_scratch_reset(backend: number): void;
declare function bloom_ui_scratch_push_f64(backend: number, value: number): void;
declare function bloom_ui_scratch_command(backend: number, opcode: number, id: number, count: number, text: number): number;
declare function bloom_ui_inject_text(text: number): void;
declare function bloom_ui_response(backend: number, id: number, field: number): number;
declare function bloom_ui_response_text(backend: number, id: number): string;
declare function bloom_ui_is_available(backend: number): number;
declare function bloom_ui_wants_input(backend: number, kind: number): number;

const EMPTY_RESPONSE: UiResponse = {
  present: false,
  clicked: false,
  changed: false,
  hovered: false,
  focused: false,
  dragged: false,
  value: 0,
  text: '',
};

function colorValues(color: Color): number[] {
  return [color.r, color.g, color.b, color.a];
}

export function createUiApi(backend: UiBackendId): UiApi {
  function command(opcode: number, id: UiId, args: number[] = [], text = ''): void {
    bloom_ui_command(
      backend,
      opcode,
      id,
      args[0] ?? 0,
      args[1] ?? 0,
      args[2] ?? 0,
      args[3] ?? 0,
      text as any,
    );
  }

  function scratchCommand(opcode: number, id: UiId, values: number[], text = ''): void {
    bloom_ui_scratch_reset(backend);
    for (const value of values) bloom_ui_scratch_push_f64(backend, value);
    bloom_ui_scratch_command(backend, opcode, id, values.length, text as any);
  }

  function response(id: UiId): UiResponse {
    if (bloom_ui_response(backend, id, 6) < 0.5) return { ...EMPTY_RESPONSE };
    return {
      present: true,
      clicked: bloom_ui_response(backend, id, 0) > 0.5,
      changed: bloom_ui_response(backend, id, 1) > 0.5,
      hovered: bloom_ui_response(backend, id, 2) > 0.5,
      focused: bloom_ui_response(backend, id, 3) > 0.5,
      dragged: bloom_ui_response(backend, id, 4) > 0.5,
      value: bloom_ui_response(backend, id, 5),
      text: bloom_ui_response_text(backend, id),
    };
  }

  const api: UiApi = {
    beginWindow(id, title, x = 16, y = 16, width = 320, height = 240) {
      command(UiOpcode.SetWindowPosition, id, [x, y, 0]);
      command(UiOpcode.SetWindowSize, id, [width, height, 0]);
      command(UiOpcode.BeginWindow, id, [], title);
    },
    endWindow(id = 0) { command(UiOpcode.EndWindow, id); },
    setWindowPosition(id, x, y) { command(UiOpcode.SetWindowPosition, id, [x, y, 1]); },
    setWindowSize(id, width, height) { command(UiOpcode.SetWindowSize, id, [width, height, 1]); },
    beginPanel(id) { command(UiOpcode.BeginPanel, id); },
    endPanel(id = 0) { command(UiOpcode.EndPanel, id); },
    beginHorizontal(id) { command(UiOpcode.BeginHorizontal, id); },
    endHorizontal(id = 0) { command(UiOpcode.EndHorizontal, id); },
    beginVertical(id) { command(UiOpcode.BeginVertical, id); },
    endVertical(id = 0) { command(UiOpcode.EndVertical, id); },
    spacing(amount = 8) { command(UiOpcode.Spacing, 0, [amount]); },
    separator() { command(UiOpcode.Separator, 0); },
    label(id, text) { command(UiOpcode.Label, id, [], text); },
    link(id, text) {
      command(UiOpcode.Link, id, [], text);
      return response(id).clicked;
    },
    button(id, text) {
      command(UiOpcode.Button, id, [], text);
      return response(id).clicked;
    },
    checkbox(id, label, checked) {
      command(UiOpcode.Checkbox, id, [checked ? 1 : 0], label);
      const result = response(id);
      return result.present ? result.value > 0.5 : checked;
    },
    radioButton(id, label, selected) {
      command(UiOpcode.RadioButton, id, [selected ? 1 : 0], label);
      return response(id).clicked;
    },
    sliderFloat(id, label, value, min, max) {
      command(UiOpcode.SliderFloat, id, [value, min, max], label);
      const result = response(id);
      return result.present ? result.value : value;
    },
    sliderInt(id, label, value, min, max) {
      command(UiOpcode.SliderInt, id, [value, min, max], label);
      const result = response(id);
      return result.present ? Math.round(result.value) : value;
    },
    dragFloat(id, prefix, value, speed = 0.1, min = Number.NaN, max = Number.NaN) {
      command(UiOpcode.DragFloat, id, [value, speed, min, max], prefix);
      const result = response(id);
      return result.present ? result.value : value;
    },
    textEditSingleline(id, label, value) {
      command(UiOpcode.Label, 0, [], label);
      command(UiOpcode.TextEdit, id, [], value);
      const result = response(id);
      return result.present ? result.text : value;
    },
    beginCombo(id, label, selectedText) {
      command(UiOpcode.Label, 0, [], label);
      command(UiOpcode.Combo, id, [], selectedText);
    },
    endCombo(id = 0) { command(UiOpcode.EndCombo, id); },
    selectable(id, label, selected) {
      command(UiOpcode.Selectable, id, [selected ? 1 : 0], label);
      return response(id).clicked;
    },
    beginCollapsingHeader(id, label) {
      command(UiOpcode.CollapsingHeader, id, [], label);
      return response(id).value > 0.5;
    },
    endCollapsingHeader(id = 0) { command(UiOpcode.EndCollapsingHeader, id); },
    beginScrollArea(id) { command(UiOpcode.BeginScrollArea, id); },
    endScrollArea(id = 0) { command(UiOpcode.EndScrollArea, id); },
    beginTabBar(id) { command(UiOpcode.BeginTabBar, id); },
    endTabBar(id = 0) { command(UiOpcode.EndTabBar, id); },
    beginTabItem(id, label) {
      command(UiOpcode.BeginTabItem, id, [], label);
      return response(id).value > 0.5;
    },
    endTabItem(id = 0) { command(UiOpcode.EndTabItem, id); },
    progressBar(id, fraction, label = '') { command(UiOpcode.ProgressBar, id, [fraction], label); },
    registerTexture(texture) {
      command(UiOpcode.RegisterTexture, texture.handle, [texture.handle]);
      return texture.handle;
    },
    image(id, texture, width, height) {
      const handle = typeof texture === 'number' ? texture : api.registerTexture(texture);
      const imageWidth = width ?? (typeof texture === 'number' ? 0 : texture.width);
      const imageHeight = height ?? (typeof texture === 'number' ? 0 : texture.height);
      command(UiOpcode.Image, id, [handle, imageWidth, imageHeight]);
    },
    paintLine(id, x1, y1, x2, y2, color, thickness = 1) {
      scratchCommand(UiOpcode.PaintLine, id, [x1, y1, x2, y2, ...colorValues(color), thickness]);
    },
    paintRect(id, x, y, width, height, color) {
      scratchCommand(UiOpcode.PaintRect, id, [x, y, width, height, ...colorValues(color)]);
    },
    paintCircle(id, x, y, radius, color, thickness = 1) {
      scratchCommand(UiOpcode.PaintCircle, id, [x, y, radius, ...colorValues(color), thickness]);
    },
    paintText(id, text, x, y, size, color) {
      scratchCommand(UiOpcode.PaintText, id, [x, y, size, ...colorValues(color)], text);
    },
    paintPolyline(id, points, color, thickness = 1) {
      if (points.length < 2) return;
      const values: number[] = [];
      for (const point of points) values.push(point.x, point.y);
      scratchCommand(UiOpcode.PaintPolyline, id, [...values, ...colorValues(color), thickness]);
    },
    paintPolygon(id, points, color, thickness = 1) {
      if (points.length < 3) return;
      const values: number[] = [];
      for (const point of points) values.push(point.x, point.y);
      scratchCommand(UiOpcode.PaintPolygon, id, [...values, ...colorValues(color), thickness]);
    },
    setTheme(theme) { command(UiOpcode.SetStyle, 0, [theme === 'light' ? 1 : 0, Number.NaN]); },
    loadFont(id, family, fontBytes) {
      scratchCommand(UiOpcode.LoadFont, id, fontBytes, family);
    },
    setFont(id) { command(UiOpcode.SetStyle, 0, [2, id]); },
    beginMenuBar(id) { command(UiOpcode.BeginMenuBar, id); },
    endMenuBar(id = 0) { command(UiOpcode.EndMenuBar, id); },
    beginMenu(id, label) { command(UiOpcode.BeginMenu, id, [], label); },
    endMenu(id = 0) { command(UiOpcode.EndMenu, id); },
    menuItem(id, label) {
      command(UiOpcode.MenuItem, id, [], label);
      return response(id).clicked;
    },
    beginTreeNode(id, label) {
      command(UiOpcode.TreeNode, id, [], label);
      return response(id).value > 0.5;
    },
    endTreeNode(id = 0) { command(UiOpcode.TreePop, id); },
    beginTable(id, columns) { command(UiOpcode.BeginTable, id, [columns]); },
    endTable(id = 0) { command(UiOpcode.EndTable, id); },
    tableNextRow() { command(UiOpcode.TableNextRow, 0); },
    tableNextColumn() { command(UiOpcode.TableNextColumn, 0); },
    demoWindow(id = 0) { command(UiOpcode.DemoWindow, id); },
    metricsWindow(id = 0) { command(UiOpcode.MetricsWindow, id); },
    response,
    isAvailable() { return bloom_ui_is_available(backend) > 0.5; },
    wantsPointerInput() { return bloom_ui_wants_input(backend, 0) > 0.5; },
    wantsKeyboardInput() { return bloom_ui_wants_input(backend, 1) > 0.5; },
    injectText(text) { bloom_ui_inject_text(text as any); },
  };
  return api;
}
