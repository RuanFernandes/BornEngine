const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { test } = require('node:test');
const { transformSync } = require(path.join(__dirname, '..', 'node_modules/esbuild'));

function loadApplyEdit() {
  const sourcePath = path.join(__dirname, '..', 'src/maps/world2dEdits.ts');
  const source = fs.readFileSync(sourcePath, 'utf8');
  const { code } = transformSync(source, { loader: 'ts', format: 'cjs', target: 'node18' });
  const module = { exports: {} };
  new Function('module', 'exports', code)(module, module.exports);
  return module.exports.applyWorld2DEdit;
}

const applyWorld2DEdit = loadApplyEdit();

function mapWithTrackedData(width, height) {
  const rawData = Array(width * height).fill(null);
  let sliceCount = 0;
  const data = new Proxy(rawData, {
    get(target, property, receiver) {
      if (property === 'slice') {
        return (...args) => {
          sliceCount++;
          return target.slice(...args);
        };
      }
      return Reflect.get(target, property, receiver);
    },
  });
  return {
    document: {
      assets: [],
      tilesets: [{ id: 'terrain', tileWidth: 16, tileHeight: 16, tileCount: 8 }],
      layers: [{
        id: 'ground', type: 'tilemap', width, height, tileSize: { x: 16, y: 16 }, data,
        visible: true, opacity: 1, offset: { x: 0, y: 0 }, parallax: { x: 1, y: 1 },
      }],
    },
    getSliceCount: () => sliceCount,
  };
}

test('bulk painting copies a large tile layer once for a multi-tile stamp', () => {
  const tracked = mapWithTrackedData(128, 128);
  const tiles = Array.from({ length: 595 }, (_, index) => ({
    x: index % 64,
    y: Math.floor(index / 64),
    cell: {
      tilesetId: 'terrain',
      tileId: index % 8,
      flipX: false,
      flipY: false,
      flipDiagonal: false,
    },
  }));

  const result = applyWorld2DEdit(tracked.document, { type: 'paintTiles', layerId: 'ground', tiles });

  assert.equal(tracked.getSliceCount(), 1);
  assert.equal(result.layers[0].data[0].tileId, 0);
  assert.equal(result.layers[0].data[9 * 128 + 18].tileId, 2);
  assert.equal(tracked.document.layers[0].data[0], null, 'the source document remains immutable');
});

test('bulk painting validates all positions and tile IDs before changing the document', () => {
  const tracked = mapWithTrackedData(2, 2);
  const validCell = { tilesetId: 'terrain', tileId: 1, flipX: false, flipY: false, flipDiagonal: false };

  assert.throws(() => applyWorld2DEdit(tracked.document, {
    type: 'paintTiles',
    layerId: 'ground',
    tiles: [
      { x: 0, y: 0, cell: validCell },
      { x: 2, y: 0, cell: validCell },
    ],
  }), /outside the layer bounds/);
  assert.equal(tracked.getSliceCount(), 0);
  assert.equal(tracked.document.layers[0].data[0], null);
  assert.throws(() => applyWorld2DEdit(tracked.document, {
    type: 'paintTiles',
    layerId: 'ground',
    tiles: [{ x: 0, y: 0, cell: { ...validCell, tileId: 8 } }],
  }), /outside the referenced tileset bounds/);
  assert.equal(tracked.getSliceCount(), 0);
});
