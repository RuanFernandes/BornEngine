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

test('disabled entries print SKIP with the reason, are not run, and do not affect the exit code', () => {
  const { dir, manifestPath } = createFixtureDir(
    { 'ok.ts': PASSING, 'broken.ts': FAILING },
    [
      { file: 'ok.ts', runner: 'node' },
      { file: 'broken.ts', runner: 'node', disabled: 'crashes under the pinned runtime' },
    ],
  );
  try {
    const result = runRunner(manifestPath);
    assert.equal(result.status, 0, result.stdout + result.stderr);
    assert.match(result.stdout, /PASS ok\.ts/);
    assert.match(result.stdout, /SKIP broken\.ts: crashes under the pinned runtime/);
    assert.doesNotMatch(result.stdout, /(PASS|FAIL) broken\.ts/);
    assert.match(result.stdout, /1 passed, 0 failed, 1 disabled/);

    const withCi = runRunner(manifestPath, '--include-ci');
    assert.equal(withCi.status, 0, withCi.stdout + withCi.stderr);
    assert.match(withCi.stdout, /SKIP broken\.ts: crashes under the pinned runtime/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('disabled takes precedence over ci, with or without --include-ci', () => {
  const { dir, manifestPath } = createFixtureDir(
    { 'both.ts': FAILING },
    [{ file: 'both.ts', runner: 'node', ci: true, disabled: 'known crash' }],
  );
  try {
    for (const args of [[], ['--include-ci']]) {
      const result = runRunner(manifestPath, ...args);
      assert.equal(result.status, 0, result.stdout + result.stderr);
      assert.match(result.stdout, /SKIP both\.ts: known crash/);
      assert.doesNotMatch(result.stdout, /\(ci\)/);
      assert.doesNotMatch(result.stdout, /(PASS|FAIL) both\.ts/);
    }
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('a failing harness still fails the run when another entry is disabled', () => {
  const { dir, manifestPath } = createFixtureDir(
    { 'bad.ts': FAILING, 'off.ts': FAILING },
    [
      { file: 'bad.ts', runner: 'node' },
      { file: 'off.ts', runner: 'node', disabled: 'known crash' },
    ],
  );
  try {
    const result = runRunner(manifestPath);
    assert.notEqual(result.status, 0);
    assert.match(result.stdout, /FAIL bad\.ts/);
    assert.match(result.stdout, /SKIP off\.ts: known crash/);
    assert.match(result.stdout, /0 passed, 1 failed, 1 disabled/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('rejects an empty disabled reason in the manifest', () => {
  const { dir, manifestPath } = createFixtureDir(
    { 'ok.ts': PASSING },
    [{ file: 'ok.ts', runner: 'node', disabled: '' }],
  );
  try {
    const result = runRunner(manifestPath);
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /disabled/i);
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

const FAKE_PERRY = '#!/bin/sh\n[ "$PERRY_ALLOW_PERRY_FEATURES" = "1" ] || exit 3\n[ "$HARNESS_PROBE" = "kept" ] || exit 4\n';

test('perry entries run with PERRY_ALLOW_PERRY_FEATURES=1 and the rest of the environment', { skip: process.platform === 'win32' }, () => {
  const { dir, manifestPath } = createFixtureDir(
    { 'native.ts': PASSING },
    [{ file: 'native.ts', runner: 'perry' }],
  );
  writeFileSync(join(dir, 'perry'), FAKE_PERRY, { mode: 0o755 });
  try {
    const result = spawnSync(process.execPath, [runnerPath, '--manifest', manifestPath], {
      cwd: repoRoot,
      encoding: 'utf8',
      env: {
        ...process.env,
        PATH: `${dir}:${process.env.PATH}`,
        PERRY_ALLOW_PERRY_FEATURES: '0',
        HARNESS_PROBE: 'kept',
      },
    });
    assert.equal(result.status, 0, result.stdout + result.stderr);
    assert.match(result.stdout, /PASS native\.ts/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('node entries do not receive PERRY_ALLOW_PERRY_FEATURES', () => {
  const { dir, manifestPath } = createFixtureDir(
    { 'plain.ts': 'if (process.env.PERRY_ALLOW_PERRY_FEATURES !== undefined) process.exit(1);\n' },
    [{ file: 'plain.ts', runner: 'node' }],
  );
  try {
    const env = { ...process.env };
    delete env.PERRY_ALLOW_PERRY_FEATURES;
    const result = spawnSync(process.execPath, [runnerPath, '--manifest', manifestPath], {
      cwd: repoRoot,
      encoding: 'utf8',
      env,
    });
    assert.equal(result.status, 0, result.stdout + result.stderr);
    assert.match(result.stdout, /PASS plain\.ts/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
