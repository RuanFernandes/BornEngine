import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const DEFAULT_MANIFEST = join(REPO_ROOT, 'tests', 'game-runtime', 'harnesses.json');
const TS_RESOLUTION_HOOK = join(REPO_ROOT, 'tests', 'world2d', 'register-ts-resolution.mjs');
const RUNNERS = ['node', 'perry'];

function parseArgs(argv) {
  const options = { manifest: DEFAULT_MANIFEST, runner: null, includeCi: false };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--manifest') options.manifest = resolve(argv[++i] ?? '');
    else if (arg === '--runner') options.runner = argv[++i] ?? '';
    else if (arg === '--include-ci') options.includeCi = true;
    else throw new Error(`unknown argument: ${arg}`);
  }
  if (options.runner !== null && !RUNNERS.includes(options.runner)) {
    throw new Error(`--runner must be one of: ${RUNNERS.join(', ')}`);
  }
  return options;
}

function loadManifest(manifestPath) {
  const entries = JSON.parse(readFileSync(manifestPath, 'utf8'));
  if (!Array.isArray(entries)) throw new Error(`${manifestPath}: manifest must be an array`);
  for (const entry of entries) {
    if (typeof entry?.file !== 'string' || entry.file.length === 0) {
      throw new Error(`${manifestPath}: entry without a file: ${JSON.stringify(entry)}`);
    }
    if (!RUNNERS.includes(entry.runner)) {
      throw new Error(`${manifestPath}: unknown runner "${entry.runner}" for ${entry.file}`);
    }
    if (entry.disabled !== undefined && (typeof entry.disabled !== 'string' || entry.disabled.length === 0)) {
      throw new Error(`${manifestPath}: "disabled" must be a non-empty reason string for ${entry.file}`);
    }
  }
  return entries;
}

function commandFor(entry, filePath) {
  if (entry.runner === 'node') {
    return [
      process.execPath,
      [
        '--import', TS_RESOLUTION_HOOK,
        '--disable-warning=ExperimentalWarning',
        '--disable-warning=MODULE_TYPELESS_PACKAGE_JSON',
        filePath,
      ],
    ];
  }
  return [process.env.PERRY_BIN || 'perry', ['run', '--local', filePath]];
}

function envFor(entry) {
  if (entry.runner === 'perry') return { ...process.env, PERRY_ALLOW_PERRY_FEATURES: '1' };
  return process.env;
}

function runEntry(entry, manifestDir) {
  const filePath = resolve(manifestDir, entry.file);
  if (!existsSync(filePath)) return { ok: false, output: `file not found: ${filePath}` };
  const [command, args] = commandFor(entry, filePath);
  const result = spawnSync(command, args, {
    cwd: REPO_ROOT,
    env: envFor(entry),
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
  });
  const output = `${result.stdout ?? ''}${result.stderr ?? ''}${result.error ? `${result.error.message}\n` : ''}`;
  return { ok: result.status === 0 && !result.error, output };
}

function main() {
  const options = parseArgs(process.argv.slice(2));
  const entries = loadManifest(options.manifest);
  const manifestDir = dirname(options.manifest);
  let failed = 0;
  let passed = 0;
  let disabled = 0;
  for (const entry of entries) {
    if (options.runner !== null && entry.runner !== options.runner) continue;
    if (entry.disabled !== undefined) {
      console.log(`SKIP ${entry.file}: ${entry.disabled}`);
      disabled += 1;
      continue;
    }
    if (entry.ci === true && !options.includeCi) {
      console.log(`SKIP ${entry.file} (ci)`);
      continue;
    }
    const { ok, output } = runEntry(entry, manifestDir);
    console.log(`${ok ? 'PASS' : 'FAIL'} ${entry.file}`);
    if (ok) {
      passed += 1;
    } else {
      failed += 1;
      process.stdout.write(output.split('\n').map((line) => `    ${line}`).join('\n'));
      process.stdout.write('\n');
    }
  }
  console.log(`${passed} passed, ${failed} failed, ${disabled} disabled`);
  process.exitCode = failed > 0 ? 1 : 0;
}

try {
  main();
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
}
