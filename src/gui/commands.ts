import type { GuiProfile } from './profile';
import type { GuiRect } from './types';
import type { Texture } from '../textures';

/** Numeric codes identifying the kind of control in a render command. */
export const GuiControlKind = {
  Control: 0,
  Panel: 1,
  Window: 2,
  Scroll: 3,
  BitmapBorder: 4,
  Stretch: 5,
  FrameSet: 6,
  Button: 7,
  CheckBox: 8,
  RadioButton: 9,
  BitmapButton: 10,
  Text: 11,
  MLText: 12,
  TextEdit: 13,
  MLTextEdit: 14,
  TextEditSlider: 15,
  Slider: 16,
  PopUpMenu: 17,
  PopUpEdit: 18,
  TreeView: 19,
  TextList: 20,
  Tab: 21,
  Menu: 22,
  ContextMenu: 23,
  Bitmap: 24,
  ShowImg: 25,
  Progress: 26,
  DrawingPanel: 27,
} as const;

/** Union of the numeric values in `GuiControlKind`. */
export type GuiControlKindCode = (typeof GuiControlKind)[keyof typeof GuiControlKind];

/** One list, menu, or tree entry submitted with a control render command. */
export interface GuiControlItemCommand {
  id: string | number;
  label: string;
  depth: number;
}

/** One drawing primitive submitted with a drawing panel render command. */
export interface GuiDrawingPayload {
  kind: number;
  values: number[];
  text: string;
  texture?: Texture;
  textureHandle?: number;
}

/** A clip rectangle, in global coordinates, applied by the control with id `ownerId`. */
export interface GuiClipCommand {
  ownerId: number;
  rect: GuiRect;
}

/** Flattened description of one control (geometry, profile, state, items, drawings) handed to the native GUI layer each frame. */
export interface GuiControlCommand {
  kind: number;
  id: number;
  parentId: number;
  rect: GuiRect;
  clip: GuiRect | null;
  clips: GuiClipCommand[];
  backgroundTextureHandle: number;
  profile: GuiProfile;
  values: number[];
  text: string;
  items: GuiControlItemCommand[];
  drawings: GuiDrawingPayload[];
}

/** Returns the overlapping area of two rectangles, with zero width or height when they do not overlap. */
export function intersectGuiRects(left: GuiRect, right: GuiRect): GuiRect {
  const x = Math.max(left.x, right.x);
  const y = Math.max(left.y, right.y);
  const rightEdge = Math.min(left.x + left.width, right.x + right.width);
  const bottomEdge = Math.min(left.y + left.height, right.y + right.height);
  return {
    x,
    y,
    width: Math.max(0, rightEdge - x),
    height: Math.max(0, bottomEdge - y),
  };
}
