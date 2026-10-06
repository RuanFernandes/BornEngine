const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { test } = require('node:test');
const { transformSync } = require(path.join(__dirname, '..', 'node_modules/esbuild'));

function loadModule(relativePath) {
  const sourcePath = path.join(__dirname, '..', 'src', relativePath);
  const source = fs.readFileSync(sourcePath, 'utf8');
  const { code } = transformSync(source, { loader: 'ts', format: 'cjs', target: 'node18' });
  const module = { exports: {} };
  new Function('module', 'exports', code)(module, module.exports);
  return module.exports;
}

const { tilePaletteDisplayScale, tileSelectionFromDrag, tileIdsInSelection, stampTileSelection } = loadModule('maps/tileSelection.ts');

test('tileset palette keeps each tile large enough to inspect', () => {
  assert.equal(tilePaletteDisplayScale(16, 16), 2);
  assert.equal(tilePaletteDisplayScale(32, 16), 2);
  assert.equal(tilePaletteDisplayScale(64, 48), 1);
  assert.equal(tilePaletteDisplayScale(0, 16), 1);
});

test('tile selection supports a click and a normalized drag in any direction', () => {
  assert.deepEqual(tileSelectionFromDrag({ x: 3, y: 2 }, { x: 3, y: 2 }), { x: 3, y: 2, width: 1, height: 1 });
  assert.deepEqual(tileSelectionFromDrag({ x: 4, y: 5 }, { x: 1, y: 2 }), { x: 1, y: 2, width: 4, height: 4 });
});

test('tile selection omits cells past an incomplete final tileset row', () => {
  assert.deepEqual(tileIdsInSelection({ x: 1, y: 1, width: 3, height: 2 }, 4, 7), [5, 6]);
});

test('stamping maps the selected rectangle in row order and clips it to map bounds', () => {
  assert.deepEqual(stampTileSelection({ x: 1, y: 0, width: 2, height: 2 }, { x: 4, y: 2 }, 4, 7, 5, 4), [
    { x: 4, y: 2, tileId: 1 },
    { x: 4, y: 3, tileId: 5 },
  ]);
});
