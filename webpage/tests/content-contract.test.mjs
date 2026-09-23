import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
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

test('ships a complete CLI data snapshot and prerequisite catalog', async () => {
  const [commandsSource, prerequisitesSource] = await Promise.all([
    readFile(new URL('../src/data/cli-commands.json', import.meta.url), 'utf8'),
    readFile(new URL('../src/data/prerequisites.json', import.meta.url), 'utf8'),
  ]);
  const commands = JSON.parse(commandsSource);
  const prerequisites = JSON.parse(prerequisitesSource);

  assert.deepEqual(commandInventoryErrors(commands), []);
  for (const command of commands) {
    for (const field of ['group', 'title', 'summary', 'synopsis', 'examples', 'options', 'behavior', 'related']) {
      assert.ok(command[field], `${command.id} is missing ${field}`);
    }
  }
  assert.deepEqual(prerequisiteErrors(prerequisites.entries), []);
});

test('navigation entries use documentation routes or approved HTTPS links', async () => {
  const source = await readFile(new URL('../src/data/navigation.ts', import.meta.url), 'utf8');
  const hrefs = [...source.matchAll(/href:\s*['"]([^'"]+)['"]/g)].map(([, href]) => href);
  assert.ok(hrefs.length > 20, 'navigation should cover the complete documentation surface');
  assert.ok(hrefs.every((href) => href.startsWith('/docs/') || href.startsWith('https://')));
});
