const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { test } = require('node:test');
const { transformSync } = require(path.join(__dirname, '..', 'node_modules/esbuild'));

function load(relativePath) {
  const sourcePath = path.join(__dirname, '..', 'src', relativePath);
  const source = fs.readFileSync(sourcePath, 'utf8');
  const { code } = transformSync(source, { loader: 'ts', format: 'cjs', target: 'node18' });
  const module = { exports: {} };
  const localModules = {
    './animationFrameTransform': 'animations/animationFrameTransform.ts',
    './spriteAnimationSchema': 'animations/spriteAnimationSchema.ts',
  };
  const localRequire = (specifier) => Object.hasOwn(localModules, specifier)
    ? load(localModules[specifier])
    : require(specifier);
  new Function('require', 'module', 'exports', code)(localRequire, module, module.exports);
  return module.exports;
}

const { validateSpriteAnimationDocument } = load('animations/spriteAnimationSchema.ts');
const { selectFramesForGroupAndDirection } = load('animations/animationPreview.ts');
const { cropSpriteFrameFromDrag } = load('animations/animationFrames.ts');
const { getSpriteAnimationFrameTransform, getSpriteAnimationCanvasSize } = load('animations/animationFrameTransform.ts');

function documentWithFrames(frames) {
  return {
    format: 'bornengine.spriteanim',
    version: 1,
    source: 'assets/walk.spritesheet.json',
    clips: [{ name: 'walk', animationGroupId: 'walk', fps: 12, loop: 'loop', frames }],
  };
}

test('sprite animation clips validate frame image references and crop rectangles', () => {
  const valid = documentWithFrames([{ image: 'assets/walk/01.png', x: 2, y: 4, width: 12, height: 16 }]);
  assert.equal(validateSpriteAnimationDocument(valid).ok, true);
  assert.equal(validateSpriteAnimationDocument(documentWithFrames([
    { image: '../outside.png', x: 0, y: 0, width: 12, height: 16 },
  ])).ok, false);
  assert.equal(validateSpriteAnimationDocument(documentWithFrames([
    { image: 'assets/walk/01.png', x: -1, y: 0, width: 12, height: 16 },
  ])).ok, false);
});

test('custom animation clips preview frames across different source images in order', () => {
  const document = documentWithFrames([
    {
      image: 'assets/walk/01.png', x: 0, y: 0, width: 16, height: 16,
      transform: {
        offset: { x: 2, y: -3 },
        stretch: { x: 1.25, y: 0.75 },
        rotation: 30,
        pivot: { x: 0.5, y: 0.25 },
      },
    },
    { image: 'assets/walk/02.png', x: 4, y: 8, width: 12, height: 20 },
  ]);
  document.clips[0].canvasSize = { width: 40, height: 48 };
  const metadata = {
    spritesheet: { path: 'walk.png' },
    cell_size: { width: 16, height: 16 },
    sheet_size: { width: 16, height: 16 },
    columns: 1,
    rows: [{ row: 0, type: 'walk', frame_count: 1, animation_group_id: 'walk', direction: 'row-1' }],
  };

  const selection = selectFramesForGroupAndDirection(document, metadata, 'walk', 'Frames');

  assert.equal(selection.frameCount, 2);
  assert.equal(selection.direction, 'Frames');
  assert.deepEqual([selection.canvasWidth, selection.canvasHeight], [40, 48]);
  assert.deepEqual(selection.frames[0].transform, document.clips[0].frames[0].transform);
  assert.deepEqual(selection.frames.map((frame) => [frame.imagePath, frame.x, frame.y, frame.width, frame.height]), [
    ['assets/walk/01.png', 0, 0, 16, 16],
    ['assets/walk/02.png', 4, 8, 12, 20],
  ]);
});

