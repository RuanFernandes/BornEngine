const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { test } = require('node:test');
const { transformSync } = require(path.join(__dirname, '..', 'node_modules/esbuild'));

function loadEdits() {
  const sourcePath = path.join(__dirname, '..', 'src/maps/world2dEdits.ts');
  const source = fs.readFileSync(sourcePath, 'utf8');
  const { code } = transformSync(source, { loader: 'ts', format: 'cjs', target: 'node18' });
  const module = { exports: {} };
  new Function('module', 'exports', code)(module, module.exports);
  return module.exports.applyWorld2DEdit;
}

const applyWorld2DEdit = loadEdits();
const grass = { tilesetId: 'terrain', tileId: 1, flipX: false, flipY: false, flipDiagonal: false };
const water = { tilesetId: 'terrain', tileId: 2, flipX: false, flipY: false, flipDiagonal: false };

function mapWith(data, width = 3, height = 3) {
  return {
    assets: [],
    tilesets: [{ id: 'terrain', tileWidth: 16, tileHeight: 16, tileCount: 8 }],
    layers: [{
      id: 'ground', type: 'tilemap', width, height, tileSize: { x: 16, y: 16 },
      data: data.slice(), visible: true, opacity: 1, offset: { x: 0, y: 0 }, parallax: { x: 1, y: 1 },
    }],
  };
}

test('bucket fills the four-connected region with the selected tile and leaves diagonals alone', () => {
  const source = mapWith([
    grass, grass, water,
    grass, water, grass,
    water, grass, grass,
  ]);
  const filled = applyWorld2DEdit(source, { type: 'fillTiles', layerId: 'ground', x: 0, y: 0, cell: water });
  assert.deepEqual(filled.layers[0].data, [
    water, water, water,
    water, water, grass,
    water, grass, grass,
  ]);
  assert.deepEqual(source.layers[0].data[0], grass, 'the source document remains immutable');
});

test('bucket fills a connected empty region', () => {
  const source = mapWith([
    null, null, water,
    null, water, null,
    water, null, null,
  ]);
  const filled = applyWorld2DEdit(source, { type: 'fillTiles', layerId: 'ground', x: 0, y: 0, cell: grass });
  assert.deepEqual(filled.layers[0].data, [
    grass, grass, water,
    grass, water, null,
    water, null, null,
  ]);
});

test('bucket is a no-op when the selected tile already matches the source region', () => {
  const source = mapWith([grass, grass, water, grass, water, grass, water, grass, grass]);
  const filled = applyWorld2DEdit(source, { type: 'fillTiles', layerId: 'ground', x: 0, y: 0, cell: grass });
  assert.equal(filled, source);
});

test('bucket validates its seed position and target tile', () => {
  const source = mapWith(Array(9).fill(null));
  assert.throws(() => applyWorld2DEdit(source, { type: 'fillTiles', layerId: 'ground', x: 3, y: 0, cell: grass }), /outside the layer bounds/);
  assert.throws(() => applyWorld2DEdit(source, { type: 'fillTiles', layerId: 'ground', x: 0, y: 0, cell: { ...grass, tileId: 9 } }), /outside the referenced tileset bounds/);
});
