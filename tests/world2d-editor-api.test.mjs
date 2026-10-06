import test from 'node:test';
import assert from 'node:assert/strict';
import * as editor from '@bornengine/engine/world2d/editor';

test('the editor package subpath exposes pure World2D storage APIs', () => {
  assert.equal(editor.WORLD2D_VERSION, 2);
  assert.equal(typeof editor.validateWorld2D, 'function');
  assert.equal(typeof editor.normalizeWorld2DStorage, 'function');
  assert.equal(typeof editor.migrateWorld2D, 'function');
  assert.equal(typeof editor.serializeWorld2D, 'function');
  assert.equal(typeof editor.createWorld2DTileCodebook, 'function');
  assert.equal(typeof editor.encodeWorld2DTileGrid, 'function');
  assert.equal('World2DLoader' in editor, false);
});
