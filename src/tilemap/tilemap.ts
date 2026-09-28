import { Colors } from '../core/colors';
import type { GameContext } from '../core/context';
import type { Color, Rect, Vec2 } from '../core/types';
import type { Renderer } from '../core/renderer';
import { GameComponent } from '../game/game-component';
import type { SpriteFrame, SpriteSheet } from '../sprites/sprite-sheet';

export interface TilemapTileDefinition {
  /** Tile ID 0 is reserved for an empty cell. */
  id: number;
  /** A frame from the tilemap's sheet or the name of a frame on that sheet. */
  frame: SpriteFrame | string;
  /** Marks this tile as a full-cell solid tile unless a custom collision is supplied. */
  solid?: boolean;
  /** One local collision rectangle, measured from this cell's top-left corner. */
  collision?: Readonly<Rect>;
}

export interface TilemapOptions {
  columns: number;
  rows: number;
  tileWidth: number;
  tileHeight: number;
  tiles: TilemapTileDefinition[];
  /** Row-major tile IDs. Missing cells are filled with 0 (empty). */
  data?: number[];
  tint?: Color;
  visible?: boolean;
  renderOrder?: number;
}

export interface TilemapSolidTile {
  readonly column: number;
  readonly row: number;
  readonly tileId: number;
  /** Local rectangle measured from the Tilemap GameObject's top-left origin. */
  readonly bounds: Readonly<Rect>;
}

interface ResolvedTileDefinition {
  id: number;
  frame: SpriteFrame;
  solid: boolean;
  collision: Rect;
}

function finite(value: number): boolean {
  return value === value && value !== Infinity && value !== -Infinity;
}

function validColor(value: Color): boolean {
  return value !== null && value !== undefined && finite(value.r) && finite(value.g) &&
    finite(value.b) && finite(value.a);
}

function copyColor(value: Color): Color { return { r: value.r, g: value.g, b: value.b, a: value.a }; }
function copyRect(value: Rect): Rect { return { x: value.x, y: value.y, width: value.width, height: value.height }; }

function rotationZDegrees(rotation: { x: number; y: number; z: number; w: number }): number {
  const sin = 2 * (rotation.w * rotation.z + rotation.x * rotation.y);
  const cos = 1 - 2 * (rotation.y * rotation.y + rotation.z * rotation.z);
  return Math.atan2(sin, cos) * 180 / Math.PI;
}

/** Grid-based, atlas-backed renderer and collision-data source for 2D tilemaps. */
export class Tilemap extends GameComponent {
  readonly sheet: SpriteSheet;
  readonly columns: number;
  readonly rows: number;
  readonly tileWidth: number;
  readonly tileHeight: number;
  readonly error: string | null;
  tint: Color;
  visible: boolean;

  private definitions: ResolvedTileDefinition[] = [];
  private cells: number[] = [];

  constructor(sheet: SpriteSheet, options: TilemapOptions) {
    super();
    this.sheet = sheet;
    const settings: TilemapOptions = options === null || options === undefined
      ? { columns: 0, rows: 0, tileWidth: 0, tileHeight: 0, tiles: [] }
      : options;
    this.columns = settings.columns;
    this.rows = settings.rows;
    this.tileWidth = settings.tileWidth;
    this.tileHeight = settings.tileHeight;
    this.tint = settings.tint === undefined ? copyColor(Colors.WHITE) : validColor(settings.tint)
      ? copyColor(settings.tint) : copyColor(Colors.WHITE);
    this.visible = settings.visible === undefined ? true : settings.visible;

    const error = this.validateOptions(settings);
    this.error = error;
    if (error !== null) {
      this.enabled = false;
      return;
    }

    if (settings.renderOrder !== undefined) this.renderOrder = settings.renderOrder;
    for (let index = 0; index < settings.tiles.length; index++) {
      const definition = settings.tiles[index];
      const frame = typeof definition.frame === 'string'
        ? sheet.getFrame(definition.frame)
        : definition.frame;
      if (frame === null || frame === undefined || frame.sheet !== sheet) {
        this.definitions = [];
        this.enabled = false;
        return;
      }
      const collision = definition.collision === undefined
        ? { x: 0, y: 0, width: this.tileWidth, height: this.tileHeight }
        : copyRect(definition.collision);
      this.definitions.push({
        id: definition.id,
        frame,
        solid: definition.solid === true || definition.collision !== undefined,
        collision,
      });
    }

    const cellCount = this.columns * this.rows;
    this.cells = [];
    for (let index = 0; index < cellCount; index++) this.cells.push(0);
    if (settings.data !== undefined) {
      for (let index = 0; index < settings.data.length; index++) this.cells[index] = settings.data[index];
    }
  }

