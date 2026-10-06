# BornEngine Server Scaffolding and Blueprint Authoring

## Status

Design draft for user review. No implementation is authorized by this document alone.

## Goal

Let a BornEngine project create a Colyseus server through the BornEngine CLI, and use BornEngineTools to author versioned JSON templates and blueprints for either the server project or the client source.

## User intent

- Create reusable JSON templates such as spells, weapons, or other game-defined content.
- Let a template define fields and the events, actions, and conditions available in its visual graph.
- Create a blueprint from a template, edit its fields in a form, and connect allowed events/actions/conditions in a graph.
- Create a Colyseus server with the BornEngine CLI, using Colyseus' maintained project generator.
- Let BornEngineTools save blueprint JSON into the detected server folder or the BornEngine client source, according to the user's choice.
- Keep files in the project so they can be versioned and included in deployment.
- Keep the authoring tool optional and avoid a generic blueprint executor in the BornEngine engine core for V1.

## Scope split

This feature has two independently testable workstreams connected by the project folder convention and the blueprint JSON contract:

1. **CLI server scaffolding** in the separate BornEngine CLI repository.
2. **BornEngineTools template and blueprint editors** in the VS Code extension source currently located at `tools/vscode/bornengine-tools` in the BornEngine worktree.

The CLI work establishes a default `server/` subproject and marks it as belonging to the BornEngine game project. The editor work detects that marker and offers the server as a JSON destination alongside the BornEngine client source. The CLI remains usable directly; V1 does not require an extension command to create the server.

## CLI server creation

Add `bornengine create server [PATH] [--package-manager <pnpm|npm|yarn>]` while preserving the current `bornengine create` interactive game-project wizard. Run it from a BornEngine game project; when no path is supplied, default to `server/` beneath that project. An explicit target path must be a child of the BornEngine project root so the association is unambiguous and the client project itself cannot be scaffolded over. Refuse to overwrite a non-empty target. When the package-manager option is omitted, use the CLI's configured package manager.

The CLI delegates project generation to Colyseus' maintained generator instead of copying or maintaining a separate server template. The current official getting-started guide uses `npm create colyseus-app@latest <path>` and documents package-manager alternatives, presets, and generator flags ([Colyseus Getting Started](https://docs.colyseus.io/getting-started)). The CLI uses its configured or explicitly selected package manager, starts the generator with inherited terminal input/output so its prompts work, and returns the generator's exit status.

Only after the generator succeeds, the CLI writes `bornengine.server.json` at the generated server root:

```json
{
  "format": "bornengine.server",
  "version": 1,
  "provider": "colyseus",
  "clientProjectRoot": ".."
}
```

`clientProjectRoot` is a normalized relative path from the server folder to the owning BornEngine project root. The CLI uses its existing project-root detection, defaults the server to `<project-root>/server`, and requires explicit target paths to stay below that project root. BornEngineTools resolves the marker path and requires it to identify the detected project exactly. This marker is the explicit association signal for BornEngineTools; a folder with Colyseus dependencies alone is not treated as a BornEngine server. If marker creation fails, report the failure and leave the generated folder intact so the user can recover it.

V1 does not inject custom Colyseus room code or edit generated server source. The generated server is a normal project that BornEngineTools can recognize from its `package.json` dependencies.

## Proposed architecture

BornEngineTools adds two VS Code custom editors as Webviews, following the existing map and sprite-animation editor pattern:

1. **Template editor** creates and edits template JSON. It defines template identity, fields, events, and the allowed action/condition node catalog.
2. **Blueprint editor** opens a blueprint JSON that references a template revision. It renders a form from the template fields and a node graph from the template's event and node definitions.

The extension host owns workspace file access, serialization, validation, VS Code diagnostics, and document edits. Webviews handle presentation and user input only. The tool detects BornEngine client workspaces using the existing project check, then searches within that project for a valid `bornengine.server.json` marker. It verifies the marker format/version, provider, relative client-root path, and that the referenced root is the detected BornEngine project. If more than one valid server marker exists, the creation flow asks which server to use. If no server marker is found, the server destination is unavailable and the CLI command is shown as the way to create one. Marker file events refresh the workspace tree.

