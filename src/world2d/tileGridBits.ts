const MAX_WORLD2D_TILE_CELLS = 1_000_000;
const MAX_WORLD2D_TILE_BYTES = 2_500_000;
const MAX_WORLD2D_TILE_COMPRESSED_BYTES = MAX_WORLD2D_TILE_BYTES + Math.ceil(MAX_WORLD2D_TILE_BYTES / 8);
const MAX_SAFE_INTEGER_VALUE = 9007199254740991;
const BASE64_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

function fail(path: string, code: string, message: string): never {
  const error: any = new Error(message);
  error.name = 'World2DCodecError';
  error.diagnostic = { path, code, message };
  throw error;
}

function safeInteger(value: unknown): value is number {
  return typeof value === 'number' && value === value && value !== Infinity && value !== -Infinity &&
    Math.floor(value) === value && Math.abs(value) <= MAX_SAFE_INTEGER_VALUE;
}

function checkedCellCount(value: unknown): number {
  if (!safeInteger(value) || value < 0 || value > MAX_WORLD2D_TILE_CELLS) {
    fail('/size', 'invalid_tile_grid_size', 'Tile grid cell count must be an integer from zero through the supported limit.');
  }
  return value;
}

function checkedCodes(value: unknown, path: string): number[] {
  if (!Array.isArray(value)) fail(path, 'invalid_tile_grid', 'Tile grid codes must be an array.');
  if (value.length > MAX_WORLD2D_TILE_CELLS) fail(path, 'tile_grid_too_large', 'Tile grid exceeds the supported cell limit.');
  for (let index = 0; index < value.length; index++) {
    if (!safeInteger(value[index])) fail(path + '/' + index, 'invalid_tile_code', 'Tile codes must be safe integers.');
  }
  return value as number[];
}

function checkedBytes(value: unknown, path: string, maxLength: number): number[] {
  if (!Array.isArray(value)) fail(path, 'invalid_tile_grid_bytes', 'Packed grid bytes must be an array.');
  if (value.length > maxLength) fail(path, 'tile_grid_too_large', 'Packed grid exceeds the supported byte limit.');
  for (let index = 0; index < value.length; index++) {
    if (!safeInteger(value[index]) || value[index] < 0 || value[index] > 255) {
      fail(path + '/' + index, 'invalid_tile_grid_byte', 'Packed grid bytes must be integers from 0 through 255.');
    }
  }
  return value as number[];
}

function bitWidth(paletteLength: number): number {
  let bits = 1;
  while (Math.pow(2, bits) < paletteLength) bits++;
  return bits;
}

/** Builds a frequency-sorted local palette and packs its indices LSB-first. */
export function packTileCodes(inputCodes: number[]): { palette: number[]; bytes: number[] } {
  const codes = checkedCodes(inputCodes, '/data');
  const frequencies: Record<string, number> = {};
  for (let index = 0; index < codes.length; index++) {
    const key = '' + codes[index];
    const current = frequencies[key];
    frequencies[key] = current === undefined ? 1 : current + 1;
  }

  const entries: Array<{ code: number; count: number }> = [];
  const keys = Object.keys(frequencies);
  for (let index = 0; index < keys.length; index++) {
    entries.push({ code: Number(keys[index]), count: frequencies[keys[index]] });
  }
  entries.sort((left, right) => {
    if (left.count > right.count) return -1;
    if (left.count < right.count) return 1;
    if (left.code < right.code) return -1;
    if (left.code > right.code) return 1;
    return 0;
  });

  const palette: number[] = [];
  const indices: Record<string, number> = {};
  for (let index = 0; index < entries.length; index++) {
    palette.push(entries[index].code);
    indices['' + entries[index].code] = index;
  }

  const bits = bitWidth(palette.length);
  const bytes: number[] = [];
  let bitBuffer = 0;
  let bitCount = 0;
  for (let index = 0; index < codes.length; index++) {
    bitBuffer |= indices['' + codes[index]] << bitCount;
    bitCount += bits;
    while (bitCount >= 8) {
      bytes.push(bitBuffer & 255);
      bitBuffer >>>= 8;
      bitCount -= 8;
    }
  }
  if (bitCount > 0) bytes.push(bitBuffer & 255);
  if (bytes.length > MAX_WORLD2D_TILE_BYTES) fail('/data', 'tile_grid_too_large', 'Packed grid exceeds the supported byte limit.');
  return { palette, bytes };
}

