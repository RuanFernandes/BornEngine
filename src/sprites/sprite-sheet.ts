import type { GameContext } from '../core/context';
import type { Rect, Vector2DLike } from '../core/types';
import { Vector2D } from '../math/vector2d';
import type { Texture } from '../textures/texture';

export interface SpriteFrameTrim {
  /** Top-left offset of the packed pixels inside the original, untrimmed frame. */
  readonly offset: Readonly<Vector2D>;
  /** Size of the original frame before atlas trimming. */
  readonly originalSize: Readonly<Vector2D>;
}

export interface SpriteFrameTrimDefinition {
  /** Top-left offset of the packed pixels inside the original, untrimmed frame. */
  offset: Readonly<Vector2DLike>;
  /** Size of the original frame before atlas trimming. */
  originalSize: Readonly<Vector2DLike>;
}

export interface SpriteFrameDefinition {
  name: string;
  source: Readonly<Rect>;
  /** Normalized pivot in the original, untrimmed frame. Values outside 0..1 are allowed. */
  pivot?: Readonly<Vector2DLike>;
  trim?: SpriteFrameTrimDefinition;
}

/** Immutable source frame created by a SpriteSheet. */
export interface SpriteFrame {
  readonly name: string;
  readonly sheet: SpriteSheet;
  readonly source: Readonly<Rect>;
  readonly pivot: Readonly<Vector2D>;
  readonly trim: SpriteFrameTrim | null;
  readonly originalSize: Readonly<Vector2D>;
}

export interface SpriteSheetOptions {
  /** Grid cell width in texture pixels. Pair with frameHeight to enable gridFrame(). */
  frameWidth?: number;
  /** Grid cell height in texture pixels. Pair with frameWidth to enable gridFrame(). */
  frameHeight?: number;
  /** Symmetric atlas edge inset in texture pixels. */
  margin?: Readonly<Vector2DLike>;
  /** Horizontal and vertical gap between grid cells in texture pixels. */
  spacing?: Readonly<Vector2DLike>;
  /** Named, manually placed frames. Frame rectangles are not rotated. */
  frames?: SpriteFrameDefinition[];
}

interface GridFrameEntry {
  column: number;
  row: number;
  frame: SpriteFrame;
}

function copyVec2(value: Vector2DLike): Vector2D {
  return Vector2D.from(value);
}

