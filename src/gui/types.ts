/** A 2D position in GUI coordinates. */
export interface GuiPoint {
  x: number;
  y: number;
}

/** A width and height in GUI units. */
export interface GuiSize {
  width: number;
  height: number;
}

/** A rectangle defined by a position and a size. */
export interface GuiRect extends GuiPoint, GuiSize {}

/** Mouse cursor name; the common values are listed, and any other string is passed through. */
export type GuiCursor = 'arrow' | 'text' | 'pointer' | 'resizeHorizontal' | 'resizeVertical' | 'crosshair' | string;

/** Initial geometry and state accepted by GUI control constructors. */
export interface GUIControlOptions {
  /** Horizontal position relative to the parent. Defaults to 0. */
  x?: number;
  /** Vertical position relative to the parent. Defaults to 0. */
  y?: number;
  /** Width of the control. Defaults to 0. */
  width?: number;
  /** Height of the control. Defaults to 0. */
  height?: number;
  /** Whether the control is drawn. Defaults to true. */
  visible?: boolean;
  /** Whether the control is enabled and receives input. Defaults to true. */
  active?: boolean;
  /** Whether children are clipped to this control's bounds. Defaults to false. */
  clipChildren?: boolean;
  /** Whether this control and its children are clipped to its own bounds. Defaults to false. */
  clipToBounds?: boolean;
}

export const GUI_MAX_ID = 0xffff_ffff;

/** @internal Monotonic allocator used for retained-control identity. */
export class GUIIdAllocator {
  private nextId: number;
  private exhausted = false;

  constructor(firstId = 1) {
    if (!Number.isInteger(firstId) || firstId < 1 || firstId > GUI_MAX_ID) {
      throw new RangeError('GUI IDs must start within the unsigned 32-bit range.');
    }
    this.nextId = firstId;
  }

  allocate(): number {
    if (this.exhausted) throw new RangeError('The GUI control ID range is exhausted.');
    const id = this.nextId;
    if (id === GUI_MAX_ID) this.exhausted = true;
    else this.nextId = id + 1;
    return id;
  }
}

const processGUIIds = new GUIIdAllocator();

/** @internal Allocates an ID shared across all controls created in this process. */
export function allocateGUIId(): number {
  return processGUIIds.allocate();
}
