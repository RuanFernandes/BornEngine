# BornEngine Server, Blueprint, and Animation Template Plan

## Goal

Deliver a coordinated authoring workflow across the BornEngine CLI, BornEngineTools,
and the engine's sprite runtime:

1. Scaffold a Colyseus server in a BornEngine game through the CLI and mark its
   relationship to the client project.
2. Author reusable JSON templates and template-based blueprints in BornEngineTools,
   then save each blueprint in the marked server or the client assets.
3. Create parameterized layered 2D animation templates whose author-defined
   image inputs can be rebound to different textures at runtime.

## Design references

- `docs/superpowers/specs/2026-10-06-bornengine-server-and-blueprints-design.md`
- `docs/superpowers/specs/2026-10-06-sprite-animation-templates-design.md`
- Existing editor layer foundation:
  `docs/superpowers/specs/2026-10-06-sprite-animation-composite-frames-design.md`
- Existing related editor plan:
  `docs/superpowers/plans/2026-10-06-bornengine-tools-map-animation-overhaul.md`

## Workstream boundaries

- **CLI repository:** `/home/nullborne/Documentos/Bornengine/bornengine-cli`.
- **Engine and extension workspace:**
  `/home/nullborne/Documentos/Bornengine/.worktrees/bornengine-visual-editor`.
- The CLI creates and identifies the server subproject. BornEngineTools detects
  the marker, edits files, and does not execute blueprints.
- Blueprint runtime behavior stays in game-owned server/client code. The engine
  does not gain a generic graph executor in this work.
- Sprite templates are a distinct format from blueprint templates. The engine
  runtime binds named image parameters and plays the layered sprite clips.
- Preserve the current interactive `bornengine create` wizard and the existing
  single-sprite animation API.
- No publishing or branch integration is part of these implementation tasks.

## Dependency order

```text
CLI marker + server scaffold
          |
          v
BornEngineTools server discovery ----> Blueprint template/schema
                                           |
                                           v
                                   Blueprint form + graph editor

Approved composite-layer editor base --> Animation template schema/editor
                                                      |
                                                      v
                                            Engine bind/render/playback
```

The CLI can be implemented and validated independently. Extension server
destination work depends on the marker contract. Animation editor authoring and
engine runtime work share the new template schema, but can proceed in separate
packages after the schema is agreed.

---

## Phase A: CLI server scaffolding

### Task 1: Add the nested `create server` command

**Repository:** `bornengine-cli`

**Files:** `src/cli.rs`, `src/commands/mod.rs`, `src/commands/create.rs`,
new focused server command module, `src/lib.rs` if exports are required.

1. Add a nested create subcommand so `bornengine create` still runs the current
   interactive BornEngine game wizard and
   `bornengine create server [PATH] [--package-manager <pnpm|npm|yarn>]`
   runs the server scaffold flow.
2. Reuse the CLI's existing project-root lookup and BornEngine manifest check
   (the package dependency on `@bornengine/engine`). Fail with a direct
   instruction when no BornEngine project is found.
3. Default the destination to `<project-root>/server`. Accept an optional
   relative or absolute destination only when it resolves to a strict child of
   the project root. Use the configured package manager unless the new option
   overrides it.
4. Refuse a non-empty target and do not partially overwrite user files.
5. Select the generator invocation for the configured or explicitly selected
   package manager. Delegate to the maintained Colyseus scaffold command,
   forward stdin/stdout/stderr so its prompts remain usable, and propagate its
   exit status. Verify the exact upstream invocation against the official guide
   immediately before implementation: <https://docs.colyseus.io/getting-started>.
6. Write the BornEngine marker only after the generator exits successfully. If
   marker writing fails, preserve the generated project and explain how to
   recover rather than deleting the server directory.

### Task 2: Define and validate the server marker

**Files:** the server command module, focused Rust unit/integration tests,
`README.md` and CLI command help.

1. Write `bornengine.server.json` at the server root with the agreed versioned
   shape: format `bornengine.server`, version `1`, provider `colyseus`, and a
   normalized `clientProjectRoot` relative to the server folder.
