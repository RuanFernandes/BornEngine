#!/usr/bin/env node

import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const EXAMPLES_ROOT = join(ROOT, 'examples');
const TEMP_DIRS = new Set(['node_modules', 'target', 'dist', 'build', '.git']);
const NON_GAME_TS_DIRS = new Set(['server', 'test', 'tests']);

export const EXAMPLE_ENTRYPOINTS = [
  'examples/2d-platformer/main.ts',
  'examples/2d-top-down/main.ts',
  'examples/bistro/main.ts',
  'examples/colyseus-smoke/main.ts',
  'examples/colyseus-smoke/lifecycle-smoke.ts',
  'examples/colyseus-smoke/math-smoke.ts',
  'examples/dungeon-crawl/main.ts',
  'examples/intel-sponza/main.ts',
  'examples/isometric-rpg/main.ts',
  'examples/kart-racer/main.ts',
  'examples/multiplayer-arena/client/main.ts',
  'examples/multiplayer-chat/client/main.ts',
  'examples/pbr-spheres/main.ts',
  'examples/perry-embed/main.ts',
  'examples/physics2d-tilemap/main.ts',
  'examples/pong/main.ts',
  'examples/renderer-test/main.ts',
  'examples/scene-graph/interactive.ts',
  'examples/scene-graph/main.ts',
  'examples/scene-graph/r3f-bridge.ts',
  'examples/scene-graph/room.ts',
  'examples/scene-graph/shadows.ts',
  'examples/scripted-actor/main.ts',
  'examples/space-blaster/main.ts',
  'examples/sponza/main.ts',
  'examples/sprite-animation/main.ts',
  'examples/test-gltf-watch/main.ts',
  'examples/test-scene-watch/main.ts',
  'examples/test3d/main.ts',
  'examples/ui-smoke/main.ts',
  'examples/voxel-sandbox/main.ts',
  'examples/world-viewer/main.ts',
];

