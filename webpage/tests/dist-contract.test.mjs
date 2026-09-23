import assert from 'node:assert/strict';
import { access, readFile, readdir } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import test from 'node:test';

const distDirectory = resolve(process.env.DIST_DIR ?? new URL('../dist', import.meta.url).pathname);

async function exists(relativePath) {
  try {
    await access(join(distDirectory, relativePath));
    return true;
  } catch {
    return false;
  }
}

async function requireArtifact(relativePath, missing) {
  if (!(await exists(relativePath))) missing.push(relativePath);
}

test('production distribution contains required routes and SEO artifacts', async () => {
  const missing = [];
  for (const relativePath of [
    'index.html',
    'docs/index.html',
    '404.html',
    'robots.txt',
    'favicon.svg',
    'og-image.svg',
    '_pagefind/pagefind-ui.js',
  ]) {
    await requireArtifact(relativePath, missing);
  }

  const rootFiles = await readdir(distDirectory).catch(() => []);
  if (!rootFiles.some((file) => /^sitemap(?:-index|-\d+)?\.xml$/.test(file))) {
    missing.push('sitemap*.xml');
  }

  assert.deepEqual(missing, [], `Missing distribution artifacts in ${distDirectory}`);
});

test('key routes contain canonical and social metadata', async () => {
  const pages = [
    'index.html',
    'docs/index.html',
    'docs/getting-started/index.html',
  ];
  const failures = [];

  for (const relativePath of pages) {
    const html = await readFile(join(distDirectory, relativePath), 'utf8').catch(() => '');
    for (const pattern of [
      /<html[^>]+lang="en"/,
      /<title>[^<]+<\/title>/,
      /<meta name="description" content="[^"]+"/,
      /<link rel="canonical" href="https?:\/\//,
      /<meta property="og:image" content="https?:\/\//,
      /<meta name="twitter:card" content="summary_large_image"/,
    ]) {
      if (!pattern.test(html)) failures.push(`${relativePath}: ${pattern}`);
    }
  }

  assert.deepEqual(failures, [], 'Missing required metadata:\n' + failures.join('\n'));
});

test('robots points crawlers at an absolute sitemap', async () => {
  const robots = await readFile(join(distDirectory, 'robots.txt'), 'utf8').catch(() => '');
  assert.match(robots, /User-agent:\s*\*/);
  assert.match(robots, /Allow:\s*\//);
  assert.match(robots, /Sitemap:\s+https?:\/\/[^\s]+\/sitemap[^\s]*\.xml/);
});
