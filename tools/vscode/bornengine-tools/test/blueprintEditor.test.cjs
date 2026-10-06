const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { createRequire } = require('node:module');
const { test } = require('node:test');
const { transformSync } = require(path.join(__dirname, '..', 'node_modules/esbuild'));

const extensionRoot = path.resolve(__dirname, '..');

function makeUri(uriPath) {
  return {
    path: uriPath,
    scheme: 'file',
    authority: '',
    toString: () => `file://${uriPath}`,
    with(changes) { return makeUri(changes.path ?? uriPath); },
  };
}

function loadTypeScript(relativePath, mocks = {}) {
  const modulePath = path.join(extensionRoot, relativePath);
  const source = fs.readFileSync(modulePath, 'utf8');
  const { code } = transformSync(source, { loader: 'ts', format: 'cjs', target: 'node18' });
  const module = { exports: {} };
  const localRequire = createRequire(modulePath);
  const sourceRequire = (specifier) => Object.hasOwn(mocks, specifier) ? mocks[specifier] : localRequire(specifier);
  new Function('require', 'module', 'exports', code)(sourceRequire, module, module.exports);
  return module.exports;
}

const template = {
  format: 'bornengine.blueprint-template',
  version: 1,
  id: 'rpg.spell',
  revision: 2,
  name: 'Spell',
  fields: [
    { id: 'title', label: 'Title', type: 'string', required: true },
    { id: 'power', label: 'Power', type: 'integer', defaultValue: 12, minimum: 1 },
    { id: 'flags', label: 'Flags', type: 'object', properties: [{ id: 'fire', label: 'Fire', type: 'boolean', defaultValue: true }] },
    { id: 'tags', label: 'Tags', type: 'array', items: { type: 'string' } },
  ],
  events: [{ id: 'onCast', label: 'On Cast', operationId: 'spell.cast', parameters: [], outputPin: { id: 'then', label: 'Then' } }],
  nodes: [
    { id: 'damage', label: 'Deal Damage', category: 'action', operationId: 'spell.damage', parameters: [{ id: 'amount', label: 'Amount', type: 'integer', defaultValue: 12 }], inputs: [{ id: 'in', label: 'In' }], outputs: [{ id: 'out', label: 'Out' }] },
    { id: 'target', label: 'Has Target?', category: 'condition', operationId: 'spell.hasTarget', parameters: [], inputs: [{ id: 'in', label: 'In' }], outputs: [{ id: 'yes', label: 'Yes', branch: 'true' }, { id: 'no', label: 'No', branch: 'false' }] },
  ],
};

const blueprint = {
  format: 'bornengine.blueprint',
  version: 1,
  id: 'fireball',
  name: 'Fireball',
  template: { id: 'rpg.spell', revision: 2 },
  fields: { title: 'Fireball', power: 12, flags: { fire: true }, tags: [] },
  graph: {
    nodes: [
      { instanceId: 'cast', kind: 'event', definitionId: 'onCast', position: { x: 40, y: 60 }, parameters: {} },
      { instanceId: 'damage-node', kind: 'node', definitionId: 'damage', position: { x: 340, y: 60 }, parameters: { amount: 12 } },
      { instanceId: 'target-check', kind: 'node', definitionId: 'target', position: { x: 640, y: 60 }, parameters: {} },
    ],
    connections: [
      { from: { nodeId: 'cast', pinId: 'then' }, to: { nodeId: 'damage-node', pinId: 'in' } },
      { from: { nodeId: 'damage-node', pinId: 'out' }, to: { nodeId: 'target-check', pinId: 'in' } },
    ],
  },
};

function loadWorkspaceModule(serverModule = {
  discoverBornEngineServers: async () => [],
  pickBornEngineServer: async (_api, servers) => servers[0],
}) {
  const schema = loadTypeScript('src/blueprints/blueprintSchema.ts');
  const json = loadTypeScript('src/blueprints/blueprintJson.ts', { './blueprintSchema': schema });
  return loadTypeScript('src/blueprints/blueprintWorkspace.ts', {
    './blueprintSchema': schema,
    './blueprintJson': json,
    '../shared/extensionIds': {
      BLUEPRINT_EDITOR_VIEW_TYPE: 'bornengineTools.blueprintEditor',
      CREATE_BLUEPRINT_COMMAND: 'bornengineTools.createBlueprint',
    },
    '../shared/workspaceAssets': {
      workspaceFolderForDocument: (uri, folders) => folders.find((folder) => uri.path.startsWith(folder.uri.path)) ?? null,
    },
    '../views/bornEngineProject': { isBornEngineProjectManifest: () => true },
    '../views/bornEngineServers': serverModule,
  });
}

