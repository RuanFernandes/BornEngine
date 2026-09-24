import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

test('shared layouts expose accessible metadata and navigation hooks', async () => {
  const [site, docs, sidebar, header, themeToggle, themeScript, tokens, docsStyles, globalStyles, codeBlock, homepageStyles] = await Promise.all([
    readFile(new URL('../src/layouts/SiteLayout.astro', import.meta.url), 'utf8'),
    readFile(new URL('../src/layouts/DocsLayout.astro', import.meta.url), 'utf8'),
    readFile(new URL('../src/components/DocsSidebar.astro', import.meta.url), 'utf8'),
    readFile(new URL('../src/components/Header.astro', import.meta.url), 'utf8'),
    readFile(new URL('../src/components/ThemeToggle.astro', import.meta.url), 'utf8'),
    readFile(new URL('../src/scripts/theme.ts', import.meta.url), 'utf8').catch(() => ''),
    readFile(new URL('../src/styles/tokens.css', import.meta.url), 'utf8'),
    readFile(new URL('../src/styles/docs.css', import.meta.url), 'utf8'),
    readFile(new URL('../src/styles/global.css', import.meta.url), 'utf8'),
    readFile(new URL('../src/components/CodeBlock.astro', import.meta.url), 'utf8'),
    readFile(new URL('../src/styles/homepage.css', import.meta.url), 'utf8'),
  ]);
  assert.match(site, /<html[^>]+lang=["']en/);
  assert.match(site, /theme\?: 'ink' \| 'paper' \| 'system'/);
  assert.match(site, /scripts\/theme\.ts/);
  assert.match(site, /canonical/);
  assert.match(docs, /On this page/);
  assert.match(docs, /Breadcrumb/);
  assert.match(docs, /theme = 'system'/);
  assert.match(sidebar, /aria-current/);
  assert.match(header, /ThemeToggle/);
  assert.match(themeToggle, /data-theme-toggle/);
  assert.match(themeScript, /theme-state\.mjs/);
  assert.match(tokens, /--docs-canvas/);
  assert.match(tokens, /--docs-text/);
  assert.match(tokens, /--docs-code-surface/);
  assert.match(docsStyles, /\.theme-ink \.docs-article/);
  assert.match(docsStyles, /\.theme-ink \.docs-sidebar__group a/);
  assert.match(themeScript, /resolveTheme/);
  assert.match(themeScript, /document\.documentElement\.dataset\.theme = currentTheme\(\)/);
  assert.match(globalStyles, /\.theme-toggle\s*\{/);
  assert.match(globalStyles, /min-width:\s*44px/);
  assert.match(globalStyles, /\.site-header\s*\{/);
  assert.match(globalStyles, /\.brand\s*\{/);
  assert.match(globalStyles, /\.site-footer\s*\{/);
  assert.match(globalStyles, /\.theme-ink \.site-header__nav \.site-header__cta/);
  assert.match(codeBlock, /data-monaco-code/);
  assert.match(codeBlock, /data-monaco-editor/);
  assert.match(codeBlock, /data-monaco-fallback/);
  assert.match(homepageStyles, /line-height:\s*0\.96/);
});
