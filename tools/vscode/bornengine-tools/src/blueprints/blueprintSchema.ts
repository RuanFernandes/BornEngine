export const BLUEPRINT_TEMPLATE_FORMAT = 'bornengine.blueprint-template';
export const BLUEPRINT_TEMPLATE_VERSION = 1;
export const BLUEPRINT_FORMAT = 'bornengine.blueprint';
export const BLUEPRINT_VERSION = 1;

export type BlueprintFieldType = 'string' | 'number' | 'integer' | 'boolean' | 'enum' | 'object' | 'array';

export type BlueprintFieldValueSchema = {
  type: BlueprintFieldType;
  description?: string;
  defaultValue?: unknown;
  enumValues?: string[];
  minimum?: number;
  maximum?: number;
  properties?: BlueprintFieldDefinition[];
  items?: BlueprintFieldValueSchema;
};

export type BlueprintFieldDefinition = BlueprintFieldValueSchema & {
  id: string;
  label: string;
  required?: boolean;
};

export type BlueprintExecutionPin = {
  id: string;
  label: string;
  branch?: 'true' | 'false';
};

export type BlueprintEventDefinition = {
  id: string;
  label: string;
  description?: string;
  operationId: string;
  parameters: BlueprintFieldDefinition[];
  outputPin: BlueprintExecutionPin;
};

export type BlueprintNodeDefinition = {
  id: string;
  label: string;
  description?: string;
  category: 'action' | 'condition';
  operationId: string;
  parameters: BlueprintFieldDefinition[];
  inputs: BlueprintExecutionPin[];
  outputs: BlueprintExecutionPin[];
};

export type BlueprintTemplate = {
  format: typeof BLUEPRINT_TEMPLATE_FORMAT;
  version: number;
  id: string;
  revision: number;
  name: string;
  description?: string;
  fields: BlueprintFieldDefinition[];
  events: BlueprintEventDefinition[];
  nodes: BlueprintNodeDefinition[];
};

export type BlueprintGraphNode = {
  instanceId: string;
  kind: 'event' | 'node';
  definitionId: string;
  position: { x: number; y: number };
  parameters: Record<string, unknown>;
};

export type BlueprintConnection = {
  from: { nodeId: string; pinId: string };
  to: { nodeId: string; pinId: string };
};

export type BlueprintDocument = {
  format: typeof BLUEPRINT_FORMAT;
  version: number;
  id: string;
  name: string;
  description?: string;
  template: { id: string; revision: number };
  fields: Record<string, unknown>;
  graph: { nodes: BlueprintGraphNode[]; connections: BlueprintConnection[] };
};

export type BlueprintDiagnostic = {
  path: string;
  code: string;
  message: string;
};

const FIELD_TYPES = new Set<BlueprintFieldType>([
  'string', 'number', 'integer', 'boolean', 'enum', 'object', 'array',
]);
const IDENTIFIER_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]*$/;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isIdentifier(value: unknown): value is string {
  return typeof value === 'string' && IDENTIFIER_PATTERN.test(value);
}

function isLabel(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0 && value === value.trim();
}

function addDiagnostic(
  diagnostics: BlueprintDiagnostic[],
  path: string,
  code: string,
  message: string,
): void {
  diagnostics.push({ path, code, message });
}

function checkAllowedKeys(
  value: Record<string, unknown>,
  allowed: readonly string[],
  path: string,
  diagnostics: BlueprintDiagnostic[],
): void {
  for (const key of Object.keys(value)) {
    if (!allowed.includes(key)) addDiagnostic(diagnostics, `${path}.${key}`, 'schema.unknown', `Unknown property '${key}'.`);
  }
}

function checkDescription(value: Record<string, unknown>, path: string, diagnostics: BlueprintDiagnostic[]): void {
  if (value.description !== undefined && typeof value.description !== 'string') {
    addDiagnostic(diagnostics, `${path}.description`, 'value.type', 'Description must be a string.');
  }
}

