import { basename } from 'node:path';
import { buildSmokeExecutable, run } from '../native-smoke-utils.mjs';

const targetIndex = process.argv.indexOf('--target');
const target = targetIndex >= 0 ? process.argv[targetIndex + 1] : '';
if (!['aarch64-linux-android', 'x86_64-linux-android'].includes(target)) {
  throw new Error(`Unsupported Android Colyseus smoke target: ${target || '(missing)'}`);
}

const executable = buildSmokeExecutable(target);
const remoteExecutable = `/data/local/tmp/${basename(executable)}`;
run('adb', ['reverse', 'tcp:2567', 'tcp:2567']);
try {
  run('adb', ['push', executable, remoteExecutable]);
  run('adb', ['shell', 'chmod', '755', remoteExecutable]);
  run('adb', [
    'shell',
    'sh',
    '-c',
    `COLYSEUS_URL=ws://127.0.0.1:2567 ${remoteExecutable} --nocapture`,
  ]);
} finally {
  const result = run('adb', ['reverse', '--remove', 'tcp:2567'], { stdio: 'pipe' });
  void result;
}
