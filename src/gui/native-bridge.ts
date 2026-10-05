import type { GuiControlCommand } from './commands';
import { GuiEventField, GuiOpcode } from './opcodes';

declare function bloom_gui_command(opcode: number, id: number, a: number, b: number, c: number, d: number, text: number): number;
declare function bloom_gui_scratch_reset(): void;
declare function bloom_gui_scratch_push_f64(value: number): void;
declare function bloom_gui_scratch_command(opcode: number, id: number, count: number, text: number): number;
declare function bloom_gui_response(id: number, field: number): number;
declare function bloom_gui_response_text(id: number): string;
declare function bloom_gui_event_count(): number;
declare function bloom_gui_event_field(index: number, field: number): number;
declare function bloom_gui_is_available(): number;
declare function bloom_gui_wants_input(kind: number): number;

export interface GuiNativeApi {
  command(opcode: number, id: number, a: number, b: number, c: number, d: number, text: string): number;
  scratchReset(): void;
  scratchPushF64(value: number): void;
  scratchCommand(opcode: number, id: number, count: number, text: string): number;
  response(id: number, field: number): number;
  responseText(id: number): string;
  eventCount(): number;
  eventField(index: number, field: number): number;
  isAvailable(): number;
  wantsInput(kind: number): number;
}

export interface GuiNativeResponse {
  present: boolean;
  clicked: boolean;
  changed: boolean;
  hovered: boolean;
  focused: boolean;
  dragged: boolean;
  value: number;
  text: string;
}

export interface GuiNativeEvent {
  type: number;
  controlId: number;
  globalX: number;
  globalY: number;
  localX: number;
  localY: number;
  key: number;
  button: number;
  wheelX: number;
  wheelY: number;
  modifiers: number;
}

function nativeApi(): GuiNativeApi {
  return {
    command: (opcode, id, a, b, c, d, text) => bloom_gui_command(opcode, id, a, b, c, d, text as any),
    scratchReset: () => bloom_gui_scratch_reset(),
    scratchPushF64: (value) => bloom_gui_scratch_push_f64(value),
    scratchCommand: (opcode, id, count, text) => bloom_gui_scratch_command(opcode, id, count, text as any),
    response: (id, field) => bloom_gui_response(id, field),
    responseText: (id) => bloom_gui_response_text(id),
    eventCount: () => bloom_gui_event_count(),
    eventField: (index, field) => bloom_gui_event_field(index, field),
    isAvailable: () => bloom_gui_is_available(),
    wantsInput: (kind) => bloom_gui_wants_input(kind),
  };
}

function colorValues(color: { r: number; g: number; b: number; a: number }): number[] {
  return [color.r, color.g, color.b, color.a];
}

function profileValues(command: GuiControlCommand): number[] {
  const profile = command.profile;
  const alignment = (value: string): number => value === 'center' ? 1 : value === 'end' ? 2 : 0;
  const cursor = ['arrow', 'pointer', 'text', 'crosshair', 'resizeHorizontal', 'resizeVertical', 'hidden'].indexOf(profile.cursor);
  return [
    command.kind,
    command.clip === null ? 0 : 1,
    command.clip?.x ?? 0, command.clip?.y ?? 0, command.clip?.width ?? 0, command.clip?.height ?? 0,
    ...colorValues(profile.normalColor), ...colorValues(profile.hoverColor), ...colorValues(profile.disabledColor),
    ...colorValues(profile.textColor), ...colorValues(profile.selectionColor),
    profile.font.size, profile.font.bold ? 1 : 0, profile.font.italic ? 1 : 0,
    alignment(profile.alignment.horizontal), alignment(profile.alignment.vertical),
    profile.spacing.item, profile.spacing.padding, profile.spacing.inner,
    ...colorValues(profile.border.color), profile.border.width, profile.border.radius, profile.opacity,
    ...colorValues(profile.shadow.color), profile.shadow.offsetX, profile.shadow.offsetY, profile.shadow.blur,
    profile.focusable ? 1 : 0, profile.modal ? 1 : 0, cursor,
    command.values.length, ...command.values,
  ];
}

export class GuiNativeBridge {
  private readonly api: GuiNativeApi;

  constructor(api: GuiNativeApi = nativeApi()) { this.api = api; }

  submit(commands: readonly GuiControlCommand[]): void {
    for (const command of commands) {
      this.api.command(
        GuiOpcode.Control,
        command.id,
        command.rect.x,
        command.rect.y,
        command.rect.width,
        command.rect.height,
        command.text,
      );
      const values = profileValues(command);
      this.api.scratchReset();
      for (const value of values) this.api.scratchPushF64(value);
      this.api.scratchCommand(GuiOpcode.Control, command.id, values.length, command.text);
    }
  }

  response(id: number): GuiNativeResponse {
    const field = (index: number): number => this.api.response(id, index);
    const present = field(6) > 0.5;
    return {
      present,
      clicked: present && field(0) > 0.5,
      changed: present && field(1) > 0.5,
      hovered: present && field(2) > 0.5,
      focused: present && field(3) > 0.5,
      dragged: present && field(4) > 0.5,
      value: present ? field(5) : 0,
      text: present ? this.api.responseText(id) : '',
    };
  }

  events(): GuiNativeEvent[] {
    const count = Math.max(0, Math.min(16_384, Math.trunc(this.api.eventCount())));
    const read = (index: number, field: number): number => this.api.eventField(index, field);
    const events: GuiNativeEvent[] = [];
    for (let index = 0; index < count; index++) {
      events.push({
        type: read(index, GuiEventField.EventType),
        controlId: read(index, GuiEventField.ControlId),
        globalX: read(index, GuiEventField.GlobalX), globalY: read(index, GuiEventField.GlobalY),
        localX: read(index, GuiEventField.LocalX), localY: read(index, GuiEventField.LocalY),
        key: read(index, GuiEventField.Key), button: read(index, GuiEventField.Button),
        wheelX: read(index, GuiEventField.WheelX), wheelY: read(index, GuiEventField.WheelY),
        modifiers: read(index, GuiEventField.Modifiers),
      });
    }
    return events;
  }

  isAvailable(): boolean { return this.api.isAvailable() > 0.5; }
  wantsPointerInput(): boolean { return this.api.wantsInput(0) > 0.5; }
  wantsKeyboardInput(): boolean { return this.api.wantsInput(1) > 0.5; }
}
