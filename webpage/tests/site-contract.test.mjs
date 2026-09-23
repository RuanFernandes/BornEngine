import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

test('shared layouts expose accessible metadata and navigation hooks', async () => {
  const [site, docs, sidebar, globalStyles] = await Promise.all([
    readFile(new URL('../src/layouts/SiteLayout.astro', import.meta.url), 'utf8'),
    readFile(new URL('../src/layouts/DocsLayout.astro', import.meta.url), 'utf8'),
    readFile(new URL('../src/components/DocsSidebar.astro', import.meta.url), 'utf8'),
    readFile(new URL('../src/styles/global.css', import.meta.url), 'utf8'),
  ]);
  assert.match(site, /<html[^>]+lang=["']en/);
  assert.match(site, /canonical/);
  assert.match(docs, /On this page/);
  assert.match(docs, /Breadcrumb/);
  assert.match(sidebar, /aria-current/);
  assert.match(globalStyles, /\.site-header\s*\{/);
  assert.match(globalStyles, /\.brand\s*\{/);
  assert.match(globalStyles, /\.site-footer\s*\{/);
});
