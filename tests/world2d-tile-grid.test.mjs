import test from 'node:test';
import assert from 'node:assert/strict';
import {
  decodeWorld2DTileGrid,
  encodeWorld2DTileGrid,
  tileGridEncodedSize,
} from '../src/world2d/tileGridCodec.ts';

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
