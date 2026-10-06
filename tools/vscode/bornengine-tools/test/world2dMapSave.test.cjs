const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { test } = require('node:test');
const { transformSync } = require(path.join(__dirname, '..', 'node_modules/esbuild'));

function loadCodecCoordinator() {
  const sourcePath = path.join(__dirname, '..', 'src/maps/mapCodecCoordinator.ts');
  const source = fs.readFileSync(sourcePath, 'utf8');
  const { code } = transformSync(source, { loader: 'ts', format: 'cjs', target: 'node18' });
  const module = { exports: {} };
  new Function('module', 'exports', code)(module, module.exports);
  return module.exports.World2DMapCodecCoordinator;
}

function loadProvider(dependencies = {}) {
  const extensionRoot = path.resolve(__dirname, '..');
  const providerPath = path.join(extensionRoot, 'src/maps/world2dEditorProvider.ts');
  const { createRequire } = require('node:module');
  const source = fs.readFileSync(providerPath, 'utf8');
  const { code } = transformSync(source, { loader: 'ts', format: 'cjs', target: 'node18' });
  const module = { exports: {} };
  const localRequire = createRequire(providerPath);
  const mocked = {
    '@bornengine/engine/world2d/editor': {
      formatWorld2DDiagnostics: () => '',
      serializeWorld2D: dependencies.serializeWorld2D ?? ((document) => ({ ok: true, json: JSON.stringify(document) })),
      validateWorld2D: () => ({ ok: true, diagnostics: [] }),
    },
    './mapEditorHtml': { buildMapEditorHtml: () => '<html></html>' },
    './world2dEdits': { applyWorld2DEdit: (document) => document },
    './world2dDocument': {
      parseWorld2DText: (text) => ({
        document: JSON.parse(text), diagnostics: [], formattedDiagnostics: '', editable: true,
      }),
    },
    '../shared/workspaceAssets': {
      resolveWorkspaceAsset: () => undefined,
      workspaceFolderForDocument: () => undefined,
      workspaceRelativeAssetPath: () => undefined,
    },
  };
  const sourceRequire = (specifier) => mocked[specifier] ?? localRequire(specifier);
  new Function('require', 'module', 'exports', code)(sourceRequire, module, module.exports);
  return module.exports.World2DTextEditorProvider;
}

function createProviderHarness(codec, dependencies = {}) {
  const sentMessages = [];
  const errors = [];
  const documentData = {
    format: 'bornengine.world2d', version: 2, id: 'town', name: 'Town', assets: [],
    tilesets: [], layers: [], metadata: {},
  };
  let currentText = JSON.stringify(documentData);
  let documentVersion = 3;
  const uri = { path: '/maps/town.world2d.json', toString: () => 'file:///maps/town.world2d.json' };
  const document = {
    uri,
    get version() { return documentVersion; },
    getText: () => currentText,
    positionAt: () => ({ line: 0, character: 0 }),
    save: async () => {
      const event = { reason: 1, document, waitUntil(promise) { this.promise = promise; } };
      saveListener?.(event);
      if (event.promise) {
        const edits = await event.promise;
        for (const edit of edits) {
          currentText = edit.newText;
          documentVersion++;
        }
      }
      return true;
    },
  };
  let receiveMessage;
  let saveListener;
  const appliedEdits = [];
  const saveEvent = { reason: 1, document, waitUntil(promise) { this.promise = promise; } };
  const api = {
    Uri: { joinPath: (...parts) => ({ toString: () => parts.map(String).join('/') }) },
    Range: class Range { constructor(...values) { this.values = values; } },
    TextEdit: { replace: (range, newText) => ({ range, newText }) },
      WorkspaceEdit: class {
        replacements = [];
        replace(uriValue, range, value) { this.replacements.push({ uri: uriValue, range, value }); }
      },
    Diagnostic: class Diagnostic { constructor(...values) { this.values = values; } },
    DiagnosticSeverity: { Error: 0 },
    workspace: {
      workspaceFolders: [],
      fs: { stat: async () => undefined },
      onDidChangeTextDocument: () => ({ dispose() {} }),
      onWillSaveTextDocument: (listener) => { saveListener = listener; return { dispose() {} }; },
      applyEdit: async (edit) => {
        appliedEdits.push(edit.replacements);
        for (const replacement of edit.replacements) {
          currentText = replacement.value;
          documentVersion++;
        }
        return true;
      },
    },
    window: { showErrorMessage: async (message) => errors.push(message) },
  };
  const panel = {
    active: true,
    webview: {
      options: undefined,
      html: '',
      asWebviewUri: (value) => ({ toString: () => `webview:${value.toString()}` }),
      postMessage: async (message) => { sentMessages.push(message); return true; },
      onDidReceiveMessage: (listener) => { receiveMessage = listener; return { dispose() {} }; },
    },
    onDidDispose() {},
  };
  const Provider = loadProvider(dependencies);
  const provider = new Provider({ extensionUri: {} }, { set() {} }, api, codec);
  return {
    api, document, documentData, panel, provider, errors, appliedEdits, saveEvent,
    receive: (message) => receiveMessage?.(message),
    save: (event = saveEvent) => saveListener?.(event),
    getText: () => currentText,
    setText: (value) => { currentText = value; documentVersion++; },
  };
}

