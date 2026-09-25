import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';
import test from 'node:test';

registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier.startsWith('.') && !/\.[a-z]+$/i.test(specifier)) {
      return nextResolve(`${specifier}.ts`, context);
    }
    return nextResolve(specifier, context);
  },
});

const { createUiApi } = await import('../src/ui/api.ts');

test('registerTexture sends a bounded UI ID separate from the engine handle', () => {
  const commands = [];
  globalThis.bloom_ui_command = (...args) => {
    commands.push(args);
    return 1;
  };

  const ui = createUiApi(0);
  const texture = { handle: 0x1_0000_0001, width: 8, height: 8 };
  const secondTexture = { handle: 0x2_0000_0002, width: 16, height: 16 };
  const reusedSlotTexture = { handle: 0x2_0000_0001, width: 4, height: 4 };
  const returnedHandle = ui.registerTexture(texture);
  ui.registerTexture(secondTexture);
  ui.registerTexture(reusedSlotTexture);

  assert.equal(returnedHandle, texture.handle);
  assert.ok(Number.isInteger(commands[0][2]));
  assert.ok(commands[0][2] > 0 && commands[0][2] <= 0xffff_ffff);
  assert.notEqual(commands[0][2], texture.handle);
  assert.equal(commands[0][3], texture.handle);
  assert.notEqual(commands[0][2], commands[1][2]);
  assert.equal(commands[1][3], secondTexture.handle);
  assert.equal(commands[2][2], commands[0][2]);
  assert.equal(commands[2][3], reusedSlotTexture.handle);
});
