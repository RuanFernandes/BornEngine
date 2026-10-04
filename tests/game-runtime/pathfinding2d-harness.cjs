const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { stripTypeScriptTypes } = require('node:module');

const root = path.resolve(__dirname, '../..');
const modulePath = path.join(root, 'src/pathfinding2d/index.ts');
const moduleSource = fs.readFileSync(modulePath, 'utf8');
const moduleCode = stripTypeScriptTypes(moduleSource, { mode: 'strip' })
  .replace(/^export\s+/gm, '');
const sandbox = { console };
vm.runInNewContext(moduleCode + '\nthis.AStarGrid2D = AStarGrid2D;', sandbox, {
  filename: 'src/pathfinding2d/index.ts',
});

const fixturePath = path.join(__dirname, 'pathfinding2d.ts');
const fixtureSource = fs.readFileSync(fixturePath, 'utf8');
const fixtureCode = stripTypeScriptTypes(fixtureSource, { mode: 'strip' })
  .replace(/^import \{ AStarGrid2D \} from ['"][^'"]+['"];\s*\n/, '');
vm.runInNewContext(fixtureCode, sandbox, { filename: fixturePath });
