import assert from 'node:assert/strict';
import test from 'node:test';
import { parallelMap, spawn } from '../src/preview/browser-thread.js';

test('browser thread fallback runs one task and returns its result', async () => {
  let taskRuns = 0;
  const result = await spawn(() => {
    taskRuns += 1;
    return 'loaded';
  });

  assert.equal(result, 'loaded');
  assert.equal(taskRuns, 1);
});

test('browser parallel map preserves input order when tasks finish at different times', async () => {
  const result = await parallelMap([30, 1, 10], async (delay) => {
    await new Promise((resolve) => setTimeout(resolve, delay));
    return delay * 2;
  });

  assert.deepEqual(result, [60, 2, 20]);
});
