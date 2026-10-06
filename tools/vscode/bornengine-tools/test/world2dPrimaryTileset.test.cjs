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

function mapWithSources() {
  const mainCell = { tilesetId: 'terrain', tileId: 11, flipX: false, flipY: true, flipDiagonal: false };
  const extraCell = { tilesetId: 'lantern', tileId: 0, flipX: true, flipY: false, flipDiagonal: true };
  return {
    format: 'bornengine.world2d',
    version: 2,
    id: 'village',
    name: 'Village',
    assets: ['assets/terrain.png', 'assets/lantern.png'],
    tilesets: [
      { id: 'terrain', image: 'assets/terrain.png', tileWidth: 16, tileHeight: 16, columns: 16, tileCount: 256,
        margin: { x: 0, y: 0 }, spacing: { x: 0, y: 0 }, tiles: [] },
      { id: 'lantern', image: 'assets/lantern.png', tileWidth: 16, tileHeight: 16, columns: 1, tileCount: 1,
        margin: { x: 0, y: 0 }, spacing: { x: 0, y: 0 }, tiles: [] },
    ],
    layers: [{ id: 'ground', name: 'Ground', type: 'tilemap', width: 2, height: 1, tileSize: { x: 16, y: 16 },
      visible: true, opacity: 1, offset: { x: 5, y: 7 }, parallax: { x: 1, y: 1 },
      data: [mainCell, extraCell] }],
    metadata: {},
  };
}

test('changing the main source reorders descriptors without changing placed tiles or geometry', () => {
  const source = mapWithSources();
  const originalCells = source.layers[0].data;
  const beforeCells = structuredClone(originalCells);
  const beforeGeometry = {
    width: source.layers[0].width,
    height: source.layers[0].height,
    tileSize: structuredClone(source.layers[0].tileSize),
    offset: structuredClone(source.layers[0].offset),
  };

  const result = applyWorld2DEdit(source, { type: 'setMainTileset', tilesetId: 'lantern' });

  assert.deepEqual(result.tilesets.map((tileset) => tileset.id), ['lantern', 'terrain']);
  assert.deepEqual(result.layers[0].data, beforeCells);
  assert.equal(result.layers[0].data, originalCells, 'source cell array remains shared because no cell changed');
  assert.deepEqual({
    width: result.layers[0].width,
    height: result.layers[0].height,
    tileSize: result.layers[0].tileSize,
    offset: result.layers[0].offset,
  }, beforeGeometry);
  assert.deepEqual(source.tilesets.map((tileset) => tileset.id), ['terrain', 'lantern'], 'the source document is immutable');
});

test('one-image supplemental sources remain valid and can become the primary source', () => {
  const source = mapWithSources();
  const singleImage = {
    id: 'flower',
    image: 'assets/flower.png',
    tileWidth: 16,
    tileHeight: 16,
    columns: 1,
    tileCount: 1,
    margin: { x: 0, y: 0 },
    spacing: { x: 0, y: 0 },
    tiles: [],
  };
  const withExtra = applyWorld2DEdit(source, { type: 'addTileset', tileset: singleImage });
  const result = applyWorld2DEdit(withExtra, { type: 'setMainTileset', tilesetId: 'flower' });

  assert.equal(result.tilesets[0].id, 'flower');
  assert.equal(result.tilesets[0].tileCount, 1);
  assert.deepEqual(result.assets, ['assets/terrain.png', 'assets/lantern.png', 'assets/flower.png']);
  assert.equal(source.tilesets.length, 2);
  assert.equal(withExtra.tilesets.length, 3);
});

test('selecting a missing main source fails without modifying the document', () => {
  const source = mapWithSources();
  assert.throws(() => applyWorld2DEdit(source, { type: 'setMainTileset', tilesetId: 'missing' }), /not found/);
  assert.equal(source.tilesets[0].id, 'terrain');
});
