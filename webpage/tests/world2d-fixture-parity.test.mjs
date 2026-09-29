import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import test from 'node:test';

test('the Tiled importer golden matches the CLI repository fixture', async () => {
  const fixture = await readFile(
    new URL('../../tests/fixtures/world2d/tiled-golden.world2d.json', import.meta.url),
  );
  const sha256 = createHash('sha256').update(fixture).digest('hex');

  assert.equal(
    sha256,
    '3bb2570c0ceaf34469ac35ae5e0b86c41a71ad7b4ce9abecc239cc4bd62618c6',
  );
  assert.equal(JSON.parse(fixture.toString('utf8')).format, 'bornengine.world2d');
});
