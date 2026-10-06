const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { createRequire } = require('node:module');
const { test } = require('node:test');
const { transformSync } = require(path.join(__dirname, '..', 'node_modules/esbuild'));

function makeUri(uriPath) {
  return {
    scheme: 'file', authority: '', path: uriPath,
    with(change) { return makeUri(change.path ?? uriPath); },
    toString: () => `file://${uriPath}`,
  };
}

function loadProvider(mocks) {
  const filePath = path.join(__dirname, '..', 'src/animations/spriteAnimationTemplateEditorProvider.ts');
  if (!fs.existsSync(filePath)) return {};
  const source = fs.readFileSync(filePath, 'utf8');
  const { code } = transformSync(source, { loader: 'ts', format: 'cjs', target: 'node18' });
  const module = { exports: {} };
  const localRequire = createRequire(filePath);
  const defaults = {
    './spriteAnimationTemplateSchema': {
      validateSpriteAnimationTemplate: (value) => ({ ok: true, value, diagnostics: [] }),
      validateSpriteAnimationTemplateBinding: () => ({ ok: true, diagnostics: [] }),
      readSpriteAnimationTemplate: (sourceText) => ({ sourceText, result: { ok: true, value: JSON.parse(sourceText), diagnostics: [] } }),
    },
    './spriteAnimationJson': { serializeSpriteAnimationJsonCompact: (value) => JSON.stringify(value) },
    './spriteAnimationTemplateEditorHtml': { buildSpriteAnimationTemplateEditorHtml: () => '<html></html>' },
    './spriteAnimationTemplateCreation': { createSpriteAnimationTemplateDocument: () => ({}) },
    './spriteAnimationCreation': { spriteAnimationFileStem: (value) => value.toLowerCase(), readRasterImageSize: () => null },
    '../shared/workspaceAssets': { workspaceFolderForDocument: () => null },
  };
  new Function('require', 'module', 'exports', code)(
    (specifier) => Object.hasOwn(mocks, specifier) ? mocks[specifier] : Object.hasOwn(defaults, specifier) ? defaults[specifier] : localRequire(specifier),
    module,
    module.exports,
  );
  return module.exports;
}

function png(width, height) {
  const bytes = Buffer.alloc(24);
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]).copy(bytes);
  bytes.writeUInt32BE(width, 16);
  bytes.writeUInt32BE(height, 20);
  return bytes;
}

test('template editor and separate creation flow are exposed', () => {
  const api = loadProvider({});
  assert.equal(typeof api.SpriteAnimationTemplateTextEditorProvider, 'function');
  assert.equal(typeof api.createSpriteAnimationTemplate, 'function');
  assert.ok(api.SPRITE_ANIMATION_TEMPLATE_EDITOR_VIEW_TYPE);
});

