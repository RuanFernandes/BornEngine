import assert from 'node:assert/strict';
import test from 'node:test';
import { validateAndCompileClientScript } from '../src/sandbox/client-script.js';

test('rejectsSourcesOver64KiB', () => {
  const result = validateAndCompileClientScript(`export default {};\n//${'x'.repeat(64 * 1024)}`);
  assert.equal(result.ok, false);
  if (!result.ok) assert.match(result.diagnostics.join('\n'), /64 KiB/);
});

test('rejectsStaticAndDynamicImports', () => {
  for (const source of [
    `import { readFile } from 'node:fs'; export default {};`,
    `export { readFile } from 'node:fs'; export default {};`,
    `export default { onStart() { import('./untrusted.js'); } };`,
    `export default { onStart() { require('node:fs'); } };`,
  ]) {
    const result = validateAndCompileClientScript(source);
    assert.equal(result.ok, false);
    if (!result.ok) assert.match(result.diagnostics.join('\n'), /Imports and module loading/);
  }
});

test('rejectsTypeErrors', () => {
  const result = validateAndCompileClientScript(`export default {
    update(ctx: BornEngineScriptContext, dt: number) {
      const answer: string = 42;
      ctx.log?.(answer);
    },
  } satisfies BornEngineScriptBehavior;`);
  assert.equal(result.ok, false);
  if (!result.ok) assert.match(result.diagnostics.join('\n'), /Type 'number' is not assignable to type 'string'/);
});

test('rejectsCapabilitiesNotGrantedByThePreview', () => {
  const result = validateAndCompileClientScript(`export default {
    update(ctx: BornEngineScriptContext) {
      ctx.self.setPosition?.(10, 20, 0);
    },
  } satisfies BornEngineScriptBehavior;`);
  assert.equal(result.ok, false);
  if (!result.ok) assert.match(result.diagnostics.join('\n'), /setPosition/);
});

test('transpilesDefaultExportHooks', () => {
  const result = validateAndCompileClientScript(`export default {
    onStart(ctx: BornEngineScriptContext) { ctx.log?.('ready'); },
    update(ctx: BornEngineScriptContext, dt: number) { ctx.particles?.emitBurst(2, dt, 0); },
  } satisfies BornEngineScriptBehavior;`);
  assert.equal(result.ok, true);
  if (result.ok) {
    assert.match(result.javascript, /export default/);
    assert.doesNotMatch(result.javascript, /BornEngineScriptContext|satisfies/);
    assert.match(result.javascript, /emitBurst/);
  }
});