function createBlueprintApi({ destination = 'client', server = undefined, saveUri = undefined } = {}) {
  const written = [];
  const directories = [];
  const opened = [];
  const infos = [];
  const errors = [];
  const quickPicks = [];
  const defaultUris = [];
  const folder = { uri: makeUri('/game'), name: 'game', index: 0 };
  const templateUri = makeUri('/game/.bornengine/blueprint-templates/spell.blueprint-template.json');
  const api = {
    FileType: { File: 1, Directory: 2, SymbolicLink: 64 },
    Uri: { joinPath: (base, ...parts) => makeUri(path.posix.join(base.path, ...parts)) },
    RelativePattern: class RelativePattern { constructor(base, pattern) { this.base = base; this.pattern = pattern; } },
    workspace: {
      workspaceFolders: [folder],
      findFiles: async () => [templateUri],
      fs: {
        async readFile(uri) {
          if (uri.path.endsWith('/package.json')) return Buffer.from('{"dependencies":{"@bornengine/engine":"workspace:*"}}');
          if (uri.path === templateUri.path) return Buffer.from(JSON.stringify(template));
          throw new Error('missing');
        },
        async stat(uri) {
          if (uri.path === templateUri.path) return { type: 1 };
          if (['/game', '/game/.bornengine', '/game/.bornengine/blueprint-templates'].includes(uri.path)) return { type: 2 };
          throw new Error('missing file');
        },
        async createDirectory(uri) { directories.push(uri.path); },
        async writeFile(uri, bytes) { written.push({ uri, text: Buffer.from(bytes).toString('utf8') }); },
      },
    },
    window: {
      async showQuickPick(items, options) {
        quickPicks.push({ items, options });
        if (items.some((item) => item.value === 'server') && destination === 'server') return items.find((item) => item.value === 'server');
        if (items.some((item) => item.template)) return items.find((item) => item.template?.id === template.id);
        return items.find((item) => item.value === 'client');
      },
      async showInputBox(options) { return options.prompt === 'Blueprint ID' ? 'fireball' : 'Fireball'; },
      async showSaveDialog(options) { defaultUris.push(options.defaultUri); return saveUri ?? options.defaultUri; },
      async showInformationMessage(message) { infos.push(message); },
      async showErrorMessage(message) { errors.push(message); },
    },
    commands: { async executeCommand(...args) { opened.push(args); } },
  };
  if (server) {
    api.discoveredServer = server;
  }
  return { api, written, directories, opened, infos, errors, quickPicks, defaultUris };
}

function loadBlueprintEditorProviderModule(templateResult = { template, diagnostics: [] }) {
  const schema = loadTypeScript('src/blueprints/blueprintSchema.ts');
  const json = loadTypeScript('src/blueprints/blueprintJson.ts', { './blueprintSchema': schema });
  const html = loadTypeScript('src/blueprints/blueprintEditorHtml.ts');
  return loadTypeScript('src/blueprints/blueprintEditorProvider.ts', {
    './blueprintSchema': schema,
    './blueprintJson': json,
    './blueprintEditorHtml': html,
    './blueprintWorkspace': {
      findBornEngineProjectRoot: async () => ({ uri: makeUri('/game'), name: 'game', index: 0 }),
      resolveBlueprintTemplate: async () => templateResult,
    },
    '../shared/extensionIds': { BLUEPRINT_EDITOR_VIEW_TYPE: 'bornengineTools.blueprintEditor' },
  });
}

