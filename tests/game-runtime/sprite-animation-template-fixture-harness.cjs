const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '../..');
const runtimeTestPath = path.join(__dirname, 'sprite-animation-template.ts');
const fixturePath = path.join(root, 'examples/sprite-animation/assets/layered-avatar.spriteanim-template.json');
const runtimeSource = fs.readFileSync(runtimeTestPath, 'utf8');
const embedded = runtimeSource.match(/const templateFixtureJson = String\.raw`([\s\S]*?)`;/);
assert.ok(embedded, 'runtime template test embeds the source fixture for Perry');
assert.deepEqual(JSON.parse(embedded[1]), JSON.parse(fs.readFileSync(fixturePath, 'utf8')),
  'the runtime API test data matches the checked-in JSON example exactly');
console.log('PASS: sprite animation template runtime fixture matches the JSON example');