2. Resolve paths before writing; confirm the marker's relative client root
   resolves exactly to the owning project, and reject malformed paths or a
   destination outside that project.
3. Keep marker serialization stable and include a trailing newline.
4. Add command tests for the default path, explicit nested path, path escape,
   missing BornEngine project, non-empty destination, generator failure, and
   marker success/failure. Stub process creation so tests never invoke the
   network generator.
5. Add CLI help and README examples without changing `bornengine create` or
   `bornengine new` behavior.

**Completion checks:** Rust formatting and the focused/full CLI test suite pass;
`bornengine create --help` still describes the wizard and the nested help shows
the server command.

---

## Phase B: BornEngineTools server discovery and blueprint authoring

### Task 3: Discover a marked server safely

**Workspace:** BornEngineTools source under `tools/vscode/bornengine-tools`.

**Files:** project detection under `src/views/`, shared workspace path helpers,
the tools tree provider, and extension tests.

1. Reuse the current BornEngine project manifest check (`@bornengine/engine`)
   and locate `bornengine.server.json` files within that project's workspace.
2. Validate marker format/version/provider and resolve `clientProjectRoot` from
   the marker's directory. Offer a server only when the resolved root matches
   the actual BornEngine root; reject path traversal and stale/copied markers.
3. Support more than one valid server marker by asking which one to target.
   Refresh detection on marker create/change/delete and workspace changes.
4. Show a useful empty state and CLI instruction when no valid server is
   present. A package containing Colyseus alone is not proof of association.
5. Add tests for valid, malformed, unsupported-version, copied, escaped,
   missing, and multiple markers.

### Task 4: Implement blueprint template and document schemas

**Files:** new pure schema/validation/edit modules beneath
`tools/vscode/bornengine-tools/src/blueprints/`, plus focused tests.

1. Add versioned BornEngine JSON formats for blueprint templates and blueprint
   instances, following the design spec. Keep format IDs and schema revisions
   distinct.
2. Templates define stable IDs, supported field types/defaults, event
   definitions, and action/condition node definitions with typed parameters
   and execution-flow pins. Use operation IDs as the contract back to game code.
3. Blueprint files reference one exact template ID and revision, store field
   values, node instances, canvas positions, and execution-pin connections.
4. Validate unique IDs, field/default compatibility, node parameters, event
   roots, connection endpoints and pin directions, template references, and
   schema versions. Preserve malformed source text and report diagnostics
   rather than replacing it.
5. Keep graphs limited to execution flow in V1. Do not support arbitrary
   JavaScript, custom scripts, expression/data-flow execution, or a general
   interpreter.
6. Add schema, edit-operation, migration/version, and round-trip tests before
   implementation changes, using the previously approved TDD approach.

### Task 5: Build the template editor

**Files:** new custom editor provider, Webview HTML/CSS/TypeScript and tests
under `tools/vscode/bornengine-tools/src/blueprints/` and `src/webview/`;
activation/registration in `src/extension.ts` and contribution metadata.

1. Add a template editor for identity, field list, events, and action/condition
   node catalog. Allow adding, editing, reordering, and deleting entries.
2. Provide ID editing with uniqueness feedback and field editors tailored to
   string, number, integer, boolean, enum, nested object, and array types.
3. Provide execution pin configuration and clear direction labels. Template
   actions describe game-owned operations; they do not contain executable
   source.
4. Use VS Code document edits for save, undo/redo, dirty state, and external
   text changes. Show schema diagnostics in both the editor and VS Code.
5. Save shared templates by default to
   `<project>/.bornengine/blueprint-templates/`.

### Task 6: Build the blueprint form and graph editor

**Files:** blueprint Webview provider, form/graph view, edit operations, and
focused tests.

1. Add a creation flow that selects a template, creates blueprint identity, and
   chooses the client or server destination.
2. Render template fields as an editable form. Render only template-declared
   events/actions/conditions in the visual graph.
3. Allow adding, moving, configuring, connecting, and removing nodes. Keep
   graph connections limited to declared execution pins and condition
   true/false paths.
4. Serialize to plain JSON as the source of truth; show a generated JSON view
   and support opening the same file as text.
