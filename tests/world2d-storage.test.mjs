import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { normalizeWorld2DStorage } from '../src/world2d/storage.ts';
import { serializeWorld2D } from '../src/world2d/saver.ts';
import { migrateWorld2D } from '../src/world2d/migrate.ts';
import { validateWorld2D } from '../src/world2d/validate.ts';
import { WORLD2D_VERSION } from '../src/world2d/types.ts';

const compactFixture = JSON.parse(readFileSync(new URL('./fixtures/world2d/compact-mixed.world2d.json', import.meta.url), 'utf8'));
const v1Fixture = JSON.parse(readFileSync(new URL('./fixtures/world2d/simple.world2d.json', import.meta.url), 'utf8'));

function tileLayers(document) {
  return document.layers.filter((layer) => layer.type === 'tilemap');
}

function cellSignature(cell) {
  return cell === null ? null : [cell.tilesetId, cell.tileId, cell.flipX, cell.flipY, cell.flipDiagonal];
}

test('keeps expanded World2D version 2 while the stored format is version 2', () => {
  assert.equal(WORLD2D_VERSION, 2);
  const result = normalizeWorld2DStorage(compactFixture);
  assert.equal(result.ok, true, JSON.stringify(result.diagnostics));
  assert.equal(result.document.version, 2);
  assert.deepEqual(result.document.layers[0].data.map(cellSignature), [
    ['main', 0, false, false, false], null, ['extra', 0, false, false, false], null,
    ['main', 1, false, false, false], null, ['extra', 0, true, false, false], null,
  ]);
});

test('decodes Dense, RLE, Sparse, Bits, and LZ into the same normalized cell model', () => {
  const result = normalizeWorld2DStorage(compactFixture);
  assert.equal(result.ok, true, JSON.stringify(result.diagnostics));
  const layers = tileLayers(result.document);
  assert.deepEqual(layers.map((layer) => layer.data.map(cellSignature)), [
    [
      ['main', 0, false, false, false], null, ['extra', 0, false, false, false], null,
      ['main', 1, false, false, false], null, ['extra', 0, true, false, false], null,
    ],
    Array(8).fill(['main', 0, false, false, false]),
    [null, null, ['extra', 0, false, false, false], null, null, null, null, ['extra', 0, true, false, false]],
    [null, ['main', 0, false, false, false], null, ['main', 0, false, false, false],
      null, ['main', 0, false, false, false], null, ['main', 0, false, false, false]],
    Array(8).fill(['main', 0, false, false, false]),
  ]);
});

test('restores inferred assets, default fields, object transforms, and custom JSON', () => {
  const result = normalizeWorld2DStorage(compactFixture);
  assert.equal(result.ok, true, JSON.stringify(result.diagnostics));
  const document = result.document;

  assert.equal(document.name, 'compact-mixed');
  assert.deepEqual(document.assets, ['assets/main.png', 'assets/extra.png', 'audio/guard.ogg', 'data/custom.bin']);
  for (const layer of tileLayers(document)) {
    assert.equal(layer.name, layer.id);
    assert.equal(layer.visible, true);
    assert.equal(layer.opacity, 1);
    assert.deepEqual(layer.offset, { x: 0, y: 0 });
    assert.deepEqual(layer.parallax, { x: 1, y: 1 });
    assert.deepEqual(layer.tileSize, { x: 16, y: 16 });
    assert.equal(layer.width, 4);
    assert.equal(layer.height, 2);
  }
  assert.deepEqual(document.tilesets[0].margin, { x: 0, y: 0 });
  assert.deepEqual(document.tilesets[0].spacing, { x: 0, y: 0 });
  assert.deepEqual(document.tilesets[0].tiles, []);

  const actors = document.layers.find((layer) => layer.type === 'objects');
  assert.equal(actors.name, 'actors');
  assert.deepEqual(actors.objects[0].position, { x: 32, y: 48 });
  assert.equal(actors.objects[0].rotation, 45);
  assert.deepEqual(actors.objects[0].size, { x: 24, y: 48 });
  assert.deepEqual(actors.objects[0].origin, { x: 0.25, y: 0.75 });
  assert.equal(actors.objects[0].visible, false);
  assert.deepEqual(actors.objects[0].tags, ['town', 'guard']);
  assert.equal(actors.objects[0].properties.voice.value, 'audio/guard.ogg');
  assert.deepEqual(actors.objects[0].components[0].data.patrol, [1.25, 8.5]);
  assert.equal(document.metadata.custom.precise, 1.234567890123);
});

