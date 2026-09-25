import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { apiCoverage, recipeCoverage } from '../src/data/docs-coverage.mjs';

test('declares every public module and recipe route', () => {
  assert.equal(apiCoverage.length, 14);
  assert.deepEqual(apiCoverage.map((item) => item.slug), [
    'game', 'core', 'shapes', 'textures', 'text', 'audio', 'models', 'math',
    'scene', 'physics', 'vfx', 'world', 'mobile', 'ui',
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
  const coverage = new Set(['game', 'physics', 'vfx', 'world', 'mobile', 'ui']);
  for (const item of apiCoverage.filter((entry) => coverage.has(entry.slug))) {
    const source = await readFile(new URL(`../src/content/docs/${item.file}`, import.meta.url), 'utf8');
    const fences = source.match(/^```(?:ts|typescript)(?:\s|$)/gm) ?? [];
    assert.ok(fences.length >= 2, `${item.file} needs at least two TypeScript examples`);
    for (const section of item.sections) {
      assert.match(source, new RegExp(`^##\\s+${section.replace(/[.*+?^${}()|[\\]\\]/g, '\\\\$&')}\\s*$`, 'm'));
    }
  }
});

test('scene manager and OOP renderer sections include usable TypeScript examples', async () => {
  const item = apiCoverage.find((entry) => entry.slug === 'game');
  const source = await readFile(new URL(`../src/content/docs/${item.file}`, import.meta.url), 'utf8');

  for (const section of ['Scene manager', 'OOP renderer nodes']) {
    const sectionContent = source.split(/^##\s+/m).find((part) => part.startsWith(`${section}\n`));
    assert.ok(sectionContent, `${section} heading is required`);
    assert.match(sectionContent, /^```(?:ts|typescript)(?:\s|$)/m, `${section} needs a TypeScript example`);
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
