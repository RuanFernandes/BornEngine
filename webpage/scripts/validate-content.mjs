import { readFile } from 'node:fs/promises';
import { commandInventoryErrors, prerequisiteErrors } from './content-contract.mjs';

async function readJson(relativePath) {
  const source = await readFile(new URL(relativePath, import.meta.url), 'utf8');
  return JSON.parse(source);
}

const commands = await readJson('../src/data/cli-commands.json');
const prerequisites = await readJson('../src/data/prerequisites.json');
const navigationSource = await readFile(new URL('../src/data/navigation.ts', import.meta.url), 'utf8');
const navigationHrefs = [...navigationSource.matchAll(/href:\s*['"]([^'"]+)['"]/g)]
  .map(([, href]) => href);
const errors = [
  ...commandInventoryErrors(commands),
  ...prerequisiteErrors(prerequisites.entries),
];

for (const command of commands) {
  for (const field of ['id', 'group', 'title', 'summary', 'synopsis', 'examples', 'options', 'behavior', 'related']) {
    if (!command[field] || (Array.isArray(command[field]) && command[field].length === 0)) {
      errors.push(`${command.id ?? 'unknown'} must include ${field}`);
    }
  }
}

for (const entry of prerequisites.entries ?? []) {
  if (!entry.title?.trim()) errors.push(`${entry.id ?? 'unknown'} must include a title`);
  if (!entry.scope?.trim()) errors.push(`${entry.id ?? 'unknown'} must include a scope`);
}

for (const href of navigationHrefs) {
  if (!href.startsWith('/docs/') && !href.startsWith('https://')) {
    errors.push(`Navigation href must be a docs route or HTTPS URL: ${href}`);
  }
}

if (navigationHrefs.length === 0) {
  errors.push('Navigation must contain at least one route');
}

if (errors.length > 0) {
  console.error('BornEngine content validation failed:');
  for (const error of errors) console.error(`- ${error}`);
  process.exitCode = 1;
} else {
  console.log(`BornEngine content valid: ${commands.length} CLI commands, ${prerequisites.entries.length} prerequisites, ${navigationHrefs.length} navigation links.`);
}
