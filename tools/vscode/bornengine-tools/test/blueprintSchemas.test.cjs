const assert = require('node:assert/strict');
const path = require('node:path');
const { createRequire } = require('node:module');
const { readFileSync } = require('node:fs');
const { test } = require('node:test');
const { transformSync } = require(path.join(__dirname, '..', 'node_modules/esbuild'));

const extensionRoot = path.resolve(__dirname, '..');

function loadTypeScript(relativePath, mocks = {}) {
  const modulePath = path.join(extensionRoot, relativePath);
  const source = readFileSync(modulePath, 'utf8');
  const { code } = transformSync(source, { loader: 'ts', format: 'cjs', target: 'node18' });
  const module = { exports: {} };
  const localRequire = createRequire(modulePath);
  const sourceRequire = (specifier) => Object.hasOwn(mocks, specifier) ? mocks[specifier] : localRequire(specifier);
  new Function('require', 'module', 'exports', code)(sourceRequire, module, module.exports);
  return module.exports;
}

const template = {
  format: 'bornengine.blueprint-template',
  version: 1,
  id: 'rpg.character',
  revision: 3,
  name: 'Character',
  fields: [
    { id: 'displayName', label: 'Display name', type: 'string', required: true },
    { id: 'health', label: 'Health', type: 'integer', defaultValue: 100, minimum: 1 },
    { id: 'faction', label: 'Faction', type: 'enum', enumValues: ['player', 'enemy'], defaultValue: 'player' },
    { id: 'stats', label: 'Stats', type: 'object', properties: [
      { id: 'power', label: 'Power', type: 'number', defaultValue: 5 },
    ] },
    { id: 'inventory', label: 'Inventory', type: 'array', items: { type: 'string' } },
  ],
  events: [{
    id: 'onSpawn',
    label: 'When spawned',
    operationId: 'character.spawn',
    parameters: [{ id: 'map', label: 'Map', type: 'string', required: true }],
    outputPin: { id: 'then', label: 'Then' },
  }],
  nodes: [
    {
      id: 'dealDamage',
      label: 'Deal Damage',
      category: 'action',
      operationId: 'combat.damage',
      parameters: [{ id: 'amount', label: 'Amount', type: 'integer', required: true }],
      inputs: [{ id: 'in', label: 'In' }],
      outputs: [{ id: 'out', label: 'Out' }],
    },
    {
      id: 'isAlive',
      label: 'Is Alive?',
      category: 'condition',
      operationId: 'combat.isAlive',
      parameters: [],
      inputs: [{ id: 'in', label: 'In' }],
      outputs: [
        { id: 'yes', label: 'Yes', branch: 'true' },
        { id: 'no', label: 'No', branch: 'false' },
      ],
    },
    {
      id: 'end',
      label: 'End',
      category: 'action',
      operationId: 'flow.end',
      parameters: [],
      inputs: [{ id: 'in', label: 'In' }],
      outputs: [],
    },
  ],
};

const blueprint = {
  format: 'bornengine.blueprint',
  version: 1,
  id: 'fireball',
  name: 'Fireball',
  template: { id: 'rpg.character', revision: 3 },
  fields: {
    displayName: 'Ari',
    health: 90,
    faction: 'player',
    stats: { power: 8 },
    inventory: ['key'],
  },
  graph: {
    nodes: [
      { instanceId: 'spawn', kind: 'event', definitionId: 'onSpawn', position: { x: 0, y: 0 }, parameters: { map: 'home' } },
      { instanceId: 'damage', kind: 'node', definitionId: 'dealDamage', position: { x: 200, y: 0 }, parameters: { amount: 8 } },
      { instanceId: 'alive', kind: 'node', definitionId: 'isAlive', position: { x: 400, y: 0 }, parameters: {} },
      { instanceId: 'end', kind: 'node', definitionId: 'end', position: { x: 600, y: 0 }, parameters: {} },
    ],
    connections: [
      { from: { nodeId: 'spawn', pinId: 'then' }, to: { nodeId: 'damage', pinId: 'in' } },
      { from: { nodeId: 'damage', pinId: 'out' }, to: { nodeId: 'alive', pinId: 'in' } },
      { from: { nodeId: 'alive', pinId: 'yes' }, to: { nodeId: 'end', pinId: 'in' } },
    ],
  },
};

function issuesForTemplate(value) {
  return loadTypeScript('src/blueprints/blueprintSchema.ts').validateBlueprintTemplate(value);
}

function issuesForBlueprint(value, sourceTemplate = template) {
  return loadTypeScript('src/blueprints/blueprintSchema.ts').validateBlueprint(value, sourceTemplate);
}

test('template revisions can advance independently of document schema versions', () => {
  const nextRevision = structuredClone(template);
  nextRevision.revision = 9;
  const matchingBlueprint = structuredClone(blueprint);
  matchingBlueprint.template.revision = 9;
  assert.deepEqual(issuesForTemplate(nextRevision), []);
  assert.deepEqual(issuesForBlueprint(matchingBlueprint, nextRevision), []);
});

