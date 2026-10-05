export const GuiOpcode = {
  Control: 1,
} as const;

export const GUIEventType = {
  Action: 1,
  Change: 2,
  Focus: 3,
  Blur: 4,
  PointerEnter: 5,
  PointerLeave: 6,
  PointerMove: 7,
  PointerDown: 8,
  PointerUp: 9,
  PointerDrag: 10,
  Wheel: 11,
  KeyDown: 12,
  KeyUp: 13,
} as const;

export const GuiEventField = {
  EventType: 0,
  ControlId: 1,
  GlobalX: 2,
  GlobalY: 3,
  LocalX: 4,
  LocalY: 5,
  Key: 6,
  Button: 7,
  WheelX: 8,
  WheelY: 9,
  Modifiers: 10,
} as const;

export type GuiOpcodeCode = typeof GuiOpcode[keyof typeof GuiOpcode];
export type GuiEventFieldCode = typeof GuiEventField[keyof typeof GuiEventField];
