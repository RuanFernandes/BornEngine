const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { test } = require('node:test');
const { createRequire } = require('node:module');
const { transformSync } = require(path.join(__dirname, '..', 'node_modules/esbuild'));

function loadCreationHelpers() {
  const sourcePath = path.join(__dirname, '..', 'src/animations/spriteAnimationCreation.ts');
  const source = fs.readFileSync(sourcePath, 'utf8');
  const { code } = transformSync(source, { loader: 'ts', format: 'cjs', target: 'node18' });
  const module = { exports: {} };
  new Function('module', 'exports', code)(module, module.exports);
  return module.exports;
}

const { readRasterImageSize, parseFrameSize, spriteAnimationFileStem, createSpriteAnimationAssets } = loadCreationHelpers();

function loadAnimationSchema() {
  const sourcePath = path.join(__dirname, '..', 'src/animations/spriteAnimationSchema.ts');
  const source = fs.readFileSync(sourcePath, 'utf8');
  const { code } = transformSync(source, { loader: 'ts', format: 'cjs', target: 'node18' });
  const module = { exports: {} };
  new Function('module', 'exports', code)(module, module.exports);
  return module.exports;
}

test('reads sprite sheet dimensions from PNG, GIF, and JPEG headers', () => {
  const png = Buffer.alloc(24);
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]).copy(png);
  png.writeUInt32BE(128, 16);
  png.writeUInt32BE(64, 20);
  assert.deepEqual(readRasterImageSize('sheet.png', png), { width: 128, height: 64 });

  const gif = Buffer.alloc(10);
  Buffer.from('GIF89a').copy(gif);
  gif.writeUInt16LE(48, 6);
  gif.writeUInt16LE(32, 8);
  assert.deepEqual(readRasterImageSize('sheet.gif', gif), { width: 48, height: 32 });

  const jpeg = Buffer.from([0xff, 0xd8, 0xff, 0xc0, 0x00, 0x11, 0x08, 0x00, 0x20, 0x00, 0x30, 0x03, 0x01, 0x11, 0x00, 0x02, 0x11, 0x00, 0x03, 0x11, 0x00, 0xff, 0xd9]);
  assert.deepEqual(readRasterImageSize('sheet.jpg', jpeg), { width: 48, height: 32 });
});

test('validates frame size against the selected sheet', () => {
  assert.deepEqual(parseFrameSize('16 x 32', { width: 128, height: 64 }), { width: 16, height: 32 });
  assert.equal(parseFrameSize('0x16', { width: 128, height: 64 }), null);
  assert.equal(parseFrameSize('200x16', { width: 128, height: 64 }), null);
  assert.equal(parseFrameSize('16', { width: 128, height: 64 }), null);
});

test('builds a named clip and spritesheet metadata for each complete row', () => {
  const assets = createSpriteAnimationAssets({
    name: 'walk cycle',
    imageRelativePath: 'hero.png',
    metadataPath: 'assets/hero/walk-cycle.spritesheet.json',
    imageSize: { width: 96, height: 64 },
    frameSize: { width: 32, height: 32 },
  });
  assert.equal(spriteAnimationFileStem('walk cycle'), 'walk-cycle');
  assert.deepEqual(assets.metadata, {
    spritesheet: { path: 'hero.png' },
    cell_size: { width: 32, height: 32 },
    sheet_size: { width: 96, height: 64 },
    columns: 3,
    rows: [
      { row: 0, type: 'walk cycle', frame_count: 3, animation_group_id: 'walk cycle', direction: 'row-1' },
      { row: 1, type: 'walk cycle', frame_count: 3, animation_group_id: 'walk cycle', direction: 'row-2' },
    ],
  });
  assert.deepEqual(assets.animation.clips, [{ name: 'walk cycle', animationGroupId: 'walk cycle', fps: 12, loop: 'loop' }]);
  assert.equal(assets.animation.source, 'assets/hero/walk-cycle.spritesheet.json');
  assert.equal(loadAnimationSchema().validateSpriteAnimationDocument(assets.animation).ok, true);
  assert.equal(loadAnimationSchema().validateSpriteSheetCharacterMetadata(assets.metadata, { width: 96, height: 64 }).ok, true);
});