function validateIdentifier(value: unknown, path: string, diagnostics: BlueprintDiagnostic[], label: string): void {
  if (!isIdentifier(value)) {
    addDiagnostic(diagnostics, path, 'id.invalid', `${label} must use letters, numbers, dots, underscores, colons, or hyphens and start with a letter or number.`);
  }
}

function validateLabel(value: unknown, path: string, diagnostics: BlueprintDiagnostic[]): void {
  if (!isLabel(value)) addDiagnostic(diagnostics, path, 'label.invalid', 'Label must be a non-empty string without leading or trailing whitespace.');
}

function validateVersion(
  value: Record<string, unknown>,
  format: string,
  version: number,
  path: string,
  diagnostics: BlueprintDiagnostic[],
): void {
  if (value.format !== format) addDiagnostic(diagnostics, `${path}.format`, 'document.format', `Expected format '${format}'.`);
  if (value.version !== version) addDiagnostic(diagnostics, `${path}.version`, 'document.version', `Unsupported schema version; expected ${version}.`);
}

function validateFieldValue(
  value: unknown,
  schema: BlueprintFieldValueSchema,
  path: string,
  diagnostics: BlueprintDiagnostic[],
  required = false,
): void {
  if (value === undefined) {
    if (required && schema.defaultValue === undefined) {
      addDiagnostic(diagnostics, path, 'field.required', 'A required value is missing.');
    }
    return;
  }

  switch (schema.type) {
    case 'string':
      if (typeof value !== 'string') addDiagnostic(diagnostics, path, 'value.type', 'Expected a string.');
      break;
    case 'number':
    case 'integer':
      if (typeof value !== 'number' || !Number.isFinite(value) || (schema.type === 'integer' && !Number.isInteger(value))) {
        addDiagnostic(diagnostics, path, 'value.type', schema.type === 'integer' ? 'Expected a finite integer.' : 'Expected a finite number.');
      } else {
        if (schema.minimum !== undefined && value < schema.minimum) addDiagnostic(diagnostics, path, 'value.minimum', `Value must be at least ${schema.minimum}.`);
        if (schema.maximum !== undefined && value > schema.maximum) addDiagnostic(diagnostics, path, 'value.maximum', `Value must be at most ${schema.maximum}.`);
      }
      break;
    case 'boolean':
      if (typeof value !== 'boolean') addDiagnostic(diagnostics, path, 'value.type', 'Expected a boolean.');
      break;
    case 'enum':
      if (typeof value !== 'string' || !schema.enumValues?.includes(value)) {
        addDiagnostic(diagnostics, path, 'value.enum', 'Value must match one of the declared enum choices.');
      }
      break;
    case 'object':
      if (!isRecord(value)) {
        addDiagnostic(diagnostics, path, 'value.type', 'Expected an object.');
        break;
      }
      validateObjectValues(value, schema.properties ?? [], path, diagnostics);
      break;
    case 'array':
      if (!Array.isArray(value)) {
        addDiagnostic(diagnostics, path, 'value.type', 'Expected an array.');
        break;
      }
      if (!schema.items) break;
      value.forEach((item, index) => validateFieldValue(item, schema.items!, `${path}[${index}]`, diagnostics));
      break;
  }
}

function validateObjectValues(
  values: Record<string, unknown>,
  definitions: readonly BlueprintFieldDefinition[],
  path: string,
  diagnostics: BlueprintDiagnostic[],
): void {
  const known = new Set(definitions.map((field) => field.id));
  for (const key of Object.keys(values)) {
    if (!known.has(key)) addDiagnostic(diagnostics, `${path}.${key}`, 'field.unknown', `Field '${key}' is not declared by the template.`);
  }
  for (const field of definitions) {
    validateFieldValue(values[field.id], field, `${path}.${field.id}`, diagnostics, field.required === true);
  }
}