test('frame crop drag supports pixel-exact and grid-snapped selections', () => {
  assert.deepEqual(cropSpriteFrameFromDrag({ x: 5.2, y: 7.8 }, { x: 12.1, y: 20.2 }, 64, 64, 16, false), {
    x: 5, y: 7, width: 8, height: 14,
  });
  assert.deepEqual(cropSpriteFrameFromDrag({ x: 18, y: 18 }, { x: 43, y: 27 }, 64, 64, 16, true), {
    x: 16, y: 16, width: 32, height: 16,
  });
  assert.deepEqual(cropSpriteFrameFromDrag({ x: 60, y: 60 }, { x: 63, y: 63 }, 64, 64, 16, true), {
    x: 48, y: 48, width: 16, height: 16,
  });
});

test('frame transforms and output canvas dimensions are preserved and receive useful defaults', () => {
  const clip = {
    name: 'walk',
    animationGroupId: 'walk',
    fps: 12,
    loop: 'loop',
    canvasSize: { width: 48, height: 64 },
    frames: [{
      image: 'assets/walk.png', x: 4, y: 8, width: 16, height: 20,
      transform: {
        offset: { x: 3, y: -2 },
        stretch: { x: -1.5, y: -0.75 },
        zoom: 2,
        rotation: 35,
        pivot: { x: 0.25, y: 0.8 },
      },
    }],
  };
  const source = {
    format: 'bornengine.spriteanim', version: 1, source: 'assets/walk.spritesheet.json', clips: [clip],
  };
  const checked = validateSpriteAnimationDocument(source);
  assert.equal(checked.ok, true);
  assert.deepEqual(checked.value.clips[0].canvasSize, { width: 48, height: 64 });
  assert.deepEqual(checked.value.clips[0].frames[0].transform, clip.frames[0].transform);
  assert.deepEqual(getSpriteAnimationFrameTransform(checked.value.clips[0].frames[0]), clip.frames[0].transform);
  assert.deepEqual(getSpriteAnimationFrameTransform({ image: 'walk.png', x: 0, y: 0, width: 8, height: 8 }), {
    offset: { x: 0, y: 0 }, stretch: { x: 1, y: 1 }, zoom: 1, rotation: 0, pivot: { x: 0.5, y: 0.5 },
  });
  const olderTransform = validateSpriteAnimationDocument(documentWithFrames([{
    image: 'assets/walk.png', x: 0, y: 0, width: 16, height: 16,
    transform: {
      offset: { x: 1, y: 2 }, stretch: { x: 1, y: 1 }, rotation: 0, pivot: { x: 0.5, y: 0.5 },
    },
  }]));
  assert.equal(olderTransform.ok, true);
  assert.equal(olderTransform.value.clips[0].frames[0].transform.zoom, 1);
  assert.deepEqual(getSpriteAnimationCanvasSize(checked.value.clips[0], { cell_size: { width: 32, height: 32 } }), { width: 48, height: 64 });
  assert.deepEqual(getSpriteAnimationCanvasSize({ ...checked.value.clips[0], canvasSize: undefined }, { cell_size: { width: 32, height: 24 } }), {
    width: 32, height: 24,
  });
});

test('frame transform and output canvas validation rejects invalid geometry', () => {
  const invalid = documentWithFrames([{
    image: 'assets/walk.png', x: 0, y: 0, width: 16, height: 16,
    transform: { stretch: { x: 0, y: 1 }, rotation: Number.NaN, pivot: { x: 1.5, y: 0.5 } },
  }]);
  invalid.clips[0].canvasSize = { width: 0, height: 16 };
  assert.equal(validateSpriteAnimationDocument(invalid).ok, false);
  const invalidZoom = documentWithFrames([{
    image: 'assets/walk.png', x: 0, y: 0, width: 16, height: 16,
    transform: {
      offset: { x: 0, y: 0 }, stretch: { x: -1, y: 1 }, zoom: 0,
      rotation: 0, pivot: { x: 0.5, y: 0.5 },
    },
  }]);
  assert.equal(validateSpriteAnimationDocument(invalidZoom).ok, false);
});
