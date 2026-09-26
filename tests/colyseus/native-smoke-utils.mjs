import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

export const repoRoot = fileURLToPath(new URL('../../', import.meta.url));
export const smokeManifest = fileURLToPath(new URL('./native-smoke/Cargo.toml', import.meta.url));

export function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: repoRoot,
    encoding: 'utf8',
    maxBuffer: 32 * 1024 * 1024,
    ...options,
  });
  if (result.error) throw result.error;
  if (result.stdout) process.stdout.write(result.stdout);
  if (result.stderr) process.stderr.write(result.stderr);
  if (result.status !== 0) {
    throw new Error(`${command} ${args.join(' ')} exited with ${result.status ?? result.signal}`);
  }
  return result;
}

export function capture(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: repoRoot,
    encoding: 'utf8',
    maxBuffer: 32 * 1024 * 1024,
    ...options,
  });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    if (result.stdout) process.stdout.write(result.stdout);
    if (result.stderr) process.stderr.write(result.stderr);
    throw new Error(`${command} ${args.join(' ')} exited with ${result.status ?? result.signal}`);
  }
  return result.stdout;
}

export function buildSmokeExecutable(target, { nightly = false } = {}) {
  const args = nightly
    ? ['+nightly', 'test', '-Z', 'build-std=std,panic_abort', '--release', '--locked']
    : ['test', '--release', '--locked'];
  args.push('--manifest-path', smokeManifest);
  if (target) args.push('--target', target);
  args.push('--no-run', '--message-format=json');

  const result = spawnSync('cargo', args, {
    cwd: repoRoot,
    encoding: 'utf8',
    maxBuffer: 32 * 1024 * 1024,
  });
  if (result.error) throw result.error;
  if (result.stderr) process.stderr.write(result.stderr);
  if (result.status !== 0) {
    if (result.stdout) process.stdout.write(result.stdout);
    throw new Error(`cargo ${args.join(' ')} failed with exit code ${result.status}`);
  }

  for (const line of result.stdout.split(/\r?\n/)) {
    if (!line.startsWith('{')) continue;
    let event;
    try { event = JSON.parse(line); } catch { continue; }
    if (event.reason === 'compiler-artifact' && event.profile?.test && event.executable) {
      return event.executable;
    }
  }
  throw new Error('Cargo built the Colyseus smoke test but did not report its executable path');
}