function copyTrim(value: SpriteFrameTrimDefinition): SpriteFrameTrim {
  return { offset: copyVec2(value.offset), originalSize: copyVec2(value.originalSize) };
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

function isValidVector(value: Vector2DLike): boolean {
  return value !== null && value !== undefined && isFiniteNumber(value.x) && isFiniteNumber(value.y);
}

class AtlasSpriteFrame implements SpriteFrame {
  readonly name: string;
  readonly sheet: SpriteSheet;
  readonly source: Rect;
  private readonly pivotValue: Vector2D;
  private readonly trimValue: SpriteFrameTrim | null;
  private readonly originalSizeValue: Vector2D;

  get pivot(): Readonly<Vector2D> {
    return this.pivotValue.clone();
  }
  get trim(): SpriteFrameTrim | null {
    return this.trimValue === null ? null : copyTrim(this.trimValue);
  }
  get originalSize(): Readonly<Vector2D> {
    return this.originalSizeValue.clone();
  }

  constructor(sheet: SpriteSheet, definition: SpriteFrameDefinition) {
    this.name = definition.name;
    this.sheet = sheet;
    this.source = copyRect(definition.source);
    this.pivotValue = definition.pivot === undefined ? new Vector2D(0.5, 0.5) : copyVec2(definition.pivot);
    this.trimValue = definition.trim === undefined ? null : copyTrim(definition.trim);
    this.originalSizeValue =
      this.trimValue === null
        ? new Vector2D(this.source.width, this.source.height)
        : this.trimValue.originalSize.clone();
  }
}

/** Reusable named or grid-based frames over one Game-owned texture. */
export class SpriteSheet {
  readonly texture: Texture;
  private readonly marginValue: Vector2D;
  private readonly spacingValue: Vector2D;
  readonly frameWidth: number;
  readonly frameHeight: number;
  private columnCount = 0;
  private rowCount = 0;

  private frameError: string | null = null;
  private namedFrames: SpriteFrame[] = [];
  private gridFrames: GridFrameEntry[] = [];

  constructor(texture: Texture, options: SpriteSheetOptions = {}) {
    const settings: SpriteSheetOptions = options === null || options === undefined ? {} : options;
    this.texture = texture;
    this.frameWidth = settings.frameWidth === undefined ? 0 : settings.frameWidth;
    this.frameHeight = settings.frameHeight === undefined ? 0 : settings.frameHeight;
    this.marginValue =
      settings.margin === undefined
        ? Vector2D.zero()
        : isValidVector(settings.margin)
          ? copyVec2(settings.margin)
          : new Vector2D(NaN, NaN);
    this.spacingValue =
      settings.spacing === undefined
        ? Vector2D.zero()
        : isValidVector(settings.spacing)
          ? copyVec2(settings.spacing)
          : new Vector2D(NaN, NaN);
    if (
      texture === null ||
      texture === undefined ||
      !texture.isLoaded ||
      !isPositive(texture.width) ||
      !isPositive(texture.height)
    ) {
      this.frameError = 'SpriteSheet requires a loaded texture.';
      return;
    }
    if (
      !isValidVector(this.marginValue) ||
      !isNonNegative(this.marginValue.x) ||
      !isNonNegative(this.marginValue.y) ||
      !isValidVector(this.spacingValue) ||
      !isNonNegative(this.spacingValue.x) ||
      !isNonNegative(this.spacingValue.y)
    ) {
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
      const availableWidth = texture.width - this.marginValue.x * 2;
      const availableHeight = texture.height - this.marginValue.y * 2;
      const columnStride = this.frameWidth + this.spacingValue.x;
      const rowStride = this.frameHeight + this.spacingValue.y;
      this.columnCount =
        availableWidth < this.frameWidth ? 0 : Math.floor((availableWidth + this.spacingValue.x) / columnStride);
      this.rowCount =
        availableHeight < this.frameHeight ? 0 : Math.floor((availableHeight + this.spacingValue.y) / rowStride);
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
      if (
        definition === null ||
        definition === undefined ||
        typeof definition.name !== 'string' ||
        definition.name.length === 0
      ) {
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

  get error(): string | null {
    return this.frameError;
  }
  get columns(): number {
    return this.columnCount;
  }
  get rows(): number {
    return this.rowCount;
  }
  get margin(): Readonly<Vector2D> {
    return this.marginValue.clone();
  }
  get spacing(): Readonly<Vector2D> {
    return this.spacingValue.clone();
  }

  /** Returns the same cached frame object for every request of a grid cell. */
  gridFrame(column: number, row: number): SpriteFrame | null {
    if (
      this.frameError !== null ||
      this.frameWidth <= 0 ||
      this.frameHeight <= 0 ||
      column !== Math.floor(column) ||
      row !== Math.floor(row) ||
      column < 0 ||
      row < 0 ||
      column >= this.columns ||
      row >= this.rows
    )
      return null;
    for (let index = 0; index < this.gridFrames.length; index++) {
      const entry = this.gridFrames[index];
      if (entry.column === column && entry.row === row) return entry.frame;
    }

    const definition: SpriteFrameDefinition = {
      name: 'grid:' + column + ':' + row,
      source: {
        x: this.marginValue.x + column * (this.frameWidth + this.spacingValue.x),
        y: this.marginValue.y + row * (this.frameHeight + this.spacingValue.y),
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
    if (
      source === null ||
      source === undefined ||
      !isPositive(source.width) ||
      !isPositive(source.height) ||
      !isFiniteNumber(source.x) ||
      !isFiniteNumber(source.y) ||
      source.x < 0 ||
      source.y < 0 ||
      source.x + source.width > this.texture.width ||
      source.y + source.height > this.texture.height
    ) {
      return 'SpriteSheet frame source is outside the texture: ' + definition.name;
    }
    if (definition.pivot !== undefined && !isValidVector(definition.pivot)) {
      return 'SpriteSheet frame pivot must be finite: ' + definition.name;
    }
    if (definition.trim !== undefined) {
      const trim = definition.trim;
      if (
        trim === null ||
        !isValidVector(trim.offset) ||
        !isValidVector(trim.originalSize) ||
        !isPositive(trim.originalSize.x) ||
        !isPositive(trim.originalSize.y) ||
        !isNonNegative(trim.offset.x) ||
        !isNonNegative(trim.offset.y) ||
        trim.offset.x + source.width > trim.originalSize.x ||
        trim.offset.y + source.height > trim.originalSize.y
      ) {
        return 'SpriteSheet trim metadata is invalid: ' + definition.name;
      }
    }
    return null;
  }
}