test('template editor keeps preview images transient and saves compact validated JSON', async () => {
  const template = {
    format: 'bornengine.spriteanim-template', version: 1, id: 'avatar', name: 'Avatar',
    imageParameters: [{ id: 'base art', required: true, tags: ['actor'] }],
    clips: [{ name: 'idle', fps: 8, loop: 'loop', canvasSize: { width: 32, height: 32 },
      frames: [{ layers: [{ parameter: 'base art', source: { x: 0, y: 0, width: 16, height: 16 } }] }] }],
  };
  const templateUri = makeUri('/project/assets/avatar.spriteanim-template.json');
  const imageUri = makeUri('/tmp/preview.png');
  const workspaceFolder = { uri: makeUri('/project') };
  const files = new Map([[imageUri.path, png(20, 18)]]);
  const messages = [];
  let receive;
  let documentText = JSON.stringify(template, null, 2);
  let writes = 0;
  let opens = [];
  const api = loadProvider({
    './spriteAnimationTemplateSchema': {
      validateSpriteAnimationTemplate: (value) => ({ ok: true, value, diagnostics: [] }),
      validateSpriteAnimationTemplateBinding: () => ({ ok: true, diagnostics: [] }),
      readSpriteAnimationTemplate: (sourceText) => {
        try { return { sourceText, result: { ok: true, value: JSON.parse(sourceText), diagnostics: [] } }; }
        catch { return { sourceText, result: { ok: false, value: null, diagnostics: [{ path: '', code: 'json', message: 'Invalid JSON' }] } }; }
      },
    },
    './spriteAnimationJson': { serializeSpriteAnimationJsonCompact: (value) => JSON.stringify(value) },
    './spriteAnimationTemplateCreation': { createSpriteAnimationTemplateDocument: () => template },
    './spriteAnimationTemplateEditorHtml': { buildSpriteAnimationTemplateEditorHtml: () => '<html></html>' },
    './spriteAnimationCreation': { readRasterImageSize: (_name, bytes) => {
      const data = Buffer.from(bytes); return { width: data.readUInt32BE(16), height: data.readUInt32BE(20) };
    } },
    '../shared/workspaceAssets': { workspaceFolderForDocument: () => workspaceFolder },
  });

  api.SpriteAnimationTemplateTextEditorProvider = api.SpriteAnimationTemplateTextEditorProvider;
  const provider = new api.SpriteAnimationTemplateTextEditorProvider({ extensionUri: makeUri('/extension') }, { set() {} }, {
    Uri: { joinPath: (base, ...parts) => makeUri(path.posix.join(base.path, ...parts)) },
    Range: class Range {}, Diagnostic: class Diagnostic {}, DiagnosticSeverity: { Error: 0 },
    WorkspaceEdit: class WorkspaceEdit { replace(uri, _range, text) { this.uri = uri; this.text = text; } },
    workspace: {
      workspaceFolders: [workspaceFolder], fs: {
        readFile: async (uri) => files.get(uri.path) ?? Buffer.from(''),
        writeFile: async () => { writes++; }, stat: async () => ({}),
      },
      applyEdit: async (edit) => { documentText = edit.text; return true; },
      onDidChangeTextDocument: () => ({ dispose() {} }),
      onDidSaveTextDocument: () => ({ dispose() {} }),
    },
    window: { showOpenDialog: async (options) => { opens.push(options); return [imageUri]; } },
  });
  const panel = {
    webview: {
      options: undefined, html: '', cspSource: 'vscode-webview:', asWebviewUri: (uri) => uri,
      postMessage: async (message) => { messages.push(message); return true; },
      onDidReceiveMessage: (listener) => { receive = listener; return { dispose() {} }; },
    }, onDidDispose() {},
  };
  await provider.resolveCustomTextEditor({ uri: templateUri, getText: () => documentText, positionAt: () => ({ line: 0, character: 0 }), isDirty: false }, panel);
  await receive({ type: 'ready' });
  const initial = messages.at(-1);
  assert.equal(initial.mode, 'template');
  assert.equal(initial.template.imageParameters[0].id, 'base art');
  await receive({ type: 'selectPreviewImages', parameterId: 'base art' });
  const previewMessage = messages.findLast((message) => message.type === 'previewImagesSelected');
  assert.equal(previewMessage.type, 'previewImagesSelected');
  assert.equal(previewMessage.parameterId, 'base art');
  assert.equal(previewMessage.images[0].size.width, 20);
  assert.match(previewMessage.images[0].uri, /^data:image\/png;base64,/);
  assert.equal(JSON.stringify(previewMessage).includes(imageUri.path), false);
  assert.equal(writes, 0, 'choosing a transient preview must not copy or save an image');
  assert.equal(opens[0].canSelectMany, true, 'one parameter can try alternate preview images');

  const changed = structuredClone(template);
  changed.clips[0].frames[0].layers[0].transform = { stretch: { x: -1, y: 1 }, rotation: 13 };
  await receive({ type: 'edit', editId: 1, externalEditGeneration: 0, template: changed });
  assert.equal(documentText.includes('\n'), false, 'visual template saves use compact JSON');
  const saved = JSON.parse(documentText);
  assert.deepEqual(saved.imageParameters[0].tags, ['actor']);
  assert.equal(saved.clips[0].frames[0].layers[0].transform.stretch.x, -1);
  assert.equal(Object.hasOwn(saved.clips[0].frames[0].layers[0], 'visible'), false);
});

