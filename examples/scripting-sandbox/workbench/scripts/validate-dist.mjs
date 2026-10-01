import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const distDirectory = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../dist');
const html = await readFile(path.join(distDirectory, 'index.html'), 'utf8');
const files = await readdir(path.join(distDirectory, 'assets'));
const javascriptFiles = files.filter((file) => file.endsWith('.js'));
const javascript = (await Promise.all(javascriptFiles.map((file) => readFile(path.join(distDirectory, 'assets', file), 'utf8')))).join('\n');

const forbidden = [
  ['production HTML includes the server rules tab', html.includes('id="tab-server"')],
  ['production HTML includes server file controls', html.includes('server-script-controls')],
  ['production JavaScript includes the local script route', javascript.includes('/__dev/server-scripts')],
  ['production JavaScript includes the private development token header', javascript.includes('x-bornengine-dev-token')],
  ['production JavaScript includes the server workspace editor', javascript.includes('createRules(): SandboxRules')],
  ['production assets include the server workspace chunk', javascriptFiles.some((file) => file.includes('server-workspace'))],
];
const failures = forbidden.filter(([, present]) => present).map(([message]) => message);
if (failures.length > 0) {
  console.error(failures.join('\n'));
  process.exitCode = 1;
} else {
  console.log('Production workbench excludes local server editor controls, routes, and token headers.');
}