test('creation asks for an animation name, chooses an image, and writes its JSON companion', async () => {
  const providerPath = path.join(__dirname, '..', 'src/animations/spriteAnimationEditorProvider.ts');
  const source = fs.readFileSync(providerPath, 'utf8');
  const { code } = transformSync(source, { loader: 'ts', format: 'cjs', target: 'node18' });
  const module = { exports: {} };
  const imageUri = makeUri('/project/assets/hero.png');
  const rootUri = makeUri('/project');
  const workspaceFolder = { uri: rootUri };
  const writtenFiles = new Map();
  const openedDocuments = [];
  const inputOptions = [];
  const openOptions = [];
  let inputIndex = 0;
  const imageBytes = Buffer.alloc(24);
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]).copy(imageBytes);
  imageBytes.writeUInt32BE(96, 16);
  imageBytes.writeUInt32BE(64, 20);

  const api = {
    Uri: {
      joinPath: (base, ...segments) => makeUri(path.posix.join(base.path, ...segments)),
    },
    workspace: {
      workspaceFolders: [workspaceFolder],
      getWorkspaceFolder: (uri) => uri.path.startsWith('/project/') || uri.path === '/project' ? workspaceFolder : undefined,
      fs: {
        readFile: async (uri) => uri.path === imageUri.path ? imageBytes : writtenFiles.get(uri.path),
        stat: async (uri) => {
          if (uri.path === imageUri.path || writtenFiles.has(uri.path)) return {};
          throw new Error('missing');
        },
        writeFile: async (uri, contents) => writtenFiles.set(uri.path, Buffer.from(contents)),
        delete: async (uri) => writtenFiles.delete(uri.path),
      },
    },
    window: {
      activeTextEditor: undefined,
      showInputBox: async (options) => {
        inputOptions.push(options);
        return ['walk', '32x32'][inputIndex++];
      },
      showQuickPick: async () => ({ value: 'sheet' }),
      showOpenDialog: async (options) => {
        openOptions.push(options);
        return [imageUri];
      },
      showErrorMessage: async (message) => { throw new Error(message); },
    },
    commands: {
      executeCommand: async (...args) => openedDocuments.push(args),
    },
  };

  const helperModulePath = path.join(__dirname, '..', 'src/animations/spriteAnimationCreation.ts');
  const helperSource = fs.readFileSync(helperModulePath, 'utf8');
  const { code: helperCode } = transformSync(helperSource, { loader: 'ts', format: 'cjs', target: 'node18' });
  const helpers = { exports: {} };
  new Function('module', 'exports', helperCode)(helpers, helpers.exports);
  const localRequire = createRequire(providerPath);
  const mocked = {
    './spriteAnimationSchema': {
      SPRITE_ANIMATION_DOCUMENT_FORMAT: 'bornengine.spriteanim',
      SPRITE_ANIMATION_DOCUMENT_VERSION: 1,
      validateSpriteAnimationDocument: () => ({ ok: true, diagnostics: [] }),
      validateSpriteSheetCharacterMetadata: () => ({ ok: true, diagnostics: [] }),
    },
    './animationEditorHtml': { buildAnimationEditorHtml: () => '' },
    './spriteAnimationJson': { serializeSpriteAnimationJsonCompact: JSON.stringify },
    './spriteAnimationCreation': helpers.exports,
    '../shared/workspaceAssets': {
      resolveDocumentRelativeWorkspaceAsset: () => imageUri,
      resolveWorkspaceAsset: () => imageUri,
      workspaceFolderForDocument: () => workspaceFolder,
      workspaceRelativeAssetPath: (documentUri, assetUri) => assetUri.path.replace('/project/', ''),
    },
  };
  const sourceRequire = (specifier) => mocked[specifier] ?? localRequire(specifier);
  new Function('require', 'module', 'exports', code)(sourceRequire, module, module.exports);

  await module.exports.createSpriteAnimationCompanion(api);

  assert.equal(inputOptions.length, 2, 'asks for the clip name and frame size before creating files');
  assert.equal(inputOptions[0].prompt, 'Animation name');
  assert.ok(openOptions[0].filters.Images);
  assert.equal(Object.keys(openOptions[0].filters).some((label) => label.includes('JSON')), false);
  assert.equal(writtenFiles.size, 2);
  const metadata = JSON.parse(writtenFiles.get('/project/assets/walk.spritesheet.json').toString());
  const animation = JSON.parse(writtenFiles.get('/project/assets/walk.spriteanim.json').toString());
  assert.equal(metadata.spritesheet.path, 'hero.png');
  assert.equal(metadata.cell_size.width, 32);
  assert.equal(animation.clips[0].name, 'walk');
  assert.equal(openedDocuments[0][0], 'vscode.openWith');
  assert.equal(openedDocuments[0][1].path, '/project/assets/walk.spriteanim.json');
  assert.equal(openedDocuments[0][2], 'bornengineTools.spriteAnimationEditor');
});

