const MAX_WORLD2D_TILE_BYTES = 2_500_000;
const MAX_LZ_DISTANCE = 65_535;
const MAX_LZ_MATCH_LENGTH = 258;
const MAX_SAFE_INTEGER_VALUE = 9007199254740991;

interface PositionList {
  values: number[];
  start: number;
}

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

function checkedByteCount(value: unknown): number {
  if (!safeInteger(value) || value < 0 || value > MAX_WORLD2D_TILE_BYTES) {
    fail('/data/values', 'invalid_lz_output_size', 'LZ output size must be an integer within the supported tile-grid byte limit.');
  }
  return value;
}

function checkedBytes(value: unknown, path: string, maxLength: number): number[] {
  if (!Array.isArray(value)) fail(path, 'invalid_tile_grid_bytes', 'Packed grid bytes must be an array.');
  if (value.length > maxLength) fail(path, 'tile_grid_too_large', 'Packed grid exceeds its bounded input size.');
  for (let index = 0; index < value.length; index++) {
    if (!safeInteger(value[index]) || value[index] < 0 || value[index] > 255) {
      fail(path + '/' + index, 'invalid_tile_grid_byte', 'Packed grid bytes must be integers from 0 through 255.');
    }
  }
  return value as number[];
}

function hash(bytes: number[], position: number): number {
  return bytes[position] * 65536 + bytes[position + 1] * 256 + bytes[position + 2];
}

function compactPositions(list: PositionList): void {
  if (list.start >= 64) {
    list.values.splice(0, list.start);
    list.start = 0;
  }
}

function expireCandidates(
  bytes: number[],
  candidates: Record<string, PositionList>,
  currentPosition: number,
  oldestPosition: { value: number },
): void {
  const firstValidPosition = currentPosition - MAX_LZ_DISTANCE;
  while (oldestPosition.value < firstValidPosition) {
    const expiredPosition = oldestPosition.value++;
    if (expiredPosition + 2 >= bytes.length) continue;
    const key = '' + hash(bytes, expiredPosition);
    const list = candidates[key];
    if (list === undefined || list.start >= list.values.length || list.values[list.start] !== expiredPosition) continue;
    list.start++;
    if (list.start >= list.values.length) delete candidates[key];
    else compactPositions(list);
  }
}

function addCandidate(candidates: Record<string, PositionList>, bytes: number[], position: number): void {
  if (position + 2 >= bytes.length) return;
  const key = '' + hash(bytes, position);
  let list = candidates[key];
  if (list === undefined) {
    list = { values: [], start: 0 };
    candidates[key] = list;
  }
  list.values.push(position);
  if (list.values.length - list.start > 64) list.start++;
  compactPositions(list);
}

function findMatch(bytes: number[], candidates: Record<string, PositionList>, position: number): { distance: number; length: number } {
  const remaining = bytes.length - position;
  if (remaining < 4) return { distance: 0, length: 0 };
  const list = candidates['' + hash(bytes, position)];
  if (list === undefined) return { distance: 0, length: 0 };

  const maximumLength = remaining < MAX_LZ_MATCH_LENGTH ? remaining : MAX_LZ_MATCH_LENGTH;
  let bestLength = 3;
  let bestDistance = 0;
  let examined = 0;
  for (let index = list.values.length - 1; index >= list.start && examined < 64; index--) {
    const candidate = list.values[index];
    const distance = position - candidate;
    if (distance > MAX_LZ_DISTANCE) break;
    if (distance <= 0) continue;
    examined++;

    let length = 3;
    while (length < maximumLength && bytes[candidate + length] === bytes[position + length]) length++;
    if (length > bestLength) {
      bestLength = length;
      bestDistance = distance;
      if (bestLength === maximumLength) break;
    }
  }
  return { distance: bestDistance, length: bestLength };
}

/** Compresses bytes into deterministic packets of literals and bounded LZ references. */
export function compressTileGridBytes(inputBytes: number[]): number[] {
  const bytes = checkedBytes(inputBytes, '/data/values', MAX_WORLD2D_TILE_BYTES);
  const output: number[] = [];
  const candidates: Record<string, PositionList> = {};
  const oldestPosition = { value: 0 };
  let position = 0;

  while (position < bytes.length) {
    const controlPosition = output.length;
    output.push(0);
    let control = 0;
    for (let bit = 0; bit < 8 && position < bytes.length; bit++) {
      expireCandidates(bytes, candidates, position, oldestPosition);
      const match = findMatch(bytes, candidates, position);
      let consumed = 1;
      if (match.length > 3) {
        control |= 1 << bit;
        output.push(match.distance & 255, Math.floor(match.distance / 256), match.length - 3);
        consumed = match.length;
      } else {
        output.push(bytes[position]);
      }

      const end = position + consumed;
      for (let added = position; added < end; added++) addCandidate(candidates, bytes, added);
      position = end;
    }
    output[controlPosition] = control;
  }

  if (output.length > bytes.length + Math.ceil(bytes.length / 8)) {
    fail('/data/values', 'lz_encoder_bound_exceeded', 'LZ encoder exceeded its bounded packet overhead.');
  }
  return output;
}

/** Decodes one exact-size LZ block without trusting an unbounded payload length. */
export function decompressTileGridBytes(inputBytes: number[], expectedByteCount: number): number[] {
  const expected = checkedByteCount(expectedByteCount);
  const maximumInput = expected + Math.ceil(expected / 8);
  const bytes = checkedBytes(inputBytes, '/data/values', maximumInput);
  const output: number[] = [];
  let inputPosition = 0;
  let control = 0;
  let controlBit = 8;

  while (output.length < expected) {
    if (controlBit === 8) {
      if (inputPosition >= bytes.length) fail('/data/values', 'truncated_lz_payload', 'LZ payload ended before producing the expected bytes.');
      control = bytes[inputPosition++];
      controlBit = 0;
    }
    const isReference = ((control >> controlBit) & 1) !== 0;
    controlBit++;

    if (!isReference) {
      if (inputPosition >= bytes.length) fail('/data/values', 'truncated_lz_payload', 'LZ literal is missing its byte.');
      output.push(bytes[inputPosition++]);
      continue;
    }

    if (inputPosition + 2 >= bytes.length) fail('/data/values', 'truncated_lz_payload', 'LZ reference is missing its distance or length.');
    const distance = bytes[inputPosition] + bytes[inputPosition + 1] * 256;
    const length = bytes[inputPosition + 2] + 3;
    inputPosition += 3;
    if (distance === 0 || distance > MAX_LZ_DISTANCE || distance > output.length) {
      fail('/data/values', 'invalid_lz_distance', 'LZ reference distance must point inside the decoded output window.');
    }
    if (length > expected - output.length) fail('/data/values', 'lz_output_size_mismatch', 'LZ reference expands beyond the expected byte count.');
    for (let copied = 0; copied < length; copied++) output.push(output[output.length - distance]);
  }

  if (controlBit < 8 && Math.floor(control / Math.pow(2, controlBit)) !== 0) {
    fail('/data/values', 'nonzero_lz_control_padding', 'Unused LZ control bits must be zero.');
  }
  if (inputPosition !== bytes.length) fail('/data/values', 'trailing_lz_bytes', 'LZ payload contains bytes after the expected output.');
  return output;
}
