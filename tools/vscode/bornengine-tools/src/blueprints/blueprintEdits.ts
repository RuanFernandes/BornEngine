import type {
  BlueprintConnection,
  BlueprintDocument,
  BlueprintGraphNode,
} from './blueprintSchema';

export type BlueprintEditOperation =
  | { type: 'set-field'; fieldId: string; value: unknown; fieldPath?: string[] }
  | { type: 'add-node'; node: BlueprintGraphNode }
  | { type: 'move-node'; instanceId: string; position: { x: number; y: number } }
  | { type: 'set-node-parameter'; instanceId: string; parameterId: string; fieldPath?: string[]; value: unknown }
  | { type: 'remove-node'; instanceId: string }
  | { type: 'connect'; connection: BlueprintConnection }
  | { type: 'disconnect'; connection: BlueprintConnection };

function cloneDocument(document: BlueprintDocument): BlueprintDocument {
  return structuredClone(document);
}

function findNode(document: BlueprintDocument, instanceId: string): BlueprintGraphNode {
  const node = document.graph.nodes.find((candidate) => candidate.instanceId === instanceId);
  if (!node) throw new Error(`Blueprint graph node '${instanceId}' was not found.`);
  return node;
}

function sameConnection(left: BlueprintConnection, right: BlueprintConnection): boolean {
  return left.from.nodeId === right.from.nodeId
    && left.from.pinId === right.from.pinId
    && left.to.nodeId === right.to.nodeId
    && left.to.pinId === right.to.pinId;
}

/** Applies one immutable edit operation; schema validation remains a separate step. */
export function applyBlueprintEdit(
  source: BlueprintDocument,
  edit: BlueprintEditOperation,
): BlueprintDocument {
  const document = cloneDocument(source);
  switch (edit.type) {
    case 'set-field':
      if (!edit.fieldPath || edit.fieldPath.length === 0) {
        document.fields[edit.fieldId] = edit.value;
        break;
      }
      {
        const path = [edit.fieldId, ...edit.fieldPath];
        let current: Record<string, unknown> = document.fields;
        for (const segment of path.slice(0, -1)) {
          const child = current[segment];
          if (!child || typeof child !== 'object' || Array.isArray(child)) {
            current[segment] = {};
          }
          current = current[segment] as Record<string, unknown>;
        }
        current[path.at(-1)!] = edit.value;
      }
      break;
    case 'add-node':
      if (document.graph.nodes.some((node) => node.instanceId === edit.node.instanceId)) {
        throw new Error(`Blueprint graph node '${edit.node.instanceId}' already exists.`);
      }
      document.graph.nodes.push(structuredClone(edit.node));
      break;
    case 'move-node':
      if (!Number.isFinite(edit.position.x) || !Number.isFinite(edit.position.y)) {
        throw new Error('Blueprint node position must use finite x and y coordinates.');
      }
      findNode(document, edit.instanceId).position = { ...edit.position };
      break;
    case 'set-node-parameter':
      if (!edit.fieldPath || edit.fieldPath.length === 0) {
        findNode(document, edit.instanceId).parameters[edit.parameterId] = edit.value;
        break;
      }
      {
        const path = [edit.parameterId, ...edit.fieldPath];
        const parameters = findNode(document, edit.instanceId).parameters;
        if (!parameters[path[0]] || typeof parameters[path[0]] !== 'object' || Array.isArray(parameters[path[0]])) {
          parameters[path[0]] = {};
        }
        let current = parameters[path[0]] as Record<string, unknown>;
        for (const segment of path.slice(1, -1)) {
          const child = current[segment];
          if (!child || typeof child !== 'object' || Array.isArray(child)) current[segment] = {};
          current = current[segment] as Record<string, unknown>;
        }
        current[path.at(-1)!] = edit.value;
      }
      break;
    case 'remove-node':
      findNode(document, edit.instanceId);
      document.graph.nodes = document.graph.nodes.filter((node) => node.instanceId !== edit.instanceId);
      document.graph.connections = document.graph.connections.filter((connection) =>
        connection.from.nodeId !== edit.instanceId && connection.to.nodeId !== edit.instanceId);
      break;
    case 'connect':
      if (document.graph.connections.some((connection) => sameConnection(connection, edit.connection))) {
        throw new Error('Blueprint graph connection already exists.');
      }
      document.graph.connections.push(structuredClone(edit.connection));
      break;
    case 'disconnect':
      document.graph.connections = document.graph.connections.filter((connection) => !sameConnection(connection, edit.connection));
      break;
  }
  return document;
}