  get tileCount(): number {
    let count = 0;
    for (let index = 0; index < this.cells.length; index++) if (this.cells[index] !== 0) count++;
    return count;
  }

  getTile(column: number, row: number): number {
    const index = this.cellIndex(column, row);
    return index < 0 ? 0 : this.cells[index];
  }

  setTile(column: number, row: number, tileId: number): boolean {
    const index = this.cellIndex(column, row);
    if (this.error !== null || index < 0 || !this.hasDefinition(tileId)) return false;
    this.cells[index] = tileId;
    return true;
  }

  fill(tileId: number): boolean {
    if (this.error !== null || !this.hasDefinition(tileId)) return false;
    for (let index = 0; index < this.cells.length; index++) this.cells[index] = tileId;
    return true;
  }

  getFrame(tileId: number): SpriteFrame | null {
    const definition = this.findDefinition(tileId);
    return definition === null ? null : definition.frame;
  }

  /** Returns solid cell rectangles in map-local coordinates, row-major. */
  getSolidTiles(): TilemapSolidTile[] {
    const result: TilemapSolidTile[] = [];
    if (this.error !== null) return result;
    for (let row = 0; row < this.rows; row++) {
      for (let column = 0; column < this.columns; column++) {
        const tileId = this.cells[row * this.columns + column];
        const definition = this.findDefinition(tileId);
        if (tileId === 0 || definition === null || !definition.solid) continue;
        result.push({
          column,
          row,
          tileId,
          bounds: {
            x: column * this.tileWidth + definition.collision.x,
            y: row * this.tileHeight + definition.collision.y,
            width: definition.collision.width,
            height: definition.collision.height,
          },
        });
      }
    }
    return result;
  }

  _canAttachTo(context: GameContext): boolean {
    if (this.error !== null || this.sheet === null || this.sheet === undefined ||
        this.sheet.error !== null || !this.sheet._canAttachTo(context)) return false;
    for (let index = 0; index < this.definitions.length; index++) {
      if (!this.definitions[index].frame.sheet._canAttachTo(context)) return false;
    }
    return true;
  }

  render(renderer: Renderer): void {
    if (!this.visible || this.error !== null || !this.isActiveAndEnabled ||
        !validColor(this.tint) || this.gameObject === null || this.gameObject.scene === null ||
        !this.sheet._canAttachTo(this.gameObject.scene.context)) return;
    const owner = this.gameObject;
    const transform = owner.transform;
    const position = transform.worldPosition;
    const scale = transform.worldScale;
    const rotation = rotationZDegrees(transform.worldRotation);
    if (!finite(scale.x) || !finite(scale.y) || scale.x === 0 || scale.y === 0 || !finite(rotation)) return;
    const radians = rotation * Math.PI / 180;
    const cos = Math.cos(radians);
    const sin = Math.sin(radians);
    const signedWidth = this.tileWidth * scale.x;
    const signedHeight = this.tileHeight * scale.y;
    const flipX = scale.x < 0;
    const flipY = scale.y < 0;
    const cullingBounds: Rect = { x: 0, y: 0, width: 0, height: 0 };

    for (let row = 0; row < this.rows; row++) {
      for (let column = 0; column < this.columns; column++) {
        const tileId = this.cells[row * this.columns + column];
        if (tileId === 0) continue;
        const definition = this.findDefinition(tileId);
        if (definition === null) continue;
        const frame = definition.frame;
        const source = {
          x: frame.source.x + (flipX ? frame.source.width : 0),
          y: frame.source.y + (flipY ? frame.source.height : 0),
          width: flipX ? -frame.source.width : frame.source.width,
          height: flipY ? -frame.source.height : frame.source.height,
        };
        const trimOffset = frame.trim === null ? { x: 0, y: 0 } : frame.trim.offset;
        const original = frame.originalSize;
        if (original.x <= 0 || original.y <= 0) continue;
        const trimX = flipX ? original.x - trimOffset.x - frame.source.width : trimOffset.x;
        const trimY = flipY ? original.y - trimOffset.y - frame.source.height : trimOffset.y;
        const sourceCenterX = trimX + frame.source.width * 0.5;
        const sourceCenterY = trimY + frame.source.height * 0.5;
        const localX = (column + sourceCenterX / original.x) * signedWidth;
        const localY = (row + sourceCenterY / original.y) * signedHeight;
        const centerX = position.x + localX * cos - localY * sin;
        const centerY = position.y + localX * sin + localY * cos;
        const width = frame.source.width / original.x * this.tileWidth * Math.abs(scale.x);
        const height = frame.source.height / original.y * this.tileHeight * Math.abs(scale.y);
        const destination = { x: centerX - width * 0.5, y: centerY - height * 0.5, width, height };
        const halfWidth = (Math.abs(cos) * width + Math.abs(sin) * height) * 0.5;
        const halfHeight = (Math.abs(sin) * width + Math.abs(cos) * height) * 0.5;
        cullingBounds.x = centerX - halfWidth;
        cullingBounds.y = centerY - halfHeight;
        cullingBounds.width = halfWidth * 2;
        cullingBounds.height = halfHeight * 2;
        if (!renderer.isRectVisibleIn2D(cullingBounds)) {
          renderer._recordSpriteCulled();
          continue;
        }
        if (this.sheet.texture.drawRegion(
          source, destination, { x: width * 0.5, y: height * 0.5 }, rotation, this.tint,
        )) renderer._recordSpriteDrawn();
      }
    }
  }

