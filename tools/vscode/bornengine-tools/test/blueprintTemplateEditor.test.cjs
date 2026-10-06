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

function loadTemplateEditorModule(projectCheck = () => true) {
  const schema = loadTypeScript('src/blueprints/blueprintSchema.ts');
  const json = loadTypeScript('src/blueprints/blueprintJson.ts', { './blueprintSchema': schema });
  const html = loadTypeScript('src/blueprints/blueprintTemplateEditorHtml.ts');
  return loadTypeScript('src/blueprints/blueprintTemplateEditorProvider.ts', {
    './blueprintSchema': schema,
    './blueprintJson': json,
    './blueprintTemplateEditorHtml': html,
    '../shared/extensionIds': {
      BLUEPRINT_TEMPLATE_EDITOR_VIEW_TYPE: 'bornengineTools.blueprintTemplateEditor',
      CREATE_BLUEPRINT_TEMPLATE_COMMAND: 'bornengineTools.createBlueprintTemplate',
    },
    '../views/bornEngineProject': { isBornEngineProjectManifest: projectCheck },
    '../shared/workspaceAssets': {
      workspaceFolderForDocument: (uri, folders) => folders.find((candidate) => uri.path.startsWith(candidate.uri.path)) ?? null,
    },
  });
}

function createHarness(initialText = '{ broken') {
  const messages = [];
  let receiveMessage;
  let documentChange;
  let documentSave;
  let text = initialText;
  let applyCount = 0;
  const document = {
    uri: makeUri('/game/.bornengine/blueprint-templates/test.blueprint-template.json'),
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
  const folder = { uri: makeUri('/game'), name: 'game', index: 0 };
  const api = {
    Uri: { joinPath: (base, ...parts) => makeUri(path.posix.join(base.path, ...parts)) },
    Range: class Range {},
    Diagnostic,
    DiagnosticSeverity: { Error: 0 },
    WorkspaceEdit,
    workspace: {
      workspaceFolders: [folder],
      onDidChangeTextDocument(listener) { documentChange = listener; return { dispose() {} }; },
      onDidSaveTextDocument(listener) { documentSave = listener; return { dispose() {} }; },
      async applyEdit(edit) { applyCount++; text = edit.text; return true; },
    },
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
  const Provider = loadTemplateEditorModule().BlueprintTemplateEditorProvider;
  const provider = new Provider({ extensionUri: makeUri('/extension') }, diagnostics, api);

  return {
    api, diagnostics, document, messages, panel, provider,
    get applyCount() { return applyCount; },
    setText(value) { text = value; },
    async ready() { await provider.resolveCustomTextEditor(document, panel); await receiveMessage({ type: 'ready' }); },
    async receive(message) { await receiveMessage(message); },
    externalChange() { return documentChange({ document }); },
    save() { return documentSave(document); },
  };
}

const validTemplate = {
  format: 'bornengine.blueprint-template',
  version: 1,
  id: 'combat.spell',
  revision: 1,
  name: 'Spell',
  description: '',
  fields: [],
  events: [],
  nodes: [],
};

test('template editor waits for webview readiness and reports malformed JSON without replacing source', async () => {
  const harness = createHarness();
  await harness.provider.resolveCustomTextEditor(harness.document, harness.panel);
  assert.equal(harness.messages.length, 0);

  await harness.receive({ type: 'ready' });

  assert.equal(harness.document.getText(), '{ broken');
  assert.equal(harness.messages[0].type, 'document');
  assert.equal(harness.messages[0].template, null);
  assert.match(harness.messages[0].diagnostics, /JSON/i);
  assert.equal(harness.diagnostics.latest.length, 1);
});

test('template editor edits through a VS Code workspace edit and publishes schema diagnostics', async () => {
  const harness = createHarness(JSON.stringify(validTemplate));
  await harness.ready();
  const updated = {
    ...validTemplate,
    name: 'Arcane Spell',
    fields: [
      { id: 'power', label: 'Power', type: 'integer' },
      { id: 'power', label: 'Power Again', type: 'integer' },
    ],
  };

  await harness.receive({ type: 'edit', editId: 1, revision: 0, template: updated });

  assert.equal(harness.applyCount, 1);
  assert.deepEqual(JSON.parse(harness.document.getText()), updated);
  assert.ok(harness.diagnostics.latest.some((item) => /duplicated/i.test(item.message)));
  assert.equal(harness.messages.at(-1).template.name, 'Arcane Spell');
});

test('template editor refreshes from external text changes', async () => {
  const harness = createHarness(JSON.stringify(validTemplate));
  await harness.ready();
  harness.setText(JSON.stringify({ ...validTemplate, name: 'External change' }));
  await harness.externalChange();

  assert.equal(harness.messages.at(-1).template.name, 'External change');
  assert.equal(harness.messages.at(-1).revision, 1);
});

test('template editor provides typed field, event, node, pin-direction, and list controls', () => {
  const html = loadTypeScript('src/blueprints/blueprintTemplateEditorHtml.ts').buildBlueprintTemplateEditorHtml(
    { cspSource: 'vscode-webview:' },
    makeUri('vscode-webview:/blueprintTemplateEditor.js'),
    makeUri('vscode-webview:/blueprintTemplateEditor.css'),
    'nonce',
  );
  for (const fragment of ['Fields', 'Events', 'Actions and Conditions', 'Execution inputs', 'Execution outputs', 'Nested object', 'Array item']) {
    assert.match(html, new RegExp(fragment, 'i'));
  }
  assert.match(html, /id="template-editor"/);
});

test('BornEngineTools contributes the blueprint template custom editor and create command', () => {
  const manifest = JSON.parse(fs.readFileSync(path.join(extensionRoot, 'package.json'), 'utf8'));
  assert.ok(manifest.activationEvents.includes('onCustomEditor:bornengineTools.blueprintTemplateEditor'));
  assert.ok(manifest.activationEvents.includes('onCommand:bornengineTools.createBlueprintTemplate'));
  assert.ok(manifest.contributes.commands.some((command) => command.command === 'bornengineTools.createBlueprintTemplate'));
  assert.ok(manifest.contributes.customEditors.some((editor) => editor.viewType === 'bornengineTools.blueprintTemplateEditor'
    && editor.selector.some((selector) => selector.filenamePattern === '*.blueprint-template.json')));
});

test('template creation defaults to the shared project template folder and writes a valid starter document', async () => {
  const writes = [];
  const directories = [];
  const opened = [];
  const folder = { uri: makeUri('/game'), name: 'game', index: 0 };
  const api = {
    Uri: { joinPath: (base, ...parts) => makeUri(path.posix.join(base.path, ...parts)) },
    workspace: {
      workspaceFolders: [folder],
      fs: {
        async readFile() { return Buffer.from('{"dependencies":{"@bornengine/engine":"workspace:*"}}'); },
        async stat() { throw new Error('missing file'); },
        async createDirectory(uri) { directories.push(uri.path); },
        async writeFile(uri, bytes) { writes.push({ uri, text: Buffer.from(bytes).toString('utf8') }); },
      },
    },
    window: {
      async showInputBox() { return 'Arcane Spell'; },
      async showSaveDialog(options) { return options.defaultUri; },
      async showErrorMessage(message) { assert.fail(message); },
    },
    commands: { async executeCommand(...args) { opened.push(args); } },
  };
  const { createBlueprintTemplate } = loadTemplateEditorModule();

  await createBlueprintTemplate(api);

  assert.equal(writes[0].uri.path, '/game/.bornengine/blueprint-templates/arcane-spell.blueprint-template.json');
  assert.equal(directories[0], '/game/.bornengine/blueprint-templates');
  assert.equal(JSON.parse(writes[0].text).id, 'arcane-spell');
  assert.equal(JSON.parse(writes[0].text).revision, 1);
  assert.deepEqual(opened[0], ['vscode.openWith', writes[0].uri, 'bornengineTools.blueprintTemplateEditor']);
});

test('template creation refuses a target that resolves outside the BornEngine project', async () => {
  const writes = [];
  const errors = [];
  const folder = { uri: makeUri('/game'), name: 'game', index: 0 };
  const api = {
    Uri: { joinPath: (base, ...parts) => makeUri(path.posix.join(base.path, ...parts)) },
    workspace: {
      workspaceFolders: [folder],
      fs: {
        async readFile() { return Buffer.from('{"dependencies":{"@bornengine/engine":"workspace:*"}}'); },
        async stat() { throw new Error('missing file'); },
        async createDirectory() {},
        async writeFile(uri, bytes) { writes.push({ uri, bytes }); },
      },
    },
    window: {
      async showInputBox() { return 'Escaped'; },
      async showSaveDialog() { return makeUri('/game/../outside/escaped.blueprint-template.json'); },
      async showErrorMessage(message) { errors.push(message); },
    },
    commands: { async executeCommand() { assert.fail('must not open an escaped template'); } },
  };

  await loadTemplateEditorModule().createBlueprintTemplate(api);

  assert.deepEqual(writes, []);
  assert.match(errors[0], /inside the BornEngine project/i);
});

test('template creation requires a BornEngine project manifest', async () => {
  const errors = [];
  let promptCount = 0;
  const folder = { uri: makeUri('/other'), name: 'other', index: 0 };
  const api = {
    Uri: { joinPath: (base, ...parts) => makeUri(path.posix.join(base.path, ...parts)) },
    workspace: {
      workspaceFolders: [folder],
      fs: { async readFile() { return Buffer.from('{"dependencies":{}}'); } },
    },
    window: {
      async showInputBox() { promptCount++; return 'Nope'; },
      async showErrorMessage(message) { errors.push(message); },
    },
  };

  await loadTemplateEditorModule(() => false).createBlueprintTemplate(api);

  assert.equal(promptCount, 0);
  assert.match(errors[0], /@bornengine\/engine/);
});
