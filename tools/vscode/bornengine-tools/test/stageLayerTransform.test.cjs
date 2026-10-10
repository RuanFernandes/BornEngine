const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { createRequire } = require('node:module');
const { test } = require('node:test');
const { transformSync } = require(path.join(__dirname, '..', 'node_modules/esbuild'));

const extensionRoot = path.resolve(__dirname, '..');
const repoRoot = path.resolve(extensionRoot, '../../..');

function loadTypeScript(filePath, mocks = {}) {
  const source = fs.readFileSync(filePath, 'utf8');
  const { code } = transformSync(source, { loader: 'ts', format: 'cjs', target: 'node18' });
  const module = { exports: {} };
  const localRequire = createRequire(filePath);
  const sourceRequire = (specifier) => Object.hasOwn(mocks, specifier) ? mocks[specifier] : localRequire(specifier);
  new Function('require', 'module', 'exports', code)(sourceRequire, module, module.exports);
  return module.exports;
}

const stage = loadTypeScript(path.join(extensionRoot, 'src/animations/stageLayerTransform.ts'));
const engineSchema = loadTypeScript(path.join(repoRoot, 'src/sprites/sprite-animation-template.ts'));
const templateSchema = loadTypeScript(path.join(extensionRoot, 'src/animations/spriteAnimationTemplateSchema.ts'), {
  '../../../../../src/sprites/sprite-animation-template': engineSchema,
});
const documentSchema = loadTypeScript(path.join(extensionRoot, 'src/animations/spriteAnimationSchema.ts'));
const json = loadTypeScript(path.join(extensionRoot, 'src/animations/spriteAnimationJson.ts'), {
  './spriteAnimationSchema': documentSchema,
  './spriteAnimationTemplateSchema': templateSchema,
});

const canvas = { width: 64, height: 64 };
const source = { width: 20, height: 10 };
const base = {
  offset: { x: 4, y: -3 },
  stretch: { x: 1.5, y: 0.75 },
  zoom: 2,
  rotation: 30,
  pivot: { x: 0.25, y: 0.5 },
};
const close = (actual, expected, message) => assert.ok(Math.abs(actual - expected) < 0.05, `${message}: ${actual} vs ${expected}`);
const closePoint = (actual, expected, message) => {
  close(actual.x, expected.x, `${message} x`);
  close(actual.y, expected.y, `${message} y`);
};

test('layer local and canvas points are inverse', () => {
  const point = stage.layerPoint(canvas, source, base, { x: 7, y: 2 });
  closePoint(stage.layerLocalPoint(canvas, source, base, point), { x: 7, y: 2 }, 'round trip');
});

test('scale keeps the opposite anchor fixed and moves the handle to the pointer', () => {
  for (const [hx, hy] of stage.STAGE_SCALE_HANDLES) {
    const anchorLocal = { x: hx > 0 ? 0 : hx < 0 ? source.width : source.width / 2, y: hy > 0 ? 0 : hy < 0 ? source.height : source.height / 2 };
    const anchorBefore = stage.layerPoint(canvas, source, base, anchorLocal);
    const pointer = { x: anchorBefore.x + 25 + hx * 3, y: anchorBefore.y - 18 + hy * 2 };
    const next = stage.scaleTransform(canvas, source, base, hx, hy, pointer);
    closePoint(stage.layerPoint(canvas, source, next, anchorLocal), anchorBefore, `anchor for ${hx},${hy}`);
    const handleLocal = { x: hx < 0 ? 0 : hx > 0 ? source.width : source.width / 2, y: hy < 0 ? 0 : hy > 0 ? source.height : source.height / 2 };
    const pointerLocal = stage.layerLocalPoint(canvas, source, next, pointer);
    if (hx !== 0) close(pointerLocal.x, handleLocal.x, `handle x ${hx},${hy}`);
    if (hy !== 0) close(pointerLocal.y, handleLocal.y, `handle y ${hx},${hy}`);
    assert.equal(next.zoom, base.zoom);
    assert.equal(next.rotation, base.rotation);
  }
});

