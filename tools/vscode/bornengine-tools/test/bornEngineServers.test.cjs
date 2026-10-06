const assert = require('node:assert/strict');
const path = require('node:path');
const { createRequire } = require('node:module');
const { readFileSync } = require('node:fs');
const { test } = require('node:test');
const { transformSync } = require(path.join(__dirname, '..', 'node_modules/esbuild'));

const extensionRoot = path.resolve(__dirname, '..');
const modulePath = path.join(extensionRoot, 'src/views/bornEngineServers.ts');

function makeUri(uriPath) {
  return {
    scheme: 'file',
    authority: '',
    path: uriPath,
    with(changes) { return makeUri(changes.path ?? uriPath); },
    toString() { return `file://${uriPath}`; },
  };
}

function loadServerModule() {
  const source = readFileSync(modulePath, 'utf8');
  const { code } = transformSync(source, { loader: 'ts', format: 'cjs', target: 'node18' });
  const module = { exports: {} };
  const localRequire = createRequire(modulePath);
  const workspaceAssets = {
    workspaceFolderForDocument(uri, folders) {
      return folders
        .filter((folder) => uri.scheme === folder.uri.scheme
          && uri.authority === folder.uri.authority
          && (uri.path === folder.uri.path || uri.path.startsWith(`${folder.uri.path.replace(/\/$/, '')}/`)))
        .sort((left, right) => right.uri.path.length - left.uri.path.length)[0] ?? null;
    },
  };
  const sourceRequire = (specifier) => specifier === '../shared/workspaceAssets'
    ? workspaceAssets
    : localRequire(specifier);
  new Function('require', 'module', 'exports', code)(sourceRequire, module, module.exports);
  return module.exports;
}

function makeHarness({ rootPath = '/game', markers = {}, missingMarkers = [], symlinks = [], workspaceFolders } = {}) {
  const folder = { uri: makeUri(rootPath), name: path.posix.basename(rootPath), index: 0 };
  const folders = workspaceFolders ?? [folder];
  const markerUris = [...Object.keys(markers), ...missingMarkers].map(makeUri);
  const api = {
    FileType: { File: 1, Directory: 2, SymbolicLink: 64 },
    RelativePattern: class RelativePattern {
      constructor(base, pattern) { this.base = base; this.pattern = pattern; }
    },
    workspace: {
      findFiles: async () => markerUris,
      fs: {
        async readFile(uri) {
          if (!(uri.path in markers)) throw new Error('missing marker');
          return Buffer.from(markers[uri.path]);
        },
        async stat(uri) {
          if (symlinks.includes(uri.path)) return { type: 64 };
          return { type: uri.path in markers ? 1 : 2 };
        },
      },
    },
  };
  return { ...loadServerModule(), api, folder, folders, markerUris };
}

function marker(clientProjectRoot = '..', extra = {}) {
  return JSON.stringify({
    format: 'bornengine.server',
    version: 1,
    provider: 'colyseus',
    clientProjectRoot,
    ...extra,
  });
}

