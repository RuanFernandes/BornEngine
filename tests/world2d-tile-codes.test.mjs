import test from 'node:test';
import assert from 'node:assert/strict';
import { createWorld2DTileCodebook, World2DCodecError } from '../src/world2d/tileCodes.ts';

function tileset(id, tileCount) {
  return { id, tileCount };
}

function cell(tilesetId, tileId, mask = 0) {
  return {
    tilesetId,
    tileId,
    flipX: (mask & 1) !== 0,
    flipY: (mask & 2) !== 0,
    flipDiagonal: (mask & 4) !== 0,
  };
}

test('assigns consecutive codes to the primary and supplemental tilesets', () => {
  const codebook = createWorld2DTileCodebook([tileset('main', 16), tileset('extra', 4)]);

  assert.equal(codebook.encode(cell('main', 0)), 1);
  assert.equal(codebook.encode(cell('extra', 0)), 17);
  assert.equal(codebook.encode(cell('extra', 0, 1)), -137);
  assert.equal(codebook.decode(0), null);
});

test('round-trips all flip masks and the last tile in each source', () => {
  const codebook = createWorld2DTileCodebook([tileset('main', 16), tileset('extra', 4)]);

  for (let mask = 0; mask <= 7; mask++) {
    const value = cell('extra', 3, mask);
    assert.deepEqual(codebook.decode(codebook.encode(value)), value);
  }
  assert.deepEqual(codebook.decode(codebook.encode(cell('main', 15))), cell('main', 15));
});

test('reorders source ranges without changing decoded source identity', () => {
  const original = cell('extra', 2, 5);
  const before = createWorld2DTileCodebook([tileset('main', 16), tileset('extra', 4)]);
  const after = createWorld2DTileCodebook([tileset('extra', 4), tileset('main', 16)]);

  assert.notEqual(before.encode(original), after.encode(original));
  assert.deepEqual(after.decode(after.encode(original)), original);
  assert.equal(after.encode(cell('extra', 0)), 1);
  assert.equal(after.encode(cell('main', 0)), 5);
});

test('supports extra sources after very large primary ranges', () => {
  const codebook = createWorld2DTileCodebook([
    tileset('main', 0x1_0000_0000),
    tileset('single', 1),
  ]);
  const placed = cell('single', 0, 7);

  assert.equal(codebook.encode(placed), -34_359_738_383);
  assert.deepEqual(codebook.decode(codebook.encode(placed)), placed);
});

test('rejects malformed source ranges and invalid cell references', () => {
  assert.throws(() => createWorld2DTileCodebook([tileset('same', 1), tileset('same', 2)]));
  assert.throws(() => createWorld2DTileCodebook([tileset('empty', 0)]));
  assert.throws(() => createWorld2DTileCodebook([tileset('fraction', 1.5)]));
  assert.throws(() => createWorld2DTileCodebook([tileset('overflow', Number.MAX_SAFE_INTEGER)]));

  const codebook = createWorld2DTileCodebook([tileset('main', 2)]);
  assert.throws(() => codebook.encode(cell('missing', 0)));
  assert.throws(() => codebook.encode(cell('main', 2)));
  assert.throws(() => codebook.decode(-8));
  assert.throws(() => codebook.decode(Number.MAX_SAFE_INTEGER + 1));

  assert.throws(
    () => codebook.encode(cell('missing', 0)),
    (error) => error instanceof World2DCodecError && error.diagnostic.code === 'unknown_tileset',
  );
});
