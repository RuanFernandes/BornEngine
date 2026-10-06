const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { createRequire } = require('node:module');
const { test } = require('node:test');
const { transformSync } = require(path.join(__dirname, '..', 'node_modules/esbuild'));

function makeUri(uriPath) {
  return { path: uriPath, toString: () => `file://${uriPath}` };
}

function loadProvider() {
  const providerPath = path.join(__dirname, '..', 'src/animations/spriteAnimationEditorProvider.ts');
  const source = fs.readFileSync(providerPath, 'utf8');
  const { code } = transformSync(source, { loader: 'ts', format: 'cjs', target: 'node18' });
  const module = { exports: {} };
  const localRequire = createRequire(providerPath);
  const mocks = {
    './spriteAnimationSchema': {
      validateSpriteAnimationDocument: () => ({ ok: false, value: null, diagnostics: [] }),
      validateSpriteSheetCharacterMetadata: () => ({ ok: false, value: null, diagnostics: [] }),
    },
    './animationEditorHtml': { buildAnimationEditorHtml: () => '<html></html>' },
    './spriteAnimationJson': { serializeSpriteAnimationJsonCompact: JSON.stringify },
    './spriteAnimationCreation': {
      createSpriteAnimationAssets() {},
      parseFrameSize() {},
      readRasterImageSize() {},
      spriteAnimationFileStem() {},
    },
    '../shared/workspaceAssets': {
      resolveDocumentRelativeWorkspaceAsset() {},
      resolveWorkspaceAsset() {},
      workspaceFolderForDocument() {},
      workspaceRelativeAssetPath() {},
    },
  };
  const sourceRequire = (specifier) => mocks[specifier] ?? localRequire(specifier);
  new Function('require', 'module', 'exports', code)(sourceRequire, module, module.exports);
  return module.exports.SpriteAnimationTextEditorProvider;
}

test('animation editor waits for the webview ready message before sending its document', async () => {
  const messages = [];
  let receive;
  const document = {
    uri: makeUri('/project/walk.spriteanim.json'),
    getText: () => '{ invalid json',
    positionAt: () => ({ line: 0, character: 0 }),
  };
  const api = {
    Uri: { joinPath: (_base, ...parts) => makeUri(`/extension/${parts.join('/')}`) },
    Range: class Range {},
    Diagnostic: class Diagnostic {},
    DiagnosticSeverity: { Error: 0 },
    workspace: {
      workspaceFolders: [],
      onDidChangeTextDocument: () => ({ dispose() {} }),
      onDidSaveTextDocument: () => ({ dispose() {} }),
    },
  };
  const panel = {
    webview: {
      options: undefined,
      html: '',
      asWebviewUri: (uri) => uri,
      postMessage: (message) => { messages.push(message); return Promise.resolve(true); },
      onDidReceiveMessage: (listener) => { receive = listener; return { dispose() {} }; },
    },
    onDidDispose() {},
  };
  const diagnostics = { set() {} };
  const Provider = loadProvider();
  const provider = new Provider({ extensionUri: makeUri('/extension') }, diagnostics, api);

  await provider.resolveCustomTextEditor(document, panel);
  assert.equal(messages.length, 0, 'initial document delivery must wait until the webview has installed its listener');

  await receive({ type: 'ready' });
  assert.deepEqual(messages.map((message) => message.type), ['document']);
});

test('animation editor HTML contains every control required before it posts ready', () => {
  const editorSource = fs.readFileSync(path.join(__dirname, '..', 'src/webview/animationEditor.ts'), 'utf8');
  const htmlPath = path.join(__dirname, '..', 'src/animations/animationEditorHtml.ts');
  const htmlSource = fs.readFileSync(htmlPath, 'utf8');
  const { code } = transformSync(htmlSource, { loader: 'ts', format: 'cjs', target: 'node18' });
  const htmlModule = { exports: {} };
  new Function('module', 'exports', code)(htmlModule, htmlModule.exports);
  const html = htmlModule.exports.buildAnimationEditorHtml(
    { cspSource: 'vscode-webview:' },
    { toString: () => 'vscode-webview:/animationEditor.js' },
    { toString: () => 'vscode-webview:/animationEditor.css' },
    'test-nonce',
  );
  const ids = new Set([...html.matchAll(/\sid="([^"]+)"/g)].map((match) => match[1]));
  const requiredIds = [...editorSource.matchAll(/getElement<[^>]+>\('#([^']+)'\)/g)].map((match) => match[1]);

  assert.ok(requiredIds.length > 0);
  assert.deepEqual(requiredIds.filter((id) => !ids.has(id)), []);
  assert.match(html, /id="frame-list"/);
  assert.match(editorSource, /className = 'frame-thumb'/);
  assert.match(html, /id="frame-rotation-range"/);
});
