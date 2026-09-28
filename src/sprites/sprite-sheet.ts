import type { GameContext } from '../core/context';
import type { Rect, Vec2 } from '../core/types';
import type { Texture } from '../textures/texture';

export interface SpriteFrameTrim {
  /** Top-left offset of the packed pixels inside the original, untrimmed frame. */
  readonly offset: Readonly<Vec2>;
  /** Size of the original frame before atlas trimming. */
  readonly originalSize: Readonly<Vec2>;
}

export interface SpriteFrameDefinition {
  name: string;
  source: Readonly<Rect>;
  /** Normalized pivot in the original, untrimmed frame. Values outside 0..1 are allowed. */
  pivot?: Readonly<Vec2>;
  trim?: SpriteFrameTrim;
}

/** Immutable source frame created by a SpriteSheet. */
export interface SpriteFrame {
  readonly name: string;
  readonly sheet: SpriteSheet;
  readonly source: Readonly<Rect>;
  readonly pivot: Readonly<Vec2>;
  readonly trim: SpriteFrameTrim | null;
  readonly originalSize: Readonly<Vec2>;
}

export interface SpriteSheetOptions {
  /** Grid cell width in texture pixels. Pair with frameHeight to enable gridFrame(). */
  frameWidth?: number;
  /** Grid cell height in texture pixels. Pair with frameWidth to enable gridFrame(). */
  frameHeight?: number;
  /** Symmetric atlas edge inset in texture pixels. */
  margin?: Readonly<Vec2>;
  /** Horizontal and vertical gap between grid cells in texture pixels. */
  spacing?: Readonly<Vec2>;
  /** Named, manually placed frames. Frame rectangles are not rotated. */
  frames?: SpriteFrameDefinition[];
}

interface GridFrameEntry {
  column: number;
  row: number;
  frame: SpriteFrame;
}

function copyVec2(value: Vec2): Vec2 {
  return { x: value.x, y: value.y };
}

function copyRect(value: Rect): Rect {
  return { x: value.x, y: value.y, width: value.width, height: value.height };
}

function isFiniteNumber(value: number): boolean {
  return value === value && value !== Infinity && value !== -Infinity;
}

function isPositive(value: number): boolean {
  return isFiniteNumber(value) && value > 0;
}

function isNonNegative(value: number): boolean {
  return isFiniteNumber(value) && value >= 0;
}

function isValidVector(value: Vec2): boolean {
  return value !== null && value !== undefined &&
    isFiniteNumber(value.x) && isFiniteNumber(value.y);
}

class AtlasSpriteFrame implements SpriteFrame {
  readonly name: string;
  readonly sheet: SpriteSheet;
  readonly source: Rect;
  readonly pivot: Vec2;
  readonly trim: SpriteFrameTrim | null;
  readonly originalSize: Vec2;

  constructor(sheet: SpriteSheet, definition: SpriteFrameDefinition) {
    this.name = definition.name;
    this.sheet = sheet;
    this.source = copyRect(definition.source);
    this.pivot = definition.pivot === undefined
      ? { x: 0.5, y: 0.5 }
      : copyVec2(definition.pivot);
    this.trim = definition.trim === undefined
      ? null
      : {
          offset: copyVec2(definition.trim.offset),
          originalSize: copyVec2(definition.trim.originalSize),
        };
    this.originalSize = this.trim === null
      ? { x: this.source.width, y: this.source.height }
      : copyVec2(this.trim.originalSize);
  }
}

/** Reusable named or grid-based frames over one Game-owned texture. */
export class SpriteSheet {
  readonly texture: Texture;
  readonly margin: Readonly<Vec2>;
  readonly spacing: Readonly<Vec2>;
  readonly frameWidth: number;
  readonly frameHeight: number;
  private columnCount = 0;
  private rowCount = 0;

  private frameError: string | null = null;
  private namedFrames: SpriteFrame[] = [];
  private gridFrames: GridFrameEntry[] = [];