  private validateOptions(options: TilemapOptions): string | null {
    if (this.sheet === null || this.sheet === undefined || this.sheet.error !== null || !this.sheet.texture.isLoaded) {
      return 'Tilemap requires a valid SpriteSheet with a loaded texture.';
    }
    if (!finite(this.columns) || this.columns <= 0 || Math.floor(this.columns) !== this.columns ||
        !finite(this.rows) || this.rows <= 0 || Math.floor(this.rows) !== this.rows ||
        !finite(this.tileWidth) || this.tileWidth <= 0 || !finite(this.tileHeight) || this.tileHeight <= 0) {
      return 'Tilemap columns, rows, tileWidth, and tileHeight must be positive.';
    }
    if (!Array.isArray(options.tiles) || options.tiles.length === 0) return 'Tilemap requires tile definitions.';
    if (options.tint !== undefined && !validColor(options.tint)) return 'Tilemap tint must be finite.';
    if (options.renderOrder !== undefined && !finite(options.renderOrder)) return 'Tilemap renderOrder must be finite.';
    const cellCount = this.columns * this.rows;
    if (cellCount > 1000000) return 'Tilemap is too large; limit it to one million cells.';
    if (options.data !== undefined && (options.data === null || options.data.length !== cellCount)) {
      return 'Tilemap data length must match columns multiplied by rows.';
    }

    for (let index = 0; index < options.tiles.length; index++) {
      const definition = options.tiles[index];
      if (definition === null || definition === undefined || !finite(definition.id) ||
          definition.id <= 0 || Math.floor(definition.id) !== definition.id) {
        return 'Tilemap tile IDs must be positive integers; 0 is reserved for empty cells.';
      }
      for (let prior = 0; prior < index; prior++) {
        if (options.tiles[prior].id === definition.id) return 'Tilemap tile IDs must be unique.';
      }
      if (typeof definition.frame !== 'string' &&
          (definition.frame === null || definition.frame === undefined || definition.frame.sheet !== this.sheet)) {
        return 'Tilemap frames must belong to its SpriteSheet.';
      }
      if (typeof definition.frame === 'string' && this.sheet.getFrame(definition.frame) === null) {
        return 'Unknown Tilemap frame: ' + definition.frame;
      }
      if (definition.collision !== undefined) {
        const collision = definition.collision;
        if (collision === null || !finite(collision.x) || !finite(collision.y) ||
            !finite(collision.width) || !finite(collision.height) || collision.x < 0 || collision.y < 0 ||
            collision.width <= 0 || collision.height <= 0 ||
            collision.x + collision.width > this.tileWidth || collision.y + collision.height > this.tileHeight) {
          return 'Tilemap collision rectangle must fit inside its tile.';
        }
      }
    }
    if (options.data !== undefined) {
      for (let index = 0; index < options.data.length; index++) {
        const tileId = options.data[index];
        let isDefined = tileId === 0;
        for (let tileIndex = 0; tileIndex < options.tiles.length && !isDefined; tileIndex++) {
          isDefined = options.tiles[tileIndex].id === tileId;
        }
        if (!isDefined) return 'Tilemap data contains an undefined tile ID.';
      }
    }
    return null;
  }

  private cellIndex(column: number, row: number): number {
    if (!finite(column) || !finite(row) || Math.floor(column) !== column || Math.floor(row) !== row ||
        column < 0 || row < 0 || column >= this.columns || row >= this.rows) return -1;
    return row * this.columns + column;
  }

  private hasDefinition(tileId: number): boolean {
    return tileId === 0 || this.findDefinition(tileId) !== null;
  }

  private findDefinition(tileId: number): ResolvedTileDefinition | null {
    for (let index = 0; index < this.definitions.length; index++) {
      if (this.definitions[index].id === tileId) return this.definitions[index];
    }
    return null;
  }
}
