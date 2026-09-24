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

test('foundational API pages contain their required sections and examples', async () => {
  const foundational = new Set(['core', 'shapes', 'textures', 'text', 'math']);
  for (const item of apiCoverage.filter((entry) => foundational.has(entry.slug))) {
    const source = await readFile(new URL(`../src/content/docs/${item.file}`, import.meta.url), 'utf8');
    const fences = source.match(/^```(?:ts|typescript)(?:\s|$)/gm) ?? [];
    assert.ok(fences.length >= 2, `${item.file} needs at least two TypeScript examples`);
    for (const section of item.sections) {
      assert.match(source, new RegExp(`^##\\s+${section.replace(/[.*+?^${}()|[\\]\\]/g, '\\\\$&')}\\s*$`, 'm'));
    }
  }
});

test('asset and scene API pages contain their required sections and examples', async () => {
  const coverage = new Set(['audio', 'models', 'scene']);
  for (const item of apiCoverage.filter((entry) => coverage.has(entry.slug))) {
    const source = await readFile(new URL(`../src/content/docs/${item.file}`, import.meta.url), 'utf8');
    const fences = source.match(/^```(?:ts|typescript)(?:\s|$)/gm) ?? [];
    assert.ok(fences.length >= 2, `${item.file} needs at least two TypeScript examples`);
    for (const section of item.sections) {
      assert.match(source, new RegExp(`^##\\s+${section.replace(/[.*+?^${}()|[\\]\\]/g, '\\\\$&')}\\s*$`, 'm'));
    }
  }
});

test('gameplay systems API pages contain their required sections and examples', async () => {
  const coverage = new Set(['physics', 'vfx', 'world', 'mobile']);
  for (const item of apiCoverage.filter((entry) => coverage.has(entry.slug))) {
    const source = await readFile(new URL(`../src/content/docs/${item.file}`, import.meta.url), 'utf8');
    const fences = source.match(/^```(?:ts|typescript)(?:\s|$)/gm) ?? [];
    assert.ok(fences.length >= 2, `${item.file} needs at least two TypeScript examples`);
    for (const section of item.sections) {
      assert.match(source, new RegExp(`^##\\s+${section.replace(/[.*+?^${}()|[\\]\\]/g, '\\\\$&')}\\s*$`, 'm'));
    }
  }
});

test('composition recipes contain the complete learning path', async () => {
  for (const item of recipeCoverage) {
    const source = await readFile(new URL(`../src/content/docs/${item.file}`, import.meta.url), 'utf8');
    const fences = source.match(/^```(?:ts|typescript)(?:\s|$)/gm) ?? [];
    assert.ok(fences.length >= 2, `${item.file} needs at least two TypeScript examples`);
    for (const section of item.sections) {
      assert.match(source, new RegExp(`^##\\s+${section.replace(/[.*+?^${}()|[\\]\\]/g, '\\\\$&')}\\s*$`, 'm'));
    }
  }
});
