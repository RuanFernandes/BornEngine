import assert from 'node:assert/strict';
import test from 'node:test';
import {
  REQUIRED_COMMAND_IDS,
  commandInventoryErrors,
  prerequisiteErrors,
} from '../scripts/content-contract.mjs';

test('accepts the complete BornEngine CLI command inventory', () => {
  const commands = REQUIRED_COMMAND_IDS.map((id) => ({ id, title: id }));
  assert.deepEqual(commandInventoryErrors(commands), []);
});

test('reports an omitted nested CLI command', () => {
  const commands = REQUIRED_COMMAND_IDS
    .filter((id) => id !== 'engine/use')
    .map((id) => ({ id, title: id }));
  assert.deepEqual(commandInventoryErrors(commands), ['Missing CLI command: engine/use']);
});

test('requires official installation links and verification commands', () => {
  assert.deepEqual(prerequisiteErrors([
    { id: 'rust', docsUrl: 'https://rustup.rs/', verify: 'rustc --version' },
    { id: 'perry', docsUrl: 'https://docs.perryts.com/getting-started/installation.html', verify: 'perry --version' },
  ]), []);
  assert.deepEqual(prerequisiteErrors([
    { id: 'rust', docsUrl: 'rustup.rs', verify: '' },
  ]), [
    'rust must link to an HTTPS installation document',
    'rust must include a verification command',
  ]);
});
