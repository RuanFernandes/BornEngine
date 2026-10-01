import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const toolsDirectory = dirname(fileURLToPath(import.meta.url));
const exampleDirectory = resolve(toolsDirectory, '..');
const scriptPath = resolve(exampleDirectory, 'scripts/actor.js');
const outputPath = resolve(exampleDirectory, 'src/actor-script.ts');
const source = readFileSync(scriptPath, 'utf8').replaceAll('\r\n', '\n');
mkdirSync(dirname(outputPath), { recursive: true });
writeFileSync(outputPath, `export const actorScriptSource = ${JSON.stringify(source)};\n`);
