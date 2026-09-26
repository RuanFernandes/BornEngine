import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { repoRoot, smokeManifest } from './native-smoke-utils.mjs';

const serverRunner = fileURLToPath(new URL('./run-server-smoke.mjs', import.meta.url));
const passedCommand = process.argv.slice(2);
const command = passedCommand[0] === '--'
  ? passedCommand.slice(1)
    : passedCommand.length > 0
      ? passedCommand
      : ['cargo', 'test', '--release', '--locked', '--manifest-path', smokeManifest, '--', '--nocapture'];

if (command.length === 0) {
  console.error('Pass a smoke command after --, or use the default native contract test.');
  process.exit(2);
}

const result = spawnSync(process.execPath, [serverRunner, '--', ...command], {
  cwd: repoRoot,
  env: process.env,
  stdio: 'inherit',
});
if (result.error) throw result.error;
process.exitCode = result.status ?? 1;