Templates and blueprints are ordinary project files. The editor saves templates in the workspace's shared template folder. For each blueprint, the user chooses the client or server destination; the selected project owns that JSON file and includes it in its normal deployment. No direct remote-save workflow or live-server publishing is included in V1.

## Document model

### Template document

Template files use a versioned BornEngine format and define:

- A stable template ID, a template revision, a display name, and an optional description.
- A field schema for blueprint top-level data and node parameters. V1 supports strings, numbers, integers, booleans, enums, nested objects, and arrays. Fields can specify labels, descriptions, required status, defaults, enum choices, and numeric bounds where applicable.
- A list of event definitions. Each event has a stable event ID, display label, optional parameters, and an event output that starts a graph.
- A node catalog with stable node IDs, display labels, category (`action` or `condition`), parameter fields, and execution-flow pins. Condition nodes have explicit true/false outputs. V1 graph wires connect execution flow; node parameter values are entered through node forms.
- Stable operation IDs on events, actions, and conditions. The game server maps these IDs to game-specific behavior.

The template editor lets the author add, edit, reorder, and remove fields, events, and node definitions. It validates unique IDs and field defaults before saving. Templates describe available data and operations; they do not embed executable JavaScript or arbitrary scripts.

### Blueprint document

Blueprint files use a separate versioned BornEngine format and contain:

- A stable blueprint ID and display name.
- The referenced template ID and revision.
- Values for the template's top-level fields.
- A graph containing node instances and execution connections. Each node instance stores its template node ID, a unique instance ID, canvas position, and configured parameter values. Connections reference source/target node IDs and pin IDs.

The blueprint editor presents two coordinated areas or tabs: **Fields** for template-defined values and **Graph** for event/action/condition nodes. Only events and node types declared by the selected template can be added. A blueprint from a template without graph nodes remains a form-only JSON document.

The editor can show generated JSON and open the same document as plain text. The JSON document remains the persisted source of truth; editor state is derived from it and is not stored in a separate opaque format.

## Runtime and deployment boundary

The extension does not execute blueprint behavior. The selected target determines which project receives the blueprint file:

- Blueprints saved in the server project are read by the game's Colyseus server, which maps operation IDs to game-owned handlers and remains authoritative for gameplay effects.
- Blueprints saved in the BornEngine client project are available to client code for client-side use such as presentation and previews. Client-side processing does not grant authority over multiplayer gameplay.

V1 defines the data format and authoring tools, not a universal graph interpreter. A sample server-side contract and operation-handler example should accompany the feature. The Colyseus server generator remains upstream-owned; BornEngine CLI does not install BornEngine engine packages into the server or alter its generated source.

## Validation and error handling

The extension validates both documents before saving and reports actionable diagnostics in VS Code and in the editor UI.

Template validation covers supported field types, unique IDs, required/default compatibility, enum choices, numeric bounds, event and node definitions, operation IDs, and pin declarations.

Blueprint validation covers JSON shape and version, template resolution and revision, required and typed field values, permitted node IDs, unique node-instance IDs, valid parameter values, existing connection endpoints, pin direction/type, and valid event roots. If a referenced template is missing or has a different revision, the editor preserves the JSON and reports the mismatch rather than silently replacing data.

External text edits and editor changes flow through VS Code's document-edit APIs so dirty state, undo/redo, save, and file-watcher behavior remain consistent with the existing custom editors.

## Project file locations

Use project-relative files with defaults that can be changed through the creation flow:

- Shared templates: `<bornengine-project>/.bornengine/blueprint-templates/<name>.blueprint-template.json`
- Server-target blueprints: `<server-project>/blueprints/<name>.blueprint.json`
- Client-target blueprints: `<client-project>/assets/blueprints/<name>.blueprint.json`

The CLI's default server project is `<client-project>/server/`, making the server target easy to detect. An explicit CLI path may put it elsewhere inside the client project. The marker stores the relative client root, so the extension can reject markers copied from unrelated Colyseus projects. These are source files, not machine-specific extension storage. Projects may commit them and include the selected blueprint folder in the corresponding runtime deployment.

## User workflow

