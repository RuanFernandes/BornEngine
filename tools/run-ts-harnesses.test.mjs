import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const runnerPath = join(repoRoot, 'tools', 'run-ts-harnesses.mjs');

function createFixtureDir(files, manifest) {
  const dir = mkdtempSync(join(tmpdir(), 'ts-harnesses-'));
  for (const [name, body] of Object.entries(files)) writeFileSync(join(dir, name), body);
  const manifestPath = join(dir, 'harnesses.json');
  writeFileSync(manifestPath, JSON.stringify(manifest));
  return { dir, manifestPath };
}

function runRunner(manifestPath, ...extraArgs) {
  return spawnSync(process.execPath, [runnerPath, '--manifest', manifestPath, ...extraArgs], {
    cwd: repoRoot,
    encoding: 'utf8',
  });
}

const PASSING = 'const value: number = 1;\nif (value !== 1) process.exit(1);\n';
const FAILING = 'const value: number = 1;\nprocess.exit(value);\n';

test('exits 0 when every node harness passes', () => {
  const { dir, manifestPath } = createFixtureDir(
    { 'ok-a.ts': PASSING, 'ok-b.ts': PASSING },
    [
      { file: 'ok-a.ts', runner: 'node' },
      { file: 'ok-b.ts', runner: 'node' },
    ],
  );
  try {
    const result = runRunner(manifestPath);
    assert.equal(result.status, 0, result.stdout + result.stderr);
    assert.match(result.stdout, /PASS ok-a\.ts/);
    assert.match(result.stdout, /PASS ok-b\.ts/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('exits non-zero and names the failing harness when one fails', () => {
  const { dir, manifestPath } = createFixtureDir(
    { 'ok.ts': PASSING, 'bad.ts': FAILING },
    [
      { file: 'ok.ts', runner: 'node' },
      { file: 'bad.ts', runner: 'node' },
    ],
  );
  try {
    const result = runRunner(manifestPath);
    assert.notEqual(result.status, 0);
    assert.match(result.stdout, /PASS ok\.ts/);
    assert.match(result.stdout, /FAIL bad\.ts/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('exits non-zero when the manifest lists a file that does not exist', () => {
  const { dir, manifestPath } = createFixtureDir(
    { 'ok.ts': PASSING },
    [
      { file: 'ok.ts', runner: 'node' },
      { file: 'missing.ts', runner: 'node' },
    ],
  );
  try {
    const result = runRunner(manifestPath);
    assert.notEqual(result.status, 0);
    assert.match(result.stdout, /FAIL missing\.ts/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('--runner node skips perry entries', () => {
  const { dir, manifestPath } = createFixtureDir(
    { 'ok.ts': PASSING, 'perry-only.ts': FAILING },
    [
      { file: 'ok.ts', runner: 'node' },
      { file: 'perry-only.ts', runner: 'perry' },
    ],
  );
  try {
    const result = runRunner(manifestPath, '--runner', 'node');
    assert.equal(result.status, 0, result.stdout + result.stderr);
    assert.match(result.stdout, /PASS ok\.ts/);
    assert.doesNotMatch(result.stdout, /perry-only\.ts/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('ci entries are skipped unless --include-ci is passed', () => {
  const { dir, manifestPath } = createFixtureDir(
    { 'ok.ts': PASSING, 'native.ts': FAILING },
    [
      { file: 'ok.ts', runner: 'node' },
      { file: 'native.ts', runner: 'node', ci: true },
    ],
  );
  try {
    const skipped = runRunner(manifestPath);
    assert.equal(skipped.status, 0, skipped.stdout + skipped.stderr);
    assert.match(skipped.stdout, /SKIP native\.ts/);

    const included = runRunner(manifestPath, '--include-ci');
    assert.notEqual(included.status, 0);
    assert.match(included.stdout, /FAIL native\.ts/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('rejects an unknown runner value in the manifest', () => {
  const { dir, manifestPath } = createFixtureDir(
    { 'ok.ts': PASSING },
    [{ file: 'ok.ts', runner: 'deno' }],
  );
  try {
    const result = runRunner(manifestPath);
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /unknown runner/i);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
