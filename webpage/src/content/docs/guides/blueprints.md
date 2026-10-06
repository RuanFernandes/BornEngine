---
title: JSON blueprints
description: Create data-driven game definitions with versioned templates and the BornEngineTools form and graph editor.
section: Guides
order: 76
---

JSON blueprints let a game define data such as spells, items, abilities, or character classes without embedding executable code in the document. BornEngineTools edits the files; your client or server owns their runtime behavior.

## Create the project files

From the root of a BornEngine game, create a linked Colyseus server:

```sh
bornengine create server
```

The command runs the maintained Colyseus project generator in `server/` and writes `server/bornengine.server.json` after generation succeeds. You can choose another directory inside the game project or select a package manager explicitly:

```sh
bornengine create server services/game-server --package-manager pnpm
```

The marker uses this versioned shape:

```json
{
  "format": "bornengine.server",
  "version": 1,
  "provider": "colyseus",
  "clientProjectRoot": ".."
}
```

`clientProjectRoot` is a normalized path from the server directory to the BornEngine project root. BornEngineTools offers that server as a save destination only when the marker is valid and resolves to the currently detected game. A Colyseus project without the marker is not treated as part of the game.

In the BornEngineTools view, choose **Create Blueprint Template** to define the reusable data and graph vocabulary. Templates are stored in `.bornengine/blueprint-templates/`. Choose **Create Blueprint** to select a template, enter an ID and name, and choose a destination. The picker shows the resolved folder:

- Client blueprints go under `assets/blueprints/`.
- Server blueprints go under the linked server's `blueprints/` folder.

The extension writes normal project files. You can review them, edit them as text, commit them to version control, and deploy them with their owning project. It does not edit a running server or publish remote changes. The editor is not needed at runtime.

## Template and blueprint formats

Each format has its own `format` ID and schema `version`. A template also has a positive `revision`; a blueprint references one exact template ID and revision. The schema version describes the JSON format, while the template revision tracks changes to that particular template. The editor does not silently migrate a blueprint when its template revision changes.

A template declares typed top-level fields, event definitions, and an action/condition catalog. Supported field types are strings, numbers, integers, booleans, enums, nested objects, and arrays. Events start execution graphs. Action nodes expose execution input/output pins; condition nodes expose one `true` and one `false` output. Graph connections carry execution flow only; node parameters are configured in their forms.

Events and nodes declare stable `operationId` strings. These IDs are a contract for your game code. Templates and blueprints contain no JavaScript, server code, or arbitrary expressions. The game explicitly maps the declared IDs to its own handlers.

A blueprint stores its identity, the exact template reference, field values, graph node instances and positions, parameter values, and connections. It only uses events and node definitions declared by the referenced template. A template with no graph definitions can still create a form-only blueprint.

## Read a server blueprint

Deploy the server blueprint together with the exact template revision it references. For example, place a template copy in `server/blueprint-templates/ember.blueprint-template.json` and create a blueprint at `server/blueprints/ember.blueprint.json`. The shared authoring copy stays in the game project's `.bornengine/blueprint-templates/`; include the server copy in the server's version control and deployment so the server can resolve each `definitionId` to its `operationId`.

This Colyseus room example loads both files, checks their format and exact reference, and dispatches only IDs that the game has explicitly implemented. Add runtime schema validation for the full document before executing it, and validate gameplay values in each handler:

