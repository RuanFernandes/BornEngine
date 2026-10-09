import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import { perryBinary, readPin } from './perry.mjs';

const VALID_COMMIT = '484345a2aa35ced2f9f67dbcc0bf052aa95eb357';

function withPin(content, check) {
  const dir = mkdtempSync(join(tmpdir(), 'perry-pin-'));
  const pinPath = join(dir, 'perry.source.json');
  writeFileSync(pinPath, content);
  try {
    return check(pinPath);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

test('readPin accepts a repository and a full commit SHA', () => {
  const pin = withPin(
    JSON.stringify({ repository: 'https://github.com/PerryTS/perry.git', commit: VALID_COMMIT }),
    readPin,
  );
  assert.deepEqual(pin, { repository: 'https://github.com/PerryTS/perry.git', commit: VALID_COMMIT });
});

test('readPin rejects branch names and abbreviated SHAs', () => {
  for (const commit of ['main', VALID_COMMIT.slice(0, 12), VALID_COMMIT.toUpperCase()]) {
    withPin(JSON.stringify({ repository: 'https://github.com/PerryTS/perry.git', commit }), (pinPath) => {
      assert.throws(() => readPin(pinPath), /40-character lowercase SHA-1/);
    });
  }
});

test('readPin rejects a missing repository', () => {
  withPin(JSON.stringify({ commit: VALID_COMMIT }), (pinPath) => {
    assert.throws(() => readPin(pinPath), /"repository" must be a non-empty string/);
  });
});

test('PERRY_BIN overrides the pinned build', () => {
  const previous = process.env.PERRY_BIN;
  process.env.PERRY_BIN = fileURLToPath(import.meta.url);
  try {
    assert.equal(perryBinary(), resolve(fileURLToPath(import.meta.url)));
  } finally {
    if (previous === undefined) delete process.env.PERRY_BIN;
    else process.env.PERRY_BIN = previous;
  }
});

test('PERRY_BIN pointing nowhere is an error, not a silent fallback', () => {
  const previous = process.env.PERRY_BIN;
  process.env.PERRY_BIN = join(tmpdir(), 'perry-binary-that-does-not-exist');
  try {
    assert.throws(() => perryBinary(), /PERRY_BIN does not exist/);
  } finally {
    if (previous === undefined) delete process.env.PERRY_BIN;
    else process.env.PERRY_BIN = previous;
  }
});