function loadTreeProvider(servers) {
  const providerPath = path.join(extensionRoot, 'src/views/bornEngineToolsProvider.ts');
  const source = readFileSync(providerPath, 'utf8');
  const { code } = transformSync(source, { loader: 'ts', format: 'cjs', target: 'node18' });
  const module = { exports: {} };
  const localRequire = createRequire(providerPath);
  const mocks = {
    '../animations/spriteAnimationEditorProvider': { SPRITE_ANIMATION_EDITOR_VIEW_TYPE: 'bornengine.animation' },
    '../shared/extensionIds': {
      BORNENGINE_TOOLS_VIEW_ID: 'bornengineTools.assets',
      CREATE_BLUEPRINT_TEMPLATE_COMMAND: 'bornengineTools.createBlueprintTemplate',
      CREATE_BLUEPRINT_COMMAND: 'bornengineTools.createBlueprint',
      CREATE_SPRITE_ANIMATION_COMMAND: 'bornengine.createSpriteAnimation',
      CREATE_SPRITE_ANIMATION_TEMPLATE_COMMAND: 'bornengine.createSpriteAnimationTemplate',
      CREATE_WORLD2D_COMMAND: 'bornengineTools.createWorld2D',
      WORLD2D_EDITOR_VIEW_TYPE: 'bornengineTools.world2dEditor',
    },
    '../shared/workspaceAssets': {
      workspaceFolderForDocument: (uri, folders) => folders.find((folder) => uri.path.startsWith(folder.uri.path)) ?? null,
    },
    './bornEngineProject': { isBornEngineProjectManifest: () => true },
    './bornEngineAssets': { discoverBornEngineAssets: async () => [] },
    './bornEngineServers': { discoverBornEngineServers: async () => servers },
  };
  const sourceRequire = (specifier) => mocks[specifier] ?? localRequire(specifier);
  new Function('require', 'module', 'exports', code)(sourceRequire, module, module.exports);

  const folder = { uri: makeUri('/game'), name: 'game', index: 0 };
  class TreeItem {
    constructor(label, collapsibleState) { this.label = label; this.collapsibleState = collapsibleState; }
  }
  class EventEmitter {
    event() { return { dispose() {} }; }
    fire() {}
  }
  const api = {
    TreeItem,
    TreeItemCollapsibleState: { None: 0, Collapsed: 1 },
    EventEmitter,
    Uri: { joinPath: (base, ...parts) => makeUri(path.posix.join(base.path, ...parts)) },
    workspace: {
      workspaceFolders: [folder],
      fs: { readFile: async () => Buffer.from('{"dependencies":{"@bornengine/engine":"1.0.0"}}') },
      onDidChangeWorkspaceFolders: () => ({ dispose() {} }),
      createFileSystemWatcher: () => ({
        onDidCreate: () => ({ dispose() {} }),
        onDidChange: () => ({ dispose() {} }),
        onDidDelete: () => ({ dispose() {} }),
      }),
    },
  };
  const context = { subscriptions: [] };
  return { provider: new module.exports.BornEngineToolsTreeProvider(context, api), folder };
}

test('discovers a valid server marker that resolves to its BornEngine project', async () => {
  const harness = makeHarness({
    markers: { '/game/server/bornengine.server.json': marker() },
  });

  const servers = await harness.discoverBornEngineServers(
    harness.folder,
    harness.api,
    harness.folders,
  );

  assert.equal(servers.length, 1);
  assert.equal(servers[0].serverUri.path, '/game/server');
  assert.equal(servers[0].markerUri.path, '/game/server/bornengine.server.json');
  assert.equal(servers[0].relativePath, 'server');
});

test('ignores malformed, unsupported, missing, and escaped markers', async () => {
  const harness = makeHarness({
    markers: {
      '/game/bad-json/bornengine.server.json': '{ broken',
      '/game/unsupported/bornengine.server.json': marker('..', { version: 2 }),
      '/game/escaped/bornengine.server.json': marker('../../../outside'),
      '/game/copied/bornengine.server.json': marker('../other-project'),
      '/game/wrong-provider/bornengine.server.json': marker('..', { provider: 'other' }),
    },
    missingMarkers: ['/game/missing/bornengine.server.json'],
  });

  const servers = await harness.discoverBornEngineServers(
    harness.folder,
    harness.api,
    harness.folders,
  );

  assert.deepEqual(servers, []);
});

test('ignores markers placed in a nested workspace project', async () => {
  const nested = { uri: makeUri('/game/another-game'), name: 'another-game', index: 1 };
  const harness = makeHarness({
    markers: { '/game/another-game/server/bornengine.server.json': marker('../..') },
    workspaceFolders: [
      { uri: makeUri('/game'), name: 'game', index: 0 },
      nested,
    ],
  });

  const servers = await harness.discoverBornEngineServers(
    harness.folders[0],
    harness.api,
    harness.folders,
  );

  assert.deepEqual(servers, []);
});

test('ignores a marker reached through a symbolic link', async () => {
  const harness = makeHarness({
    markers: { '/game/server-link/bornengine.server.json': marker() },
    symlinks: ['/game/server-link'],
  });

  const servers = await harness.discoverBornEngineServers(
    harness.folder,
    harness.api,
    harness.folders,
  );

  assert.deepEqual(servers, []);
});

test('returns multiple valid server destinations in stable path order', async () => {
  const harness = makeHarness({
    markers: {
      '/game/z-server/bornengine.server.json': marker(),
      '/game/services/a-server/bornengine.server.json': marker('../..'),
    },
  });

  const servers = await harness.discoverBornEngineServers(
    harness.folder,
    harness.api,
    harness.folders,
  );

  assert.deepEqual(servers.map((server) => server.relativePath), [
    'services/a-server',
    'z-server',
  ]);
});

