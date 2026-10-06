import test from 'node:test';
import assert from 'node:assert/strict';
import {
  decodeWorld2DTileGrid,
  encodeWorld2DTileGrid,
  tileGridEncodedSize,
} from '../src/world2d/tileGridCodec.ts';
import {
  decodeBase64,
  encodeBase64,
  packTileCodes,
  unpackTileCodes,
} from '../src/world2d/tileGridBits.ts';
import {
  compressTileGridBytes,
  decompressTileGridBytes,
} from '../src/world2d/tileGridLz.ts';

test('chooses RLE for a uniform grid and round-trips its codes', () => {
  const codes = Array(128).fill(17);
  const encoded = encodeWorld2DTileGrid(codes);

  assert.deepEqual(encoded, { encoding: 'rle', values: [128, 17] });
  assert.deepEqual(decodeWorld2DTileGrid(encoded, codes.length), codes);
});

test('chooses Sparse for a mostly empty grid and stores flat exception gaps', () => {
  const codes = Array(100).fill(0);
  codes[10] = 2;
  codes[70] = 3;
  const encoded = encodeWorld2DTileGrid(codes);

  assert.deepEqual(encoded, { encoding: 'sparse', values: [10, 2, 59, 3] });
  assert.deepEqual(decodeWorld2DTileGrid(encoded, codes.length), codes);
});

test('chooses and stores a nonzero Sparse base by frequency', () => {
  const codes = Array(100).fill(9);
  codes[1] = 10;
  codes[60] = 10;
  const encoded = encodeWorld2DTileGrid(codes);

  assert.equal(encoded.encoding, 'sparse');
  assert.equal(encoded.base, 9);
  assert.deepEqual(decodeWorld2DTileGrid(encoded, codes.length), codes);

});

test('keeps Dense when its complete envelope is smaller', () => {
  const codes = [1, 8, 3, 12];
  const encoded = encodeWorld2DTileGrid(codes);

  assert.deepEqual(encoded, codes);
  assert.ok(tileGridEncodedSize(encoded) <= tileGridEncodedSize({ encoding: 'rle', values: [1, 1, 1, 8, 1, 3, 1, 12] }));
  assert.deepEqual(decodeWorld2DTileGrid(encoded, codes.length), codes);
});

test('keeps runs continuous across row boundaries', () => {
  const codes = Array(32).fill(5);
  const encoded = encodeWorld2DTileGrid(codes);

  assert.deepEqual(encoded, { encoding: 'rle', values: [32, 5] });
  assert.deepEqual(decodeWorld2DTileGrid(encoded, codes.length), codes);
});

test('prefers Dense when full minified candidates tie', () => {
  const codes = Array(16).fill(0);
  const dense = tileGridEncodedSize(codes);
  const sparse = tileGridEncodedSize({ encoding: 'sparse', values: [] });

  assert.equal(dense, sparse);
  assert.deepEqual(encodeWorld2DTileGrid(codes), codes);
});

test('rejects malformed Dense, RLE, Sparse, and unsupported payloads', () => {
  assert.throws(() => decodeWorld2DTileGrid([0, 1], 3));
  assert.throws(() => decodeWorld2DTileGrid([0, 1.5], 2));
  assert.throws(() => decodeWorld2DTileGrid({ encoding: 'rle', values: [0, 1] }, 1));
  assert.throws(() => decodeWorld2DTileGrid({ encoding: 'rle', values: [-1, 1] }, 1));
  assert.throws(() => decodeWorld2DTileGrid({ encoding: 'rle', values: [2, 1] }, 3));
  assert.throws(() => decodeWorld2DTileGrid({ encoding: 'rle', values: [2, 1, 1, 2] }, 2));
  assert.throws(() => decodeWorld2DTileGrid({ encoding: 'sparse', values: [-1, 2] }, 3));
  assert.throws(() => decodeWorld2DTileGrid({ encoding: 'sparse', values: [3, 2] }, 3));
  assert.deepEqual(decodeWorld2DTileGrid({ encoding: 'sparse', values: [0, 2, 0, 3] }, 3), [2, 3, 0]);
  assert.throws(() => decodeWorld2DTileGrid({ encoding: 'unknown', values: [] }, 0));
  assert.throws(() => decodeWorld2DTileGrid([], 1_000_001));
});

test('supports zero-cell payloads without allocating output', () => {
  assert.deepEqual(decodeWorld2DTileGrid([], 0), []);
  assert.deepEqual(decodeWorld2DTileGrid({ encoding: 'rle', values: [] }, 0), []);
  assert.deepEqual(decodeWorld2DTileGrid({ encoding: 'sparse', values: [] }, 0), []);
});

