export interface GuiPoint {
  x: number;
  y: number;
}

export interface GuiSize {
  width: number;
  height: number;
}

export interface GuiRect extends GuiPoint, GuiSize {}

export type GuiCursor = 'arrow' | 'text' | 'pointer' | 'resizeHorizontal' | 'resizeVertical' | 'crosshair' | string;

export interface GUIControlOptions {
  x?: number;
  y?: number;
  width?: number;
  height?: number;
  visible?: boolean;
  active?: boolean;
  clipChildren?: boolean;
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