test('asks which server to use when multiple valid destinations exist', async () => {
  const { pickBornEngineServer } = loadServerModule();
  const servers = [
    { name: 'server', relativePath: 'server', serverUri: makeUri('/game/server') },
    { name: 'backend', relativePath: 'backend', serverUri: makeUri('/game/backend') },
  ];
  const api = {
    window: {
      async showQuickPick(items, options) {
        assert.match(options.placeHolder, /server/i);
        assert.deepEqual(items.map((item) => item.label), ['server', 'backend']);
        return items[1];
      },
    },
  };

  const selected = await pickBornEngineServer(api, servers);

  assert.equal(selected, servers[1]);
});

test('returns the sole server without prompting', async () => {
  const { pickBornEngineServer } = loadServerModule();
  const server = { name: 'server', relativePath: 'server', serverUri: makeUri('/game/server') };
  const selected = await pickBornEngineServer(
    { window: { showQuickPick: async () => assert.fail('must not prompt') } },
    [server],
  );

  assert.equal(selected, server);
});

test('shows the CLI instruction when the BornEngine project has no linked server', async () => {
  const { provider } = loadTreeProvider([]);
  const [workspaceItem] = await provider.getChildren();
  const rootItems = await provider.getChildren(workspaceItem);
  const serversItem = rootItems.find((item) => item.label === 'Servers');
  assert.ok(serversItem);
  const [emptyState] = await provider.getChildren(serversItem);

  assert.equal(emptyState.label, 'No linked server');
  assert.match(emptyState.description, /bornengine create server/);
});

test('offers blueprint template creation in the BornEngine tools workspace menu', async () => {
  const { provider } = loadTreeProvider([]);
  const [workspaceItem] = await provider.getChildren();
  const rootItems = await provider.getChildren(workspaceItem);
  const createItem = rootItems.find((item) => item.label === 'Create Blueprint Template');

  assert.ok(createItem);
  assert.equal(createItem.command.command, 'bornengineTools.createBlueprintTemplate');
  assert.equal(createItem.command.arguments[0], workspaceItem.resourceUri);
});

test('offers blueprint creation in the BornEngine tools workspace menu', async () => {
  const { provider } = loadTreeProvider([]);
  const [workspaceItem] = await provider.getChildren();
  const rootItems = await provider.getChildren(workspaceItem);
  const createItem = rootItems.find((item) => item.label === 'Create Blueprint');

  assert.ok(createItem);
  assert.equal(createItem.command.command, 'bornengineTools.createBlueprint');
  assert.equal(createItem.command.arguments[0], workspaceItem.resourceUri);
});

test('offers a separate sprite animation template workflow in the BornEngine tools workspace menu', async () => {
  const { provider, folder } = loadTreeProvider([]);
  const rootItems = await provider.getChildren();
  const workspaceItem = rootItems.find((item) => item.label === folder.name);
  const workspaceItems = await provider.getChildren(workspaceItem);
  const createItem = workspaceItems.find((item) => item.label === 'Create Sprite Animation Template');
  assert.ok(createItem);
  assert.equal(createItem.command.command, 'bornengine.createSpriteAnimationTemplate');
  assert.deepEqual(createItem.command.arguments, [{ workspaceFolderUri: folder.uri }]);
});

test('shows each valid server destination in the BornEngine tools tree', async () => {
  const servers = [
    { name: 'server', relativePath: 'server', serverUri: makeUri('/game/server'), markerUri: makeUri('/game/server/bornengine.server.json') },
    { name: 'backend', relativePath: 'services/backend', serverUri: makeUri('/game/services/backend'), markerUri: makeUri('/game/services/backend/bornengine.server.json') },
  ];
  const { provider } = loadTreeProvider(servers);
  const [workspaceItem] = await provider.getChildren();
  const rootItems = await provider.getChildren(workspaceItem);
  const serversItem = rootItems.find((item) => item.label === 'Servers');
  const serverItems = await provider.getChildren(serversItem);

  assert.deepEqual(serverItems.map((item) => item.label), ['server', 'backend']);
  assert.deepEqual(serverItems.map((item) => item.description), ['server', 'services/backend']);
});
