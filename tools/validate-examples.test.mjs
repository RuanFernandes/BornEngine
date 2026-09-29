import assert from 'node:assert/strict';
import test from 'node:test';

import {
  inspectPackage,
  inspectSource,
  validateInventory,
} from './validate-examples.mjs';

test('detects Bloom-only imports and callback game lifecycle in sample source', () => {
  const issues = inspectSource(
    'examples/old-sample/main.ts',
    "import { Game } from 'bloom/core';\nconst game = new Game();\ngame.run({ update(dt) {} });",
  );

  assert.equal(issues.length, 2);
  assert.match(issues.join('\n'), /Bloom-only import/);
  assert.match(issues.join('\n'), /callback-based game\.run/);
});

test('permits current class-first run and the Perry-owned BloomView boundary only', () => {
  assert.deepEqual(
    inspectSource('examples/current/main.ts', 'const game = new MyGame();\ngame.run();'),
    [],
  );
  assert.deepEqual(
    inspectSource('examples/perry-embed/main.ts', "import { BloomView } from 'perry/ui';"),
    [],
  );
  assert.match(
    inspectSource('examples/current/main.ts', 'const view = new BloomView();')[0],
    /BloomView is reserved/,
  );
});

test('rejects Bloom package aliases and Bloom-branded example package names', () => {
  const issues = inspectPackage('examples/renderer-test/package.json', {
    name: 'bloom-renderer-test',
    dependencies: { bloom: 'file:../../' },
  });

  assert.equal(issues.length, 2);
  assert.match(issues.join('\n'), /Bloom-branded package name/);
  assert.match(issues.join('\n'), /Bloom package dependency alias/);
});

test('requires the Perry native-library allowlist for BornEngine consumers', () => {
  const invalid = inspectPackage('examples/game/package.json', {
    name: 'bornengine-game',
    dependencies: { '@bornengine/engine': 'file:../../' },
    perry: { allow: { nativeLibrary: true } },
  });
  const valid = inspectPackage('examples/game/package.json', {
    name: 'bornengine-game',
    dependencies: { '@bornengine/engine': 'file:../../' },
    perry: { allow: { nativeLibrary: ['@bornengine/engine'] } },
  });

  assert.match(invalid.join('\n'), /Perry native-library allowlist must include @bornengine\/engine/);
  assert.deepEqual(valid, []);
});

test('requires every discovered example TypeScript file exactly once in the inventory', () => {
  const issues = validateInventory(
    ['examples/a/main.ts', 'examples/a/main.ts', 'examples/b/main.ts'],
    ['examples/a/main.ts', 'examples/b/main.ts', 'examples/c/helper.ts'],
  );

  assert.match(issues.join('\n'), /listed more than once/);
  assert.match(issues.join('\n'), /not listed/);
});