test('migrates strict v1 without mutating the original object', () => {
  const input = structuredClone(v1Fixture);
  const before = structuredClone(input);
  const result = migrateWorld2D(input);

  assert.equal(result.ok, true, JSON.stringify(result.diagnostics));
  assert.equal(result.document.version, 2);
  assert.deepEqual(input, before);
  assert.equal(validateWorld2D(v1Fixture).ok, true);
});

test('rejects invalid v1 instead of repairing missing required fields', () => {
  const input = structuredClone(v1Fixture);
  delete input.name;
  const result = normalizeWorld2DStorage(input);

  assert.equal(result.ok, false);
  assert.ok(result.diagnostics.some((item) => item.path === '/name'));
});

test('accepts an expanded v2 document as programmatic input', () => {
  const normalized = normalizeWorld2DStorage(compactFixture);
  assert.equal(normalized.ok, true, JSON.stringify(normalized.diagnostics));
  const expanded = structuredClone(normalized.document);
  const result = normalizeWorld2DStorage(expanded);

  assert.equal(result.ok, true, JSON.stringify(result.diagnostics));
  assert.deepEqual(result.document, expanded);
});

test('serializes compact defaults and emits readable dense grids on request', () => {
  const normalized = normalizeWorld2DStorage(compactFixture);
  assert.equal(normalized.ok, true, JSON.stringify(normalized.diagnostics));
  const compact = serializeWorld2D(normalized.document);
  assert.equal(compact.ok, true, JSON.stringify(compact.diagnostics));
  const stored = JSON.parse(compact.json);

  assert.equal(stored.version, 2);
  assert.equal(Object.hasOwn(stored, 'name'), false);
  assert.deepEqual(stored.assets, ['data/custom.bin']);
  assert.deepEqual(stored.size, [4, 2]);
  assert.deepEqual(stored.tileSize, [16, 16]);
  const storedGrid = stored.layers[0].data;
  assert.ok(Array.isArray(storedGrid)
    ? storedGrid.every((value) => typeof value === 'number')
    : ['rle', 'sparse', 'bits', 'lz'].includes(storedGrid.encoding));
  assert.equal(stored.layers[0].visible, undefined);
  assert.equal(stored.layers[0].opacity, undefined);
  assert.equal(stored.layers[0].offset, undefined);
  assert.equal(stored.layers[0].parallax, undefined);

  const readable = serializeWorld2D(normalized.document, { mode: 'readable', effort: 'fast' });
  assert.equal(readable.ok, true, JSON.stringify(readable.diagnostics));
  const readableStored = JSON.parse(readable.json);
  assert.ok(Array.isArray(readableStored.layers[0].data));
  assert.ok(readable.json.includes('"data": [\n'));
  assert.equal(normalizeWorld2DStorage(readableStored).ok, true);
});

test('preserves a fractional empty layer tile size without promoting it to the integer map default', () => {
  const input = {
    format: 'bornengine.world2d',
    version: 2,
    id: 'fractional-empty-layer',
    size: [1, 1],
    tilesets: [],
    layers: [{ id: 'empty', type: 'tilemap', size: [1, 1], tileSize: [1.5, 1.5], data: [0] }],
  };

  const serialized = serializeWorld2D(input);
  assert.equal(serialized.ok, true, JSON.stringify(serialized.diagnostics));
  const stored = JSON.parse(serialized.json);
  assert.equal(Object.hasOwn(stored, 'tileSize'), false);
  assert.deepEqual(stored.layers[0].tileSize, [1.5, 1.5]);
  const reopened = normalizeWorld2DStorage(stored);
  assert.equal(reopened.ok, true, JSON.stringify(reopened.diagnostics));
  assert.deepEqual(reopened.document.layers[0].tileSize, { x: 1.5, y: 1.5 });
});

test('uses the first layer size as the map default when layer-size counts tie', () => {
  const makeLayer = (id, width) => ({
    id,
    type: 'tilemap',
    size: [width, 1],
    tileSize: [16, 16],
    data: Array(width).fill(0),
  });
  const input = {
    format: 'bornengine.world2d',
    version: 2,
    id: 'tied-map-sizes',
    tilesets: [],
    layers: [makeLayer('first', 2), makeLayer('second', 3), makeLayer('third', 3), makeLayer('fourth', 2)],
  };

  const serialized = serializeWorld2D(input);
  assert.equal(serialized.ok, true, JSON.stringify(serialized.diagnostics));
  const stored = JSON.parse(serialized.json);
  assert.deepEqual(stored.size, [2, 1]);
  assert.deepEqual(stored.layers.map((layer) => layer.size), [undefined, [3, 1], [3, 1], undefined]);

  const reopened = normalizeWorld2DStorage(stored);
  assert.equal(reopened.ok, true, JSON.stringify(reopened.diagnostics));
  assert.deepEqual(reopened.document.layers.map((layer) => [layer.width, layer.height]),
    [[2, 1], [3, 1], [3, 1], [2, 1]]);
});