1. Run `bornengine create server` inside a BornEngine game project, or provide an explicit target path inside that project. The CLI runs the official Colyseus generator and, after success, writes `bornengine.server.json` into the generated server folder.
2. Open the workspace in VS Code. BornEngineTools recognizes the client project and the server only when its valid marker points back to that client project.
3. Choose **Create Blueprint Template**, define the template's identity, fields, events, and action/condition node catalog, and save it in the shared template folder.
4. Choose **Create Blueprint**, select a template, set the blueprint ID/name, and choose the server or client destination.
5. Fill template-defined fields and, when the template contains graph nodes, build the event-to-action/condition flow. Save the JSON in the chosen project.
6. The game code reads the deployed JSON and handles its operation IDs; no VS Code extension is required on the running server or client.

## V1 scope

Included:

- CLI `bornengine create server [PATH]`, package-manager selection/configuration, upstream generator delegation, and help/docs.
- Server creation defaults to a `server/` subfolder when run from a BornEngine project; explicit paths are supported.
- A versioned `bornengine.server.json` marker that links the generated Colyseus project to its owning BornEngine project.
- Template creation and visual editing, including fields, events, and action/condition node definitions.
- Blueprint creation from a selected template.
- Form-based field editing and visual execution-flow graph editing in the same blueprint document.
- Server/client destination selection in the extension.
- JSON persistence, validation, diagnostics, undo/redo, and external-edit synchronization through VS Code documents.
- Stable format versions, template revisions, and clear errors for missing or incompatible templates.
- Documentation of the JSON contract and an example mapping operation IDs to game-owned server handlers.

Excluded:

- Runtime blueprint execution in BornEngine core.
- Built-in RPG classes, spells, weapons, or gameplay operations.
- Arbitrary code execution from template or blueprint JSON.
- Editing the live production server, remote publishing, multiplayer hot reload, and write-back synchronization.
- Data pins, visual expression evaluation, custom node scripting, marketplace/sharing service, and automatic template migrations.
- A server-creation UI inside BornEngineTools; V1 exposes server creation through the CLI and lets the extension detect the resulting project.

## Acceptance criteria

1. Existing `bornengine create` continues to open the game-project wizard; `bornengine create server` invokes the current Colyseus generator with the chosen target, passes through its interactive prompts, and writes the versioned association marker only after successful generation.
2. A BornEngineTools user can create a template that declares fields and one or more events, then save and reopen it without losing values.
3. A user can create a blueprint from that template, edit fields in a form, place only allowed graph nodes, connect execution pins, and save/reopen the result.
4. The user can save a blueprint in a Colyseus server project only when its valid BornEngine association marker points to the current game project, or save it in the BornEngine client source. An absent or invalid marker makes the server unavailable as a destination.
5. The saved blueprint JSON references the exact template ID and revision and contains field values plus graph nodes/connections.
6. Invalid template fields, event/node definitions, blueprint values, unresolved templates, and invalid graph connections produce useful diagnostics without destroying the source document.
7. Editing the same file as text and reopening the visual editor reflects external changes and reports incompatibilities.
8. The formats contain no executable source. Server behavior is selected by operation IDs implemented by the game project.
9. The generated Colyseus server remains a normal upstream-compatible project and does not require BornEngineTools at runtime.

## Risks and mitigations

- **Colyseus changes its generator interface.** Delegate to the current upstream command and keep arguments narrow; verify command syntax against official documentation when implementation begins.
- **The CLI and editor live in separate repositories.** Keep the directory and JSON format conventions in this spec, and validate each workstream in its own repository.
- **The destination prompt could write to the wrong project.** Show project name and resolved path before saving and require the selected folder to be inside the open workspace unless the user explicitly picks an additional workspace folder.
- **Template revisions can drift from blueprints.** Store the exact template revision in every blueprint and report mismatches; do not silently migrate.
- **User-defined operation IDs may not be implemented by the server.** Treat each ID as a game-code dispatch contract and provide a server-side example; do not imply the editor implements gameplay semantics.
- **Generic nested fields and graphs can make the UI unwieldy.** Keep the field type set small and use separate Fields/Graph areas; exclude data-flow pins and expressions from V1.
- **Large graphs can make Webview state expensive.** Keep the persisted graph plain JSON, use stable IDs, and separate rendering from serialization and validation.
- **The existing extension tree and CLI checkout contain unrelated untracked or modified files.** Preserve them during implementation and stage only task-owned files.