test('template fields support typed nested values, arrays, defaults, and bounds', () => {
  const invalid = structuredClone(template);
  invalid.fields[1].defaultValue = 0;
  invalid.fields[3].defaultValue = { power: 'strong' };
  invalid.fields[4].defaultValue = [5];
  const issues = issuesForTemplate(invalid);
  assert.ok(issues.some((issue) => issue.code === 'value.minimum'));
  assert.ok(issues.some((issue) => issue.path.includes('fields[3].defaultValue')));
  assert.ok(issues.some((issue) => issue.path.includes('fields[4].defaultValue')));
});

test('template rejects duplicate scoped IDs, bad enums, and invalid node pins', () => {
  const invalid = structuredClone(template);
  invalid.fields.push({ id: 'health', label: 'Health again', type: 'number' });
  invalid.fields[2].enumValues = ['player', 'player'];
  invalid.nodes[1].outputs = [{ id: 'yes', label: 'Yes', branch: 'true' }];
  const issues = issuesForTemplate(invalid);
  assert.ok(issues.some((issue) => issue.code === 'id.duplicate'));
  assert.ok(issues.some((issue) => issue.code === 'enum.invalid'));
  assert.ok(issues.some((issue) => issue.code === 'pin.invalid'));
});

test('template rejects unknown field types and unsupported schema versions', () => {
  const invalid = structuredClone(template);
  invalid.fields[0].type = 'script';
  invalid.version = 2;
  invalid.script = 'execute';
  const issues = issuesForTemplate(invalid);
  assert.ok(issues.some((issue) => issue.code === 'field.type'));
  assert.ok(issues.some((issue) => issue.code === 'document.version'));
  assert.ok(issues.some((issue) => issue.code === 'schema.unknown'));
});

test('blueprint accepts exact template revision, typed fields, declared nodes, and valid execution flow', () => {
  assert.deepEqual(issuesForBlueprint(blueprint), []);
});

test('blueprint reports missing required values, wrong parameter types, and undeclared fields', () => {
  const invalid = structuredClone(blueprint);
  delete invalid.fields.displayName;
  invalid.fields.extra = 'not declared';
  invalid.graph.nodes[1].parameters.amount = 'many';
  const issues = issuesForBlueprint(invalid);
  assert.ok(issues.some((issue) => issue.code === 'field.required'));
  assert.ok(issues.some((issue) => issue.code === 'field.unknown'));
  assert.ok(issues.some((issue) => issue.code === 'value.type'));
});

test('blueprint rejects mismatched template revisions and unknown node definitions', () => {
  const invalid = structuredClone(blueprint);
  invalid.template.revision = 2;
  invalid.graph.nodes[1].definitionId = 'unlisted';
  const issues = issuesForBlueprint(invalid);
  assert.ok(issues.some((issue) => issue.code === 'template.revision'));
  assert.ok(issues.some((issue) => issue.code === 'node.definition'));
});

test('blueprint validates connection endpoints, output-to-input direction, and event roots', () => {
  const invalid = structuredClone(blueprint);
  invalid.graph.connections[0].to.pinId = 'missing';
  invalid.graph.connections.push({
    from: { nodeId: 'damage', pinId: 'in' },
    to: { nodeId: 'alive', pinId: 'in' },
  });
  invalid.graph.nodes[0].kind = 'node';
  const issues = issuesForBlueprint(invalid);
  assert.ok(issues.some((issue) => issue.code === 'connection.pin'));
  assert.ok(issues.some((issue) => issue.code === 'connection.direction'));
  assert.ok(issues.some((issue) => issue.code === 'graph.event-root'));
});

test('blueprint rejects duplicate instances, invalid positions, duplicate edges, and unreachable nodes', () => {
  const invalid = structuredClone(blueprint);
  invalid.graph.nodes[1].instanceId = 'spawn';
  invalid.graph.nodes[2].position.x = Number.NaN;
  invalid.graph.nodes.push({
    instanceId: 'orphan', kind: 'node', definitionId: 'end', position: { x: 0, y: 200 }, parameters: {},
  });
  invalid.graph.connections.push(structuredClone(invalid.graph.connections[1]));
  const issues = issuesForBlueprint(invalid);
  assert.ok(issues.some((issue) => issue.code === 'id.duplicate'));
  assert.ok(issues.some((issue) => issue.code === 'position.invalid'));
  assert.ok(issues.some((issue) => issue.code === 'connection.duplicate'));
  assert.ok(issues.some((issue) => issue.code === 'graph.unreachable'));
});

test('empty graph is valid for a form-only blueprint', () => {
  const formOnly = structuredClone(blueprint);
  formOnly.graph = { nodes: [], connections: [] };
  assert.deepEqual(issuesForBlueprint(formOnly), []);
});