test('edge handles change one stretch axis only', () => {
  const next = stage.scaleTransform(canvas, source, base, 1, 0, { x: 40, y: 0 });
  assert.equal(next.stretch.y, base.stretch.y);
  assert.notEqual(next.stretch.x, base.stretch.x);
});

test('dragging a handle past its anchor mirrors the layer instead of collapsing it', () => {
  const anchorLocal = { x: source.width, y: source.height / 2 };
  const anchor = stage.layerPoint(canvas, source, base, anchorLocal);
  const past = { x: anchor.x + 30, y: anchor.y };
  const next = stage.scaleTransform(canvas, source, { ...base, rotation: 0 }, -1, 0, past);
  assert.ok(next.stretch.x < 0);
  assert.ok(Math.abs(next.stretch.x) >= 0.01);
});

test('move and rotate apply pointer deltas', () => {
  const moved = stage.moveTransform(base, { x: 10, y: 10 }, { x: 13, y: 6 });
  assert.deepEqual(moved.offset, { x: 7, y: -7 });
  const center = { x: canvas.width / 2 + base.offset.x, y: canvas.height / 2 + base.offset.y };
  const rotated = stage.rotateTransform(canvas, { ...base, rotation: 0 }, { x: center.x, y: center.y - 20 }, { x: center.x + 20, y: center.y });
  close(rotated.rotation, 90, 'quarter turn clockwise');
});

test('hit testing prefers handles of the selected layer, then top layers, and misses empty space', () => {
  const layers = [
    { visible: true, source, transform: { ...base, offset: { x: 0, y: 0 } } },
    { visible: true, source, transform: { ...base, offset: { x: 0, y: 0 }, rotation: 0, stretch: { x: 1, y: 1 }, zoom: 1, pivot: { x: 0, y: 0 } } },
  ];
  const topLeft = stage.layerHandlePoint(canvas, source, layers[1].transform, -1, -1);
  assert.deepEqual(stage.hitTestStage(canvas, layers, 1, topLeft, 1), { kind: 'scale', layerIndex: 1, hx: -1, hy: -1 });
  const body = stage.layerPoint(canvas, source, layers[1].transform, { x: 5, y: 5 });
  assert.deepEqual(stage.hitTestStage(canvas, layers, 0, body, 1), { kind: 'move', layerIndex: 1, hx: 0, hy: 0 });
  assert.equal(stage.hitTestStage(canvas, layers, 0, { x: 500, y: 500 }, 1), null);
});

test('stage transform edits round-trip through the compact template JSON', () => {
  const value = {
    format: 'bornengine.spriteanim-template', version: 1, id: 'player', name: 'player',
    imageParameters: [{ id: 'body', required: true }],
    clips: [{ name: 'idle', fps: 8, loop: 'loop', canvasSize: { width: 32, height: 32 }, frames: [{ layers: [{
      parameter: 'body', source: { x: 0, y: 0, width: 32, height: 32 },
      transform: { offset: { x: 0, y: 3.75 }, stretch: { x: 1.25, y: 1 } },
    }] }] }],
  };
  const checked = templateSchema.validateSpriteAnimationTemplate(value);
  assert.equal(checked.ok, true, JSON.stringify(checked.diagnostics));
  const text = json.serializeSpriteAnimationJsonCompact(templateSchema.spriteAnimationTemplateSource(checked.value));
  const reread = templateSchema.readSpriteAnimationTemplate(text);
  assert.equal(reread.result.ok, true, JSON.stringify(reread.result.diagnostics));
  assert.deepEqual(JSON.parse(text).clips[0].frames[0].layers[0].transform, { offset: { x: 0, y: 3.75 }, stretch: { x: 1.25, y: 1 } });
});