function validateFieldSchema(
  value: Record<string, unknown>,
  path: string,
  diagnostics: BlueprintDiagnostic[],
  isDefinition: boolean,
): void {
  const allowed = isDefinition
    ? ['id', 'label', 'description', 'type', 'required', 'defaultValue', 'enumValues', 'minimum', 'maximum', 'properties', 'items']
    : ['type', 'description', 'defaultValue', 'enumValues', 'minimum', 'maximum', 'properties', 'items'];
  checkAllowedKeys(value, allowed, path, diagnostics);

  if (isDefinition) {
    validateIdentifier(value.id, `${path}.id`, diagnostics, 'Field ID');
    validateLabel(value.label, `${path}.label`, diagnostics);
  }
  checkDescription(value, path, diagnostics);
  if (isDefinition && value.required !== undefined && typeof value.required !== 'boolean') {
    addDiagnostic(diagnostics, `${path}.required`, 'value.type', 'Required must be a boolean.');
  }

  if (typeof value.type !== 'string' || !FIELD_TYPES.has(value.type as BlueprintFieldType)) {
    addDiagnostic(diagnostics, `${path}.type`, 'field.type', 'Field type is not supported.');
    return;
  }
  const type = value.type as BlueprintFieldType;
  if (type !== 'enum' && value.enumValues !== undefined) addDiagnostic(diagnostics, `${path}.enumValues`, 'field.schema', 'Enum choices are only valid for enum fields.');
  if (type !== 'object' && value.properties !== undefined) addDiagnostic(diagnostics, `${path}.properties`, 'field.schema', 'Nested properties are only valid for object fields.');
  if (type !== 'array' && value.items !== undefined) addDiagnostic(diagnostics, `${path}.items`, 'field.schema', 'Item schemas are only valid for array fields.');
  if (type !== 'number' && type !== 'integer' && (value.minimum !== undefined || value.maximum !== undefined)) {
    addDiagnostic(diagnostics, path, 'field.schema', 'Numeric bounds are only valid for number and integer fields.');
  }

  if (value.minimum !== undefined && (typeof value.minimum !== 'number' || !Number.isFinite(value.minimum))) {
    addDiagnostic(diagnostics, `${path}.minimum`, 'field.schema', 'Minimum must be a finite number.');
  }
  if (value.maximum !== undefined && (typeof value.maximum !== 'number' || !Number.isFinite(value.maximum))) {
    addDiagnostic(diagnostics, `${path}.maximum`, 'field.schema', 'Maximum must be a finite number.');
  }
  if (typeof value.minimum === 'number' && typeof value.maximum === 'number' && value.minimum > value.maximum) {
    addDiagnostic(diagnostics, path, 'field.schema', 'Minimum cannot exceed maximum.');
  }

  if (type === 'enum') {
    if (!Array.isArray(value.enumValues) || value.enumValues.length === 0
        || value.enumValues.some((choice) => !isLabel(choice))
        || new Set(value.enumValues).size !== value.enumValues.length) {
      addDiagnostic(diagnostics, `${path}.enumValues`, 'enum.invalid', 'Enum choices must be a non-empty list of unique labels.');
    }
  }
  if (type === 'object') {
    if (value.properties !== undefined && !Array.isArray(value.properties)) {
      addDiagnostic(diagnostics, `${path}.properties`, 'field.schema', 'Object properties must be a list.');
    } else if (Array.isArray(value.properties)) {
      validateFieldDefinitions(value.properties, `${path}.properties`, diagnostics);
    }
  }
  if (type === 'array') {
    if (!isRecord(value.items)) {
      addDiagnostic(diagnostics, `${path}.items`, 'field.schema', 'Array fields need an item schema.');
    } else {
      validateFieldSchema(value.items, `${path}.items`, diagnostics, false);
    }
  }
  if (Object.hasOwn(value, 'defaultValue')) {
    validateFieldValue(value.defaultValue, value as unknown as BlueprintFieldValueSchema, `${path}.defaultValue`, diagnostics);
  }
}

