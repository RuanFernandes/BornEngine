import assert from 'node:assert/strict';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { resolveEngineRoot } from './engine-root.mjs';

async function fixture(t) {
  const tempRoot = await mkdtemp(path.join(os.tmpdir(), 'bornengine-engine-root-'));
  const projectRoot = path.join(tempRoot, 'engine', 'examples', 'scripting-sandbox');
  await mkdir(projectRoot, { recursive: true });
  t.after(() => rm(tempRoot, { recursive: true, force: true }));
  const createEngine = async (relativePath) => {
    const engine = path.join(projectRoot, relativePath);
    const web = path.join(engine, 'native/web');
    await mkdir(web, { recursive: true });
    await writeFile(path.join(web, 'build.sh'), '#!/bin/sh\n');
    return engine;
  };
  return { projectRoot, createEngine };
}

test('usesConfiguredLocalEngineCheckout', async (t) => {
  const { projectRoot, createEngine } = await fixture(t);
  const localEngine = await createEngine('.worktrees/engine');
  await createEngine('node_modules/@bornengine/engine');

  assert.equal(resolveEngineRoot(projectRoot, '.worktrees/engine'), localEngine);
});

test('usesMonorepoCheckoutWhenNoLocalPathIsConfigured', async (t) => {
  const { projectRoot, createEngine } = await fixture(t);
  const localEngine = await createEngine('../..');
  await createEngine('node_modules/@bornengine/engine');

  assert.equal(resolveEngineRoot(projectRoot), localEngine);
});