test('packs the published bit order and canonical Base64 vector', () => {
  const packed = packTileCodes([0, 1, 2, 3]);

  assert.deepEqual(packed, { palette: [0, 1, 2, 3], bytes: [0xe4] });
  assert.equal(encodeBase64(packed.bytes), '5A==');
  assert.deepEqual(decodeBase64('5A==', 1), [0xe4]);
  assert.deepEqual(unpackTileCodes(packed.palette, packed.bytes, 4), [0, 1, 2, 3]);
});

test('sorts palette by descending frequency and numeric code on ties', () => {
  const packed = packTileCodes([2, 1, 2, 1, 3]);
  assert.deepEqual(packed.palette, [1, 2, 3]);
  assert.deepEqual(unpackTileCodes(packed.palette, packed.bytes, 5), [2, 1, 2, 1, 3]);
});

test('rejects invalid packed indices, byte lengths, and nonzero padding', () => {
  assert.throws(() => unpackTileCodes([], [], 1));
  assert.throws(() => unpackTileCodes([0, 1, 2], [3], 3));
  assert.throws(() => unpackTileCodes([0, 1], [], 1));
  assert.throws(() => unpackTileCodes([0, 1], [0x81], 1));
  assert.deepEqual(unpackTileCodes([0, 1, 2], [0x24], 3), [0, 1, 2]);
  assert.throws(() => unpackTileCodes([0, 1, 2], [0xe4], 3));
});

test('round-trips tile codes with primary, extra, and flipped code values', () => {
  const codes = [0, 1, 16, 17, -137, -138, -139, -140, -141, -142, -143, 20];
  const packed = packTileCodes(codes);
  assert.deepEqual(unpackTileCodes(packed.palette, packed.bytes, codes.length), codes);
});

test('encodes and decodes only canonical bounded Base64', () => {
  assert.deepEqual(decodeBase64('', 0), []);
  assert.deepEqual(encodeBase64([0, 1, 2, 253, 254, 255]), 'AAEC/f7/');
  for (const input of ['A', '5B==', '5A=A', '====', '*AAA']) {
    assert.throws(() => decodeBase64(input, 10));
  }
  assert.throws(() => decodeBase64('5A==', 0));
});

test('decodes overlapping LZ copies and rejects malformed packets', () => {
  assert.deepEqual(decompressTileGridBytes([2, 65, 1, 0, 4], 8), Array(8).fill(65));
  assert.throws(() => decompressTileGridBytes([1, 0, 0, 0], 3));
  assert.throws(() => decompressTileGridBytes([1, 1, 0, 0], 3));
  assert.throws(() => decompressTileGridBytes([1, 65], 3));
  assert.throws(() => decompressTileGridBytes([2, 65], 1));
  assert.throws(() => decompressTileGridBytes([2, 65, 1, 0, 4, 0], 8));
  assert.throws(() => decompressTileGridBytes([2, 65, 1, 0, 20], 2));
  assert.throws(() => decompressTileGridBytes([0, 65, 0], 1));
});

test('accepts the maximum LZ backreference distance', () => {
  const compressed = [0, ...Array(8).fill(65), 1, 1, 0, 5, ...Array(7).fill(65)];
  for (let group = 0; group < 65_512 / 8; group++) compressed.push(0, ...Array(8).fill(65));
  compressed.push(1, 0xff, 0xff, 2);

  const decoded = decompressTileGridBytes(compressed, 65_540);
  assert.equal(decoded.length, 65_540);
  assert.deepEqual(decoded.slice(-5), Array(5).fill(65));
});

test('uses Bits for fast saves and LZ for max compression of repeated patterns', () => {
  const codes = Array.from({ length: 1024 }, (_value, index) => index % 2 === 0 ? 1 : 2);
  const fast = encodeWorld2DTileGrid(codes, { effort: 'fast' });
  const max = encodeWorld2DTileGrid(codes, { effort: 'max' });

  assert.equal(fast.encoding, 'bits');
  assert.equal(max.encoding, 'lz');
  assert.ok(tileGridEncodedSize(max) < tileGridEncodedSize(fast));
  assert.deepEqual(decodeWorld2DTileGrid(fast, codes.length), codes);
  assert.deepEqual(decodeWorld2DTileGrid(max, codes.length), codes);
  assert.deepEqual(encodeWorld2DTileGrid(codes, { mode: 'readable', effort: 'max' }), codes);
});

test('compresses deterministic byte streams losslessly with bounded packet overhead', () => {
  const bytes = Array.from({ length: 4096 }, (_value, index) => (index * 37 + Math.floor(index / 8)) % 256);
  const first = compressTileGridBytes(bytes);
  const second = compressTileGridBytes(bytes);

  assert.deepEqual(first, second);
  assert.deepEqual(decompressTileGridBytes(first, bytes.length), bytes);
  assert.ok(first.length <= bytes.length + Math.ceil(bytes.length / 8));
});