function validateFieldDefinitions(
  values: unknown,
  path: string,
  diagnostics: BlueprintDiagnostic[],
): BlueprintFieldDefinition[] {
  if (!Array.isArray(values)) {
    addDiagnostic(diagnostics, path, 'field.schema', 'Fields must be a list.');
    return [];
  }
  const definitions: BlueprintFieldDefinition[] = [];
  const ids = new Set<string>();
  values.forEach((field, index) => {
    const fieldPath = `${path}[${index}]`;
    if (!isRecord(field)) {
      addDiagnostic(diagnostics, fieldPath, 'field.schema', 'Field definition must be an object.');
      return;
    }
    if (isIdentifier(field.id)) {
      if (ids.has(field.id)) addDiagnostic(diagnostics, `${fieldPath}.id`, 'id.duplicate', `Field ID '${field.id}' is duplicated in this field list.`);
      ids.add(field.id);
    }
    validateFieldSchema(field, fieldPath, diagnostics, true);
    definitions.push(field as unknown as BlueprintFieldDefinition);
  });
  return definitions;
}

function validatePin(
  value: unknown,
  path: string,
  diagnostics: BlueprintDiagnostic[],
  allowBranch: boolean,
): BlueprintExecutionPin | null {
  if (!isRecord(value)) {
    addDiagnostic(diagnostics, path, 'pin.invalid', 'Execution pin must be an object.');
    return null;
  }
  checkAllowedKeys(value, allowBranch ? ['id', 'label', 'branch'] : ['id', 'label'], path, diagnostics);
  validateIdentifier(value.id, `${path}.id`, diagnostics, 'Pin ID');
  validateLabel(value.label, `${path}.label`, diagnostics);
  if (allowBranch && value.branch !== undefined && value.branch !== 'true' && value.branch !== 'false') {
    addDiagnostic(diagnostics, `${path}.branch`, 'pin.invalid', "Condition output branch must be 'true' or 'false'.");
  }
  if (!allowBranch && value.branch !== undefined) addDiagnostic(diagnostics, `${path}.branch`, 'pin.invalid', 'Only condition outputs may declare a branch.');
  return value as unknown as BlueprintExecutionPin;
}

function validatePins(
  values: unknown,
  path: string,
  diagnostics: BlueprintDiagnostic[],
  allowBranch: boolean,
): BlueprintExecutionPin[] {
  if (!Array.isArray(values)) {
    addDiagnostic(diagnostics, path, 'pin.invalid', 'Pins must be a list.');
    return [];
  }
  const pins: BlueprintExecutionPin[] = [];
  const ids = new Set<string>();
  values.forEach((pin, index) => {
    const pinPath = `${path}[${index}]`;
    const validPin = validatePin(pin, pinPath, diagnostics, allowBranch);
    if (validPin) {
      if (ids.has(validPin.id)) addDiagnostic(diagnostics, `${pinPath}.id`, 'id.duplicate', `Pin ID '${validPin.id}' is duplicated.`);
      ids.add(validPin.id);
      pins.push(validPin);
    }
  });
  return pins;
}