test('creation can turn multiple selected images into an ordered animation frame sequence', async () => {
  const providerPath = path.join(__dirname, '..', 'src/animations/spriteAnimationEditorProvider.ts');
  const source = fs.readFileSync(providerPath, 'utf8');
  const { code } = transformSync(source, { loader: 'ts', format: 'cjs', target: 'node18' });
  const module = { exports: {} };
  const firstUri = makeUri('/project/assets/walk-01.png');
  const secondUri = makeUri('/project/assets/walk-02.png');
  const rootUri = makeUri('/project');
  const workspaceFolder = { uri: rootUri };
  const writtenFiles = new Map();
  const openedDocuments = [];
  const selectedDialogOptions = [];
  const png = (width, height) => {
    const bytes = Buffer.alloc(24);
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]).copy(bytes);
    bytes.writeUInt32BE(width, 16);
    bytes.writeUInt32BE(height, 20);
    return bytes;
  };
  const imageBytes = new Map([[firstUri.path, png(24, 32)], [secondUri.path, png(20, 32)]]);

  const api = {
    Uri: { joinPath: (base, ...segments) => makeUri(path.posix.join(base.path, ...segments)) },
    workspace: {
      workspaceFolders: [workspaceFolder],
      getWorkspaceFolder: (uri) => uri.path.startsWith('/project/') || uri.path === '/project' ? workspaceFolder : undefined,
      fs: {
        readFile: async (uri) => imageBytes.get(uri.path) ?? writtenFiles.get(uri.path),
        stat: async (uri) => {
          if (imageBytes.has(uri.path) || writtenFiles.has(uri.path)) return {};
          throw new Error('missing');
        },
        writeFile: async (uri, contents) => writtenFiles.set(uri.path, Buffer.from(contents)),
        delete: async (uri) => writtenFiles.delete(uri.path),
      },
    },
    window: {
      activeTextEditor: undefined,
      showInputBox: async () => 'run',
      showQuickPick: async () => ({ value: 'sequence' }),
      showOpenDialog: async (options) => {
        selectedDialogOptions.push(options);
        return [firstUri, secondUri];
      },
      showErrorMessage: async (message) => { throw new Error(message); },
    },
    commands: { executeCommand: async (...args) => openedDocuments.push(args) },
  };

  const helperPath = path.join(__dirname, '..', 'src/animations/spriteAnimationCreation.ts');
  const helperSource = fs.readFileSync(helperPath, 'utf8');
  const { code: helperCode } = transformSync(helperSource, { loader: 'ts', format: 'cjs', target: 'node18' });
  const helpers = { exports: {} };
  new Function('module', 'exports', helperCode)(helpers, helpers.exports);
  const localRequire = createRequire(providerPath);
  const mocked = {
    './spriteAnimationSchema': {
      SPRITE_ANIMATION_DOCUMENT_FORMAT: 'bornengine.spriteanim',
      SPRITE_ANIMATION_DOCUMENT_VERSION: 1,
      validateSpriteAnimationDocument: () => ({ ok: true, diagnostics: [] }),
      validateSpriteSheetCharacterMetadata: () => ({ ok: true, diagnostics: [] }),
    },
    './animationEditorHtml': { buildAnimationEditorHtml: () => '' },
    './spriteAnimationJson': { serializeSpriteAnimationJsonCompact: JSON.stringify },
    './spriteAnimationCreation': helpers.exports,
    '../shared/workspaceAssets': {
      resolveDocumentRelativeWorkspaceAsset: () => firstUri,
      resolveWorkspaceAsset: () => firstUri,
      workspaceFolderForDocument: () => workspaceFolder,
      workspaceRelativeAssetPath: (_documentUri, assetUri) => assetUri.path.replace('/project/', ''),
    },
  };
  const sourceRequire = (specifier) => mocked[specifier] ?? localRequire(specifier);
  new Function('require', 'module', 'exports', code)(sourceRequire, module, module.exports);

  await module.exports.createSpriteAnimationCompanion(api);

  assert.equal(selectedDialogOptions[0].canSelectMany, true);
  const animation = JSON.parse(writtenFiles.get('/project/assets/run.spriteanim.json').toString());
  assert.deepEqual(animation.clips[0].frames, [
    { image: 'assets/walk-01.png', x: 0, y: 0, width: 24, height: 32, name: 'walk-01' },
    { image: 'assets/walk-02.png', x: 0, y: 0, width: 20, height: 32, name: 'walk-02' },
  ]);
  assert.equal(openedDocuments[0][1].path, '/project/assets/run.spriteanim.json');
});

function makeUri(uriPath) {
  return {
    scheme: 'file',
    authority: '',
    path: uriPath,
    with(change) { return makeUri(change.path ?? uriPath); },
    toString() { return `file://${uriPath}`; },
  };
}
