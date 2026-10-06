import type { World2DDiagnostic, World2DTilesetData, WorldTileCell } from './types';

const MAX_SAFE_INTEGER_VALUE = 9007199254740991;
const MAX_TOTAL_TILES = Math.floor((MAX_SAFE_INTEGER_VALUE - 7) / 8);

export class World2DCodecError extends Error {
  readonly diagnostic: World2DDiagnostic;

  constructor(path: string, code: string, message: string) {
    super(message);
    this.name = 'World2DCodecError';
    this.diagnostic = { path, code, message };
  }
}

export interface World2DTileCodebook {
  encode(cell: WorldTileCell | null): number;
  decode(code: number): WorldTileCell | null;
}

interface TileRange {
  id: string;
  firstCode: number;
  tileCount: number;
}

function safeInteger(value: unknown): value is number {
  return typeof value === 'number' && value === value && value !== Infinity && value !== -Infinity &&
    Math.floor(value) === value && Math.abs(value) <= MAX_SAFE_INTEGER_VALUE;
}

function fail(path: string, code: string, message: string): never {
  throw new World2DCodecError(path, code, message);
}

function findRange(ranges: TileRange[], code: number): TileRange | null {
  for (let index = 0; index < ranges.length; index++) {
    const range = ranges[index];
    if (code >= range.firstCode && code < range.firstCode + range.tileCount) return range;
  }
  return null;
}

/** Builds deterministic numeric ranges from tileset order; array index zero is the primary source. */
export function createWorld2DTileCodebook(tilesets: World2DTilesetData[]): World2DTileCodebook {
  if (!Array.isArray(tilesets)) fail('/tilesets', 'invalid_tileset_ranges', 'Tilesets must be an array.');

  const ranges: TileRange[] = [];
  let totalTiles = 0;
  for (let index = 0; index < tilesets.length; index++) {
    const tileset: any = tilesets[index];
    const path = '/tilesets/' + index;
    if (tileset === null || typeof tileset !== 'object' || Array.isArray(tileset) ||
        typeof tileset.id !== 'string' || tileset.id.length === 0) {
      fail(path, 'invalid_tileset_range', 'Tilesets need a non-empty ID to create tile-code ranges.');
    }
    if (!safeInteger(tileset.tileCount) || tileset.tileCount <= 0) {
      fail(path + '/tileCount', 'invalid_tileset_range', 'Tileset tileCount must be a positive safe integer.');
    }
    for (let previous = 0; previous < ranges.length; previous++) {
      if (ranges[previous].id === tileset.id) {
        fail(path + '/id', 'duplicate_tileset_id', 'Tileset IDs must be unique.');
      }
    }
    if (totalTiles + tileset.tileCount > MAX_TOTAL_TILES) {
      fail(path + '/tileCount', 'tile_code_overflow', 'Tileset ranges exceed the safe tile-code limit.');
    }
    ranges.push({ id: tileset.id, firstCode: totalTiles + 1, tileCount: tileset.tileCount });
    totalTiles += tileset.tileCount;
  }

  return {
    encode(cell: WorldTileCell | null): number {
      if (cell === null) return 0;
      if (cell === undefined || typeof cell !== 'object' || Array.isArray(cell)) {
        fail('/cell', 'invalid_tile_cell', 'Tile cells must be an object or null.');
      }
      let range: TileRange | null = null;
      for (let index = 0; index < ranges.length; index++) {
        if (ranges[index].id === cell.tilesetId) {
          range = ranges[index];
          break;
        }
      }
      if (range === null) fail('/cell/tilesetId', 'unknown_tileset', 'Tile cell refers to an unknown tileset.');
      if (!safeInteger(cell.tileId) || cell.tileId < 0 || cell.tileId >= range.tileCount) {
        fail('/cell/tileId', 'tile_id_out_of_range', 'Tile ID must be a zero-based safe integer in the referenced tileset.');
      }
      if (typeof cell.flipX !== 'boolean' || typeof cell.flipY !== 'boolean' || typeof cell.flipDiagonal !== 'boolean') {
        fail('/cell', 'invalid_tile_flip', 'Tile flip fields must be booleans.');
      }
      const globalCode = range.firstCode + cell.tileId;
      const mask = (cell.flipX ? 1 : 0) | (cell.flipY ? 2 : 0) | (cell.flipDiagonal ? 4 : 0);
      if (mask === 0) return globalCode;
      const flippedCode = globalCode * 8 + mask;
      if (!safeInteger(flippedCode)) {
        fail('/cell', 'tile_code_overflow', 'Flipped tile code exceeds the safe integer limit.');
      }
      return -flippedCode;
    },

    decode(code: number): WorldTileCell | null {
      if (!safeInteger(code)) fail('/data', 'invalid_tile_code', 'Tile codes must be safe integers.');
      if (code === 0) return null;

      let globalCode = code;
      let mask = 0;
      if (code < 0) {
        const packed = -code;
        mask = packed % 8;
        if (mask === 0) fail('/data', 'invalid_tile_code', 'Negative tile codes must include at least one flip flag.');
        globalCode = (packed - mask) / 8;
        if (globalCode <= 0) fail('/data', 'invalid_tile_code', 'Negative tile codes must refer to a positive tile range.');
      }

      const range = findRange(ranges, globalCode);
      if (range === null) fail('/data', 'unknown_tile_code', 'Tile code does not belong to a declared tileset.');
      const tileId = globalCode - range.firstCode;
      return {
        tilesetId: range.id,
        tileId,
        flipX: (mask & 1) !== 0,
        flipY: (mask & 2) !== 0,
        flipDiagonal: (mask & 4) !== 0,
      };
    },
  };
}
