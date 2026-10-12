const assert = require('node:assert/strict');
const path = require('node:path');
const { createRequire } = require('node:module');
const { readFileSync } = require('node:fs');
const { test } = require('node:test');
const { transformSync } = require(path.join(__dirname, '..', 'node_modules/esbuild'));

const extensionRoot = path.resolve(__dirname, '..');
const modulePath = path.join(extensionRoot, 'src/views/bornEngineAssets.ts');

function makeUri(uriPath) {
  return {
    scheme: 'file',
    authority: '',
    path: uriPath,
    with(changes) { return makeUri(changes.path ?? uriPath); },
    toString() { return `file://${uriPath}`; },
  };
}

function loadAssetsModule() {
  const source = readFileSync(modulePath, 'utf8');
  const { code } = transformSync(source, { loader: 'ts', format: 'cjs', target: 'node18' });
  const module = { exports: {} };
  const localRequire = createRequire(modulePath);
  const mocks = {
    '../animations/spriteAnimationSchema': { validateSpriteSheetCharacterMetadata: () => ({ ok: false }) },
    '../shared/workspaceAssets': {
      resolveDocumentRelativeWorkspaceAsset: () => null,
      resolveWorkspaceAsset: () => null,
      workspaceFolderForDocument: (uri, folders) => folders.find((folder) => uri.path.startsWith(folder.uri.path)) ?? null,
    },
  };
  const sourceRequire = (specifier) => mocks[specifier] ?? localRequire(specifier);
  new Function('require', 'module', 'exports', code)(sourceRequire, module, module.exports);
  return module.exports;
}

function makeApi(filesByPattern) {
  class RelativePattern {
    constructor(base, pattern) { this.base = base; this.pattern = pattern; }
  }
  return {
    RelativePattern,
    workspace: {
      findFiles: async (relativePattern) => filesByPattern[relativePattern.pattern] ?? [],
      fs: {
        readFile: async () => { throw new Error('not readable in this test'); },
        stat: async () => ({}),
      },
    },
  };
}

test('discovers sprite animation templates regardless of the folder they live in', async () => {
  const { discoverBornEngineAssets } = loadAssetsModule();
  const folder = { uri: makeUri('/game'), name: 'game', index: 0 };
  const template = makeUri('/game/assets/anis/idle.spriteanim-template.json');
  const api = makeApi({
    '**/*.spriteanim-template.json': [template],
    '**/*.json': [template],
  });

  const assets = await discoverBornEngineAssets(folder, api, [folder]);

  assert.deepEqual(
    assets.filter((asset) => asset.kind === 'animationTemplate').map((asset) => ({ name: asset.name, uri: asset.uri.path })),
    [{ name: 'idle', uri: '/game/assets/anis/idle.spriteanim-template.json' }],
  );
  assert.equal(assets.some((asset) => asset.kind === 'spriteMetadata' || asset.kind === 'animation'), false);
});
