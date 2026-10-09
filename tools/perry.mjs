import { spawnSync } from 'node:child_process';
import { copyFileSync, existsSync, mkdirSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const PIN_PATH = join(REPO_ROOT, 'perry.source.json');
const SOURCE_DIR = join(REPO_ROOT, '.perry-src');
const CHECKOUT_DIR = join(SOURCE_DIR, 'perry');
const BUILD_STAMP = join(SOURCE_DIR, 'built-commit');
const EXE_NAME = process.platform === 'win32' ? 'perry.exe' : 'perry';
const BUILT_BINARY = join(CHECKOUT_DIR, 'target', 'release', EXE_NAME);
const CARGO_PACKAGES = ['perry', 'perry-runtime', 'perry-stdlib', 'perry-runtime-static', 'perry-stdlib-static'];

export function readPin(pinPath = PIN_PATH) {
  const pin = JSON.parse(readFileSync(pinPath, 'utf8'));
  if (typeof pin.repository !== 'string' || pin.repository.length === 0) {
    throw new Error(`${pinPath}: "repository" must be a non-empty string`);
  }
  if (!/^[0-9a-f]{40}$/.test(pin.commit ?? '')) {
    throw new Error(`${pinPath}: "commit" must be a full 40-character lowercase SHA-1`);
  }
  return pin;
}

function run(command, args, cwd) {
  const result = spawnSync(command, args, { cwd, stdio: 'inherit' });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`${command} ${args.join(' ')} exited with ${result.status}`);
}

function isBuiltFor(pin) {
  return existsSync(BUILT_BINARY) && existsSync(BUILD_STAMP) && readFileSync(BUILD_STAMP, 'utf8').trim() === pin.commit;
}

function checkoutPin(pin) {
  if (!existsSync(join(CHECKOUT_DIR, '.git'))) {
    mkdirSync(CHECKOUT_DIR, { recursive: true });
    run('git', ['init', '--quiet'], CHECKOUT_DIR);
    run('git', ['remote', 'add', 'origin', pin.repository], CHECKOUT_DIR);
  }
  run('git', ['fetch', '--depth', '1', 'origin', pin.commit], CHECKOUT_DIR);
  run('git', ['checkout', '--detach', '--quiet', pin.commit], CHECKOUT_DIR);
}

function buildPin(pin) {
  checkoutPin(pin);
  rmSync(BUILD_STAMP, { force: true });
  run('cargo', ['build', '--release', ...CARGO_PACKAGES.flatMap((name) => ['-p', name])], CHECKOUT_DIR);
  writeFileSync(BUILD_STAMP, `${pin.commit}\n`);
}

function linkIntoNodeModules() {
  if (!existsSync(join(REPO_ROOT, 'node_modules'))) return;
  const binDir = join(REPO_ROOT, 'node_modules', '.bin');
  mkdirSync(binDir, { recursive: true });
  const link = join(binDir, EXE_NAME);
  rmSync(link, { force: true });
  if (process.platform === 'win32') copyFileSync(BUILT_BINARY, link);
  else symlinkSync(BUILT_BINARY, link);
}

export function perryBinary() {
  if (process.env.PERRY_BIN) {
    const override = resolve(process.env.PERRY_BIN);
    if (!existsSync(override)) throw new Error(`PERRY_BIN does not exist: ${override}`);
    return override;
  }
  const pin = readPin();
  if (!isBuiltFor(pin)) {
    throw new Error(`Perry ${pin.commit} is not built; run: npm run perry:setup`);
  }
  return BUILT_BINARY;
}

function setup() {
  if (process.env.PERRY_BIN) {
    process.stdout.write(`${perryBinary()}\n`);
    return;
  }
  const pin = readPin();
  if (!isBuiltFor(pin)) buildPin(pin);
  linkIntoNodeModules();
  process.stdout.write(`${BUILT_BINARY}\n`);
}

function main(argv) {
  const [command = 'setup'] = argv;
  if (command === 'setup') return setup();
  if (command === 'path') return void process.stdout.write(`${perryBinary()}\n`);
  throw new Error(`usage: node tools/perry.mjs setup|path (got "${command}")`);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    main(process.argv.slice(2));
  } catch (error) {
    process.stderr.write(`${error.message}\n`);
    process.exit(1);
  }
}