test('reading JSON preserves malformed or newer source and reports diagnostics without migration', () => {
  const schema = loadTypeScript('src/blueprints/blueprintSchema.ts');
  const { readBlueprintTemplate, readBlueprint } = loadTypeScript('src/blueprints/blueprintJson.ts', { './blueprintSchema': schema });
  const malformedSource = '{ "keep": [ this text';
  const malformed = readBlueprintTemplate(malformedSource);
  assert.equal(malformed.sourceText, malformedSource);
  assert.equal(malformed.value, undefined);
  assert.equal(malformed.diagnostics[0].code, 'json.parse');

  const newerSource = JSON.stringify({ ...blueprint, version: 7 });
  const newer = readBlueprint(newerSource, template);
  assert.equal(newer.sourceText, newerSource);
  assert.equal(newer.value.version, 7);
  assert.ok(newer.diagnostics.some((issue) => issue.code === 'document.version'));
  assert.equal(JSON.stringify(newer.value), newerSource);
});

test('template and blueprint JSON round-trip without losing declared data', () => {
  const schema = loadTypeScript('src/blueprints/blueprintSchema.ts');
  const { readBlueprintTemplate, readBlueprint } = loadTypeScript('src/blueprints/blueprintJson.ts', { './blueprintSchema': schema });
  const templateSource = JSON.stringify(template);
  const blueprintSource = JSON.stringify(blueprint);
  assert.deepEqual(readBlueprintTemplate(templateSource).value, template);
  assert.deepEqual(readBlueprint(blueprintSource, template).value, blueprint);
});

test('blueprint edits return a new document and support field, node, parameter, and position changes', () => {
  const { applyBlueprintEdit } = loadTypeScript('src/blueprints/blueprintEdits.ts');
  let edited = applyBlueprintEdit(blueprint, { type: 'set-field', fieldId: 'health', value: 120 });
  edited = applyBlueprintEdit(edited, {
    type: 'add-node',
    node: { instanceId: 'extra', kind: 'node', definitionId: 'end', position: { x: 800, y: 0 }, parameters: {} },
  });
  edited = applyBlueprintEdit(edited, { type: 'set-node-parameter', instanceId: 'damage', parameterId: 'amount', value: 12 });
  edited = applyBlueprintEdit(edited, { type: 'move-node', instanceId: 'extra', position: { x: 900, y: 20 } });

  assert.equal(blueprint.fields.health, 90);
  assert.equal(edited.fields.health, 120);
  assert.equal(edited.graph.nodes[1].parameters.amount, 12);
  assert.deepEqual(edited.graph.nodes.at(-1).position, { x: 900, y: 20 });
});

test('blueprint edit removal also removes attached connections and invalid edits fail clearly', () => {
  const { applyBlueprintEdit } = loadTypeScript('src/blueprints/blueprintEdits.ts');
  const edited = applyBlueprintEdit(blueprint, { type: 'remove-node', instanceId: 'damage' });
  assert.equal(edited.graph.nodes.some((node) => node.instanceId === 'damage'), false);
  assert.equal(edited.graph.connections.some((connection) => connection.from.nodeId === 'damage'
    || connection.to.nodeId === 'damage'), false);
  assert.throws(
    () => applyBlueprintEdit(blueprint, { type: 'move-node', instanceId: 'absent', position: { x: 1, y: 1 } }),
    /node/i,
  );
});

test('blueprint edits can connect and disconnect declared graph instances', () => {
  const { applyBlueprintEdit } = loadTypeScript('src/blueprints/blueprintEdits.ts');
  const withoutLastConnection = {
    ...blueprint,
    graph: { ...blueprint.graph, connections: blueprint.graph.connections.slice(0, 2) },
  };
  const connection = { from: { nodeId: 'alive', pinId: 'no' }, to: { nodeId: 'end', pinId: 'in' } };
  const connected = applyBlueprintEdit(withoutLastConnection, { type: 'connect', connection });
  const disconnected = applyBlueprintEdit(connected, { type: 'disconnect', connection });
  assert.equal(connected.graph.connections.length, 3);
  assert.equal(disconnected.graph.connections.length, 2);
});

test('blueprint edit operations update nested form values and nested node parameters immutably', () => {
  const { applyBlueprintEdit } = loadTypeScript('src/blueprints/blueprintEdits.ts');
  let edited = applyBlueprintEdit(blueprint, {
    type: 'set-field', fieldId: 'stats', fieldPath: ['power'], value: 14,
  });
  edited = applyBlueprintEdit(edited, {
    type: 'set-node-parameter', instanceId: 'damage', parameterId: 'amount', fieldPath: ['bonus'], value: 3,
  });

  assert.equal(blueprint.fields.stats.power, 8);
  assert.equal(edited.fields.stats.power, 14);
  assert.equal(edited.graph.nodes[1].parameters.amount.bonus, 3);
});
