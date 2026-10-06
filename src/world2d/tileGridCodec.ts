import type { World2DSerializeOptions } from './storageTypes';

const MAX_WORLD2D_TILE_CELLS = 1_000_000;
const MAX_SAFE_INTEGER_VALUE = 9007199254740991;

export interface EncodedWorld2DRleTileGrid {
  encoding: 'rle';
  values: number[];
}

export interface EncodedWorld2DSparseTileGrid {
  encoding: 'sparse';
  base?: number;
  values: number[];
}

export interface EncodedWorld2DPackedTileGrid {
  encoding: 'bits' | 'lz';
  palette: number[];
  values: string;
}

export type EncodedWorld2DTileGrid =
  | number[]
  | EncodedWorld2DRleTileGrid
  | EncodedWorld2DSparseTileGrid
  | EncodedWorld2DPackedTileGrid;

function safeInteger(value: unknown): value is number {
  return typeof value === 'number' && value === value && value !== Infinity && value !== -Infinity &&
    Math.floor(value) === value && Math.abs(value) <= MAX_SAFE_INTEGER_VALUE;
}

function fail(path: string, code: string, message: string): never {
  const error: any = new Error(message);
  error.name = 'World2DCodecError';
  error.diagnostic = { path, code, message };
  throw error;
}

function numberListSize(values: number[]): number {
  let size = values.length === 0 ? 2 : values.length - 1 + 2;
  for (let index = 0; index < values.length; index++) size += ('' + values[index]).length;
  return size;
}

function requireCodes(codes: unknown, path: string, limit: number): number[] {
  if (!Array.isArray(codes)) fail(path, 'invalid_tile_grid', 'Tile grid codes must be an array.');
  if (codes.length > limit) fail(path, 'tile_grid_too_large', 'Tile grid exceeds the supported cell limit.');
  for (let index = 0; index < codes.length; index++) {
    if (!safeInteger(codes[index])) {
      fail(path + '/' + index, 'invalid_tile_code', 'Tile codes must be safe integers.');
    }
  }
  return codes as number[];
}

function denseCopy(codes: number[]): number[] {
  const output: number[] = [];
  for (let index = 0; index < codes.length; index++) output.push(codes[index]);
  return output;
}

function runLengthEncode(codes: number[]): EncodedWorld2DRleTileGrid {
  const values: number[] = [];
  let index = 0;
  while (index < codes.length) {
    const code = codes[index];
    let end = index + 1;
    while (end < codes.length && codes[end] === code) end++;
    values.push(end - index, code);
    index = end;
  }
  return { encoding: 'rle', values };
}

function sparseEncode(codes: number[]): EncodedWorld2DSparseTileGrid {
  const frequencies: Record<string, number> = {};
  for (let index = 0; index < codes.length; index++) {
    const key = '' + codes[index];
    const count = frequencies[key];
    frequencies[key] = count === undefined ? 1 : count + 1;
  }

  let base = 0;
  let bestFrequency = -1;
  const keys = Object.keys(frequencies);
  for (let index = 0; index < keys.length; index++) {
    const code = Number(keys[index]);
    const count = frequencies[keys[index]];
    if (count > bestFrequency || (count === bestFrequency && code < base)) {
      base = code;
      bestFrequency = count;
    }
  }

  const values: number[] = [];
  let previous = -1;
  for (let index = 0; index < codes.length; index++) {
    if (codes[index] === base) continue;
    values.push(index - previous - 1, codes[index]);
    previous = index;
  }
  if (base === 0) return { encoding: 'sparse', values };
  return { encoding: 'sparse', base, values };
}

function optionValue(options: World2DSerializeOptions | undefined): World2DSerializeOptions {
  if (options === undefined) return {};
  if (options === null || typeof options !== 'object' || Array.isArray(options)) {
    fail('/options', 'invalid_serialize_options', 'World2D serialization options must be an object.');
  }
  if (options.mode !== undefined && options.mode !== 'compact' && options.mode !== 'readable') {
    fail('/options/mode', 'invalid_serialize_options', 'Serialization mode must be compact or readable.');
  }
  if (options.effort !== undefined && options.effort !== 'fast' && options.effort !== 'max') {
    fail('/options/effort', 'invalid_serialize_options', 'Serialization effort must be fast or max.');
  }
  return options;
}

/** Measures the complete canonical minified JSON envelope of one supported grid candidate. */
export function tileGridEncodedSize(grid: EncodedWorld2DTileGrid): number {
  if (Array.isArray(grid)) {
    const codes = requireCodes(grid, '/data', MAX_WORLD2D_TILE_CELLS);
    return numberListSize(codes);
  }
  if (grid === null || typeof grid !== 'object') {
    fail('/data', 'invalid_tile_grid', 'Encoded tile grid must be an array or codec object.');
  }
  const value: any = grid;
  if (value.encoding === 'rle') {
    const values = requireCodes(value.values, '/data/values', MAX_WORLD2D_TILE_CELLS * 2);
    return '{"encoding":"rle","values":'.length + numberListSize(values) + 1;
  }
  if (value.encoding === 'sparse') {
    const values = requireCodes(value.values, '/data/values', MAX_WORLD2D_TILE_CELLS * 2);
    if (value.base === undefined || value.base === 0) {
      return '{"encoding":"sparse","values":'.length + numberListSize(values) + 1;
    }
    if (!safeInteger(value.base)) fail('/data/base', 'invalid_tile_code', 'Sparse base must be a safe integer.');
    return '{"encoding":"sparse","base":'.length + ('' + value.base).length +
      ',"values":'.length + numberListSize(values) + 1;
  }
  if (value.encoding === 'bits' || value.encoding === 'lz') {
    const palette = requireCodes(value.palette, '/data/palette', MAX_WORLD2D_TILE_CELLS);
    if (typeof value.values !== 'string') fail('/data/values', 'invalid_tile_grid', 'Packed grid values must be Base64 text.');
    const prefix = value.encoding === 'bits'
      ? '{"encoding":"bits","palette":'
      : '{"encoding":"lz","palette":';
    return prefix.length + numberListSize(palette) + ',"values":"'.length + value.values.length + '"}'.length;
  }
  fail('/data/encoding', 'unknown_tile_grid_encoding', 'Tile grid encoding is unsupported.');
}

