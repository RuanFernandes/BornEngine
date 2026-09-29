import test from 'node:test';
import assert from 'node:assert/strict';
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const sourceDir = dirname(fileURLToPath(import.meta.url));
const buildSource = resolve(sourceDir, '../build.sh');

function writeExecutable(path, contents) {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, contents, { mode: 0o755 });
}

function createFixture(t) {
  const root = mkdtempSync(join(tmpdir(), 'bornengine-web-preflight-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const web = join(root, 'native', 'web');
  const output = join(root, 'existing-output');
  const bin = join(root, 'bin');
  const nodeModules = join(web, 'node_modules');
  mkdirSync(web, { recursive: true });
  mkdirSync(join(nodeModules, '.bin'), { recursive: true });
  mkdirSync(output, { recursive: true });
  cpSync(buildSource, join(web, 'build.sh'));
  for (const file of ['bloom_glue.js', 'jolt_bridge.js', 'database_bridge.js', 'index.html',
    'colyseus_bridge.entry.js', 'sqlite_database_worker.entry.js']) {
    writeFileSync(join(web, file), `fixture:${file}`);
  }
  writeFileSync(join(output, 'index.html'), 'old-index');
  writeFileSync(join(output, 'sqlite3.wasm'), 'old-wasm');
  writeExecutable(join(nodeModules, '.bin', 'esbuild'), `#!/bin/sh
out=""
for arg in "$@"; do
  case "$arg" in --outfile=*) out="\${arg#--outfile=}" ;; esac
done
mkdir -p "$(dirname "$out")"
printf 'bundle' > "$out"
`);
  writeExecutable(join(bin, 'wasm-pack'), `#!/bin/sh
printf 'called\n' >> "$WASM_LOG"
mkdir -p pkg
printf 'wasm' > pkg/bloom_web_bg.wasm
printf 'module' > pkg/bloom_web.js
`);
  writeExecutable(join(bin, 'npm'), `#!/bin/sh
printf '%s\n' "$*" >> "$NPM_LOG"
if [ "$FAIL_NPM" = '1' ]; then exit 42; fi
mkdir -p "$3/node_modules/@sqlite.org/sqlite-wasm/dist"
printf 'sqlite-wasm' > "$3/node_modules/@sqlite.org/sqlite-wasm/dist/sqlite3.wasm"
`);
  return { root, web, output, bin, nodeModules };
}

function runBuild(fixture, failNpm) {
  const npmLog = join(fixture.root, 'npm.log');
  const wasmLog = join(fixture.root, 'wasm-pack.log');
  return {
    result: spawnSync('bash', [join(fixture.web, 'build.sh'), '--dev', '--output', fixture.output], {
      encoding: 'utf8',
      env: { ...process.env, PATH: `${fixture.bin}:${process.env.PATH}`,
        NPM_LOG: npmLog, WASM_LOG: wasmLog, FAIL_NPM: failNpm ? '1' : '0' },
    }),
    npmLog,
    wasmLog,
  };
}

test('incomplete locked Web dependencies fail before build output is cleaned', (t) => {
  const fixture = createFixture(t);
  const { result, npmLog, wasmLog } = runBuild(fixture, true);
  assert.notEqual(result.status, 0, result.stdout + result.stderr);
  assert.match(readFileSync(npmLog, 'utf8'), /ci --prefix/);
  assert.equal(readFileSync(join(fixture.output, 'index.html'), 'utf8'), 'old-index');
  assert.equal(readFileSync(join(fixture.output, 'sqlite3.wasm'), 'utf8'), 'old-wasm');
  assert.throws(() => readFileSync(wasmLog, 'utf8'));
});

test('a partial install runs npm ci and assembles the SQLite worker files', (t) => {
  const fixture = createFixture(t);
  const { result, npmLog, wasmLog } = runBuild(fixture, false);
  assert.equal(result.status, 0, result.stdout + result.stderr);
  assert.match(readFileSync(npmLog, 'utf8'), /ci --prefix/);
  assert.match(readFileSync(wasmLog, 'utf8'), /called/);
  assert.equal(readFileSync(join(fixture.output, 'sqlite3.wasm'), 'utf8'), 'sqlite-wasm');
  assert.equal(readFileSync(join(fixture.output, 'sqlite_database_worker.js'), 'utf8'), 'bundle');
  assert.equal(readFileSync(join(fixture.output, 'index.html'), 'utf8'), 'fixture:index.html');
});