class FakeWorker {
  listeners = { message: [], error: [] };
  requests = [];

  on(event, listener) {
    this.listeners[event].push(listener);
    return this;
  }

  postMessage(request) {
    this.requests.push(request);
  }

  respond(request, data = {}) {
    const response = {
      type: 'encoded',
      uri: request.uri,
      textVersion: request.textVersion,
      generation: request.generation,
      sourceText: request.sourceText,
      ok: true,
      json: `compact:${request.sourceText}`,
      ...data,
    };
    for (const listener of this.listeners.message) listener(response);
  }

  fail(error) {
    for (const listener of this.listeners.error) listener(error);
  }

  terminate() { return Promise.resolve(0); }
}

function revision(textVersion, generation, sourceText) {
  return { uri: 'file:///maps/town.world2d.json', textVersion, generation, sourceText };
}

test('idle max encoding is debounced and matching results are reused', async () => {
  const World2DMapCodecCoordinator = loadCodecCoordinator();
  const worker = new FakeWorker();
  const coordinator = new World2DMapCodecCoordinator(() => worker, 10);
  const current = revision(4, 1, '{"version":2}');
  try {
    coordinator.schedule(current);
    assert.equal(worker.requests.length, 0);
    await new Promise((resolve) => setTimeout(resolve, 25));
    assert.equal(worker.requests.length, 1);
    worker.respond(worker.requests[0]);
    const result = await coordinator.requestMax(current, 100);
    assert.equal(result.json, `compact:${current.sourceText}`);
    assert.equal(worker.requests.length, 1, 'the matching idle result is reused');
  } finally {
    coordinator.dispose();
  }
});

test('undo, external text edits, and source edits invalidate older worker revisions', async () => {
  const World2DMapCodecCoordinator = loadCodecCoordinator();
  const worker = new FakeWorker();
  const coordinator = new World2DMapCodecCoordinator(() => worker, 1000);
  const oldRevision = revision(7, 2, '{"id":"before"}');
  const newRevision = revision(8, 3, '{"id":"after undo and text edit"}');
  try {
    const staleRequest = coordinator.requestMax(oldRevision, 500);
    assert.equal(worker.requests.length, 1);
    coordinator.schedule(newRevision);
    worker.respond(worker.requests[0]);
    await assert.rejects(staleRequest, /revision changed/i);

    const latestRequest = coordinator.requestMax(newRevision, 500);
    assert.equal(worker.requests.length, 2);
    worker.respond(worker.requests[1]);
    assert.equal((await latestRequest).sourceText, newRevision.sourceText);

    const sourceChanged = revision(8, 4, '{"id":"after source switch"}');
    const pending = coordinator.requestMax(sourceChanged, 500);
    assert.equal(worker.requests.length, 3);
    coordinator.invalidate(newRevision.uri);
    worker.respond(worker.requests[2]);
    await assert.rejects(pending, /revision changed/i);
  } finally {
    coordinator.dispose();
  }
});

test('save deadline returns to the caller while late matching max output can be cached', async () => {
  const World2DMapCodecCoordinator = loadCodecCoordinator();
  const worker = new FakeWorker();
  const coordinator = new World2DMapCodecCoordinator(() => worker, 1000);
  const current = revision(11, 9, '{"id":"current"}');
  try {
    assert.equal(await coordinator.requestMax(current, 5), null);
    assert.equal(worker.requests.length, 1);
    worker.respond(worker.requests[0]);
    const result = await coordinator.requestMax(current, 50);
    assert.equal(result.json, `compact:${current.sourceText}`);
    assert.equal(worker.requests.length, 1);
  } finally {
    coordinator.dispose();
  }
});

test('worker failure rejects Optimize Map instead of claiming a compact save succeeded', async () => {
  const World2DMapCodecCoordinator = loadCodecCoordinator();
  const worker = new FakeWorker();
  const coordinator = new World2DMapCodecCoordinator(() => worker, 1000);
  const current = revision(2, 1, '{"id":"broken worker"}');
  try {
    const result = coordinator.requestMax(current);
    worker.fail(new Error('worker unavailable'));
    await assert.rejects(result, /worker unavailable/);
  } finally {
    coordinator.dispose();
  }
});

