import type { GuiProfile } from './profile';
import type { GuiRect } from './types';
import type { Texture } from '../textures';

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

export type GuiControlKindCode = typeof GuiControlKind[keyof typeof GuiControlKind];

export interface GuiControlItemCommand {
  id: string | number;
  label: string;
  depth: number;
}

export interface GuiDrawingPayload {
  kind: number;
  values: number[];
  text: string;
  texture?: Texture;
  textureHandle?: number;
}

export interface GuiClipCommand {
  ownerId: number;
  rect: GuiRect;
}

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
