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
const json = loadTypeScript(path.join(extensionRoot, 'src/animations/spriteAnimationJson.ts'), {
  './spriteAnimationSchema': loadTypeScript(path.join(extensionRoot, 'src/animations/spriteAnimationSchema.ts')),
  './spriteAnimationTemplateSchema': extensionSchema,
});
const directions = loadTypeScript(path.join(extensionRoot, 'src/animations/animationDirections.ts'));
const edits = loadTypeScript(path.join(extensionRoot, 'src/animations/spriteAnimationTemplateEdits.ts'), {
  './animationDirections': directions,
});

const template = {
  format: 'bornengine.spriteanim-template',
  version: 1,
  id: 'rpg.layered-avatar',
  name: 'Layered Avatar',
  imageParameters: [
    { id: 'skin / art:01', label: 'First custom slot', required: true, tags: ['character', 'blue'] },
    { id: 'FX+Alternate', label: 'Second custom slot', required: true, tags: ['effects'] },
    { id: 'optional layer!', required: false, tags: ['optional'] },
  ],
  clips: [{
    name: 'walk',
    fps: 8,
    loop: 'loop',
    canvasSize: { width: 32, height: 48 },
    frames: [{
      duration: 0.125,
      markers: ['step'],
      layers: [
        { parameter: 'skin / art:01', source: { x: 0, y: 0, width: 16, height: 32 }, visible: true },
        {
          parameter: 'FX+Alternate',
          source: { x: 4, y: 8, width: 8, height: 8 },
          transform: {
            offset: { x: 2.5, y: -3 },
            stretch: { x: -1, y: 0.75 },
            zoom: 1.5,
            rotation: 12.25,
            pivot: { x: 0.25, y: 0.75 },
          },
        },
        { parameter: 'optional layer!', source: { x: 0, y: 0, width: 4, height: 4 } },
      ],
    }],
  }],
};

test('template schema and compact serializer APIs are exposed', () => {
  for (const schema of [extensionSchema, engineSchema]) {
    assert.equal(typeof schema.validateSpriteAnimationTemplate, 'function');
    assert.equal(typeof schema.validateSpriteAnimationTemplateBinding, 'function');
  }
  assert.equal(typeof json.serializeSpriteAnimationJsonCompact, 'function');
  assert.equal(typeof edits.setSpriteAnimationTemplateParameterTags, 'function');
});

function codes(result) {
  return result.diagnostics.map((diagnostic) => diagnostic.code);
}

test('animation template schema accepts arbitrary author IDs and organizational tags', () => {
  for (const schema of [extensionSchema, engineSchema]) {
    const result = schema.validateSpriteAnimationTemplate(template);
    assert.equal(result.ok, true, result.diagnostics.map((item) => item.message).join('\n'));
    assert.deepEqual(result.value.imageParameters.map((item) => item.id), ['skin / art:01', 'FX+Alternate', 'optional layer!']);
    assert.deepEqual(result.value.imageParameters[0].tags, ['character', 'blue']);
  }
});

test('binding validation accepts a missing optional parameter and maps arbitrary IDs by key', () => {
  const binding = {
    'FX+Alternate': { width: 16, height: 16 },
    'skin / art:01': { width: 32, height: 48 },
  };
  for (const schema of [extensionSchema, engineSchema]) {
    const result = schema.validateSpriteAnimationTemplateBinding(template, binding);
    assert.equal(result.ok, true, result.diagnostics.map((item) => item.message).join('\n'));
  }
});

test('binding validation reports missing required and unknown input IDs', () => {
  for (const schema of [extensionSchema, engineSchema]) {
    const missing = schema.validateSpriteAnimationTemplateBinding(template, {
      'skin / art:01': { width: 32, height: 48 },
    });
    assert.equal(missing.ok, false);
    assert.ok(codes(missing).includes('binding.required'));

    const unknown = schema.validateSpriteAnimationTemplateBinding(template, {
      'skin / art:01': { width: 32, height: 48 },
      'FX+Alternate': { width: 16, height: 16 },
      'spare slot': { width: 8, height: 8 },
    });
    assert.ok(codes(unknown).includes('binding.unknown'));
  }
});

test('binding validation checks each layer crop against its own texture', () => {
  const sizes = {
    'skin / art:01': { width: 16, height: 32 },
    'FX+Alternate': { width: 10, height: 16 },
  };
  for (const schema of [extensionSchema, engineSchema]) {
    const result = schema.validateSpriteAnimationTemplateBinding(template, sizes);
    assert.equal(result.ok, false);
    assert.ok(result.diagnostics.some((item) => item.code === 'binding.crop' && item.message.includes('FX+Alternate')));
  }
});

