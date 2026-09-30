import assert from 'node:assert/strict';
import test from 'node:test';
import { waitForTypeScriptWorker } from '../src/client-script/worker-readiness.js';

test('waits for Monaco to register the TypeScript worker', async () => {
  let attempts = 0;
  const workerFactory = async () => {
    attempts++;
    if (attempts < 3) throw 'TypeScript not registered!';
    return 'ready';
  };

  assert.equal(await waitForTypeScriptWorker(workerFactory), 'ready');
  assert.equal(attempts, 3);
});

test('does not retry unrelated Monaco worker failures', async () => {
  let attempts = 0;
  const workerFactory = async () => {
    attempts++;
    throw new Error('Monaco worker failed to load.');
  };

  await assert.rejects(waitForTypeScriptWorker(workerFactory), /Monaco worker failed to load/);
  assert.equal(attempts, 1);
});