/** Expands a packed local palette after checking the exact byte count and zero padding. */
export function unpackTileCodes(paletteInput: number[], byteInput: number[], inputCellCount: number): number[] {
  const cellCount = checkedCellCount(inputCellCount);
  const palette = checkedCodes(paletteInput, '/data/palette');
  const maxBytes = Math.ceil(cellCount * 20 / 8);
  const bytes = checkedBytes(byteInput, '/data/values', maxBytes);
  if (palette.length > cellCount) fail('/data/palette', 'invalid_tile_palette', 'Tile palette cannot contain more values than the grid has cells.');
  if ((cellCount === 0 && palette.length !== 0) || (cellCount > 0 && palette.length === 0)) {
    fail('/data/palette', 'invalid_tile_palette', 'A nonempty grid needs a nonempty palette, and an empty grid needs an empty palette.');
  }
  const seenPaletteCodes: Record<string, boolean> = {};
  for (let index = 0; index < palette.length; index++) {
    const key = '' + palette[index];
    if (seenPaletteCodes[key] === true) fail('/data/palette/' + index, 'duplicate_palette_code', 'Tile palettes cannot contain duplicate codes.');
    seenPaletteCodes[key] = true;
  }

  const bits = bitWidth(palette.length);
  const expectedByteCount = Math.ceil(cellCount * bits / 8);
  if (bytes.length !== expectedByteCount) fail('/data/values', 'tile_grid_byte_count_mismatch', 'Packed grid byte length does not match its dimensions and palette.');
  const usedLastByteBits = cellCount * bits % 8;
  if (usedLastByteBits !== 0 && bytes.length > 0 && Math.floor(bytes[bytes.length - 1] / Math.pow(2, usedLastByteBits)) !== 0) {
    fail('/data/values', 'nonzero_tile_grid_padding', 'Unused high bits in the last packed byte must be zero.');
  }

  const output: number[] = [];
  const mask = Math.pow(2, bits) - 1;
  let bitBuffer = 0;
  let bitCount = 0;
  let byteIndex = 0;
  for (let cellIndex = 0; cellIndex < cellCount; cellIndex++) {
    while (bitCount < bits) {
      bitBuffer |= bytes[byteIndex++] << bitCount;
      bitCount += 8;
    }
    const paletteIndex = bitBuffer & mask;
    if (paletteIndex >= palette.length) {
      fail('/data/values', 'tile_palette_index_out_of_range', 'Packed tile grid refers to a missing palette entry.');
    }
    output.push(palette[paletteIndex]);
    bitBuffer >>>= bits;
    bitCount -= bits;
  }
  return output;
}

/** Encodes byte arrays as canonical padded Base64 using the standard alphabet. */
export function encodeBase64(inputBytes: number[]): string {
  const bytes = checkedBytes(inputBytes, '/data/values', MAX_WORLD2D_TILE_COMPRESSED_BYTES);
  let output = '';
  for (let index = 0; index < bytes.length; index += 3) {
    const first = bytes[index];
    const hasSecond = index + 1 < bytes.length;
    const hasThird = index + 2 < bytes.length;
    const second = hasSecond ? bytes[index + 1] : 0;
    const third = hasThird ? bytes[index + 2] : 0;
    output += BASE64_ALPHABET.charAt(first >> 2);
    output += BASE64_ALPHABET.charAt(((first & 3) << 4) | (second >> 4));
    output += hasSecond ? BASE64_ALPHABET.charAt(((second & 15) << 2) | (third >> 6)) : '=';
    output += hasThird ? BASE64_ALPHABET.charAt(third & 63) : '=';
  }
  return output;
}

function base64Value(character: string): number {
  const code = character.charCodeAt(0);
  if (code >= 65 && code <= 90) return code - 65;
  if (code >= 97 && code <= 122) return code - 97 + 26;
  if (code >= 48 && code <= 57) return code - 48 + 52;
  if (character === '+') return 62;
  if (character === '/') return 63;
  return -1;
}

/** Decodes canonical Base64 and enforces the caller's byte bound before allocation. */
export function decodeBase64(text: string, maxBytes: number): number[] {
  if (typeof text !== 'string') fail('/data/values', 'invalid_base64', 'Packed grid data must be Base64 text.');
  if (!safeInteger(maxBytes) || maxBytes < 0 || maxBytes > MAX_WORLD2D_TILE_COMPRESSED_BYTES) {
    fail('/data/values', 'invalid_base64_limit', 'Base64 byte limit is outside the supported range.');
  }
  if (text.length % 4 !== 0) fail('/data/values', 'invalid_base64', 'Base64 length must be a multiple of four.');
  if (text.length === 0) return [];

  let padding = 0;
  if (text.charAt(text.length - 1) === '=') padding++;
  if (text.charAt(text.length - 2) === '=') padding++;
  if (padding > 0) {
    const firstPadding = text.length - padding;
    if (firstPadding < text.length - 2) fail('/data/values', 'invalid_base64', 'Base64 padding can appear only in the final two positions.');
    for (let index = firstPadding; index < text.length; index++) {
      if (text.charAt(index) !== '=') fail('/data/values', 'invalid_base64', 'Base64 padding must be contiguous at the end.');
    }
  }

  const decodedLength = text.length / 4 * 3 - padding;
  if (decodedLength > maxBytes) fail('/data/values', 'base64_payload_too_large', 'Base64 payload exceeds its decoded byte limit.');
  for (let index = 0; index < text.length - padding; index++) {
    if (base64Value(text.charAt(index)) < 0) fail('/data/values/' + index, 'invalid_base64', 'Base64 contains a character outside its standard alphabet.');
  }
  if (padding === 2 && (base64Value(text.charAt(text.length - 3)) & 15) !== 0) {
    fail('/data/values', 'noncanonical_base64', 'Unused Base64 padding bits must be zero.');
  }
  if (padding === 1 && (base64Value(text.charAt(text.length - 2)) & 3) !== 0) {
    fail('/data/values', 'noncanonical_base64', 'Unused Base64 padding bits must be zero.');
  }

  const output: number[] = [];
  for (let index = 0; index < text.length; index += 4) {
    const first = base64Value(text.charAt(index));
    const second = base64Value(text.charAt(index + 1));
    const third = text.charAt(index + 2) === '=' ? 0 : base64Value(text.charAt(index + 2));
    const fourth = text.charAt(index + 3) === '=' ? 0 : base64Value(text.charAt(index + 3));
    output.push((first << 2) | (second >> 4));
    if (text.charAt(index + 2) !== '=') output.push(((second & 15) << 4) | (third >> 2));
    if (text.charAt(index + 3) !== '=') output.push(((third & 3) << 6) | fourth);
  }
  return output;
}