test('template rejects unknown parameter references, duplicate IDs, bad versions, and zero stretch', () => {
  for (const schema of [extensionSchema, engineSchema]) {
    const unknown = structuredClone(template);
    unknown.clips[0].frames[0].layers[0].parameter = 'not a declared input';
    assert.ok(codes(schema.validateSpriteAnimationTemplate(unknown)).includes('layer.parameter'));

    const duplicate = structuredClone(template);
    duplicate.imageParameters[1].id = duplicate.imageParameters[0].id;
    assert.ok(codes(schema.validateSpriteAnimationTemplate(duplicate)).includes('parameter.duplicate'));

    const unsupported = structuredClone(template);
    unsupported.version = 9;
    assert.ok(codes(schema.validateSpriteAnimationTemplate(unsupported)).includes('template.version'));

    const zeroStretch = structuredClone(template);
    zeroStretch.clips[0].frames[0].layers[1].transform.stretch.x = 0;
    assert.ok(codes(schema.validateSpriteAnimationTemplate(zeroStretch)).includes('layer.transform'));
  }
});

test('tag edits preserve unrelated template data and round-trip through validation', () => {
  const edited = edits.setSpriteAnimationTemplateParameterTags(template, 'skin / art:01', ['wardrobe', 'winter']);
  assert.deepEqual(template.imageParameters[0].tags, ['character', 'blue']);
  assert.deepEqual(edited.imageParameters[0].tags, ['wardrobe', 'winter']);
  assert.deepEqual(edited.clips, template.clips);
  assert.equal(extensionSchema.validateSpriteAnimationTemplate(JSON.parse(JSON.stringify(edited))).ok, true);
});

test('compact animation JSON omits only declared template defaults and preserves every other value', () => {
  const compact = json.serializeSpriteAnimationJsonCompact(template);
  const parsed = JSON.parse(compact);
  assert.equal(compact.includes('\n'), false);
  assert.deepEqual(parsed.imageParameters, template.imageParameters);
  assert.deepEqual(parsed.clips[0].frames[0].markers, ['step']);
  assert.equal(Object.hasOwn(parsed.clips[0].frames[0].layers[0], 'visible'), false);
  assert.equal(Object.hasOwn(parsed.clips[0].frames[0].layers[0], 'transform'), false);
  assert.deepEqual(parsed.clips[0].frames[0].layers[1].transform.stretch, { x: -1, y: 0.75 });
  assert.equal(parsed.clips[0].frames[0].layers[1].transform.rotation, 12.25);
  assert.deepEqual(extensionSchema.validateSpriteAnimationTemplate(parsed).value, extensionSchema.validateSpriteAnimationTemplate(template).value);
});

test('compact serialization keeps the complete legacy animation document semantics', () => {
  const legacy = {
    format: 'bornengine.spriteanim',
    version: 1,
    source: 'assets/actor.spritesheet.json',
    clips: [{
      name: 'walk', animationGroupId: 'walk', fps: 9, loop: 'ping-pong', canvasSize: { width: 32, height: 48 },
      frames: [{
        image: 'assets/actor.png', x: 1, y: 2, width: 12, height: 14, name: 'step', duration: 0.111,
        transform: { offset: { x: 3, y: -4 }, stretch: { x: -1, y: 0.875 }, zoom: 1.4, rotation: 15.75, pivot: { x: 0.2, y: 0.8 } },
        layers: [{ id: 'overlay', name: 'Overlay', image: 'assets/overlay.png', x: 0, y: 0, width: 5, height: 6, visible: false }],
      }],
    }],
  };
  const compact = json.serializeSpriteAnimationJsonCompact(legacy);
  assert.deepEqual(JSON.parse(compact), legacy);
  assert.equal(compact.includes('\n'), false);
});

test('pretty template JSON reads as the same normalized values and unsupported versions stay invalid', () => {
  const source = JSON.stringify(template, null, 2);
  const read = extensionSchema.readSpriteAnimationTemplate(source);
  assert.equal(read.sourceText, source);
  assert.equal(read.result.ok, true);
  assert.deepEqual(read.result.value, extensionSchema.validateSpriteAnimationTemplate(template).value);

  const newer = extensionSchema.validateSpriteAnimationTemplate({ ...template, version: 2 });
  assert.equal(newer.ok, false);
  assert.ok(codes(newer).includes('template.version'));
});
