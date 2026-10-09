import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { checkSideEffects } from './check-side-effects.mjs';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const checkerPath = join(repoRoot, 'tools', 'check-side-effects.mjs');

function withFixture(files, run) {
  const dir = mkdtempSync(join(tmpdir(), 'side-effects-'));
  try {
    for (const [name, body] of Object.entries(files)) {
      const path = join(dir, name);
      mkdirSync(dirname(path), { recursive: true });
      writeFileSync(path, body);
    }
    return run(dir);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

test('accepts declarations, types and pure initializers', () => {
  const source = [
    "import { helper } from './helper';",
    "export { helper } from './helper';",
    'export interface Options { size: number }',
    "export type Mode = 'a' | 'b';",
    'export enum Kind { A, B }',
    'export const LIMIT = 4 * 1024;',
    "export const DEFAULTS = { size: 1, mode: 'a' as Mode, list: [1, 2] };",
    'const handler = (value: number) => value * 2;',
    'export function create(): Options { return { size: LIMIT }; }',
    'export class Thing { static readonly MAX = 3; private items = new Map(); }',
  ].join('\n');
  withFixture({ 'pure.ts': source, 'helper.ts': 'export const helper = 1;\n' }, (dir) => {
    assert.deepEqual(checkSideEffects(dir, []), []);
  });
});

test('flags top-level calls, constructed values, static blocks and bare imports', () => {
  const source = [
    "import './register';",
    'register();',
    'export const cache = new Map();',
    'export class Registry { static instances = createInstances(); static { boot(); } }',
  ].join('\n');
  withFixture({ 'effects.ts': source }, (dir) => {
    const kinds = checkSideEffects(dir, []).map((violation) => violation.kind);
    assert.deepEqual(kinds, ['bare-import', 'statement', 'var-init', 'static-init', 'static-block']);
  });
});

test('reports file paths relative to the root with line numbers', () => {
  withFixture({ 'nested/module.ts': 'export const a = 1;\nsetup();\n' }, (dir) => {
    assert.deepEqual(checkSideEffects(dir, []), [{ file: 'nested/module.ts', line: 2, kind: 'statement', text: 'setup();' }]);
  });
});

test('skips allowlisted constructs by file, kind and text prefix', () => {
  const allowlist = [{ file: 'registry.ts', kind: 'statement', match: 'Registry.register(', reason: 'module-owned' }];
  const source = "Registry.register('a');\nRegistry.register('b');\nother();\n";
  withFixture({ 'registry.ts': source }, (dir) => {
    const violations = checkSideEffects(dir, allowlist);
    assert.equal(violations.length, 1);
    assert.equal(violations[0].text, 'other();');
  });
});

test('CLI exits non-zero with a fix hint when violations exist', () => {
  withFixture({ 'bad.ts': 'boot();\n' }, (dir) => {
    const result = spawnSync(process.execPath, [checkerPath, '--root', dir], { encoding: 'utf8' });
    assert.equal(result.status, 1);
    assert.match(result.stderr, /bad\.ts:1\tstatement\tboot\(\);/);
    assert.match(result.stderr, /"sideEffects": false/);
  });
});

test('engine sources satisfy the side-effect contract', () => {
  const result = spawnSync(process.execPath, [checkerPath], { cwd: repoRoot, encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr);
});
