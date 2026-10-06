# JSON Blueprints

BornEngineTools can author versioned JSON templates and blueprint instances for game-owned content such as skills, items, classes, or quests. Templates define typed fields, events, action/condition nodes, and stable `operationId` strings. Blueprint files store field values, declared node instances, parameters, and execution-pin connections. The JSON contains no executable code.

Formats are `bornengine.blueprint-template` and `bornengine.blueprint`, each with schema `version: 1`. A template also has an independent positive `revision`; each blueprint references one exact template ID and revision. Unsupported or unresolved documents are preserved with diagnostics instead of being silently replaced.

## Files and runtime ownership

- Templates are shared project data in `.bornengine/blueprint-templates/`.
- Client blueprints are saved under `assets/blueprints/`.
- Blueprints for a linked Colyseus server are saved under `<server>/blueprints/`.
- Server association uses `bornengine.server.json`; the extension only accepts a marker whose normalized `clientProjectRoot` resolves to the current BornEngine project.

For server execution, deploy the exact template revision alongside its blueprint so the server can resolve node `definitionId` values to declared `operationId` values. The server maps those operation IDs to explicit game-owned handlers, validates parameters and graph structure, and remains authoritative for shared gameplay. A client blueprint may drive presentation, but client state does not decide multiplayer outcomes.

The form and graph edit the same JSON through VS Code document APIs, preserving save, undo, redo, dirty state, and synchronization with text edits. BornEngineTools is not required at runtime. This workflow edits versioned project files; it does not edit a live server or publish remote changes.

See the [JSON blueprints guide](https://ruanfernandes.github.io/BornEngine/docs/guides/blueprints/) for a Colyseus operation-dispatch example and the complete authoring flow.
