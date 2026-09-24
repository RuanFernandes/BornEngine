import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { apiCoverage, recipeCoverage } from '../src/data/docs-coverage.mjs';

test('declares every public module and recipe route', () => {
  assert.equal(apiCoverage.length, 12);
  assert.deepEqual(apiCoverage.map((item) => item.slug), [
    'core', 'shapes', 'textures', 'text', 'audio', 'models', 'math',
    'scene', 'physics', 'vfx', 'world', 'mobile',
  ]);
  assert.deepEqual(recipeCoverage.map((item) => item.slug), [
    '2d-game', '3d-scene', 'physics-gameplay', 'assets-and-worlds', 'audio-and-ui',
  ]);
});

test('links every coverage route from the sidebar navigation', async () => {
  const navigation = await readFile(new URL('../src/data/navigation.ts', import.meta.url), 'utf8');
  for (const item of [...apiCoverage, ...recipeCoverage]) {
    assert.match(navigation, new RegExp(`href: ['"]${item.href.replaceAll('/', '\\/')}['"]`));
  }
});
