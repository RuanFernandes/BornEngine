const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const { SourceTextModule } = require('node:vm');

const root = path.resolve(__dirname, '../..');
const example = path.join(root, 'examples/scripted-actor');
const manifestPath = path.join(example, 'bornengine.script.json');
assert.ok(fs.existsSync(manifestPath), 'scripted actor example must include a CLI script package manifest');
assert.equal(typeof SourceTextModule, 'function', 'guest JavaScript modules must be compiled without execution');

async function run() {
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  assert.equal(manifest.format, 'bornengine-script-v1');
  assert.equal(manifest.apiVersion, 1);
  assert.equal(manifest.entry, 'scripts/actor.js');
  assert.deepEqual(manifest.permissions, [
    'log',
    'self.particles.emit',
    'self.read',
    'self.transform.write',
  ]);

  const entryPath = path.resolve(example, manifest.entry);
  assert.ok(entryPath.startsWith(example + path.sep), 'script entry must stay inside the example package');
  assert.ok(fs.statSync(entryPath).isFile(), 'script entry must be a regular file');
  const source = fs.readFileSync(entryPath, 'utf8');
  const guestModule = new SourceTextModule(source, { identifier: entryPath });
  await guestModule.link(() => {
    throw new Error('guest package modules must not import host or external modules');
  });

  const generatedSource = fs.readFileSync(path.join(example, 'src/actor-script.ts'), 'utf8');
  assert.equal(generatedSource, `export const actorScriptSource = ${JSON.stringify(source)};\n`,
    'the Perry host embeds the same guest module that CLI check/pack uses');

  console.log('Scripted actor package fixture passed');
}

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
