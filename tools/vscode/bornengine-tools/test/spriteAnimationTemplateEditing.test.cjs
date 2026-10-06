const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { createRequire } = require('node:module');
const { test } = require('node:test');
const { transformSync } = require(path.join(__dirname, '..', 'node_modules/esbuild'));

const extensionRoot = path.resolve(__dirname, '..');
const repoRoot = path.resolve(extensionRoot, '../../..');

function loadTypeScript(filePath, mocks = {}) {
  if (!fs.existsSync(filePath)) return {};
  const source = fs.readFileSync(filePath, 'utf8');
  const { code } = transformSync(source, { loader: 'ts', format: 'cjs', target: 'node18' });
  const module = { exports: {} };
  const localRequire = createRequire(filePath);
  const sourceRequire = (specifier) => Object.hasOwn(mocks, specifier) ? mocks[specifier] : localRequire(specifier);
  new Function('require', 'module', 'exports', code)(sourceRequire, module, module.exports);
  return module.exports;
}

const engineSchema = loadTypeScript(path.join(repoRoot, 'src/sprites/sprite-animation-template.ts'));
const extensionSchema = loadTypeScript(path.join(extensionRoot, 'src/animations/spriteAnimationTemplateSchema.ts'), {
  '../../../../../src/sprites/sprite-animation-template': engineSchema,
});
const creation = loadTypeScript(path.join(extensionRoot, 'src/animations/spriteAnimationTemplateCreation.ts'), {
  './spriteAnimationSchema': loadTypeScript(path.join(extensionRoot, 'src/animations/spriteAnimationSchema.ts')),
  './spriteAnimationCreation': { spriteAnimationFileStem: (name) => name.toLowerCase().replace(/\s+/g, '-') },
  './spriteAnimationTemplateSchema': extensionSchema,
});
const edits = loadTypeScript(path.join(extensionRoot, 'src/animations/spriteAnimationTemplateEdits.ts'));
const preview = loadTypeScript(path.join(extensionRoot, 'src/animations/spriteAnimationTemplatePreview.ts'));

test('template editor model supports author-defined inputs, layer order, transforms, and composite previews', () => {
  assert.equal(typeof creation.createSpriteAnimationTemplateDocument, 'function');
  for (const name of [
    'addSpriteAnimationTemplateParameter',
    'updateSpriteAnimationTemplateParameter',
    'moveSpriteAnimationTemplateParameter',
    'removeSpriteAnimationTemplateParameter',
    'addSpriteAnimationTemplateLayer',
    'updateSpriteAnimationTemplateLayer',
    'moveSpriteAnimationTemplateLayer',
    'removeSpriteAnimationTemplateLayer',
  ]) assert.equal(typeof edits[name], 'function');
  assert.equal(typeof preview.drawSpriteAnimationTemplateFrame, 'function');
  assert.equal(typeof preview.getSpriteAnimationTemplateFrameIndex, 'function');

  let document = creation.createSpriteAnimationTemplateDocument('Layered walk');
  assert.equal(extensionSchema.validateSpriteAnimationTemplate(document).ok, true);
  document = edits.addSpriteAnimationTemplateParameter(document, {
    id: 'custom + overlay', required: false, tags: ['fx'],
  });
  document = edits.updateSpriteAnimationTemplateParameter(document, 'input-1', { id: 'base art / v2', tags: ['actor', 'main'] });
  assert.equal(document.clips[0].frames[0].layers[0].parameter, 'base art / v2');
  assert.deepEqual(document.imageParameters[0].tags, ['actor', 'main']);

  document = edits.addSpriteAnimationTemplateLayer(document, 'idle', 0, {
    parameter: 'custom + overlay', source: { x: 4, y: 8, width: 12, height: 16 },
    transform: { offset: { x: 3, y: -2 }, stretch: { x: -1, y: 0.75 }, zoom: 1.5, rotation: 18, pivot: { x: 0.25, y: 0.5 } },
  });
  document = edits.moveSpriteAnimationTemplateLayer(document, 'idle', 0, 1, -1);
  assert.equal(document.clips[0].frames[0].layers[0].parameter, 'custom + overlay');
  assert.equal(document.clips[0].frames[0].layers[0].transform.stretch.x, -1);
  assert.equal(extensionSchema.validateSpriteAnimationTemplate(document).ok, true);

  const calls = [];
  const context = {
    save() {}, restore() {}, translate: (...args) => calls.push(['translate', ...args]),
    rotate: (value) => calls.push(['rotate', value]), scale: (...args) => calls.push(['scale', ...args]),
    drawImage: (image, ...args) => calls.push(['draw', image.id, ...args]),
  };
  const clip = { ...document.clips[0], canvasSize: { width: 32, height: 32 } };
  const frame = { layers: [
    { ...document.clips[0].frames[0].layers[0], parameter: 'custom + overlay' },
    { ...document.clips[0].frames[0].layers[1], visible: false },
    { ...document.clips[0].frames[0].layers[1], parameter: 'base art / v2' },
  ] };
  preview.drawSpriteAnimationTemplateFrame(context, clip, frame, {
    'custom + overlay': { image: { id: 'overlay' }, size: { width: 32, height: 32 } },
    'base art / v2': { image: { id: 'base' }, size: { width: 32, height: 32 } },
  }, { x: 0, y: 0, scale: 2 });
  assert.deepEqual(calls.filter((call) => call[0] === 'draw').map((call) => call[1]), ['overlay', 'base']);
  assert.ok(calls.some((call) => call[0] === 'scale' && call[1] === -1.5 && call[2] === 1.125));

  const timedClip = {
    name: 'attack', fps: 10, loop: 'ping-pong', canvasSize: { width: 32, height: 32 },
    frames: [{ duration: 0.1, layers: [] }, { duration: 0.2, layers: [] }, { duration: 0.3, layers: [] }],
  };
  assert.deepEqual(preview.getSpriteAnimationTemplateFrameIndex(timedClip, 0.09), { index: 0, done: false });
  assert.deepEqual(preview.getSpriteAnimationTemplateFrameIndex(timedClip, 0.1), { index: 1, done: false });
  assert.deepEqual(preview.getSpriteAnimationTemplateFrameIndex(timedClip, 0.3), { index: 2, done: false });
  assert.deepEqual(preview.getSpriteAnimationTemplateFrameIndex(timedClip, 0.6), { index: 1, done: false });
  assert.deepEqual(preview.getSpriteAnimationTemplateFrameIndex({ ...timedClip, loop: 'once' }, 0.61), { index: 2, done: true });
  assert.deepEqual(preview.getSpriteAnimationTemplateFrameIndex({ ...timedClip, loop: 'loop' }, 0.6), { index: 0, done: false });

  assert.throws(() => edits.removeSpriteAnimationTemplateParameter(document, 'base art / v2'), /still use parameter/i);
  assert.throws(() => edits.removeSpriteAnimationTemplateLayer(
    creation.createSpriteAnimationTemplateDocument('Only layer'), 'idle', 0, 0,
  ), /at least one layer/i);
});