export function inspectSource(filePath, source) {
  const issues = [];
  const normalizedPath = filePath.replaceAll('\\', '/');

  if (/\b(?:from|import)\s*(['"])bloom(?:\/[^'"]*)?\1/i.test(source)) {
    issues.push(`${normalizedPath}: Bloom-only import; use a BornEngine export`);
  }

  if (/\b(?:game|this\.game)\.run\s*\(\s*\{[\s\S]{0,500}?\b(?:update|render|onStop)\s*[:(]/.test(source)) {
    issues.push(`${normalizedPath}: callback-based game.run lifecycle; use a Game subclass`);
  }

  const legacyFacadeNames = [
    'beginMode3D',
    'endMode3D',
    'drawText',
    'drawModel',
    'drawGrid',
    'drawCube',
    'createSceneNode',
    'sceneNode',
    'createMesh',
    'loadModel',
    'attachModelToNode',
    'addDirectionalLight',
    'addPointLight',
    'setSceneNode[A-Z]\\w*',
  ];
  const legacyFunctionPattern = new RegExp(
    `(?:^|\\n)\\s*function\\s+(${legacyFacadeNames.join('|')})\\b`,
    'g',
  );
  for (const match of source.matchAll(legacyFunctionPattern)) {
    issues.push(`${normalizedPath}: legacy free-function facade "${match[1]}"; use a sample-specific helper name or the Game API directly`);
  }

  if (/\bBloomView\b/.test(source)) {
    const perryBoundary = normalizedPath === 'examples/perry-embed/main.ts';
    const importsPerryUi = /\bfrom\s*(['"])perry\/ui\1/.test(source);
    if (!perryBoundary || !importsPerryUi) {
      issues.push(`${normalizedPath}: BloomView is reserved for Perry's perry-embed UI boundary`);
    }
  }

  return issues;
}

export function inspectPackage(filePath, manifest) {
  const issues = [];
  const normalizedPath = filePath.replaceAll('\\', '/');

  if (typeof manifest.name === 'string' && manifest.name.toLowerCase().startsWith('bloom-')) {
    issues.push(`${normalizedPath}: Bloom-branded package name; rename it for BornEngine`);
  }

  const dependencySections = [
    manifest.dependencies,
    manifest.devDependencies,
    manifest.optionalDependencies,
    manifest.peerDependencies,
  ];
  if (dependencySections.some((section) => section && Object.hasOwn(section, 'bloom'))) {
    issues.push(`${normalizedPath}: Bloom package dependency alias; depend on @bornengine/engine`);
  }

  const dependsOnBornEngine = dependencySections.some(
    (section) => section && Object.hasOwn(section, '@bornengine/engine'),
  );
  if (dependsOnBornEngine) {
    const nativeAllowlist = manifest.perry?.allow?.nativeLibrary;
    if (!Array.isArray(nativeAllowlist)
      || !nativeAllowlist.some((moduleName) => moduleName === '@bornengine/engine' || moduleName === '@bornengine/engine/*')) {
      issues.push(`${normalizedPath}: Perry native-library allowlist must include @bornengine/engine`);
    }
  }

  return issues;
}

export function validateInventory(entries, discoveredFiles) {
  const issues = [];
  const counts = new Map();

  for (const entry of entries) {
    counts.set(entry, (counts.get(entry) ?? 0) + 1);
  }

  for (const [entry, count] of counts) {
    if (count > 1) issues.push(`${entry}: listed more than once in the Perry entrypoint inventory`);
    if (!discoveredFiles.includes(entry)) issues.push(`${entry}: inventory entrypoint does not exist or is not runnable`);
  }

  for (const file of discoveredFiles) {
    if (!counts.has(file)) issues.push(`${file}: runnable Perry entrypoint is not listed in the inventory`);
  }

  return issues;
}

function walkFiles(directory, accept) {
  if (!existsSync(directory)) return [];
  const files = [];
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    if (entry.isDirectory() && !TEMP_DIRS.has(entry.name)) {
      files.push(...walkFiles(join(directory, entry.name), accept));
    } else if (entry.isFile() && accept(entry.name, relative(ROOT, join(directory, entry.name)).replaceAll('\\', '/'))) {
      files.push(relative(ROOT, join(directory, entry.name)).replaceAll('\\', '/'));
    }
  }
  return files.sort();
}

function discoverExampleSources() {
  return walkFiles(EXAMPLES_ROOT, (name) => name.endsWith('.ts'));
}

function discoverRunnableEntrypoints() {
  return discoverExampleSources().filter((file) => {
    const segments = file.split('/');
    if (segments.some((segment) => NON_GAME_TS_DIRS.has(segment))) return false;
    if (basename(file) === 'main.ts') return true;
    if (segments[1] === 'scene-graph') return true;
    return file === 'examples/colyseus-smoke/lifecycle-smoke.ts'
      || file === 'examples/colyseus-smoke/math-smoke.ts';
  });
}

function inspectAllExamples() {
  const issues = [];
  for (const file of discoverExampleSources()) {
    issues.push(...inspectSource(file, readFileSync(join(ROOT, file), 'utf8')));
  }

  for (const file of walkFiles(EXAMPLES_ROOT, (name) => name === 'package.json')) {
    try {
      const manifest = JSON.parse(readFileSync(join(ROOT, file), 'utf8'));
      issues.push(...inspectPackage(file, manifest));
    } catch (error) {
      issues.push(`${file}: invalid package.json (${error.message})`);
    }
  }

  issues.push(...validateInventory(EXAMPLE_ENTRYPOINTS, discoverRunnableEntrypoints()));
  return issues;
}

function printIssues(issues) {
  for (const issue of issues) console.error(`FAIL ${issue}`);
}

function compileEntrypoints(buildRoot) {
  let failures = 0;
  for (const file of EXAMPLE_ENTRYPOINTS) {
    const sourcePath = join(ROOT, file);
    const outputPath = join(buildRoot, file.replaceAll('/', '-').replace(/\.ts$/, ''));
    const result = spawnSync('perry', [
      'compile',
      sourcePath,
      '--target',
      'linux',
      '--no-link',
      '-o',
      outputPath,
    ], {
      cwd: buildRoot,
      encoding: 'utf8',
      env: { ...process.env, PERRY_ALLOW_PERRY_FEATURES: '1' },
      timeout: 180_000,
      maxBuffer: 8 * 1024 * 1024,
    });

    if (result.error || result.status !== 0) {
      failures += 1;
      console.error(`FAIL Perry ${file}`);
      if (result.error) console.error(result.error.message);
      if (result.stdout?.trim()) console.error(result.stdout.trim());
      if (result.stderr?.trim()) console.error(result.stderr.trim());
    } else {
      console.log(`PASS Perry ${file}`);
    }
  }
  return failures;
}

function runServerChecks() {
  let failures = 0;
  for (const example of ['multiplayer-arena', 'multiplayer-chat']) {
    const serverRoot = join(EXAMPLES_ROOT, example, 'server');
    const packagePath = join(serverRoot, 'package.json');
    if (!existsSync(packagePath)) {
      failures += 1;
      console.error(`FAIL ${example}: server/package.json is missing`);
      continue;
    }

    if (!existsSync(join(serverRoot, 'node_modules'))) {
      const install = spawnSync('npm', ['ci', '--prefix', serverRoot], {
        cwd: ROOT,
        encoding: 'utf8',
        timeout: 180_000,
        maxBuffer: 8 * 1024 * 1024,
      });
      if (install.error || install.status !== 0) {
        failures += 1;
        console.error(`FAIL ${example}: npm ci`);
        if (install.error) console.error(install.error.message);
        if (install.stdout?.trim()) console.error(install.stdout.trim());
        if (install.stderr?.trim()) console.error(install.stderr.trim());
        continue;
      }
    }

    const result = spawnSync('npm', ['test', '--prefix', serverRoot], {
      cwd: ROOT,
      encoding: 'utf8',
      timeout: 180_000,
      maxBuffer: 8 * 1024 * 1024,
    });
    if (result.error || result.status !== 0) {
      failures += 1;
      console.error(`FAIL ${example}: server tests`);
      if (result.error) console.error(result.error.message);
      if (result.stdout?.trim()) console.error(result.stdout.trim());
      if (result.stderr?.trim()) console.error(result.stderr.trim());
    } else {
      console.log(`PASS ${example}: server tests`);
      if (result.stdout?.trim()) console.log(result.stdout.trim());
    }
  }
  return failures;
}

export function run(args = process.argv.slice(2)) {
  const staticOnly = args.includes('--static');
  const issues = inspectAllExamples();
  if (issues.length > 0) {
    printIssues(issues);
    console.error(`Example audit failed with ${issues.length} issue(s).`);
    return 1;
  }

  console.log(`PASS static example audit (${EXAMPLE_ENTRYPOINTS.length} Perry entrypoints)`);
  if (staticOnly) return 0;

  const buildRoot = mkdtempSync(join(tmpdir(), 'bornengine-examples-'));
  try {
    const failures = compileEntrypoints(buildRoot) + runServerChecks();
    if (failures > 0) {
      console.error(`Example checks failed with ${failures} build/test failure(s).`);
      return 1;
    }
    console.log('All example checks passed.');
    return 0;
  } finally {
    rmSync(buildRoot, { recursive: true, force: true });
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exitCode = run();
}