export function validateBlueprintTemplate(value: unknown): BlueprintDiagnostic[] {
  const diagnostics: BlueprintDiagnostic[] = [];
  if (!isRecord(value)) {
    addDiagnostic(diagnostics, '$', 'document.shape', 'Blueprint template must be a JSON object.');
    return diagnostics;
  }
  checkAllowedKeys(value, ['format', 'version', 'id', 'revision', 'name', 'description', 'fields', 'events', 'nodes'], '$', diagnostics);
  validateVersion(value, BLUEPRINT_TEMPLATE_FORMAT, BLUEPRINT_TEMPLATE_VERSION, '$', diagnostics);
  validateIdentifier(value.id, '$.id', diagnostics, 'Template ID');
  validateLabel(value.name, '$.name', diagnostics);
  checkDescription(value, '$', diagnostics);
  if (!Number.isInteger(value.revision) || (value.revision as number) < 1) {
    addDiagnostic(diagnostics, '$.revision', 'template.revision', 'Template revision must be a positive integer.');
  }
  validateFieldDefinitions(value.fields, '$.fields', diagnostics);

  if (!Array.isArray(value.events)) addDiagnostic(diagnostics, '$.events', 'event.invalid', 'Events must be a list.');
  if (!Array.isArray(value.nodes)) addDiagnostic(diagnostics, '$.nodes', 'node.invalid', 'Node definitions must be a list.');
  const definitionIds = new Set<string>();

  for (const [index, event] of (Array.isArray(value.events) ? value.events : []).entries()) {
    const eventPath = `$.events[${index}]`;
    if (!isRecord(event)) {
      addDiagnostic(diagnostics, eventPath, 'event.invalid', 'Event definition must be an object.');
      continue;
    }
    checkAllowedKeys(event, ['id', 'label', 'description', 'operationId', 'parameters', 'outputPin'], eventPath, diagnostics);
    validateIdentifier(event.id, `${eventPath}.id`, diagnostics, 'Event ID');
    validateLabel(event.label, `${eventPath}.label`, diagnostics);
    checkDescription(event, eventPath, diagnostics);
    validateIdentifier(event.operationId, `${eventPath}.operationId`, diagnostics, 'Operation ID');
    validateFieldDefinitions(event.parameters, `${eventPath}.parameters`, diagnostics);
    validatePin(event.outputPin, `${eventPath}.outputPin`, diagnostics, false);
    if (isIdentifier(event.id)) {
      if (definitionIds.has(event.id)) addDiagnostic(diagnostics, `${eventPath}.id`, 'id.duplicate', `Definition ID '${event.id}' is duplicated.`);
      definitionIds.add(event.id);
    }
  }

  for (const [index, node] of (Array.isArray(value.nodes) ? value.nodes : []).entries()) {
    const nodePath = `$.nodes[${index}]`;
    if (!isRecord(node)) {
      addDiagnostic(diagnostics, nodePath, 'node.invalid', 'Node definition must be an object.');
      continue;
    }
    checkAllowedKeys(node, ['id', 'label', 'description', 'category', 'operationId', 'parameters', 'inputs', 'outputs'], nodePath, diagnostics);
    validateIdentifier(node.id, `${nodePath}.id`, diagnostics, 'Node ID');
    validateLabel(node.label, `${nodePath}.label`, diagnostics);
    checkDescription(node, nodePath, diagnostics);
    if (node.category !== 'action' && node.category !== 'condition') {
      addDiagnostic(diagnostics, `${nodePath}.category`, 'node.category', "Node category must be 'action' or 'condition'.");
    }
    validateIdentifier(node.operationId, `${nodePath}.operationId`, diagnostics, 'Operation ID');
    validateFieldDefinitions(node.parameters, `${nodePath}.parameters`, diagnostics);
    const inputs = validatePins(node.inputs, `${nodePath}.inputs`, diagnostics, false);
    const outputs = validatePins(node.outputs, `${nodePath}.outputs`, diagnostics, node.category === 'condition');
    if (inputs.length === 0) addDiagnostic(diagnostics, `${nodePath}.inputs`, 'pin.invalid', 'Action and condition nodes need at least one execution input.');
    if (node.category === 'condition') {
      const branches = outputs.map((pin) => pin.branch).sort();
      if (branches.length !== 2 || branches[0] !== 'false' || branches[1] !== 'true') {
        addDiagnostic(diagnostics, `${nodePath}.outputs`, 'pin.invalid', "Condition nodes need exactly one 'true' and one 'false' output.");
      }
    } else if (outputs.some((pin) => pin.branch !== undefined)) {
      addDiagnostic(diagnostics, `${nodePath}.outputs`, 'pin.invalid', 'Action outputs cannot declare condition branches.');
    }
    if (isIdentifier(node.id)) {
      if (definitionIds.has(node.id)) addDiagnostic(diagnostics, `${nodePath}.id`, 'id.duplicate', `Definition ID '${node.id}' is duplicated.`);
      definitionIds.add(node.id);
    }
  }

  return diagnostics;
}

