import assert from 'node:assert/strict';
import path from 'node:path';
import test from 'node:test';
import { createWorkbenchLaunchOptions } from './dev-utils.mjs';

test('launches the Vite JavaScript CLI from the workbench package directory', () => {
  const projectRoot = path.resolve('/tmp/bornengine-scripting-sandbox');

  assert.deepEqual(createWorkbenchLaunchOptions(projectRoot), {
    entry: path.join(projectRoot, 'workbench/node_modules/vite/bin/vite.js'),
    cwd: path.join(projectRoot, 'workbench'),
  });
});
