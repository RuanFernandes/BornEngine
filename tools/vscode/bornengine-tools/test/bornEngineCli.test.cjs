const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { test } = require('node:test');
const { transformSync } = require(path.join(__dirname, '..', 'node_modules/esbuild'));

function load() {
  const source = fs.readFileSync(path.join(__dirname, '..', 'src/cli/bornEngineCli.ts'), 'utf8');
  const { code } = transformSync(source, { loader: 'ts', format: 'cjs', target: 'node18' });
  const module = { exports: {} };
  new Function('require', 'module', 'exports', code)(require, module, module.exports);
  return module.exports;
}

const cli = load();
const inputs = (overrides = {}) => ({
  entry: 'src/game.ts',
  pickBuildTarget: async () => 'host',
  askEngineVersion: async () => '',
  askAiDocsName: async () => 'ai_docs',
  ...overrides,
});
const argsFor = (id, overrides) => cli.findBornEngineCliShortcut(id).args(inputs(overrides));

test('reads the project entry from perry.toml and falls back to main.ts', () => {
  assert.equal(cli.parsePerryEntry('[project]\nname = "hero"\nentry = "src/game.ts" # comment\n'), 'src/game.ts');
  assert.equal(cli.parsePerryEntry('[bornengine]\nentry = "nope.ts"\n[project]\nname = "hero"\n'), 'main.ts');
  assert.equal(cli.parsePerryEntry(''), 'main.ts');
});

test('builds CLI arguments for each shortcut', async () => {
  assert.deepEqual(await argsFor('dev'), ['dev', 'src/game.ts', '--watch']);
  assert.deepEqual(await argsFor('run'), ['run', 'src/game.ts']);
  assert.deepEqual(await argsFor('build'), ['build', 'src/game.ts']);
  assert.deepEqual(await argsFor('build', { pickBuildTarget: async () => 'windows' }), ['build', 'src/game.ts', '--os', 'windows']);
  assert.equal(await argsFor('build', { pickBuildTarget: async () => undefined }), undefined);
  assert.deepEqual(await argsFor('upgrade'), ['upgrade', '--latest']);
  assert.deepEqual(await argsFor('upgrade', { askEngineVersion: async () => '0.18.0' }), ['upgrade', '0.18.0']);
  assert.equal(await argsFor('upgrade', { askEngineVersion: async () => undefined }), undefined);
  assert.deepEqual(await argsFor('ai-docs'), ['--add-ai-docs', 'ai_docs']);
  assert.deepEqual(await argsFor('assets'), ['assets', 'validate']);
  assert.deepEqual(await argsFor('create-server'), ['create', 'server']);
  assert.equal(new Set(cli.BORNENGINE_CLI_SHORTCUTS.map((shortcut) => shortcut.id)).size, cli.BORNENGINE_CLI_SHORTCUTS.length);
});

test('quotes only arguments that need it', () => {
  assert.equal(cli.formatBornEngineCliCommand('bornengine', ['build', 'main.ts', '--os', 'linux']), 'bornengine build main.ts --os linux');
  assert.equal(cli.formatBornEngineCliCommand('/opt/born engine/bin/bornengine', ['run', 'my game.ts']),
    '"/opt/born engine/bin/bornengine" run "my game.ts"');
});