test('Save uses matching max JSON and keeps a valid fast result as timeout fallback', async () => {
  const scenarios = [
    { response: (revision) => ({ ...revision, type: 'encoded', ok: true, json: '{"version":2,"mode":"max"}' }), expected: 'max' },
    { response: () => null, expected: 'fast' },
  ];
  for (const scenario of scenarios) {
    const requests = [];
    const codec = {
      current: null,
      schedule(revision) { this.current = revision; },
      invalidate() { this.current = null; },
      isCurrent(revision) { return this.current === revision; },
      async requestMax(revision, timeoutMs) {
        requests.push({ revision, timeoutMs });
        return scenario.response(revision);
      },
    };
    const serializerCalls = [];
    const harness = createProviderHarness(codec, {
      serializeWorld2D: (_document, options) => {
        serializerCalls.push(options);
        return { ok: true, diagnostics: [], json: '{"version":2,"mode":"fast"}' };
      },
    });
    const resolution = harness.provider.resolveCustomTextEditor(harness.document, harness.panel);
    await harness.receive({ type: 'ready' });
    await resolution;
    const event = { document: harness.document, waitUntil(promise) { this.promise = promise; } };
    harness.save(event);
    const edits = await event.promise;
    assert.equal(requests[0].timeoutMs, 750);
    assert.deepEqual(serializerCalls.at(-1), { mode: 'compact', effort: 'fast' });
    assert.equal(edits[0].newText, `{"version":2,"mode":"${scenario.expected}"}`);
  }
});

test('Optimize Map reports worker failure and does not edit or save the file', async () => {
  const revisionFailure = new Error('worker unavailable');
  const codec = {
    current: null,
    schedule(revision) { this.current = revision; },
    invalidate() { this.current = null; },
    isCurrent(revision) { return this.current === revision; },
    requestMax: async () => { throw revisionFailure; },
  };
  const harness = createProviderHarness(codec);
  let saveCount = 0;
  harness.document.save = async () => { saveCount++; return true; };
  const resolution = harness.provider.resolveCustomTextEditor(harness.document, harness.panel);
  await harness.receive({ type: 'ready' });
  await resolution;

  await harness.provider.optimizeActive();

  assert.equal(harness.appliedEdits.length, 0);
  assert.equal(saveCount, 0);
  assert.deepEqual(harness.errors, ['worker unavailable']);
});

test('Optimize Map preserves completed max JSON when the save participant would time out or fail', async () => {
  const optimizedJson = JSON.stringify({
    format: 'bornengine.world2d', version: 2, id: 'town', name: 'Town',
    assets: [], tilesets: [], layers: [], metadata: { codec: 'max' },
  });
  for (const saveFailure of ['timeout', 'worker failure']) {
    const requests = [];
    const codec = {
      current: null,
      schedule(revision) { this.current = revision; },
      invalidate() { this.current = null; },
      isCurrent(revision) { return this.current === revision; },
      async requestMax(revision, timeoutMs) {
        requests.push({ revision, timeoutMs });
        if (requests.length === 1) return { ok: true, json: optimizedJson };
        if (saveFailure === 'timeout') return null;
        throw new Error('worker unavailable during save');
      },
    };
    const harness = createProviderHarness(codec);
    const resolution = harness.provider.resolveCustomTextEditor(harness.document, harness.panel);
    await harness.receive({ type: 'ready' });
    await resolution;

    await harness.provider.optimizeActive();

    assert.equal(harness.getText(), optimizedJson, saveFailure);
    assert.equal(requests.length, 1, 'saving the optimized text must not start a second encoding');
    assert.deepEqual(harness.errors, []);
  }
});

test('Optimize Map does not skip the save participant after the user edits the optimized text', async () => {
  const optimizedJson = JSON.stringify({
    format: 'bornengine.world2d', version: 2, id: 'town', name: 'Town',
    assets: [], tilesets: [], layers: [], metadata: { codec: 'max' },
  });
  const editedText = JSON.stringify({
    format: 'bornengine.world2d', version: 2, id: 'town', name: 'Town',
    assets: [], tilesets: [], layers: [], metadata: { userEdit: true },
  });
  const reoptimizedText = JSON.stringify({
    format: 'bornengine.world2d', version: 2, id: 'town', name: 'Town',
    assets: [], tilesets: [], layers: [], metadata: { userEdit: true, codec: 'max' },
  });
  const requests = [];
  const codec = {
    current: null,
    schedule(revision) { this.current = revision; },
    invalidate() { this.current = null; },
    isCurrent(revision) { return this.current === revision; },
    async requestMax(revision, timeoutMs) {
      requests.push({ revision, timeoutMs });
      return { ok: true, json: requests.length === 1 ? optimizedJson : reoptimizedText };
    },
  };
  const harness = createProviderHarness(codec);
  const resolution = harness.provider.resolveCustomTextEditor(harness.document, harness.panel);
  await harness.receive({ type: 'ready' });
  await resolution;

  await harness.provider.optimizeActive();
  harness.setText(editedText);
  await harness.document.save();

  assert.equal(requests.length, 2);
  assert.equal(requests[1].timeoutMs, 750);
  assert.equal(requests[1].revision.sourceText, editedText);
  assert.equal(harness.getText(), reoptimizedText);
});
