import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const readSource = (relativePath) => readFileSync(new URL(`../${relativePath}`, import.meta.url), 'utf8');

function exportStatements(source) {
  const statements = [];
  for (const match of source.matchAll(/export\s+(type\s+)?\{([^}]*)\}\s*from\s*'([^']+)'/g)) {
    const names = match[2]
      .split(',')
      .map((entry) => entry.trim().split(/\s+as\s+/).pop())
      .filter((name) => name.length > 0);
    statements.push({ isType: match[1] !== undefined, names, from: match[3] });
  }
  return statements;
}

function exportedFrom(source, modulePath) {
  return exportStatements(source)
    .filter((statement) => statement.from === modulePath)
    .flatMap((statement) => statement.names);
}

const physicsIndex = readSource('src/physics/index.ts');
const rootIndex = readSource('src/index.ts');
const sceneIndex = readSource('src/scene/index.ts');

test('physics index exports Collider as a value from ./collider', () => {
  const valueExports = exportStatements(physicsIndex)
    .filter((statement) => !statement.isType && statement.from === './collider')
    .flatMap((statement) => statement.names);
  assert.ok(valueExports.includes('Collider'));
});

test('physics index exports PhysicsBody as a value from ./rigid-body', () => {
  const valueExports = exportStatements(physicsIndex)
    .filter((statement) => !statement.isType && statement.from === './rigid-body')
    .flatMap((statement) => statement.names);
  assert.ok(valueExports.includes('PhysicsBody'));
});

test('root index does not export PbrMaterial from ./models', () => {
  assert.ok(!exportedFrom(rootIndex, './models').includes('PbrMaterial'));
});

test('scene index exports PbrMaterial as a type from ./internal', () => {
  const typeExports = exportStatements(sceneIndex)
    .filter((statement) => statement.isType && statement.from === './internal')
    .flatMap((statement) => statement.names);
  assert.ok(typeExports.includes('PbrMaterial'));
});
