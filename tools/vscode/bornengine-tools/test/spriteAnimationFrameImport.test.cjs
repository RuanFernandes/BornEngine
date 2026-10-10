const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { createRequire } = require('node:module');
const { test } = require('node:test');
const { transformSync } = require(path.join(__dirname, '..', 'node_modules/esbuild'));

function makeUri(uriPath) {
  return {
    scheme: 'file',
    authority: '',
    path: uriPath,
    with(change) { return makeUri(change.path ?? uriPath); },
    toString() { return 'file://' + uriPath; },
  };
}

function loadProvider(mocks) {
  const providerPath = path.join(__dirname, '..', 'src/animations/spriteAnimationEditorProvider.ts');
  const source = fs.readFileSync(providerPath, 'utf8');
  const { code } = transformSync(source, { loader: 'ts', format: 'cjs', target: 'node18' });
  const module = { exports: {} };
  const localRequire = createRequire(providerPath);
  const defaultMocks = {
    './spriteAnimationJson': { serializeSpriteAnimationJsonCompact: JSON.stringify },
    ...mocks,
  };
  new Function('require', 'module', 'exports', code)(
    (specifier) => defaultMocks[specifier] ?? localRequire(specifier),
    module,
    module.exports,
  );
  return module.exports.SpriteAnimationTextEditorProvider;
}

function png(width, height) {
  const bytes = Buffer.alloc(24);
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]).copy(bytes);
  bytes.writeUInt32BE(width, 16);
  bytes.writeUInt32BE(height, 20);
  return bytes;
}

test('Add Images returns every selected image and copies external images into the workspace', async () => {
  const root = makeUri('/project');
  const documentUri = makeUri('/project/assets/run.spriteanim.json');
  const metadataUri = makeUri('/project/assets/run.spritesheet.json');
  const baseImageUri = makeUri('/project/assets/run.png');
  const inWorkspaceImageUri = makeUri('/project/assets/extra.png');
  const externalImageUri = makeUri('/tmp/extra.png');
  const selectedUris = [inWorkspaceImageUri, externalImageUri];
  const documentData = {
    format: 'bornengine.spriteanim',
    version: 1,
    source: 'assets/run.spritesheet.json',
    clips: [{ name: 'run', animationGroupId: 'run', fps: 12, loop: 'loop' }],
  };
  const metadataData = {
    spritesheet: { path: 'run.png' },
    cell_size: { width: 32, height: 32 },
    sheet_size: { width: 32, height: 32 },
    columns: 1,
    rows: [{ row: 0, type: 'run', frame_count: 1, animation_group_id: 'run', direction: 'right' }],
  };
  const files = new Map([
    [metadataUri.path, Buffer.from(JSON.stringify(metadataData))],
    [inWorkspaceImageUri.path, png(16, 16)],
    [externalImageUri.path, png(20, 24)],
  ]);
  const directories = new Set();
  const messages = [];
  const diagnostics = { set() {} };
  let receive;
  let dialogOptions;
  let documentText = JSON.stringify(documentData);

  const workspaceFolder = { uri: root };
  const workspaceAssets = {
    resolveDocumentRelativeWorkspaceAsset: (_doc, relative) => relative === 'run.png' ? baseImageUri : metadataUri,
    resolveWorkspaceAsset: (_doc, relative) => makeUri('/project/' + relative),
    workspaceFolderForDocument: () => workspaceFolder,
    workspaceRelativeAssetPath: (_doc, asset) => {
      if (asset.path === '/project') return '';
      if (!asset.path.startsWith('/project/')) return null;
      return asset.path.slice('/project/'.length);
    },
  };
  const schema = {
    validateSpriteAnimationDocument: (input) => ({ ok: true, value: input, diagnostics: [] }),
    validateSpriteSheetCharacterMetadata: (input) => ({ ok: true, value: input, diagnostics: [] }),
    spriteAnimationClipFrameLists: (clip, clipPath) => clip.frames === undefined ? [] : [{ path: `${clipPath}/frames`, frames: clip.frames }],
  };
  const creation = {
    createSpriteAnimationAssets() {},
    parseFrameSize() {},
    readRasterImageSize: (_file, bytes) => {
      const buffer = Buffer.from(bytes);
      return { width: buffer.readUInt32BE(16), height: buffer.readUInt32BE(20) };
    },
    spriteAnimationFileStem() {},
  };
  const Provider = loadProvider({
    './spriteAnimationSchema': schema,
    './animationEditorHtml': { buildAnimationEditorHtml: () => '<html></html>' },
    './spriteAnimationCreation': creation,
    '../shared/workspaceAssets': workspaceAssets,
  });

  const api = {
    Uri: {
      joinPath: (base, ...segments) => makeUri(path.posix.join(base.path, ...segments)),
    },
    Range: class Range {},
    Diagnostic: class Diagnostic {},
    DiagnosticSeverity: { Error: 0 },
    WorkspaceEdit: class WorkspaceEdit {
      replace(uri, _range, text) { this.uri = uri; this.text = text; }
    },
    workspace: {
      workspaceFolders: [workspaceFolder],
      fs: {
        readFile: async (uri) => {
          const value = files.get(uri.path);
          if (!value) throw new Error('missing file');
          return value;
        },
        stat: async (uri) => {
          if (uri.path === baseImageUri.path || files.has(uri.path) || directories.has(uri.path)) return {};
          throw new Error('missing file');
        },
        createDirectory: async (uri) => directories.add(uri.path),
        writeFile: async (uri, contents) => files.set(uri.path, Buffer.from(contents)),
        delete: async (uri) => files.delete(uri.path),
      },
      applyEdit: async (edit) => {
        assert.equal(edit.uri.path, documentUri.path);
        documentText = edit.text;
        return true;
      },
      onDidChangeTextDocument: () => ({ dispose() {} }),
      onDidSaveTextDocument: () => ({ dispose() {} }),
    },
    window: {
      showOpenDialog: async (options) => {
        dialogOptions = options;
        return selectedUris;
      },
    },
  };
  const panel = {
    webview: {
      options: undefined,
      html: '',
      cspSource: 'vscode-webview:',
      asWebviewUri: (uri) => uri,
      postMessage: async (message) => { messages.push(message); return true; },
      onDidReceiveMessage: (listener) => { receive = listener; return { dispose() {} }; },
    },
    onDidDispose() {},
  };
  const provider = new Provider({ extensionUri: makeUri('/extension') }, diagnostics, api);

  await provider.resolveCustomTextEditor({
    uri: documentUri,
    getText: () => documentText,
    positionAt: () => ({ line: 0, character: 0 }),
    isDirty: false,
  }, panel);
  await receive({ type: 'ready' });
  await receive({ type: 'imageSize', width: 32, height: 32 });
  await receive({ type: 'selectFrameImages' });

  assert.equal(dialogOptions.canSelectMany, true);
  const result = messages.at(-1);
  assert.equal(result.type, 'frameImagesSelected');
  assert.deepEqual(result.images.map((image) => [image.path, image.size]), [
    ['assets/extra.png', { width: 16, height: 16 }],
    ['assets/run-frames/extra.png', { width: 20, height: 24 }],
  ]);
  assert.ok(directories.has('/project/assets/run-frames'));
  assert.deepEqual(files.get('/project/assets/run-frames/extra.png'), png(20, 24));
});
