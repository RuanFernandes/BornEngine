import assert from 'node:assert/strict';
import { performance } from 'node:perf_hooks';
import { normalizeWorld2DStorage, serializeWorld2D } from '../src/world2d/editor.ts';

const CELL_LIMIT = 1_000_000;
const TILE_SIZE = { x: 16, y: 16 };

function makeCell(tilesetId, tileId, flipX = false, flipY = false, flipDiagonal = false) {
  return { tilesetId, tileId, flipX, flipY, flipDiagonal };
}

function createDocument(id, width, height, data) {
  const tilesets = [
    {
      id: 'terrain', image: 'assets/terrain.png', tileWidth: 16, tileHeight: 16,
      columns: 8, tileCount: 64, margin: { x: 0, y: 0 }, spacing: { x: 0, y: 0 }, tiles: [],
    },
    {
      id: 'details', image: 'assets/details.png', tileWidth: 16, tileHeight: 16,
      columns: 4, tileCount: 32, margin: { x: 0, y: 0 }, spacing: { x: 0, y: 0 }, tiles: [],
    },
  ];
  return {
    format: 'bornengine.world2d',
    version: 2,
    id,
    name: id,
    assets: tilesets.map((tileset) => tileset.image),
    tilesets,
    layers: [{
      id: 'ground', name: 'Ground', type: 'tilemap', visible: true, opacity: 1,
      offset: { x: 0, y: 0 }, parallax: { x: 1, y: 1 }, width, height,
      tileSize: TILE_SIZE, data,
    }],
    metadata: {},
  };
}

function fixtureCells(kind, width, height) {
  const count = width * height;
  if (kind === 'constant') return Array.from({ length: count }, () => makeCell('terrain', 3));
  if (kind === 'pattern-2x2') {
    return Array.from({ length: count }, (_, index) => {
      const x = index % width;
      const y = Math.floor(index / width);
      return makeCell('terrain', (y % 2) * 2 + (x % 2));
    });
  }
  if (kind === 'sparse-extra') {
    const data = Array(count).fill(null);
    const positions = [7, 39, 95, 164, 276, 401, 633, 811, 1000];
    positions.forEach((position, index) => {
      data[position] = makeCell('details', index, index % 2 === 0, index % 3 === 0, index % 4 === 0);
    });
    return data;
  }
  if (kind === 'varied-extra') {
    return Array.from({ length: count }, (_, index) => {
      if (index % 13 === 0) return null;
      const useExtra = index % 5 === 0;
      const tileId = (index * 17 + Math.floor(index / width) * 3) % (useExtra ? 32 : 64);
      return makeCell(
        useExtra ? 'details' : 'terrain',
        tileId,
        (index & 1) !== 0,
        (index & 2) !== 0,
        (index & 4) !== 0,
      );
    });
  }
  if (kind === 'benchmark') {
    const tile = makeCell('terrain', 3);
    return Array(count).fill(tile);
  }
  throw new Error(`Unknown World2D benchmark fixture: ${kind}`);
}

function indent(depth) {
  return '  '.repeat(depth);
}

function legacyVector(vector) {
  return `{ "x": ${vector.x}, "y": ${vector.y} }`;
}

function legacyCell(cell) {
  if (cell === null) return 'null';
  return `{ "tilesetId": ${JSON.stringify(cell.tilesetId)}, "tileId": ${cell.tileId}, ` +
    `"flipX": ${cell.flipX}, "flipY": ${cell.flipY}, "flipDiagonal": ${cell.flipDiagonal} }`;
}

function legacyTileset(tileset, depth) {
  const pad = indent(depth + 1);
  return '{\n' +
    `${pad}"id": ${JSON.stringify(tileset.id)},\n` +
    `${pad}"image": ${JSON.stringify(tileset.image)},\n` +
    `${pad}"tileWidth": ${tileset.tileWidth},\n` +
    `${pad}"tileHeight": ${tileset.tileHeight},\n` +
    `${pad}"columns": ${tileset.columns},\n` +
    `${pad}"tileCount": ${tileset.tileCount},\n` +
    `${pad}"margin": ${legacyVector(tileset.margin)},\n` +
    `${pad}"spacing": ${legacyVector(tileset.spacing)},\n` +
    `${pad}"tiles": []\n` + indent(depth) + '}';
}

function legacyLayer(layer, depth) {
  const pad = indent(depth + 1);
  const cellPad = indent(depth + 2);
  const cells = layer.data.length === 0
    ? '[]'
    : '[\n' + layer.data.map((cell) => cellPad + legacyCell(cell)).join(',\n') + '\n' + indent(depth + 1) + ']';
  return '{\n' +
    `${pad}"id": ${JSON.stringify(layer.id)},\n` +
    `${pad}"type": ${JSON.stringify(layer.type)},\n` +
    `${pad}"name": ${JSON.stringify(layer.name)},\n` +
    `${pad}"visible": ${layer.visible},\n` +
    `${pad}"opacity": ${layer.opacity},\n` +
    `${pad}"offset": ${legacyVector(layer.offset)},\n` +
    `${pad}"parallax": ${legacyVector(layer.parallax)},\n` +
    `${pad}"width": ${layer.width},\n` +
    `${pad}"height": ${layer.height},\n` +
    `${pad}"tileSize": ${legacyVector(layer.tileSize)},\n` +
    `${pad}"data": ${cells}\n` + indent(depth) + '}';
}

