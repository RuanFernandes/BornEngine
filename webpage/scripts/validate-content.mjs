import { readFile } from 'node:fs/promises';
import { commandInventoryErrors, prerequisiteErrors } from './content-contract.mjs';
import { apiCoverage, recipeCoverage } from '../src/data/docs-coverage.mjs';

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

const escapeRegExp = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const coverageEntries = [...apiCoverage, ...recipeCoverage];

for (const entry of coverageEntries) {
  let source;
  try {
    source = await readFile(new URL(`../src/content/docs/${entry.file}`, import.meta.url), 'utf8');
  } catch {
    errors.push(`Coverage file is missing: ${entry.file}`);
    continue;
  }

  if (!navigationHrefs.includes(entry.href)) {
    errors.push(`Coverage route is not linked in navigation: ${entry.href}`);
  }

  const typescriptFenceCount = source.match(/^```(?:ts|typescript)(?:\s|$)/gm)?.length ?? 0;
  if (typescriptFenceCount < 2) {
    errors.push(`${entry.file} must include at least two TypeScript code fences`);
  }

  for (const section of entry.sections) {
    const heading = new RegExp(`^##\\s+${escapeRegExp(section)}\\s*$`, 'm');
    if (!heading.test(source)) errors.push(`${entry.file} must include a "## ${section}" section`);
  }
}

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
  console.log(`BornEngine content valid: ${commands.length} CLI commands, ${prerequisites.entries.length} prerequisites, ${navigationHrefs.length} navigation links, ${apiCoverage.length} API modules, ${recipeCoverage.length} recipes.`);
}
