import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const source = (path) => readFile(new URL(path, import.meta.url), 'utf8');

test('storage reference documents GameDatabase and the removed GameStorage API', async () => {
  const [storage, index, migration, workflow, topDown] = await Promise.all([
    source('../src/content/docs/api/storage.md'),
    source('../src/content/docs/api/index.md'),
    source('../src/content/docs/reference/migration.md'),
    source('../src/content/docs/guides/2d-production-workflow.md'),
    source('../../examples/2d-top-down/main.ts'),
  ]);
  assert.match(storage, /GameDatabase/);
  assert.match(storage, /defineMigration/);
  assert.match(storage, /quota_exceeded/);
  assert.match(storage, /unsupported_version/);
  assert.match(storage, /Application Support/);
  assert.match(storage, /IndexedDB/);
  assert.match(storage, /OPFS/);
  assert.match(storage, /Web Locks/);
  assert.match(storage, /not.*secret|secret.*not/i);
  assert.match(storage, /defineSchema/);
  assert.match(storage, /transaction/);
  assert.match(storage, /inMemory/);
  assert.doesNotMatch(storage, /localStorage/);
  assert.match(index, /GameDatabase/);
  assert.match(migration, /GameStorage.*removed|removed.*GameStorage/);
  assert.match(migration, /Game\.run\(callbacks\).*removed|removed.*Game\.run\(callbacks\)/);
  assert.match(workflow, /GameDatabase/);
  assert.doesNotMatch(topDown, /GameStorage|createGameStorage/);
});

test('physics docs state the final 2D surface, one-way, CCD, and ordering contract', async () => {
  const physics = await source('../src/content/docs/api/physics2d.md');
  assert.match(physics, /segment/);
  assert.match(physics, /convex/);
  assert.match(physics, /oneWay/);
  assert.match(physics, /previous|prior/i);
  assert.match(physics, /tolerance/);
  assert.match(physics, /ccd/);
  assert.match(physics, /eight|8/);
  assert.match(physics, /four|4/);
  assert.match(physics, /creation ID|creation order|body creation/i);
  assert.match(physics, /dynamic.*box.*circle|box.*circle.*dynamic/i);
  assert.match(physics, /static.*segment.*convex|segment.*convex.*static/i);
});

test('game lifecycle docs explain completion and embed-only runFrame', async () => {
  const [core, loop] = await Promise.all([
    source('../src/content/docs/api/core.md'),
    source('../src/content/docs/concepts/game-loop.md'),
  ]);
  assert.match(core, /runFrame.*embedded|embedded.*runFrame/i);
  assert.match(core, /Promise/);
  assert.match(core, /error/);
  assert.match(loop, /runFrame.*embedded|embedded.*runFrame/i);
  assert.match(loop, /Promise/);
});

test('platformer example demonstrates the shipped database and advanced 2D physics contracts', async () => {
  const [sample, readme, topDown] = await Promise.all([
    source('../../examples/2d-platformer/main.ts'),
    source('../../examples/2d-platformer/README.md'),
    source('../../examples/2d-top-down/README.md'),
  ]);
  assert.match(sample, /GameDatabase/);
  assert.match(sample, /defineMigration/);
  assert.match(sample, /await .*\.open\(\)/);
  assert.match(sample, /\.transaction\(/);
  assert.match(sample, /\.export\(\)/);
  assert.match(sample, /\.import\(/);
  assert.match(sample, /oneWay:/);
  assert.match(sample, /ccd: true/);
  assert.match(readme, /SQLite|GameDatabase/);
  assert.doesNotMatch(topDown, /GameStorage|createGameStorage/);
});

test('CLI asset docs expose manifest, stable JSON report, and all diagnostics', async () => {
  const [page, navigation, catalogue] = await Promise.all([
    source('../src/content/docs/cli/assets.md'),
    source('../src/data/navigation.ts'),
    source('../src/data/cli-commands.json'),
  ]);
  assert.match(page, /bornengine\.assets\.json/);
  assert.match(page, /bornengine\.asset_validation/);
  assert.match(page, /declared_dynamic_path_missing/);
  assert.match(page, /max_total_image_pixels/);
  assert.match(navigation, /\/docs\/cli\/assets\//);
  assert.match(catalogue, /assets\/validate/);
  assert.match(catalogue, /assets\/pack/);
});
