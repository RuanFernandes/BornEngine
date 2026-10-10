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

const directions = loadTypeScript(path.join(extensionRoot, 'src/animations/animationDirections.ts'));
const engineSchema = loadTypeScript(path.join(repoRoot, 'src/sprites/sprite-animation-template.ts'));
const templateSchema = loadTypeScript(path.join(extensionRoot, 'src/animations/spriteAnimationTemplateSchema.ts'), {
  '../../../../../src/sprites/sprite-animation-template': engineSchema,
});
const documentSchema = loadTypeScript(path.join(extensionRoot, 'src/animations/spriteAnimationSchema.ts'));
const json = loadTypeScript(path.join(extensionRoot, 'src/animations/spriteAnimationJson.ts'), {
  './spriteAnimationSchema': documentSchema,
  './spriteAnimationTemplateSchema': templateSchema,
});
const edits = loadTypeScript(path.join(extensionRoot, 'src/animations/spriteAnimationTemplateEdits.ts'), {
  './animationDirections': directions,
});

const layerFrame = (x, extra = {}) => ({ layers: [{ parameter: 'body', source: { x, y: 0, width: 8, height: 8 }, ...extra }] });

function template(clip) {
  return {
    format: 'bornengine.spriteanim-template',
    version: 1,
    id: 'hero',
    name: 'Hero',
    imageParameters: [{ id: 'body', required: true }],
    clips: [{ name: 'idle', fps: 6, loop: 'loop', canvasSize: { width: 8, height: 8 }, ...clip }],
  };
}

test('direction helpers switch a clip between plain and per-direction frames', () => {
  const plain = { name: 'idle', frames: ['a', 'b'] };
  const directional = directions.setClipDirectional(plain, true);
  assert.deepEqual(Object.keys(directional).sort(), ['directions', 'name']);
  assert.deepEqual(directional.directions.left, ['a', 'b']);
  assert.deepEqual(directions.getClipFrameList(directional, 'right'), ['a', 'b']);
  const edited = directions.withClipFrameList(directional, 'up', ['u']);
  assert.deepEqual(edited.directions.up, ['u']);
  assert.deepEqual(edited.directions.down, ['a', 'b']);
  const back = directions.setClipDirectional(edited, false, 'up');
  assert.deepEqual(back, { name: 'idle', frames: ['u'] });
  const seeded = directions.setClipDirectional(plain, true, 'down', (direction) => direction === 'up' ? ['seed'] : undefined);
  assert.deepEqual(seeded.directions.up, ['seed']);
  assert.deepEqual(seeded.directions.down, ['a', 'b']);
});

test('template edits target the selected direction and keep the JSON source form valid', () => {
  let value = template({ frames: [layerFrame(0)] });
  value = edits.setSpriteAnimationTemplateClipDirectional(value, 'idle', true);
  assert.equal(value.clips[0].frames, undefined);
  value = edits.addSpriteAnimationTemplateFrame(value, 'idle', layerFrame(8), 'left');
  value = edits.updateSpriteAnimationTemplateLayer(value, 'idle', 1, 0, { source: { x: 16, y: 0, width: 8, height: 8 } }, 'left');
  assert.equal(value.clips[0].directions.left.length, 2);
  assert.equal(value.clips[0].directions.left[1].layers[0].source.x, 16);
  assert.equal(value.clips[0].directions.right.length, 1);
  assert.throws(() => edits.removeSpriteAnimationTemplateFrame(value, 'idle', 0, 'up'), /at least one frame/);

  value = edits.copySpriteAnimationTemplateDirection(value, 'idle', 'left', 'right', true);
  const mirrored = value.clips[0].directions.right[1].layers[0];
  assert.equal(mirrored.transform.stretch.x, -1);
  assert.equal(mirrored.source.x, 16);

  const result = templateSchema.validateSpriteAnimationTemplate(value);
  assert.equal(result.ok, true, JSON.stringify(result.diagnostics));
  assert.equal(result.value.clips[0].frames.length, 1, 'resolved clips expose down as their default frames');

  const source = templateSchema.spriteAnimationTemplateSource(result.value);
  assert.equal(source.clips[0].frames, undefined);
  const compact = JSON.parse(json.serializeSpriteAnimationJsonCompact(source));
  assert.deepEqual(Object.keys(compact.clips[0].directions), ['up', 'left', 'down', 'right']);
  assert.equal(compact.clips[0].frames, undefined);
  assert.deepEqual(compact.clips[0].directions.right[1].layers[0].transform, { stretch: { x: -1, y: 1 } });
});

test('renaming or removing an input looks at every direction', () => {
  let value = edits.setSpriteAnimationTemplateClipDirectional(template({ frames: [layerFrame(0)] }), 'idle', true);
  value = edits.addSpriteAnimationTemplateParameter(value, { id: 'fx', required: false });
  value = edits.addSpriteAnimationTemplateLayer(value, 'idle', 0, { parameter: 'fx', source: { x: 0, y: 0, width: 4, height: 4 } }, 'up');
  assert.throws(() => edits.removeSpriteAnimationTemplateParameter(value, 'fx'), /still use parameter fx/);
  value = edits.updateSpriteAnimationTemplateParameter(value, 'body', { id: 'skin' });
  for (const direction of directions.ANIMATION_DIRECTIONS) {
    assert.equal(value.clips[0].directions[direction][0].layers[0].parameter, 'skin');
  }
});

test('sprite animation documents accept per-direction frames and reject mixed or partial clips', () => {
  const frame = (x) => ({ image: 'art/hero.png', x, y: 0, width: 16, height: 16 });
  const document = (clip) => ({
    format: 'bornengine.spriteanim',
    version: 1,
    source: 'art/hero.json',
    clips: [{ name: 'idle', animationGroupId: 'idle', fps: 8, loop: 'loop', ...clip }],
  });
  const valid = documentSchema.validateSpriteAnimationDocument(document({
    directions: { up: [frame(0)], left: [frame(16)], down: [frame(32), frame(48)], right: [frame(64)] },
  }));
  assert.equal(valid.ok, true, JSON.stringify(valid.diagnostics));
  assert.equal(valid.value.clips[0].directions.down.length, 2);
  assert.deepEqual(
    documentSchema.spriteAnimationClipFrameLists(valid.value.clips[0], '/clips/0').map((list) => list.path),
    ['/clips/0/directions/up', '/clips/0/directions/left', '/clips/0/directions/down', '/clips/0/directions/right'],
  );

  const mixed = documentSchema.validateSpriteAnimationDocument(document({
    frames: [frame(0)],
    directions: { up: [frame(0)], left: [frame(0)], down: [frame(0)], right: [frame(0)] },
  }));
  assert.equal(mixed.ok, false);
  assert.equal(mixed.diagnostics[0].code, 'frames_and_directions');

  const partial = documentSchema.validateSpriteAnimationDocument(document({
    directions: { up: [frame(0)], left: [], down: [frame(0)], north: [frame(0)] },
  }));
  assert.equal(partial.ok, false);
  assert.deepEqual(partial.diagnostics.map((item) => item.code).sort(),
    ['invalid_direction_frames', 'invalid_direction_frames', 'unknown_direction']);
});
