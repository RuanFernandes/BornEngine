import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const apiDocs = await readFile(new URL('../src/content/docs/api/colyseus.md', import.meta.url), 'utf8');
const mobileDocs = await readFile(new URL('../src/content/docs/platforms/mobile.md', import.meta.url), 'utf8');
const appleDocs = await readFile(new URL('../src/content/docs/platforms/apple.md', import.meta.url), 'utf8');

test('Colyseus docs report build and runtime status for every BornEngine platform', () => {
  const matrix = apiDocs.match(/## Verified platform matrix\n([\s\S]*?)(?=\n## |$)/)?.[1] ?? '';
  assert.ok(matrix, 'missing verified platform matrix');

  for (const platform of [
    'Linux', 'macOS', 'Windows', 'Android', 'iOS', 'tvOS', 'visionOS', 'watchOS', 'Web/WASM',
  ]) {
    const row = matrix.split('\n').find((line) => line.startsWith(`| ${platform} |`));
    assert.ok(row, `missing ${platform} matrix row`);
    const columns = row.split('|').slice(1, -1).map((column) => column.trim());
    assert.equal(columns.length, 6, `${platform} row must include target, backend, build, runtime, and setup`);
    assert.match(columns[3], /^(Pending|Passed|Not tested|Failed)/, `${platform} has no explicit build status`);
    assert.match(columns[4], /^(Pending|Passed|Not tested|Failed)/, `${platform} has no explicit runtime status`);
  }

  const androidRow = matrix.split('\n').find((line) => line.startsWith('| Android |')) ?? '';
  assert.match(androidRow, /Passed on x86_64 API 35 emulator/);
  assert.match(androidRow, /ARM64 emulator smoke unavailable.*HVF_UNSUPPORTED/);
  assert.match(androidRow, /physical-device runtime not tested/);
  assert.match(apiDocs, /runtime on a physical Android ARM64 device remains unverified/);

  const watchosRow = matrix.split('\n').find((line) => line.startsWith('| watchOS |')) ?? '';
  assert.match(watchosRow, /Passed on watchOS simulator/);
});

test('platform guides list the required native network permissions', () => {
  assert.match(mobileDocs, /android\.permission\.INTERNET/);
  assert.match(appleDocs, /com\.apple\.security\.network\.client/);
  assert.match(appleDocs, /NSLocalNetworkUsageDescription/);
});