test('preserves own __proto__ keys in metadata, typed properties, and component JSON', () => {
  const input = structuredClone(compactFixture);
  const actor = input.layers.find((layer) => layer.type === 'objects').objects[0];
  input.metadata = JSON.parse('{"__proto__":{"quest":42},"ordinary":1}');
  actor.properties = JSON.parse('{"__proto__":{"type":"int","value":7},"ordinary":{"type":"int","value":1}}');
  actor.components[0].data = JSON.parse('{"__proto__":{"quest":42},"ordinary":true}');

  const normalized = normalizeWorld2DStorage(input);
  assert.equal(normalized.ok, true, JSON.stringify(normalized.diagnostics));
  const normalizedActor = normalized.document.layers.find((layer) => layer.type === 'objects').objects[0];
  assert.equal(Object.hasOwn(normalized.document.metadata, '__proto__'), true);
  assert.equal(normalized.document.metadata.__proto__.quest, 42);
  assert.equal(Object.getPrototypeOf(normalized.document.metadata), Object.prototype);
  assert.equal(Object.hasOwn(normalizedActor.properties, '__proto__'), true);
  assert.equal(normalizedActor.properties.__proto__.value, 7);
  assert.equal(normalizedActor.components[0].data.__proto__.quest, 42);
  assert.equal(({}).quest, undefined);

  const serialized = serializeWorld2D(normalized.document);
  assert.equal(serialized.ok, true, JSON.stringify(serialized.diagnostics));
  const stored = JSON.parse(serialized.json);
  assert.equal(Object.hasOwn(stored.metadata, '__proto__'), true);
  assert.equal(stored.metadata.__proto__.quest, 42);
  const storedActor = stored.layers.find((layer) => layer.type === 'objects').objects[0];
  assert.equal(Object.hasOwn(storedActor.properties, '__proto__'), true);
  assert.equal(storedActor.properties.__proto__.value, 7);
  assert.equal(Object.hasOwn(storedActor.components[0].data, '__proto__'), true);
  assert.equal(storedActor.components[0].data.__proto__.quest, 42);
});

test('re-encodes stable source IDs after changing which tileset is primary', () => {
  const normalized = normalizeWorld2DStorage(compactFixture);
  assert.equal(normalized.ok, true, JSON.stringify(normalized.diagnostics));
  const document = structuredClone(normalized.document);
  const before = tileLayers(document).map((layer) => layer.data.map(cellSignature));
  document.tilesets = [document.tilesets[1], document.tilesets[0]];

  const saved = serializeWorld2D(document);
  assert.equal(saved.ok, true, JSON.stringify(saved.diagnostics));
  const reopened = normalizeWorld2DStorage(JSON.parse(saved.json));
  assert.equal(reopened.ok, true, JSON.stringify(reopened.diagnostics));
  assert.deepEqual(tileLayers(reopened.document).map((layer) => layer.data.map(cellSignature)), before);
  assert.equal(JSON.parse(saved.json).tilesets[0].id, 'extra');
});

test('rejects incorrect grid totals and conflicting compact/expanded dimensions', () => {
  const wrongGrid = structuredClone(compactFixture);
  wrongGrid.layers[1].data.values = [7, 1];
  assert.equal(normalizeWorld2DStorage(wrongGrid).ok, false);

  const conflictingSize = structuredClone(compactFixture);
  conflictingSize.layers[0].width = 3;
  const result = normalizeWorld2DStorage(conflictingSize);
  assert.equal(result.ok, false);
  assert.ok(result.diagnostics.some((item) => item.code === 'conflicting_dimensions'));
});

test('public validation accepts v1 and compact v2 but rejects unsupported versions', () => {
  assert.equal(validateWorld2D(v1Fixture).ok, true);
  assert.equal(validateWorld2D(compactFixture).ok, true);
  const future = { ...compactFixture, version: 3 };
  const result = validateWorld2D(future);
  assert.equal(result.ok, false);
  assert.ok(result.diagnostics.some((item) => item.path === '/version' && item.code === 'unsupported_version'));
});
