const path = require('node:path');
const { spawnSync } = require('node:child_process');

const root = path.resolve(__dirname, '../..');

function runPerry(args) {
  const result = spawnSync('perry', args, { cwd: root, stdio: 'inherit' });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status || 1);
}

runPerry(['check', '--all', 'tests/game-runtime/procedural-generation-api.ts']);
runPerry(['run', '--local', 'tests/game-runtime/procedural-generation.ts']);
