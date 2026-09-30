import { spawn } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { cpSync, existsSync, rmSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import { resolveEngineRoot } from './engine-root.mjs';
import { createWorkbenchLaunchOptions } from './dev-utils.mjs';

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const gameEntry = path.join(projectRoot, 'workbench/src/preview/entry.ts');
const previewRoot = path.join(projectRoot, 'workbench/public/preview');
const previewOutput = path.join(previewRoot, 'native');
const buildOnly = process.argv.includes('--build-preview-only');
const children = new Set();
let shuttingDown = false;

function start(command, args, options) {
  const child = spawn(command, args, {
    cwd: projectRoot,
    stdio: 'inherit',
    ...options,
  });
  children.add(child);
  child.once('exit', (code, signal) => {
    children.delete(child);
    if (!shuttingDown && (code !== 0 || signal !== null)) {
      process.exitCode = code ?? 1;
      void shutdown();
    }
  });
  return child;
}

function run(command, args, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { cwd: projectRoot, stdio: 'inherit', ...options });
    child.once('error', reject);
    child.once('exit', (code, signal) => {
      if (code === 0) resolve();
      else reject(new Error(`${command} exited with ${signal || code}.`));
    });
  });
}

async function waitFor(url, child, requestInit) {
  const deadline = Date.now() + 20_000;
  let lastError;
  while (Date.now() < deadline) {
    if (child.exitCode !== null) throw new Error(`Server exited before becoming ready (code ${child.exitCode}).`);
    try {
      const response = await fetch(url, { ...requestInit, signal: AbortSignal.timeout(750) });
      if (response.ok) return;
    } catch (error) {
      lastError = error;
    }
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
  throw new Error(`Timed out waiting for ${url}: ${String(lastError)}`);
}

async function shutdown() {
  if (shuttingDown) return;
  shuttingDown = true;
  for (const child of children) child.kill('SIGTERM');
  const stopDeadline = Date.now() + 3_000;
  while (children.size > 0 && Date.now() < stopDeadline) {
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  for (const child of children) child.kill('SIGKILL');
}

async function main() {
  if (!existsSync(gameEntry)) throw new Error(`Browser preview entry is missing: ${gameEntry}`);
  const engineRoot = resolveEngineRoot(projectRoot, process.env.BORNENGINE_ENGINE_PATH);
  const buildScript = path.join(engineRoot, 'native/web/build.sh');
  await run(buildScript, ['--dev', '--output', previewOutput]);
  const previewAssets = path.join(projectRoot, 'workbench/src/preview/assets');
  const outputAssets = path.join(previewRoot, 'assets');
  rmSync(outputAssets, { recursive: true, force: true });
  if (existsSync(previewAssets)) cpSync(previewAssets, outputAssets, { recursive: true });
  cpSync(
    path.join(projectRoot, 'workbench/preview/assets_manifest.json'),
    path.join(previewRoot, 'assets_manifest.json'),
  );
  if (buildOnly) return;

  const token = randomBytes(32).toString('hex');
  const server = start(process.execPath, [path.join(projectRoot, 'server/node_modules/tsx/dist/cli.mjs'), 'src/index.ts'], {
    cwd: path.join(projectRoot, 'server'),
    env: {
      ...process.env,
      HOST: '127.0.0.1',
      PORT: '2568',
      BORNENGINE_SANDBOX_DEV: '1',
      BORNENGINE_SANDBOX_DEV_TOKEN: token,
    },
  });
  await waitFor('http://127.0.0.1:2568/health', server);
  await waitFor('http://127.0.0.1:2569/__dev/server-scripts/status', server, {
    headers: { Origin: 'http://127.0.0.1:5173', 'x-bornengine-dev-token': token },
  });

  const workbenchOptions = createWorkbenchLaunchOptions(projectRoot);
  const workbench = start(process.execPath, [workbenchOptions.entry, '--host', '127.0.0.1', '--port', '5173'], {
    cwd: workbenchOptions.cwd,
    env: { ...process.env, BORNENGINE_SANDBOX_DEV_TOKEN: token },
  });
  await waitFor('http://127.0.0.1:5173/', workbench);
  console.log('Sandbox ready at http://127.0.0.1:5173');
}

process.on('SIGINT', () => { void shutdown(); });
process.on('SIGTERM', () => { void shutdown(); });
main().catch(async (error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
  await shutdown();
});