// Mirrors the pre-v2 explicit, pretty-printed tile-map writer for these
// fixtures: default fields and per-cell objects remain present in the baseline.
function serializeLegacyV1(document) {
  const assets = [...document.assets].sort();
  const assetJson = assets.length === 0
    ? '[]'
    : '[\n' + assets.map((asset) => indent(2) + JSON.stringify(asset)).join(',\n') + '\n  ]';
  const tilesetJson = document.tilesets.length === 0
    ? '[]'
    : '[\n' + document.tilesets.map((tileset) => indent(2) + legacyTileset(tileset, 2)).join(',\n') + '\n  ]';
  const layerJson = document.layers.length === 0
    ? '[]'
    : '[\n' + document.layers.map((layer) => indent(2) + legacyLayer(layer, 2)).join(',\n') + '\n  ]';
  return '{\n' +
    `  "format": ${JSON.stringify(document.format)},\n` +
    `  "version": 1,\n` +
    `  "id": ${JSON.stringify(document.id)},\n` +
    `  "name": ${JSON.stringify(document.name)},\n` +
    `  "assets": ${assetJson},\n` +
    `  "tilesets": ${tilesetJson},\n` +
    `  "layers": ${layerJson},\n` +
    '  "metadata": {}\n' +
    '}';
}

function documentBytes(text) {
  return Buffer.byteLength(text, 'utf8');
}

function documentLines(text) {
  return text.split('\n').length;
}

function formatMs(value) {
  return value < 0.1 ? '<0.1 ms' : `${value.toFixed(1)} ms`;
}

function measureFixture(name, document) {
  const encoded = serializeWorld2D(document, { mode: 'compact', effort: 'max' });
  assert.equal(encoded.ok, true, `${name} must serialize as compact v2`);
  const legacy = serializeLegacyV1(document);
  const compactBytes = documentBytes(encoded.json);
  const legacyBytes = documentBytes(legacy);
  const ratio = compactBytes / legacyBytes;
  assert.ok(ratio <= 0.2, `${name} compact v2 must use at most 20% of legacy bytes (got ${(ratio * 100).toFixed(2)}%)`);
  return {
    name,
    legacyBytes,
    legacyLines: documentLines(legacy),
    compactBytes,
    compactLines: documentLines(encoded.json),
    percent: ratio * 100,
  };
}

function measureCodec(width, height, id) {
  const document = createDocument(id, width, height, fixtureCells('benchmark', width, height));
  const startEncode = performance.now();
  const encoded = serializeWorld2D(document, { mode: 'compact', effort: 'max' });
  const encodeMs = performance.now() - startEncode;
  assert.equal(encoded.ok, true, `${id} must encode successfully`);

  const startParse = performance.now();
  const stored = JSON.parse(encoded.json);
  const parseMs = performance.now() - startParse;
  const startDecode = performance.now();
  const decoded = normalizeWorld2DStorage(stored);
  const decodeMs = performance.now() - startDecode;
  assert.equal(decoded.ok, true, `${id} must decode successfully`);
  assert.equal(decoded.document?.layers[0]?.data.length, width * height);
  const last = decoded.document?.layers[0]?.data.at(-1);
  assert.deepEqual(last, makeCell('terrain', 3), `${id} must round-trip its last cell`);
  return { size: `${width}×${height}`, cells: width * height, encodeMs, parseMs, decodeMs };
}

const fixtures = [
  ['constant-32x32', 'constant'],
  ['pattern-2x2-32x32', 'pattern-2x2'],
  ['sparse-extra-32x32', 'sparse-extra'],
  ['varied-extra-32x32', 'varied-extra'],
];
const sizeRows = fixtures.map(([name, kind]) => measureFixture(name, createDocument(name, 32, 32, fixtureCells(kind, 32, 32))));
const timingRows = [
  measureCodec(32, 32, 'timing-32x32'),
  measureCodec(256, 256, 'timing-256x256'),
  measureCodec(1000, 1000, 'timing-1000x1000'),
];

console.log('World2D storage size (complete tile-only documents; images remain external)');
console.log('| Fixture | Legacy v1 | Legacy lines | Compact v2 | Compact lines | v2 / v1 |');
console.log('| --- | ---: | ---: | ---: | ---: | ---: |');
for (const row of sizeRows) {
  console.log(`| ${row.name} | ${row.legacyBytes} B | ${row.legacyLines} | ${row.compactBytes} B | ${row.compactLines} | ${row.percent.toFixed(2)}% |`);
}
console.log('\nWorld2D max-effort codec timing (single run; includes bounded LZ candidate)');
console.log('| Grid | Cells | Encode | JSON parse | Decode |');
console.log('| --- | ---: | ---: | ---: | ---: |');
for (const row of timingRows) {
  console.log(`| ${row.size} | ${row.cells.toLocaleString('en-US')} | ${formatMs(row.encodeMs)} | ${formatMs(row.parseMs)} | ${formatMs(row.decodeMs)} |`);
}
