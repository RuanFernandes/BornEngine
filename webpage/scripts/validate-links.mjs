import { access, readFile, readdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { extname, join, relative, resolve } from 'node:path';

const distDirectory = resolve(
  process.env.DIST_DIR ?? process.argv[2] ?? fileURLToPath(new URL('../dist', import.meta.url)),
);
const configuredBase = process.env.BASE_PATH ?? '/BornEngine';
const basePath = configuredBase === '/' ? '/' : `/${configuredBase.replace(/^\/+|\/+$/g, '')}/`;
const site = new URL(process.env.SITE_URL ?? 'https://ruanfernandes.github.io');
site.pathname = '/';
site.search = '';
site.hash = '';

async function exists(relativePath) {
  try {
    await access(join(distDirectory, relativePath));
    return true;
  } catch {
    return false;
  }
}

async function read(relativePath) {
  try {
    return await readFile(join(distDirectory, relativePath), 'utf8');
  } catch {
    return '';
  }
}

async function walk(directory) {
  const entries = await readdir(directory, { withFileTypes: true }).catch(() => []);
  const files = [];
  for (const entry of entries) {
    const absolutePath = join(directory, entry.name);
    if (entry.isDirectory()) files.push(...await walk(absolutePath));
    else files.push(absolutePath);
  }
  return files;
}

function tagHas(tag, attribute, value) {
  return new RegExp(`${attribute}=["']${value}["']`, 'i').test(tag);
}

function hasMetaTag(html, attributes) {
  return [...html.matchAll(/<meta\b[^>]*>/gi)].some(([tag]) => (
    Object.entries(attributes).every(([attribute, value]) => tagHas(tag, attribute, value))
  ));
}

function hasCanonical(html) {
  return [...html.matchAll(/<link\b[^>]*>/gi)].some(([tag]) => (
    tagHas(tag, 'rel', 'canonical') && /href=["']https?:\/\//i.test(tag)
  ));
}

function baseRelativePath(pathname) {
  const normalizedPath = pathname.replace(/\/+/g, '/');
  if (basePath === '/') return normalizedPath.replace(/^\/+/, '');
  const withoutTrailingBase = basePath.slice(0, -1);
  if (normalizedPath === withoutTrailingBase) return '';
  if (!normalizedPath.startsWith(basePath)) return null;
  return normalizedPath.slice(basePath.length).replace(/^\/+/, '');
}

function candidatesForPath(pathname) {
  const relativePath = baseRelativePath(pathname);
  if (relativePath === null) return [];
  if (!relativePath) return ['index.html'];
  if (relativePath.endsWith('/')) return [join(relativePath, 'index.html')];
  return [relativePath, join(relativePath, 'index.html')];
}

async function localUrlExists(url) {
  const candidates = candidatesForPath(url.pathname);
  for (const candidate of candidates) {
    const resolved = resolve(distDirectory, candidate);
    if (!resolved.startsWith(`${resolve(distDirectory)}${process.platform === 'win32' ? '\\' : '/'}`)) continue;
    if (await exists(candidate)) return true;
  }
  return false;
}

function pageUrl(relativeHtmlPath) {
  const isIndexRoute = relativeHtmlPath === 'index.html' || relativeHtmlPath.endsWith('/index.html');
  const withoutIndex = relativeHtmlPath === 'index.html'
    ? ''
    : relativeHtmlPath.replace(/\/index\.html$/, '').replace(/\.html$/, '');
  return new URL(`${basePath}${withoutIndex}${isIndexRoute && withoutIndex ? '/' : ''}`, site);
}

function isSkippableReference(reference) {
  return !reference
    || reference.startsWith('#')
    || /^(?:mailto:|tel:|javascript:|data:|blob:)/i.test(reference)
    || reference.startsWith('//');
}

async function validate() {
  const errors = [];
  const requiredArtifacts = [
    'index.html',
    'docs/index.html',
    '404.html',
    'robots.txt',
    'favicon.svg',
    'og-image.svg',
    '_pagefind/pagefind-ui.js',
  ];

  for (const artifact of requiredArtifacts) {
    if (!(await exists(artifact))) errors.push(`Missing distribution artifact: ${artifact}`);
  }

  const rootFiles = await readdir(distDirectory).catch(() => []);
  const sitemapFiles = rootFiles.filter((file) => /^sitemap(?:-index|-\d+)?\.xml$/.test(file));
  if (sitemapFiles.length === 0) errors.push('Missing distribution artifact: sitemap*.xml');

  const htmlFiles = (await walk(distDirectory))
    .filter((file) => extname(file).toLowerCase() === '.html')
    .map((file) => relative(distDirectory, file).replaceAll('\\', '/'));

  for (const htmlFile of htmlFiles) {
    const html = await read(htmlFile);
    if (!/<html\b[^>]*lang=["']en["']/i.test(html)) errors.push(`${htmlFile}: missing lang="en"`);
    if (!/<title>[^<]+<\/title>/i.test(html)) errors.push(`${htmlFile}: missing title`);
    if (!hasMetaTag(html, { name: 'description' })) errors.push(`${htmlFile}: missing meta description`);
    if (!hasCanonical(html)) errors.push(`${htmlFile}: missing canonical URL`);
    if (!/<h1\b[^>]*>[\s\S]*?<\/h1>/i.test(html)) errors.push(`${htmlFile}: missing h1`);
    if (!hasMetaTag(html, { property: 'og:image' })) errors.push(`${htmlFile}: missing Open Graph image`);
    if (!hasMetaTag(html, { name: 'twitter:card' })) errors.push(`${htmlFile}: missing Twitter card`);

    const currentPage = pageUrl(htmlFile);
    for (const [, reference] of html.matchAll(/\b(?:href|src)\s*=\s*["']([^"']+)["']/gi)) {
      if (isSkippableReference(reference)) continue;
      let target;
      try {
        target = new URL(reference, currentPage);
      } catch {
        errors.push(`${htmlFile}: invalid URL ${reference}`);
        continue;
      }
      if (!['http:', 'https:'].includes(target.protocol) || target.origin !== site.origin) continue;
      if (!(await localUrlExists(target))) errors.push(`${htmlFile}: missing local link ${reference}`);
    }
  }

  const robots = await read('robots.txt');
  if (!/^User-agent:\s*\*/im.test(robots)) errors.push('robots.txt: missing User-agent rule');
  if (!/^Allow:\s*\//im.test(robots)) errors.push('robots.txt: missing Allow rule');
  const robotsSitemaps = [...robots.matchAll(/^Sitemap:\s*(\S+)/gim)].map(([, url]) => url);
  if (robotsSitemaps.length === 0) errors.push('robots.txt: missing absolute Sitemap URL');
  for (const sitemapReference of robotsSitemaps) {
    try {
      const sitemapUrl = new URL(sitemapReference);
      if (sitemapUrl.origin !== site.origin) {
        errors.push(`robots.txt: Sitemap must use ${site.origin}`);
      } else if (!(await localUrlExists(sitemapUrl))) {
        errors.push(`robots.txt: Sitemap does not exist in dist: ${sitemapReference}`);
      }
    } catch {
      errors.push(`robots.txt: invalid Sitemap URL ${sitemapReference}`);
    }
  }

  for (const sitemapFile of sitemapFiles) {
    const sitemap = await read(sitemapFile);
    for (const [, location] of sitemap.matchAll(/<loc>([^<]+)<\/loc>/gi)) {
      try {
        const sitemapUrl = new URL(location.replaceAll('&amp;', '&'));
        if (sitemapUrl.origin === site.origin && !(await localUrlExists(sitemapUrl))) {
          errors.push(`${sitemapFile}: missing URL ${location}`);
        }
      } catch {
        errors.push(`${sitemapFile}: invalid URL ${location}`);
      }
    }
  }

  if (errors.length > 0) {
    console.error(`BornEngine distribution validation failed in ${distDirectory}`);
    for (const error of errors) console.error(`- ${error}`);
    process.exitCode = 1;
    return;
  }

  console.log(`BornEngine distribution valid: ${htmlFiles.length} HTML pages, ${sitemapFiles.length} sitemap files, base ${basePath}`);
}

await validate();