function validateGraphPosition(value: unknown, path: string, diagnostics: BlueprintDiagnostic[]): void {
  if (!isRecord(value)) {
    addDiagnostic(diagnostics, path, 'position.invalid', 'Canvas position must contain finite x and y coordinates.');
    return;
  }
  checkAllowedKeys(value, ['x', 'y'], path, diagnostics);
  if (typeof value.x !== 'number' || !Number.isFinite(value.x)
      || typeof value.y !== 'number' || !Number.isFinite(value.y)) {
    addDiagnostic(diagnostics, path, 'position.invalid', 'Canvas position must contain finite x and y coordinates.');
  }
}

function findRecord(value: unknown, list: readonly Record<string, unknown>[], key: string): Record<string, unknown> | undefined {
  if (!isRecord(value)) return undefined;
  return list.find((item) => item.id === value[key]);
}

export function validateBlueprint(value: unknown, templateValue: unknown): BlueprintDiagnostic[] {
  const diagnostics: BlueprintDiagnostic[] = [];
  if (!isRecord(value)) {
    addDiagnostic(diagnostics, '$', 'document.shape', 'Blueprint must be a JSON object.');
    return diagnostics;
  }
  checkAllowedKeys(value, ['format', 'version', 'id', 'name', 'description', 'template', 'fields', 'graph'], '$', diagnostics);
  validateVersion(value, BLUEPRINT_FORMAT, BLUEPRINT_VERSION, '$', diagnostics);
  validateIdentifier(value.id, '$.id', diagnostics, 'Blueprint ID');
  validateLabel(value.name, '$.name', diagnostics);
  checkDescription(value, '$', diagnostics);

  const validTemplate = validateBlueprintTemplate(templateValue).length === 0 && isRecord(templateValue);
  if (!isRecord(templateValue)) {
    addDiagnostic(diagnostics, '$.template', 'template.missing', 'The referenced blueprint template is unavailable.');
  } else if (!validTemplate) {
    addDiagnostic(diagnostics, '$.template', 'template.invalid', 'The referenced blueprint template is invalid.');
  }

  if (!isRecord(value.template)) {
    addDiagnostic(diagnostics, '$.template', 'template.reference', 'Blueprint must reference a template ID and revision.');
  } else {
    checkAllowedKeys(value.template, ['id', 'revision'], '$.template', diagnostics);
    validateIdentifier(value.template.id, '$.template.id', diagnostics, 'Template ID');
    if (!Number.isInteger(value.template.revision) || (value.template.revision as number) < 1) {
      addDiagnostic(diagnostics, '$.template.revision', 'template.revision', 'Template revision must be a positive integer.');
    }
    if (validTemplate && isRecord(templateValue)) {
      if (value.template.id !== templateValue.id) addDiagnostic(diagnostics, '$.template.id', 'template.id', 'Blueprint references a different template.');
      if (value.template.revision !== templateValue.revision) addDiagnostic(diagnostics, '$.template.revision', 'template.revision', 'Blueprint references a different template revision.');
    }
  }

  const topLevelFields = validTemplate ? validateFieldDefinitions(templateValue.fields, '$.template.fields', []) : [];
  if (!isRecord(value.fields)) {
    addDiagnostic(diagnostics, '$.fields', 'field.values', 'Blueprint field values must be an object.');
  } else if (validTemplate) {
    validateObjectValues(value.fields, topLevelFields, '$.fields', diagnostics);
  }

  if (!isRecord(value.graph)) {
    addDiagnostic(diagnostics, '$.graph', 'graph.invalid', 'Graph must contain node and connection lists.');
    return diagnostics;
  }
  checkAllowedKeys(value.graph, ['nodes', 'connections'], '$.graph', diagnostics);
  if (!Array.isArray(value.graph.nodes)) addDiagnostic(diagnostics, '$.graph.nodes', 'graph.invalid', 'Graph nodes must be a list.');
  if (!Array.isArray(value.graph.connections)) addDiagnostic(diagnostics, '$.graph.connections', 'graph.invalid', 'Graph connections must be a list.');

  const rawNodes = Array.isArray(value.graph.nodes) ? value.graph.nodes : [];
  const nodesById = new Map<string, Record<string, unknown>>();
  const eventDefinitions = validTemplate && Array.isArray(templateValue.events)
    ? templateValue.events.filter(isRecord)
    : [];
  const nodeDefinitions = validTemplate && Array.isArray(templateValue.nodes)
    ? templateValue.nodes.filter(isRecord)
    : [];
  const validEdges: Array<{ from: string; to: string }> = [];
  let eventCount = 0;

  rawNodes.forEach((node, index) => {
    const nodePath = `$.graph.nodes[${index}]`;
    if (!isRecord(node)) {
      addDiagnostic(diagnostics, nodePath, 'graph.node', 'Graph node must be an object.');
      return;
    }
    checkAllowedKeys(node, ['instanceId', 'kind', 'definitionId', 'position', 'parameters'], nodePath, diagnostics);
    validateIdentifier(node.instanceId, `${nodePath}.instanceId`, diagnostics, 'Node instance ID');
    validateIdentifier(node.definitionId, `${nodePath}.definitionId`, diagnostics, 'Definition ID');
    if (typeof node.instanceId === 'string') {
      if (nodesById.has(node.instanceId)) addDiagnostic(diagnostics, `${nodePath}.instanceId`, 'id.duplicate', `Node instance '${node.instanceId}' is duplicated.`);
      else nodesById.set(node.instanceId, node);
    }
    validateGraphPosition(node.position, `${nodePath}.position`, diagnostics);
    if (!isRecord(node.parameters)) addDiagnostic(diagnostics, `${nodePath}.parameters`, 'value.type', 'Node parameters must be an object.');

    let definition: Record<string, unknown> | undefined;
    if (node.kind === 'event') {
      eventCount++;
      definition = findRecord(node, eventDefinitions, 'definitionId');
      if (!definition) addDiagnostic(diagnostics, `${nodePath}.definitionId`, 'event.definition', 'Event is not declared by the referenced template.');
    } else if (node.kind === 'node') {
      definition = findRecord(node, nodeDefinitions, 'definitionId');
      if (!definition) addDiagnostic(diagnostics, `${nodePath}.definitionId`, 'node.definition', 'Node is not declared by the referenced template.');
    } else {
      addDiagnostic(diagnostics, `${nodePath}.kind`, 'graph.node', "Graph node kind must be 'event' or 'node'.");
    }
    if (definition && isRecord(node.parameters)) {
      const parameters = validateFieldDefinitions(definition.parameters, `${nodePath}.definition.parameters`, []);
      validateObjectValues(node.parameters, parameters, `${nodePath}.parameters`, diagnostics);
    }
  });

  if (rawNodes.length > 0 && eventCount === 0) {
    addDiagnostic(diagnostics, '$.graph.nodes', 'graph.event-root', 'A graph with nodes needs at least one event root.');
  }

  const seenEdges = new Set<string>();
  const connections = Array.isArray(value.graph.connections) ? value.graph.connections : [];
  connections.forEach((connection, index) => {
    const connectionPath = `$.graph.connections[${index}]`;
    if (!isRecord(connection)) {
      addDiagnostic(diagnostics, connectionPath, 'connection.invalid', 'Connection must be an object.');
      return;
    }
    checkAllowedKeys(connection, ['from', 'to'], connectionPath, diagnostics);
    const from = isRecord(connection.from) ? connection.from : undefined;
    const to = isRecord(connection.to) ? connection.to : undefined;
    if (!from || !to) {
      addDiagnostic(diagnostics, connectionPath, 'connection.invalid', 'Connection needs source and target endpoints.');
      return;
    }
    checkAllowedKeys(from, ['nodeId', 'pinId'], `${connectionPath}.from`, diagnostics);
    checkAllowedKeys(to, ['nodeId', 'pinId'], `${connectionPath}.to`, diagnostics);
    validateIdentifier(from.nodeId, `${connectionPath}.from.nodeId`, diagnostics, 'Source node ID');
    validateIdentifier(from.pinId, `${connectionPath}.from.pinId`, diagnostics, 'Source pin ID');
    validateIdentifier(to.nodeId, `${connectionPath}.to.nodeId`, diagnostics, 'Target node ID');
    validateIdentifier(to.pinId, `${connectionPath}.to.pinId`, diagnostics, 'Target pin ID');
    const sourceId = typeof from.nodeId === 'string' ? from.nodeId : '';
    const targetId = typeof to.nodeId === 'string' ? to.nodeId : '';
    const edgeKey = `${sourceId}\0${String(from.pinId)}\0${targetId}\0${String(to.pinId)}`;
    if (seenEdges.has(edgeKey)) addDiagnostic(diagnostics, connectionPath, 'connection.duplicate', 'Connection is duplicated.');
    seenEdges.add(edgeKey);

    const source = nodesById.get(sourceId);
    const target = nodesById.get(targetId);
    if (!source || !target) {
      addDiagnostic(diagnostics, connectionPath, 'connection.endpoint', 'Connection refers to a missing graph node.');
      return;
    }
    if (target.kind !== 'node') {
      addDiagnostic(diagnostics, `${connectionPath}.to`, 'connection.direction', 'Execution connections cannot target event roots.');
      return;
    }
    const sourceDefinition = source.kind === 'event'
      ? findRecord(source, eventDefinitions, 'definitionId')
      : findRecord(source, nodeDefinitions, 'definitionId');
    const targetDefinition = findRecord(target, nodeDefinitions, 'definitionId');
    const sourcePins = source.kind === 'event'
      ? (sourceDefinition && isRecord(sourceDefinition.outputPin) ? [sourceDefinition.outputPin] : [])
      : sourceDefinition && Array.isArray(sourceDefinition.outputs) ? sourceDefinition.outputs.filter(isRecord) : [];
    const targetPins = targetDefinition && Array.isArray(targetDefinition.inputs) ? targetDefinition.inputs.filter(isRecord) : [];
    const wrongSourceDirection = sourceDefinition && source.kind === 'node'
      && Array.isArray(sourceDefinition.inputs)
      && sourceDefinition.inputs.some((pin) => isRecord(pin) && pin.id === from.pinId);
    const wrongTargetDirection = targetDefinition && Array.isArray(targetDefinition.outputs)
      && targetDefinition.outputs.some((pin) => isRecord(pin) && pin.id === to.pinId);
    const sourcePinExists = sourcePins.some((pin) => pin.id === from.pinId);
    const targetPinExists = targetPins.some((pin) => pin.id === to.pinId);
    if (!sourcePinExists || !targetPinExists) {
      const directionError = wrongSourceDirection || wrongTargetDirection;
      addDiagnostic(diagnostics, connectionPath, directionError ? 'connection.direction' : 'connection.pin',
        directionError ? 'Connection uses a pin with the wrong execution direction.' : 'Connection references an unknown execution pin.');
      return;
    }
    validEdges.push({ from: sourceId, to: targetId });
  });

  if (rawNodes.length > 0 && eventCount > 0) {
    const reachable = new Set<string>();
    const outgoing = new Map<string, string[]>();
    for (const edge of validEdges) outgoing.set(edge.from, [...(outgoing.get(edge.from) ?? []), edge.to]);
    const pending = [...nodesById.entries()]
      .filter(([, node]) => node.kind === 'event')
      .map(([id]) => id);
    while (pending.length > 0) {
      const current = pending.pop()!;
      if (reachable.has(current)) continue;
      reachable.add(current);
      pending.push(...(outgoing.get(current) ?? []));
    }
    for (const [id] of nodesById) {
      if (!reachable.has(id)) addDiagnostic(diagnostics, '$.graph.nodes', 'graph.unreachable', `Node instance '${id}' is not reachable from an event root.`);
    }
  }
  return diagnostics;
}