```ts
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { Room } from '@colyseus/core';

type Pin = { id: string; branch?: 'true' | 'false' };
type EventDefinition = { id: string; operationId: string; outputPin: Pin };
type NodeDefinition = {
  id: string;
  category: 'action' | 'condition';
  operationId: string;
  outputs: Pin[];
};
type Template = {
  format: 'bornengine.blueprint-template';
  version: 1;
  id: string;
  revision: number;
  events: EventDefinition[];
  nodes: NodeDefinition[];
};
type GraphNode = {
  instanceId: string;
  kind: 'event' | 'node';
  definitionId: string;
  parameters: Record<string, unknown>;
};
type Blueprint = {
  format: 'bornengine.blueprint';
  version: 1;
  id: string;
  template: { id: string; revision: number };
  fields: Record<string, unknown>;
  graph: {
    nodes: GraphNode[];
    connections: Array<{ from: { nodeId: string; pinId: string }; to: { nodeId: string; pinId: string } }>;
  };
};
type SpellContext = { target?: { health: number } };
type OperationResult = string | undefined;
type OperationHandler = (context: SpellContext, parameters: Record<string, unknown>) => OperationResult;

const handlers: Record<string, OperationHandler> = {
  'spell.cast': () => undefined,
  'spell.damage': (context, parameters) => {
    const amount = parameters.amount;
    if (!context.target || typeof amount !== 'number' || !Number.isFinite(amount)) return undefined;
    context.target.health = Math.max(0, context.target.health - Math.max(0, Math.min(amount, 500)));
    return undefined;
  },
  'spell.hasTarget': (context) => context.target ? 'true' : 'false',
};

function dispatch(operationId: string, context: SpellContext, parameters: Record<string, unknown>): OperationResult {
  const handler = Object.hasOwn(handlers, operationId) ? handlers[operationId] : undefined;
  if (!handler) throw new Error(`No game handler is registered for '${operationId}'.`);
  return handler(context, parameters);
}

async function loadPair(): Promise<{ blueprint: Blueprint; template: Template }> {
  const root = process.cwd();
  const [blueprintText, templateText] = await Promise.all([
    readFile(path.join(root, 'blueprints', 'ember.blueprint.json'), 'utf8'),
    readFile(path.join(root, 'blueprint-templates', 'ember.blueprint-template.json'), 'utf8'),
  ]);
  const blueprint = JSON.parse(blueprintText) as Blueprint;
  const template = JSON.parse(templateText) as Template;
  if (blueprint.format !== 'bornengine.blueprint' || blueprint.version !== 1
      || template.format !== 'bornengine.blueprint-template' || template.version !== 1
      || blueprint.template.id !== template.id || blueprint.template.revision !== template.revision) {
    throw new Error('Blueprint and template formats or revisions do not match.');
  }
  return { blueprint, template };
}

function runEvent(blueprint: Blueprint, template: Template, eventId: string, context: SpellContext): void {
  const eventInstance = blueprint.graph.nodes.find((node) => node.kind === 'event' && node.definitionId === eventId);
  const event = template.events.find((definition) => definition.id === eventId);
  if (!eventInstance || !event) throw new Error(`Event '${eventId}' is not present in this blueprint.`);
  dispatch(event.operationId, context, eventInstance.parameters);

  const nodes = new Map(blueprint.graph.nodes.map((node) => [node.instanceId, node]));
  let sourceNodeId = eventInstance.instanceId;
  let sourcePinId = event.outputPin.id;
  for (let step = 0; step < 128; step++) {
    const connection = blueprint.graph.connections.find((edge) =>
      edge.from.nodeId === sourceNodeId && edge.from.pinId === sourcePinId);
    if (!connection) return;
    const instance = nodes.get(connection.to.nodeId);
    const definition = template.nodes.find((item) => item.id === instance?.definitionId);
    if (!instance || !definition || instance.kind !== 'node') throw new Error('Blueprint graph contains an unknown node.');
    const result = dispatch(definition.operationId, context, instance.parameters);
    const output = definition.category === 'condition'
      ? definition.outputs.find((pin) => pin.branch === result)
      : result
        ? definition.outputs.find((pin) => pin.id === result)
        : definition.outputs[0];
    if (!output) return;
    sourceNodeId = instance.instanceId;
    sourcePinId = output.id;
  }
  throw new Error('Blueprint graph exceeded the game handler step limit.');
}

export class SpellRoom extends Room {
  private blueprint!: Blueprint;
  private template!: Template;

  async onCreate() {
    ({ blueprint: this.blueprint, template: this.template } = await loadPair());
    this.onMessage('cast', (client) => {
      const target = this.getTargetFor(client);
      runEvent(this.blueprint, this.template, 'onCast', { target });
    });
  }

  private getTargetFor(_client: unknown): SpellContext['target'] {
    // Resolve and authorize the target from server-owned room state.
    return undefined;
  }
}
```

After loading the exact template revision, resolve node definitions by their IDs. The returned operation ID is the key your server code registers:

```ts
function operationForNode(template: Template, node: GraphNode): string {
  const definition = template.nodes.find((item) => item.id === node.definitionId);
  if (!definition) throw new Error(`Node '${node.definitionId}' is not declared by this template.`);
  return definition.operationId;
}

const operationId = operationForNode(template, instance);
dispatch(operationId, context, instance.parameters);
```

The IDs `spell.cast`, `spell.damage`, `spell.hasTarget`, and `onCast` are examples: your template author chooses IDs that your game registers. Keep multiplayer effects authoritative in the server. A client blueprint can drive client-side presentation, but never trust a client to decide damage, inventory, currency, or another shared game result.

## Validation and compatibility

BornEngineTools reports JSON, field, parameter, template-revision, and graph diagnostics. Unsupported JSON versions or missing templates stay unchanged so you can fix the source as text. The form and graph edit the same JSON document through VS Code; save, undo, redo, and external text edits use VS Code's document history.

The extension is an authoring tool. A deployed game includes the blueprint and any template data its own code needs, then uses explicit game-owned handlers. There is no generic blueprint executor in the BornEngine runtime, no live server editing, and no remote publish operation in this version.