  constructor(texture: Texture, options: SpriteSheetOptions = {}) {
    const settings: SpriteSheetOptions = options === null || options === undefined
      ? {}
      : options;
    this.texture = texture;
    this.frameWidth = settings.frameWidth === undefined ? 0 : settings.frameWidth;
    this.frameHeight = settings.frameHeight === undefined ? 0 : settings.frameHeight;
    this.margin = settings.margin === undefined
      ? { x: 0, y: 0 }
      : isValidVector(settings.margin) ? copyVec2(settings.margin) : { x: NaN, y: NaN };
    this.spacing = settings.spacing === undefined
      ? { x: 0, y: 0 }
      : isValidVector(settings.spacing) ? copyVec2(settings.spacing) : { x: NaN, y: NaN };
    if (texture === null || texture === undefined || !texture.isLoaded ||
        !isPositive(texture.width) || !isPositive(texture.height)) {
      this.frameError = 'SpriteSheet requires a loaded texture.';
      return;
    }
    if (!isValidVector(this.margin) || !isNonNegative(this.margin.x) || !isNonNegative(this.margin.y) ||
        !isValidVector(this.spacing) || !isNonNegative(this.spacing.x) || !isNonNegative(this.spacing.y)) {
      this.frameError = 'SpriteSheet margin and spacing must be finite and non-negative.';
      return;
    }

    const hasGridWidth = settings.frameWidth !== undefined;
    const hasGridHeight = settings.frameHeight !== undefined;
    if (hasGridWidth !== hasGridHeight) {
      this.frameError = 'SpriteSheet grid requires both frameWidth and frameHeight.';
      return;
    }
    if (hasGridWidth && (!isPositive(this.frameWidth) || !isPositive(this.frameHeight))) {
      this.frameError = 'SpriteSheet grid dimensions must be finite and positive.';
      return;
    }

    if (hasGridWidth) {
      const availableWidth = texture.width - this.margin.x * 2;
      const availableHeight = texture.height - this.margin.y * 2;
      const columnStride = this.frameWidth + this.spacing.x;
      const rowStride = this.frameHeight + this.spacing.y;
      this.columnCount = availableWidth < this.frameWidth
        ? 0
        : Math.floor((availableWidth + this.spacing.x) / columnStride);
      this.rowCount = availableHeight < this.frameHeight
        ? 0
        : Math.floor((availableHeight + this.spacing.y) / rowStride);
      if (this.columnCount === 0 || this.rowCount === 0) {
        this.frameError = 'SpriteSheet grid does not fit inside the texture.';
        return;
      }
    }

    if (settings.frames !== undefined && settings.frames !== null && !Array.isArray(settings.frames)) {
      this.frameError = 'SpriteSheet frames must be an array.';
      return;
    }
    const definitions = settings.frames === undefined || settings.frames === null ? [] : settings.frames;
    if (!hasGridWidth && definitions.length === 0) {
      this.frameError = 'SpriteSheet requires grid dimensions or at least one named frame.';
      return;
    }
    for (let index = 0; index < definitions.length; index++) {
      const definition = definitions[index];
      if (definition === null || definition === undefined ||
          typeof definition.name !== 'string' || definition.name.length === 0) {
        this.frameError = 'SpriteSheet frame names must be non-empty strings.';
        this.namedFrames = [];
        return;
      }
      if (this.findNamedFrame(definition.name) !== null) {
        this.frameError = 'SpriteSheet frame names must be unique: ' + definition.name;
        this.namedFrames = [];
        return;
      }
      const error = this.validateDefinition(definition);
      if (error !== null) {
        this.frameError = error;
        this.namedFrames = [];
        return;
      }
      this.namedFrames.push(new AtlasSpriteFrame(this, definition));
    }
  }

  get error(): string | null { return this.frameError; }
  get columns(): number { return this.columnCount; }
  get rows(): number { return this.rowCount; }

  /** Returns the same cached frame object for every request of a grid cell. */
  gridFrame(column: number, row: number): SpriteFrame | null {
    if (this.frameError !== null || this.frameWidth <= 0 || this.frameHeight <= 0 ||
        column !== Math.floor(column) || row !== Math.floor(row) ||
        column < 0 || row < 0 || column >= this.columns || row >= this.rows) return null;
    for (let index = 0; index < this.gridFrames.length; index++) {
      const entry = this.gridFrames[index];
      if (entry.column === column && entry.row === row) return entry.frame;
    }

    const definition: SpriteFrameDefinition = {
      name: 'grid:' + column + ':' + row,
      source: {
        x: this.margin.x + column * (this.frameWidth + this.spacing.x),
        y: this.margin.y + row * (this.frameHeight + this.spacing.y),
        width: this.frameWidth,
        height: this.frameHeight,
      },
    };
    const frame = new AtlasSpriteFrame(this, definition);
    this.gridFrames.push({ column, row, frame });
    return frame;
  }

  /** Returns a named frame or null when the name is unknown. */
  getFrame(name: string): SpriteFrame | null {
    if (this.frameError !== null) return null;
    return this.findNamedFrame(name);
  }

  /** @internal Checks texture ownership when a frame is attached to a Game. */
  _canAttachTo(context: GameContext): boolean {
    return this.frameError === null && this.texture.isLoaded && context.owns(this.texture);
  }

  private findNamedFrame(name: string): SpriteFrame | null {
    for (let index = 0; index < this.namedFrames.length; index++) {
      if (this.namedFrames[index].name === name) return this.namedFrames[index];
    }
    return null;
  }

  private validateDefinition(definition: SpriteFrameDefinition): string | null {
    const source = definition.source;
    if (source === null || source === undefined ||
        !isPositive(source.width) || !isPositive(source.height) ||
        !isFiniteNumber(source.x) || !isFiniteNumber(source.y) ||
        source.x < 0 || source.y < 0 ||
        source.x + source.width > this.texture.width ||
        source.y + source.height > this.texture.height) {
      return 'SpriteSheet frame source is outside the texture: ' + definition.name;
    }
    if (definition.pivot !== undefined && !isValidVector(definition.pivot)) {
      return 'SpriteSheet frame pivot must be finite: ' + definition.name;
    }
    if (definition.trim !== undefined) {
      const trim = definition.trim;
      if (trim === null || !isValidVector(trim.offset) || !isValidVector(trim.originalSize) ||
          !isPositive(trim.originalSize.x) || !isPositive(trim.originalSize.y) ||
          !isNonNegative(trim.offset.x) || !isNonNegative(trim.offset.y) ||
          trim.offset.x + source.width > trim.originalSize.x ||
          trim.offset.y + source.height > trim.originalSize.y) {
        return 'SpriteSheet trim metadata is invalid: ' + definition.name;
      }
    }
    return null;
  }
}