function createEditorHarness(initialText = JSON.stringify(blueprint), templateResult = { template, diagnostics: [] }) {
  const messages = [];
  let receiveMessage;
  let documentChange;
  let text = initialText;
  let applyCount = 0;
  const commandCalls = [];
  const document = {
    uri: makeUri('/game/assets/blueprints/fireball.blueprint.json'),
    getText: () => text,
    positionAt: () => ({ line: 0, character: 0 }),
    get isDirty() { return false; },
  };
  class WorkspaceEdit {
    replace(uri, range, nextText) { this.uri = uri; this.range = range; this.text = nextText; }
  }
  class Diagnostic {
    constructor(range, message, severity) { Object.assign(this, { range, message, severity }); }
  }
  const api = {
    Uri: { joinPath: (base, ...parts) => makeUri(path.posix.join(base.path, ...parts)) },
    Range: class Range {},
    Diagnostic,
    DiagnosticSeverity: { Error: 0 },
    WorkspaceEdit,
    workspace: {
      workspaceFolders: [{ uri: makeUri('/game'), name: 'game', index: 0 }],
      onDidChangeTextDocument(listener) { documentChange = listener; return { dispose() {} }; },
      onDidSaveTextDocument: () => ({ dispose() {} }),
      async applyEdit(edit) { applyCount++; text = edit.text; return true; },
    },
    commands: { async executeCommand(...args) { commandCalls.push(args); } },
  };
  const panel = {
    webview: {
      options: undefined,
      html: '',
      cspSource: 'vscode-webview:',
      asWebviewUri: (uri) => uri,
      async postMessage(message) { messages.push(message); return true; },
      onDidReceiveMessage(listener) { receiveMessage = listener; return { dispose() {} }; },
    },
    onDidDispose() {},
  };
  const diagnostics = { latest: [], set(_uri, values) { this.latest = values; } };
  const module = loadBlueprintEditorProviderModule(templateResult);
  const Provider = module.BlueprintTextEditorProvider;
  const provider = new Provider({ extensionUri: makeUri('/extension') }, diagnostics, api);
  return {
    api, commandCalls, diagnostics, document, messages, panel, provider,
    get applyCount() { return applyCount; },
    setText(value) { text = value; },
    async ready() { await provider.resolveCustomTextEditor(document, panel); await receiveMessage({ type: 'ready' }); },
    async receive(message) { await receiveMessage(message); },
    externalChange() { return documentChange({ document }); },
  };
}

test('blueprint creation writes client documents under assets/blueprints with exact template revision and defaults', async () => {
  const harness = createBlueprintApi();
  const { createBlueprint } = loadWorkspaceModule();

  await createBlueprint(harness.api);

  assert.equal(harness.defaultUris[0].path, '/game/assets/blueprints/fireball.blueprint.json');
  assert.equal(harness.quickPicks[1].items[0].description, '/game/assets/blueprints');
  assert.equal(harness.directories[0], '/game/assets/blueprints');
  const created = JSON.parse(harness.written[0].text);
  assert.deepEqual(created.template, { id: 'rpg.spell', revision: 2 });
  assert.deepEqual(created.fields, { title: '', power: 12, flags: { fire: true } });
  assert.deepEqual(created.graph, { nodes: [], connections: [] });
  assert.deepEqual(harness.opened[0], ['vscode.openWith', harness.written[0].uri, 'bornengineTools.blueprintEditor']);
});

test('blueprint creation can choose the server destination and uses its blueprints folder', async () => {
  const server = {
    markerUri: makeUri('/game/server/bornengine.server.json'),
    serverUri: makeUri('/game/server'),
    name: 'server',
    relativePath: 'server',
  };
  const markerApi = {
    discoverBornEngineServers: async () => [server],
    pickBornEngineServer: async () => server,
  };
  const harness = createBlueprintApi({ destination: 'server', server });
  const { createBlueprint } = loadWorkspaceModule(markerApi);

  await createBlueprint(harness.api);

  assert.equal(harness.defaultUris[0].path, '/game/server/blueprints/fireball.blueprint.json');
  assert.equal(harness.quickPicks[1].items.find((item) => item.value === 'server').description, '/game/server/blueprints');
  assert.equal(harness.directories[0], '/game/server/blueprints');
  assert.equal(harness.written.length, 1);
});

test('blueprint creation rejects a save path outside the selected destination', async () => {
  const harness = createBlueprintApi({ saveUri: makeUri('/outside/fireball.blueprint.json') });
  const { createBlueprint } = loadWorkspaceModule();

  await createBlueprint(harness.api);

  assert.equal(harness.written.length, 0);
  assert.match(harness.errors[0], /save this blueprint under \/game\/assets\/blueprints/i);
});