5. Validate before save and preserve invalid source with precise diagnostics.
   Support undo/redo, dirty state, and external edits through the existing
   custom-editor document APIs.
6. Save server-target blueprints under
   `<server>/blueprints/`; save client-target blueprints under
   `<project>/assets/blueprints/`. Confirm the resolved target in the picker.

### Task 7: Document the game-side contract

**Files:** engine website/docs content and the CLI/BornEngineTools guides.

1. Document template and blueprint formats, revisions, operation IDs, server
   marker behavior, and the two save destinations.
2. Provide a Colyseus example that reads a blueprint file and dispatches an
   operation ID to explicit game-owned handlers.
3. Explain that the server is authoritative for multiplayer effects, client
   blueprints are for client-side use, and the editor is not required at
   runtime.
4. State that this V1 stores project files for normal version control/deploy;
   it does not edit a live server or publish remote changes.

**Completion checks:** extension schema/editor tests, strict TypeScript check,
and Webview/package builds pass. Manual review confirms the generated JSON
round-trips through text and visual editing and that an invalid server marker
never appears as a destination.

---

## Phase C: Reusable animation templates with named image parameters

### Task 8: Add the animation template schema and binding validation

**Engine files:** `src/sprites/`, sprite exports in `src/index.ts`, runtime API
type checks, and focused tests.

**Extension files:** new format logic beneath
`tools/vscode/bornengine-tools/src/animations/` and focused schema tests.

1. Define the versioned `bornengine.spriteanim-template` data types for named
   image parameters, clip timing, output canvas size, keyframes, ordered
   layers, source crops, and per-layer transforms.
2. Let template authors define uniquely identified image parameters with
   arbitrary IDs, optional display labels, and optional user-defined tags for
   grouping/filtering in the editor. Tags are saved as organizational metadata
   and never affect texture binding or runtime behavior. Keep source image
   paths out of the reusable document.
3. Implement extension and runtime validation for unique IDs, clip/frame
   structure, required/optional inputs, timing, non-zero transforms, crop
   bounds, supported format versions, and explicit defaults for safely
   omittable fields.
4. Add tests before code changes for multiple arbitrary input IDs, optional
   missing parameters, tag editing/round trips, wrong/unknown IDs, per-layer
   crop bounds, signed stretch, transform serialization, compact JSON semantic
   round trips, and bad template versions.

### Task 9: Extend the animation editor for template inputs

**Files:** the current animation editor provider, schema/edit helpers, sidebar
HTML/CSS, Webview animation editor, preview code, and tests.

1. Add separate create/open/save flows for concrete animation documents and
   reusable templates. Do not auto-convert either format.
2. Build an Inputs panel where the template author adds, names, reorders, and
   removes arbitrary parameters, sets optional labels and required status,
   assigns user-defined organizational tags, and sees which temporary preview
   image is assigned to each parameter. Support grouping or filtering by tags.
3. Add/replace one preview image per input and allow alternate preview images
   to verify the same crop layout. Do not serialize preview image paths into
   template JSON.
4. Reuse the approved Clip, Frames, and Layers organization. A selected layer
   chooses its parameter, crop rectangle, order, visibility, offset, stretch,
   zoom, rotation, and pivot. Mouse-selected atlas crops become layers for the
   selected parameter; adding a parameter image must not accidentally add a
   frame.
5. Preview every keyframe by compositing visible layers bottom-to-top, then
   play full clips using shared frame timing. Show actionable slot and crop
   validation errors.
6. Preserve the previous compatibility rules for ordinary `.spriteanim.json`
   documents and their approved optional editor-layer data.
7. Save animation JSON compactly by removing insignificant whitespace. Omit
   fields equal to defaults only when the format defines those defaults and
   loading restores the exact same value. Preserve numeric values, array order,
   tags, IDs, markers, and all other animation data.
8. Test pretty and compact input, canonical compact output, default omission,
   and semantic round trips for both new templates and supported existing
   animation documents.

### Task 10: Bind template parameters to textures in the engine

