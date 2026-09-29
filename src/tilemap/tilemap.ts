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
  /** Optional row-major Tiled orthogonal flip flags. Missing entries use the default transform. */
  cellFlips?: TilemapCellFlip[];
  tint?: Color;
  visible?: boolean;
  renderOrder?: number;
}

/** Orthogonal Tiled flips, applied diagonal first, then horizontal, then vertical. */
export interface TilemapCellFlip {
  flipX?: boolean;
  flipY?: boolean;
  flipDiagonal?: boolean;
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

interface TilemapChunk {
  columnStart: number;
  rowStart: number;
  columnCount: number;
  rowCount: number;
  nonEmptyCellCount: number;
  occupiedCellIndices: number[];
  dirty: boolean;
}

const TILEMAP_CHUNK_SIZE = 16;

function finite(value: number): boolean {
  return value === value && value !== Infinity && value !== -Infinity;
}

function validColor(value: Color): boolean {
  return value !== null && value !== undefined && finite(value.r) && finite(value.g) &&
    finite(value.b) && finite(value.a);
}

function copyColor(value: Color): Color { return { r: value.r, g: value.g, b: value.b, a: value.a }; }
function copyRect(value: Rect): Rect { return { x: value.x, y: value.y, width: value.width, height: value.height }; }

function copyFlip(value: TilemapCellFlip): TilemapCellFlip {
  return { flipX: value.flipX === true, flipY: value.flipY === true, flipDiagonal: value.flipDiagonal === true };
}

function flipIsValid(value: TilemapCellFlip): boolean {
  if (value === null || value === undefined) return false;
  if (value.flipX !== undefined && typeof value.flipX !== 'boolean') return false;
  if (value.flipY !== undefined && typeof value.flipY !== 'boolean') return false;
  if (value.flipDiagonal !== undefined && typeof value.flipDiagonal !== 'boolean') return false;
  return true;
}

function transformCellPoint(x: number, y: number, flip: TilemapCellFlip): Vec2 {
  let resultX = x;
  let resultY = y;
  if (flip.flipDiagonal === true) { const swap = resultX; resultX = resultY; resultY = swap; }
  if (flip.flipX === true) resultX = 1 - resultX;
  if (flip.flipY === true) resultY = 1 - resultY;
  return { x: resultX, y: resultY };
}

function transformCellRect(rect: Rect, tileWidth: number, tileHeight: number, flip: TilemapCellFlip): Rect {
  const left = rect.x / tileWidth;
  const top = rect.y / tileHeight;
  const right = (rect.x + rect.width) / tileWidth;
  const bottom = (rect.y + rect.height) / tileHeight;
  const corners = [
    transformCellPoint(left, top, flip),
    transformCellPoint(right, top, flip),
    transformCellPoint(left, bottom, flip),
    transformCellPoint(right, bottom, flip),
  ];
  let minX = corners[0].x;
  let minY = corners[0].y;
  let maxX = corners[0].x;
  let maxY = corners[0].y;
  for (let index = 1; index < corners.length; index++) {
    minX = Math.min(minX, corners[index].x);
    minY = Math.min(minY, corners[index].y);
    maxX = Math.max(maxX, corners[index].x);
    maxY = Math.max(maxY, corners[index].y);
  }
  return { x: minX * tileWidth, y: minY * tileHeight,
    width: (maxX - minX) * tileWidth, height: (maxY - minY) * tileHeight };
}

function transformPoint(x: number, y: number, position: Vec2, width: number, height: number,
  cosine: number, sine: number): Vec2 {
  const localX = x * width;
  const localY = y * height;
  return { x: position.x + localX * cosine - localY * sine,
    y: position.y + localX * sine + localY * cosine };
}

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
  private cellFlips: TilemapCellFlip[] = [];
  private chunks: TilemapChunk[] = [];
  private chunkColumns = 0;
  private dirtyChunkCountValue = 0;
  private lastRenderVisibleChunkCountValue = 0;
  private lastRenderVisitedCellCountValue = 0;

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
    this.cellFlips = [];
    for (let index = 0; index < cellCount; index++) {
      this.cells.push(0);
      this.cellFlips.push({ flipX: false, flipY: false, flipDiagonal: false });
    }
    if (settings.data !== undefined) {
      for (let index = 0; index < settings.data.length; index++) this.cells[index] = settings.data[index];
    }
    if (settings.cellFlips !== undefined) {
      for (let index = 0; index < settings.cellFlips.length; index++) this.cellFlips[index] = copyFlip(settings.cellFlips[index]);
    }
    this.buildChunks();
  }

  get tileCount(): number {
    let count = 0;
    for (let index = 0; index < this.cells.length; index++) if (this.cells[index] !== 0) count++;
    return count;
  }

  /** Number of fixed-size chunks indexing this map. */
  get chunkCount(): number { return this.chunks.length; }
  /** Chunks marked by setTile or fill since their last visible render. */
  get dirtyChunkCount(): number { return this.dirtyChunkCountValue; }
  /** Visible chunks traversed by the most recent render call. */
  get lastRenderVisibleChunkCount(): number { return this.lastRenderVisibleChunkCountValue; }
  /** Occupied cells traversed inside visible chunks by the most recent render call. */
  get lastRenderVisitedCellCount(): number { return this.lastRenderVisitedCellCountValue; }

  getTile(column: number, row: number): number {
    const index = this.cellIndex(column, row);
    return index < 0 ? 0 : this.cells[index];
  }

  setTile(column: number, row: number, tileId: number, flip?: TilemapCellFlip): boolean {
    const index = this.cellIndex(column, row);
    if (this.error !== null || index < 0 || !this.hasDefinition(tileId) ||
        (flip !== undefined && !flipIsValid(flip))) return false;
    const nextFlip = flip === undefined ? { flipX: false, flipY: false, flipDiagonal: false } : copyFlip(flip);
    const previousTileId = this.cells[index];
    if (previousTileId === 0 && tileId !== 0) this.adjustChunkOccupancy(column, row, index, 1);
    else if (previousTileId !== 0 && tileId === 0) this.adjustChunkOccupancy(column, row, index, -1);
    this.cells[index] = tileId;
    this.cellFlips[index] = nextFlip;
    this.markChunkDirty(column, row);
    return true;
  }

  fill(tileId: number): boolean {
    if (this.error !== null || !this.hasDefinition(tileId)) return false;
    for (let index = 0; index < this.cells.length; index++) this.cells[index] = tileId;
    for (let index = 0; index < this.cellFlips.length; index++) {
      this.cellFlips[index] = { flipX: false, flipY: false, flipDiagonal: false };
    }
    this.dirtyChunkCountValue = 0;
    for (let index = 0; index < this.chunks.length; index++) {
      const chunk = this.chunks[index];
      chunk.occupiedCellIndices = [];
      if (tileId !== 0) {
        for (let row = chunk.rowStart; row < chunk.rowStart + chunk.rowCount; row++) {
          for (let column = chunk.columnStart; column < chunk.columnStart + chunk.columnCount; column++) {
            chunk.occupiedCellIndices.push(row * this.columns + column);
          }
        }
      }
      chunk.nonEmptyCellCount = chunk.occupiedCellIndices.length;
      chunk.dirty = true;
      this.dirtyChunkCountValue++;
    }
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
        const collision = transformCellRect(definition.collision, this.tileWidth, this.tileHeight,
          this.cellFlips[row * this.columns + column]);
        result.push({
          column,
          row,
          tileId,
          bounds: { x: column * this.tileWidth + collision.x, y: row * this.tileHeight + collision.y,
            width: collision.width, height: collision.height },
        });
      }
    }
    return result;
  }

  /** Merges full-cell solids into rectangles and preserves custom collision rectangles individually. */
  getSolidRegions(): Rect[] {
    const regions: Rect[] = [];
    if (this.error !== null) return regions;
    let activeRuns = new Map<string, Rect>();
    let activeRunKeys: string[] = [];
    for (let row = 0; row < this.rows; row++) {
      const nextRuns = new Map<string, Rect>();
      const nextRunKeys: string[] = [];
      let column = 0;
      while (column < this.columns) {
        const definition = this.findDefinition(this.cells[row * this.columns + column]);
        if (definition === null || !definition.solid || !this.isFullCellCollision(definition)) {
          if (definition !== null && definition.solid) {
            const collision = transformCellRect(definition.collision, this.tileWidth, this.tileHeight,
              this.cellFlips[row * this.columns + column]);
            regions.push({
              x: column * this.tileWidth + collision.x,
              y: row * this.tileHeight + collision.y,
              width: collision.width,
              height: collision.height,
            });
          }
          column++;
          continue;
        }

        const start = column;
        column++;
        while (column < this.columns) {
          const adjacent = this.findDefinition(this.cells[row * this.columns + column]);
          if (adjacent === null || !adjacent.solid || !this.isFullCellCollision(adjacent)) break;
          column++;
        }
        const end = column;
        const key = start + ':' + end;
        nextRunKeys.push(key);
        const previous = activeRuns.get(key);
        if (previous !== undefined && previous.y + previous.height === row * this.tileHeight) {
          nextRuns.set(key, { x: previous.x, y: previous.y, width: previous.width,
            height: previous.height + this.tileHeight });
        } else {
          nextRuns.set(key, { x: start * this.tileWidth, y: row * this.tileHeight,
            width: (end - start) * this.tileWidth, height: this.tileHeight });
        }
      }
      for (let index = 0; index < activeRunKeys.length; index++) {
        const key = activeRunKeys[index];
        if (!nextRuns.has(key)) {
          const rectangle = activeRuns.get(key);
          if (rectangle !== undefined) regions.push(rectangle);
        }
      }
      activeRuns = nextRuns;
      activeRunKeys = nextRunKeys;
    }
    for (let index = 0; index < activeRunKeys.length; index++) {
      const rectangle = activeRuns.get(activeRunKeys[index]);
      if (rectangle !== undefined) regions.push(rectangle);
    }
    regions.sort((a, b) => a.y - b.y || a.x - b.x || a.height - b.height || a.width - b.width);
    return regions;
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
    this.lastRenderVisibleChunkCountValue = 0;
    this.lastRenderVisitedCellCountValue = 0;
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
    const cullingBounds: Rect = { x: 0, y: 0, width: 0, height: 0 };

    for (let chunkIndex = 0; chunkIndex < this.chunks.length; chunkIndex++) {
      const chunk = this.chunks[chunkIndex];
      const left = chunk.columnStart * this.tileWidth;
      const top = chunk.rowStart * this.tileHeight;
      const right = (chunk.columnStart + chunk.columnCount) * this.tileWidth;
      const bottom = (chunk.rowStart + chunk.rowCount) * this.tileHeight;
      const cornerA = transformPoint(left, top, position, scale.x, scale.y, cos, sin);
      const cornerB = transformPoint(right, top, position, scale.x, scale.y, cos, sin);
      const cornerC = transformPoint(left, bottom, position, scale.x, scale.y, cos, sin);
      const cornerD = transformPoint(right, bottom, position, scale.x, scale.y, cos, sin);
      const chunkMinX = Math.min(cornerA.x, cornerB.x, cornerC.x, cornerD.x);
      const chunkMinY = Math.min(cornerA.y, cornerB.y, cornerC.y, cornerD.y);
      const chunkMaxX = Math.max(cornerA.x, cornerB.x, cornerC.x, cornerD.x);
      const chunkMaxY = Math.max(cornerA.y, cornerB.y, cornerC.y, cornerD.y);
      const chunkBounds = { x: chunkMinX, y: chunkMinY, width: chunkMaxX - chunkMinX, height: chunkMaxY - chunkMinY };
      if (!renderer.isRectVisibleIn2D(chunkBounds)) {
        renderer._recordSpriteCulled(chunk.nonEmptyCellCount);
        continue;
      }
      this.clearChunkDirty(chunk);
      this.lastRenderVisibleChunkCountValue++;

      for (let occupiedIndex = 0; occupiedIndex < chunk.occupiedCellIndices.length; occupiedIndex++) {
        this.lastRenderVisitedCellCountValue++;
        const cellIndex = chunk.occupiedCellIndices[occupiedIndex];
        const row = Math.floor(cellIndex / this.columns);
        const column = cellIndex - row * this.columns;
        const tileId = this.cells[row * this.columns + column];
        if (tileId === 0) continue;
        const definition = this.findDefinition(tileId);
        if (definition === null) continue;
        const frame = definition.frame;
        const trimOffset = frame.trim === null ? { x: 0, y: 0 } : frame.trim.offset;
        const original = frame.originalSize;
        if (original.x <= 0 || original.y <= 0) continue;
        const flip = this.cellFlips[row * this.columns + column];
        let source: Rect;
        let centerX: number;
        let centerY: number;
        let width: number;
        let height: number;
        let drawRotation: number;
        if (flip.flipX === true || flip.flipY === true || flip.flipDiagonal === true) {
          const sourceCenterX = (trimOffset.x + frame.source.width * 0.5) / original.x;
          const sourceCenterY = (trimOffset.y + frame.source.height * 0.5) / original.y;
          const outputCenter = transformCellPoint(sourceCenterX, sourceCenterY, flip);
          const xStart = transformCellPoint(0, 0, flip);
          const xEnd = transformCellPoint(1, 0, flip);
          const yStart = transformCellPoint(0, 0, flip);
          const yEnd = transformCellPoint(0, 1, flip);
          const axisX = { x: (xEnd.x - xStart.x) * signedWidth, y: (xEnd.y - xStart.y) * signedHeight };
          const axisY = { x: (yEnd.x - yStart.x) * signedWidth, y: (yEnd.y - yStart.y) * signedHeight };
          const axisXLength = Math.sqrt(axisX.x * axisX.x + axisX.y * axisX.y);
          const axisYLength = Math.sqrt(axisY.x * axisY.x + axisY.y * axisY.y);
          const localRotation = Math.atan2(axisX.y, axisX.x) * 180 / Math.PI;
          const sourceYFlipped = axisX.x * axisY.y - axisX.y * axisY.x < 0;
          source = {
            x: frame.source.x,
            y: frame.source.y + (sourceYFlipped ? frame.source.height : 0),
            width: frame.source.width,
            height: sourceYFlipped ? -frame.source.height : frame.source.height,
          };
          const localX = (column + outputCenter.x) * signedWidth;
          const localY = (row + outputCenter.y) * signedHeight;
          centerX = position.x + localX * cos - localY * sin;
          centerY = position.y + localX * sin + localY * cos;
          width = frame.source.width / original.x * axisXLength;
          height = frame.source.height / original.y * axisYLength;
          drawRotation = rotation + localRotation;
        } else {
          const flipX = scale.x < 0;
          const flipY = scale.y < 0;
          source = {
            x: frame.source.x + (flipX ? frame.source.width : 0),
            y: frame.source.y + (flipY ? frame.source.height : 0),
            width: flipX ? -frame.source.width : frame.source.width,
            height: flipY ? -frame.source.height : frame.source.height,
          };
          const trimX = flipX ? original.x - trimOffset.x - frame.source.width : trimOffset.x;
          const trimY = flipY ? original.y - trimOffset.y - frame.source.height : trimOffset.y;
          const sourceCenterX = trimX + frame.source.width * 0.5;
          const sourceCenterY = trimY + frame.source.height * 0.5;
          const localX = (column + sourceCenterX / original.x) * signedWidth;
          const localY = (row + sourceCenterY / original.y) * signedHeight;
          centerX = position.x + localX * cos - localY * sin;
          centerY = position.y + localX * sin + localY * cos;
          width = frame.source.width / original.x * this.tileWidth * Math.abs(scale.x);
          height = frame.source.height / original.y * this.tileHeight * Math.abs(scale.y);
          drawRotation = rotation;
        }
        const destination = { x: centerX - width * 0.5, y: centerY - height * 0.5, width, height };
        const finalRadians = drawRotation * Math.PI / 180;
        const finalCos = Math.cos(finalRadians);
        const finalSin = Math.sin(finalRadians);
        const halfWidth = (Math.abs(finalCos) * width + Math.abs(finalSin) * height) * 0.5;
        const halfHeight = (Math.abs(finalSin) * width + Math.abs(finalCos) * height) * 0.5;
        cullingBounds.x = centerX - halfWidth;
        cullingBounds.y = centerY - halfHeight;
        cullingBounds.width = halfWidth * 2;
        cullingBounds.height = halfHeight * 2;
        if (!renderer.isRectVisibleIn2D(cullingBounds)) {
          renderer._recordSpriteCulled();
          continue;
        }
        if (this.sheet.texture.drawRegion(
          source, destination, { x: width * 0.5, y: height * 0.5 }, drawRotation, this.tint,
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
    if (options.cellFlips !== undefined &&
        (options.cellFlips === null || !Array.isArray(options.cellFlips) || options.cellFlips.length !== cellCount)) {
      return 'Tilemap cellFlips length must match columns multiplied by rows.';
    }
    if (options.cellFlips !== undefined) {
      for (let index = 0; index < options.cellFlips.length; index++) {
        if (!flipIsValid(options.cellFlips[index])) return 'Tilemap cell flip flags must be boolean.';
      }
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

  private buildChunks(): void {
    this.chunks = [];
    this.chunkColumns = Math.ceil(this.columns / TILEMAP_CHUNK_SIZE);
    const chunkRows = Math.ceil(this.rows / TILEMAP_CHUNK_SIZE);
    this.dirtyChunkCountValue = 0;
    for (let chunkRow = 0; chunkRow < chunkRows; chunkRow++) {
      for (let chunkColumn = 0; chunkColumn < this.chunkColumns; chunkColumn++) {
        const columnStart = chunkColumn * TILEMAP_CHUNK_SIZE;
        const rowStart = chunkRow * TILEMAP_CHUNK_SIZE;
        const columnCount = Math.min(TILEMAP_CHUNK_SIZE, this.columns - columnStart);
        const rowCount = Math.min(TILEMAP_CHUNK_SIZE, this.rows - rowStart);
        let nonEmptyCellCount = 0;
        const occupiedCellIndices: number[] = [];
        for (let row = rowStart; row < rowStart + rowCount; row++) {
          for (let column = columnStart; column < columnStart + columnCount; column++) {
            const cellIndex = row * this.columns + column;
            if (this.cells[cellIndex] !== 0) {
              nonEmptyCellCount++;
              occupiedCellIndices.push(cellIndex);
            }
          }
        }
        this.chunks.push({ columnStart, rowStart, columnCount, rowCount, nonEmptyCellCount,
          occupiedCellIndices, dirty: true });
        this.dirtyChunkCountValue++;
      }
    }
  }

  private chunkIndex(column: number, row: number): number {
    return Math.floor(row / TILEMAP_CHUNK_SIZE) * this.chunkColumns + Math.floor(column / TILEMAP_CHUNK_SIZE);
  }

  private adjustChunkOccupancy(column: number, row: number, cellIndex: number, amount: number): void {
    const chunk = this.chunks[this.chunkIndex(column, row)];
    if (chunk === undefined) return;
    chunk.nonEmptyCellCount += amount;
    if (amount > 0) {
      let insertion = 0;
      while (insertion < chunk.occupiedCellIndices.length && chunk.occupiedCellIndices[insertion] < cellIndex) insertion++;
      chunk.occupiedCellIndices.push(cellIndex);
      for (let index = chunk.occupiedCellIndices.length - 1; index > insertion; index--) {
        chunk.occupiedCellIndices[index] = chunk.occupiedCellIndices[index - 1];
      }
      chunk.occupiedCellIndices[insertion] = cellIndex;
    } else {
      for (let index = 0; index < chunk.occupiedCellIndices.length; index++) {
        if (chunk.occupiedCellIndices[index] === cellIndex) {
          for (let current = index; current + 1 < chunk.occupiedCellIndices.length; current++) {
            chunk.occupiedCellIndices[current] = chunk.occupiedCellIndices[current + 1];
          }
          chunk.occupiedCellIndices.pop();
          break;
        }
      }
    }
  }

  private markChunkDirty(column: number, row: number): void {
    const chunk = this.chunks[this.chunkIndex(column, row)];
    if (chunk !== undefined) {
      if (!chunk.dirty) {
        chunk.dirty = true;
        this.dirtyChunkCountValue++;
      }
    }
  }

  private clearChunkDirty(chunk: TilemapChunk): void {
    if (!chunk.dirty) return;
    chunk.dirty = false;
    this.dirtyChunkCountValue--;
  }

  private isFullCellCollision(definition: ResolvedTileDefinition): boolean {
    return definition.collision.x === 0 && definition.collision.y === 0 &&
      definition.collision.width === this.tileWidth && definition.collision.height === this.tileHeight;
  }
}