test('template creation chooses its own filename and opens the separate template editor', async () => {
  const root = makeUri('/project');
  const target = makeUri('/project/assets/animations/layered-walk.spriteanim-template.json');
  const folder = { uri: root };
  const written = new Map();
  const directories = [];
  const commands = [];
  const api = loadProvider({
    './spriteAnimationTemplateCreation': { createSpriteAnimationTemplateDocument: (name) => ({
      format: 'bornengine.spriteanim-template', version: 1, id: 'layered-walk', name,
      imageParameters: [{ id: 'input-1', required: true }],
      clips: [{ name: 'idle', fps: 8, loop: 'loop', canvasSize: { width: 32, height: 32 },
        frames: [{ layers: [{ parameter: 'input-1', source: { x: 0, y: 0, width: 1, height: 1 } }] }] }],
    }) },
    './spriteAnimationJson': { serializeSpriteAnimationJsonCompact: (value) => JSON.stringify(value) },
    './spriteAnimationCreation': { spriteAnimationFileStem: () => 'layered-walk', readRasterImageSize: () => null },
  });
  const vscodeApi = {
    Uri: { joinPath: (base, ...segments) => makeUri(path.posix.join(base.path, ...segments)) },
    workspace: {
      workspaceFolders: [folder],
      getWorkspaceFolder: (uri) => uri.path === '/project' || uri.path.startsWith('/project/') ? folder : undefined,
      fs: {
        stat: async (uri) => { if (written.has(uri.path)) return {}; throw new Error('missing'); },
        createDirectory: async (uri) => directories.push(uri.path),
        writeFile: async (uri, bytes) => written.set(uri.path, Buffer.from(bytes)),
      },
    },
    window: {
      activeTextEditor: undefined,
      showInputBox: async () => 'Layered Walk',
      showSaveDialog: async (options) => { assert.equal(options.defaultUri.path, target.path); return target; },
      showErrorMessage: async (message) => assert.fail(message),
    },
    commands: { executeCommand: async (...args) => commands.push(args) },
  };
  await api.createSpriteAnimationTemplate(vscodeApi);
  assert.deepEqual(directories, ['/project/assets/animations']);
  const document = JSON.parse(written.get(target.path).toString('utf8'));
  assert.equal(document.format, 'bornengine.spriteanim-template');
  assert.equal(document.name, 'Layered Walk');
  assert.equal(Object.hasOwn(document, 'source'), false);
  assert.equal(written.get(target.path).toString('utf8').includes('\n'), false);
  assert.deepEqual(commands, [['vscode.openWith', target, 'bornengineTools.spriteAnimationTemplateEditor']]);
});

test('template editor page includes every control before its webview script becomes ready', () => {
  const fs = require('node:fs');
  const extensionRoot = path.resolve(__dirname, '..');
  const script = fs.readFileSync(path.join(extensionRoot, 'src/webview/spriteAnimationTemplateEditor.ts'), 'utf8');
  const htmlPath = path.join(extensionRoot, 'src/animations/spriteAnimationTemplateEditorHtml.ts');
  const htmlSource = fs.readFileSync(htmlPath, 'utf8');
  const { code } = transformSync(htmlSource, { loader: 'ts', format: 'cjs', target: 'node18' });
  const htmlModule = { exports: {} };
  new Function('module', 'exports', code)(htmlModule, htmlModule.exports);
  const html = htmlModule.exports.buildSpriteAnimationTemplateEditorHtml(
    { cspSource: 'vscode-webview:' },
    { toString: () => 'vscode-webview:/spriteAnimationTemplateEditor.js' },
    { toString: () => 'vscode-webview:/spriteAnimationTemplateEditor.css' },
    'test-nonce',
  );
  const ids = new Set([...html.matchAll(/\sid="([^"]+)"/g)].map((match) => match[1]));
  const requiredIds = [...script.matchAll(/getElement<[^>]+>\('#([^']+)'\)/g)].map((match) => match[1]);
  assert.ok(requiredIds.length > 0);
  assert.deepEqual(requiredIds.filter((id) => !ids.has(id)), []);
  assert.match(html, /id="input-list"/);
  assert.match(html, /id="layer-stretch-x"/);
  assert.match(html, /id="atlas-canvas"/);
});
