const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { createRequire } = require('node:module');
const { readFileSync } = require('node:fs');
const { test } = require('node:test');

const extensionRoot = path.resolve(__dirname, '..');
const providerPath = path.join(extensionRoot, 'src/maps/world2dEditorProvider.ts');
const { transformSync } = require(path.join(extensionRoot, 'node_modules/esbuild'));

function loadProvider() {
  const source = fs.readFileSync(providerPath, 'utf8');
  const { code } = transformSync(source, { loader: 'ts', format: 'cjs', target: 'node18' });
  const module = { exports: {} };
  const localRequire = createRequire(providerPath);
  const mockedModules = {
    '@bornengine/engine/world2d/editor': {
      formatWorld2DDiagnostics: () => '',
      serializeWorld2D: (document) => ({ ok: true, json: JSON.stringify(document) }),
      validateWorld2D: () => ({ ok: true, diagnostics: [] }),
    },
    './mapEditorHtml': { buildMapEditorHtml: () => '<html></html>' },
    './world2dEdits': { applyWorld2DEdit: (document) => document },
    './world2dDocument': {
      parseWorld2DText: (text) => ({
        document: JSON.parse(text),
        diagnostics: [],
        formattedDiagnostics: '',
        editable: true,
      }),
    },
    '../shared/workspaceAssets': {
      resolveWorkspaceAsset: () => undefined,
      workspaceFolderForDocument: () => undefined,
      workspaceRelativeAssetPath: () => undefined,
    },
  };
  const sourceRequire = (specifier) => mockedModules[specifier] ?? localRequire(specifier);
  new Function('require', 'module', 'exports', code)(sourceRequire, module, module.exports);
  return module.exports.World2DTextEditorProvider;
}

function createEditorHarness() {
  const sentMessages = [];
  const pendingPosts = [];
  let receiveMessage;
  const uri = { path: '/game/new-map.world2d.json', toString: () => 'file:///game/new-map.world2d.json' };
  const documentData = {
    format: 'bornengine.world2d',
    version: 1,
    id: 'new-map',
    name: 'new map',
    assets: [],
    tilesets: [],
    layers: [],
    metadata: {},
  };
  const document = {
    uri,
    getText: () => JSON.stringify(documentData),
    positionAt: () => ({ line: 0, character: 0 }),
  };
  const diagnostics = { set() {} };
  const api = {
    Uri: {
      joinPath: (...parts) => ({ toString: () => parts.map((part) => String(part)).join('/') }),
    },
    Range: class Range {},
    Diagnostic: class Diagnostic {},
    DiagnosticSeverity: { Error: 0 },
    workspace: {
      workspaceFolders: [],
      fs: { stat: async () => undefined },
      onDidChangeTextDocument: () => ({ dispose() {} }),
    },
    window: {},
  };
  const panel = {
    webview: {
      options: undefined,
      html: '',
      asWebviewUri: (value) => ({ toString: () => `webview:${value.toString()}` }),
      postMessage: (message) => {
        sentMessages.push(message);
        return new Promise((resolve) => pendingPosts.push(resolve));
      },
      onDidReceiveMessage: (listener) => {
        receiveMessage = listener;
        return { dispose() {} };
      },
    },
    onDidDispose() {},
  };
  const provider = new (loadProvider())({ extensionUri: {} }, diagnostics, api);

  return {
    document,
    panel,
    provider,
    receive: (message) => receiveMessage?.(message),
    sentMessages,
    releasePosts: () => pendingPosts.splice(0).forEach((resolve) => resolve(true)),
  };
}

test('opens the map editor before sending its document and syncs after webview readiness', async () => {
  const harness = createEditorHarness();
  const resolution = harness.provider.resolveCustomTextEditor(harness.document, harness.panel);
  const pendingHandlers = [];

  try {
    await new Promise((resolve) => setImmediate(resolve));
    assert.equal(harness.sentMessages.length, 0, 'document sync waits until the webview reports ready');
    await resolution;

    const readyHandler = harness.receive({ type: 'ready' });
    if (readyHandler) pendingHandlers.push(readyHandler);
    await new Promise((resolve) => setImmediate(resolve));

    assert.deepEqual(harness.sentMessages.map((message) => message.type), ['document']);
  } finally {
    harness.releasePosts();
    await Promise.allSettled([resolution, ...pendingHandlers]);
  }
});

test('map editor exposes the tileset canvas, multi-select workflow, and bucket tool', () => {
  const htmlPath = path.join(extensionRoot, 'src/maps/mapEditorHtml.ts');
  const source = readFileSync(htmlPath, 'utf8');
  const { code } = transformSync(source, { loader: 'ts', format: 'cjs', target: 'node18' });
  const module = { exports: {} };
  new Function('module', 'exports', code)(module, module.exports);
  const html = module.exports.buildMapEditorHtml({ cspSource: 'vscode-resource:' }, { toString: () => 'webview.js' }, { toString: () => 'webview.css' }, 'nonce');
  assert.match(html, /data-tool="bucket"/);
  assert.match(html, /id="tileset-canvas"/);
  assert.match(html, /id="tile-selection-label"/);
  assert.doesNotMatch(html, /palette-grid/);
});

test('tileset palette supports a larger image with horizontal scrolling', () => {
  const css = readFileSync(path.join(extensionRoot, 'src/maps/mapEditor.css'), 'utf8');
  assert.match(css, /\.tileset-image-viewport\s*\{[^}]*overflow-x:\s*auto/s);
  assert.doesNotMatch(css, /#tileset-canvas\s*\{[^}]*max-width:\s*100%/s);
});

test('map editor previews and commits a multi-tile stamp as one operation', () => {
  const source = readFileSync(path.join(extensionRoot, 'src/webview/mapEditor.ts'), 'utf8');
  assert.match(source, /function drawTileStampPreview\(/);
  assert.match(source, /type: 'paintTiles', layerId: layer\.id, tiles/);
});