/** Encodes flat row-major codes, selecting the smallest complete minified JSON candidate. */
export function encodeWorld2DTileGrid(
  inputCodes: number[],
  options?: World2DSerializeOptions,
): EncodedWorld2DTileGrid {
  const codes = requireCodes(inputCodes, '/data', MAX_WORLD2D_TILE_CELLS);
  const normalizedOptions = optionValue(options);
  const dense = denseCopy(codes);
  if (normalizedOptions.mode === 'readable') return dense;

  const candidates: EncodedWorld2DTileGrid[] = [dense, runLengthEncode(codes), sparseEncode(codes)];
  let best = candidates[0];
  let bestSize = tileGridEncodedSize(best);
  for (let index = 1; index < candidates.length; index++) {
    const size = tileGridEncodedSize(candidates[index]);
    if (size < bestSize) {
      best = candidates[index];
      bestSize = size;
    }
  }
  return best;
}

function cellCountValue(value: unknown): number {
  if (!safeInteger(value) || value < 0 || value > MAX_WORLD2D_TILE_CELLS) {
    fail('/size', 'invalid_tile_grid_size', 'Tile grid cell count must be an integer from zero through the supported limit.');
  }
  return value;
}

function decodeDense(input: unknown[], cellCount: number): number[] {
  const codes = requireCodes(input, '/data', MAX_WORLD2D_TILE_CELLS);
  if (codes.length !== cellCount) fail('/data', 'tile_grid_size_mismatch', 'Dense tile grid length does not match its dimensions.');
  return denseCopy(codes);
}

function decodeRle(input: any, cellCount: number): number[] {
  const values = requireCodes(input.values, '/data/values', MAX_WORLD2D_TILE_CELLS * 2);
  if (values.length % 2 !== 0) fail('/data/values', 'invalid_rle_payload', 'RLE values must contain count/code pairs.');
  if (values.length / 2 > cellCount) fail('/data/values', 'invalid_rle_payload', 'RLE has more runs than grid cells.');

  let total = 0;
  for (let index = 0; index < values.length; index += 2) {
    const count = values[index];
    if (count <= 0) fail('/data/values/' + index, 'invalid_rle_count', 'RLE counts must be positive safe integers.');
    if (count > cellCount - total) fail('/data/values', 'tile_grid_size_mismatch', 'RLE expands beyond the declared grid size.');
    total += count;
  }
  if (total !== cellCount) fail('/data/values', 'tile_grid_size_mismatch', 'RLE output does not match the declared grid size.');

  const output: number[] = new Array(cellCount);
  let cursor = 0;
  for (let index = 0; index < values.length; index += 2) {
    const count = values[index];
    const code = values[index + 1];
    for (let run = 0; run < count; run++) output[cursor++] = code;
  }
  return output;
}

function decodeSparse(input: any, cellCount: number): number[] {
  const values = requireCodes(input.values, '/data/values', MAX_WORLD2D_TILE_CELLS * 2);
  if (values.length % 2 !== 0) fail('/data/values', 'invalid_sparse_payload', 'Sparse values must contain gap/code pairs.');
  if (values.length / 2 > cellCount) fail('/data/values', 'invalid_sparse_payload', 'Sparse has more overrides than grid cells.');
  const base = input.base === undefined ? 0 : input.base;
  if (!safeInteger(base)) fail('/data/base', 'invalid_tile_code', 'Sparse base must be a safe integer.');

  let previous = -1;
  for (let index = 0; index < values.length; index += 2) {
    const gap = values[index];
    if (gap < 0) fail('/data/values/' + index, 'invalid_sparse_gap', 'Sparse gaps must be non-negative safe integers.');
    const position = previous + gap + 1;
    if (position >= cellCount) fail('/data/values/' + index, 'sparse_position_out_of_bounds', 'Sparse override is outside the declared grid size.');
    previous = position;
  }

  const output: number[] = new Array(cellCount);
  for (let index = 0; index < cellCount; index++) output[index] = base;
  previous = -1;
  for (let index = 0; index < values.length; index += 2) {
    const position = previous + values[index] + 1;
    output[position] = values[index + 1];
    previous = position;
  }
  return output;
}

/** Validates a payload and its dimensions before constructing a dense row-major grid. */
export function decodeWorld2DTileGrid(input: unknown, inputCellCount: number): number[] {
  const cellCount = cellCountValue(inputCellCount);
  if (Array.isArray(input)) return decodeDense(input, cellCount);
  if (input === null || typeof input !== 'object') {
    fail('/data', 'invalid_tile_grid', 'Tile grid payload must be a numeric array or codec object.');
  }
  const value: any = input;
  if (value.encoding === 'rle') return decodeRle(value, cellCount);
  if (value.encoding === 'sparse') return decodeSparse(value, cellCount);
  if (value.encoding === 'bits' || value.encoding === 'lz') {
    fail('/data/encoding', 'unsupported_tile_grid_encoding', 'Packed tile grid decoding is not available yet.');
  }
  fail('/data/encoding', 'unknown_tile_grid_encoding', 'Tile grid encoding is unsupported.');
}