test('blueprint editor waits for ready and sends its template, document, and diagnostics', async () => {
  const harness = createEditorHarness();
  await harness.provider.resolveCustomTextEditor(harness.document, harness.panel);
  assert.equal(harness.messages.length, 0);
  await harness.receive({ type: 'ready' });

  assert.equal(harness.messages[0].type, 'document');
  assert.equal(harness.messages[0].blueprint.id, 'fireball');
  assert.equal(harness.messages[0].template.id, 'rpg.spell');
  assert.deepEqual(harness.messages[0].diagnostics, '');
});

test('blueprint editor applies edits with VS Code undo and diagnostics, then resyncs external text', async () => {
  const harness = createEditorHarness();
  await harness.ready();
  const updated = structuredClone(blueprint);
  updated.fields.power = 'strong';

  await harness.receive({ type: 'edit', editId: 1, revision: 0, blueprint: updated });

  assert.equal(harness.applyCount, 1);
  assert.deepEqual(JSON.parse(harness.document.getText()), updated);
  assert.ok(harness.diagnostics.latest.some((item) => /integer/i.test(item.message)));
  harness.setText(JSON.stringify({ ...blueprint, name: 'Changed in text' }));
  await harness.externalChange();
  assert.equal(harness.messages.at(-1).blueprint.name, 'Changed in text');
  assert.equal(harness.messages.at(-1).revision, 1);
});

test('blueprint editor preserves invalid or unresolved source and reports the diagnostic', async () => {
  const raw = '{ keep this malformed';
  const harness = createEditorHarness(raw, { template: null, diagnostics: [{ path: '$.template', code: 'template.missing', message: 'Template is missing.' }] });
  await harness.ready();

  assert.equal(harness.document.getText(), raw);
  assert.equal(harness.messages[0].blueprint, null);
  assert.match(harness.messages[0].sourceText, /keep this malformed/);
  assert.match(harness.messages[0].diagnostics, /missing/i);
});

test('blueprint editor opens the same document with VS Code default text editor', async () => {
  const harness = createEditorHarness();
  await harness.ready();

  await harness.receive({ type: 'open-as-text' });

  assert.deepEqual(harness.commandCalls[0], [
    'vscode.openWith', harness.document.uri, 'default',
  ]);
});

test('blueprint editor HTML contains the form, graph, connection, and JSON controls used by the webview', () => {
  const source = fs.readFileSync(path.join(extensionRoot, 'src/webview/blueprintEditor.ts'), 'utf8');
  const htmlModule = loadTypeScript('src/blueprints/blueprintEditorHtml.ts');
  const html = htmlModule.buildBlueprintEditorHtml(
    { cspSource: 'vscode-webview:' },
    makeUri('vscode-webview:/blueprintEditor.js'),
    makeUri('vscode-webview:/blueprintEditor.css'),
    'nonce',
  );
  const ids = new Set([...html.matchAll(/\sid="([^"]+)"/g)].map((match) => match[1]));
  const requiredIds = [...source.matchAll(/getElementById\('([^']+)'\)/g)].map((match) => match[1]);
  assert.deepEqual(requiredIds.filter((id) => !ids.has(id)), []);
  assert.match(html, /Execution Graph/);
  assert.match(html, /Connection/);
  assert.match(html, /Open as Text/);
  assert.match(html, /JSON Preview/);
});

test('BornEngineTools contributes the blueprint editor and creation command', () => {
  const manifest = JSON.parse(fs.readFileSync(path.join(extensionRoot, 'package.json'), 'utf8'));
  assert.ok(manifest.activationEvents.includes('onCustomEditor:bornengineTools.blueprintEditor'));
  assert.ok(manifest.activationEvents.includes('onCommand:bornengineTools.createBlueprint'));
  assert.ok(manifest.contributes.commands.some((command) => command.command === 'bornengineTools.createBlueprint'));
  assert.ok(manifest.contributes.customEditors.some((editor) => editor.viewType === 'bornengineTools.blueprintEditor'
    && editor.selector.some((selector) => selector.filenamePattern === '*.blueprint.json')));
});