**Files:** new sprite template model, sprite animation keyframe types,
layer-aware renderer/animation target, `SpriteAnimator` integration, public
exports, and runtime tests.

1. Add a binding API that receives an object map from parameter IDs to loaded
   `Texture` objects. Validate required/optional inputs, unknown IDs, Game
   ownership, and every layer crop before returning a bound animation set.
2. Build per-binding `SpriteSheet`/`SpriteFrame` data for each supplied input.
   Two character bindings must not share frame objects or mutable playhead
   state.
3. Add an animation target/renderer capable of drawing a full composite frame
   from multiple textures, applying each layer's source crop and independent
   transforms in bottom-to-top order.
4. Drive all layers from one `SpriteAnimator` timeline/state machine. Preserve
   FPS, loop modes, frame durations, markers, state transitions, and crossfade
   behavior as applicable to both ordinary and composite animations. Never
   start one independent animator per image parameter.
5. Define the canvas-to-world scaling rule: offsets use clip canvas pixels,
   signed stretch mirrors, zoom is positive, rotation is degrees, and pivot is
   normalized. The root animation renderer's size scales the clip canvas into
   world units.
6. Keep existing `SpriteRenderer`/`SpriteAnimator` single-sprite construction
   source-compatible. Add composite support alongside it.
7. Test binding order independence, multiple image combinations, synchronized
   frame changes, marker emission exactly once, bad textures/crops, scene
   ownership, renderer transforms, and the unchanged single-sprite path.

### Task 11: Document runtime use and template authoring

**Files:** website sprite animation API/guide pages, local AI docs, template
example assets, and API type tests.

1. Document the template JSON, its compact serialization, the author-defined
   `Texture` binding map, required versus optional parameters, crop/transform
   semantics, and compatibility with old animation documents.
2. Show one `idle`/`walk` template reused with different images supplied for
   arbitrary parameter IDs. Demonstrate loading each texture through the
   existing asset system, binding by parameter ID, and playing a clip.
3. State clearly that all layers in one clip share frame timing in V1; bones,
   independent tracks, and skeletal animation are not part of this feature.
4. Include a small fixture template and tests/docs that validate it against the
   runtime API.

**Completion checks:** engine type/API tests, sprite runtime tests, extension
schema/Webview tests, strict animation-editor TypeScript check, docs link
checks, and engine/extension builds pass. Manual preview and a small game
example confirm editor/runtime transforms and layer order match.

---

## Phase D: Cross-repository review and handoff

1. Review the CLI and engine/extension changes independently, with special
   attention to the marker schema, path safety, JSON compatibility, public API
   exports, and runtime render ordering.
2. Verify all new JSON fixtures round-trip and every old server/game/animation
   fixture remains valid.
3. Preserve unrelated files in both repositories. The CLI checkout currently
   contains unrelated local test changes and an untracked `.worktrees/` path;
   the engine/extension worktree contains an untracked `tools/vscode/` tree.
   Stage only files belonging to the approved work.
4. Report the separate validation results and reviewable changes. Package
   publishing, GitHub deployment, and merging are separate actions and are not
   included here.

## Global acceptance criteria

- `bornengine create` retains the existing game wizard; `bornengine create
  server` delegates to Colyseus and writes a correct, safe association marker
  only after successful generation.
- BornEngineTools shows a server destination only when a valid marker points
  back to the current BornEngine project, and offers client assets otherwise.
- A game developer can define a reusable template, fill its fields, and connect
  only its declared graph events/actions/conditions in a blueprint JSON.
- Server blueprints remain server data and client blueprints remain client
  assets. Runtime execution is performed by explicit game-owned code.
- An animation template declares its author-defined image parameters and uses them in
  ordered, independently transformable layers across shared keyframes.
- Compact animation JSON reopens with the same values, ordering, and playback
  behavior as its pretty-printed source.
- One runtime template binding maps each provided `Texture` by stable
  parameter ID; alternate characters/equipment reuse the same clips without
  copied animation definitions.
- Existing game creation, server projects, concrete animation JSON, and
  single-sprite playback keep working.
- Website and local documentation describe the formats, workflows, runtime
  APIs, constraints, and examples.
