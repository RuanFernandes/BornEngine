# BornEngine Versioned 2D World Runtime

For agentic workers: REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development`. Work in a clean worktree from BornEngine `main` at `e320b869`, branch `work/world2d-runtime`; use a dedicated progress ledger.

## Goal

Add a stable, editor-friendly, code-first `.world2d.json` contract that BornEngine can validate, migrate, instantiate, and round-trip without changing the current 3D `WorldData` schema.

## Architecture

Create a separate `src/world2d` module. The schema contains stable IDs, version, map dimensions, tile sets/layers, object transforms, asset references, and JSON component descriptors. Runtime behavior is provided by a registry of game-owned factories. Built-in descriptors cover sprite renderer, tilemap, and 2D physics collider data. Unsupported descriptors report diagnostics instead of being silently dropped.

## Tech Stack

Perry-compatible TypeScript and JSON-friendly plain data; deterministic fixture JSON shared by CLI contract tests; existing `GameScene`, `GameObject`, `Tilemap`, and component lifecycle.

## Spec

Use top-level `{ format: 'bornengine.world2d', version: 1, id, name, assets, tilesets, layers, metadata }`. `assets` is a sorted array of normalized project-relative POSIX paths. A tileset has `{ id, image, tileWidth, tileHeight, columns, tileCount, margin:{x,y}, spacing:{x,y}, tiles }`; tile definitions use `{ tileId, collision?, properties }`, zero-based local IDs, optional pixel-local axis-aligned collision rectangles, and typed properties. A typed property is `{ type:'string'|'int'|'float'|'bool'|'color'|'file', value:string|number|boolean }`; properties are records keyed by name. A tile layer has `{ id, type:'tilemap', name, visible, opacity, offset:{x,y}, parallax:{x,y}, width, height, tileSize:{x,y}, data }`; `data` is a row-major array of `WorldTileCell | null`, each cell storing `tilesetId`, zero-based local `tileId`, and explicit `flipX`, `flipY`, and `flipDiagonal` booleans. This avoids leaking Tiled's global-GID bit layout into the runtime. An object layer has `{ id, type:'objects', name, visible, opacity, offset, parallax, objects }`. Object records use `{ id, name, type, position:{x,y}, rotation, size:{x,y}, origin:{x,y}, visible, tags, properties, components }`; coordinates and size are pixels, rotation is degrees, origin is normalized 0..1, and Tiled rectangle objects default to top-left origin. Components are `{ kind, data }`, where `kind` is a stable string and `data` is JSON-only. Built-in kinds are `spriteRenderer` (`tilesetId`, `tileId`, flips, optional size/pivot/tint) and `physicsBody2D` (`type`, box/circle `shape`, sensor, layer, mask); custom kinds use the factory registry. Keep references relative to the document root. Define one migration function from v1-current format as no-op and reject future versions with path-addressed diagnostics.

## Global Constraints

No executable strings, arbitrary import paths, or implicit network reads. Preserve unknown supported metadata on parse/save. Never throw on invalid user-authored JSON; return structured diagnostics with JSON path, code, and message. Keep `WorldData` and `*.world.json` unchanged.

## Review Focus

Validate missing/duplicate IDs, invalid dimensions/GIDs, invalid and escaping asset paths, unsupported versions/components, numeric finiteness, tile-layer lengths, migration behavior, and stable JSON round trips. Factories must not construct partial scenes when validation fails.

---

### Task 1: 2D world format, validation, migration, factories, and loader

**Files:** Add `src/world2d/{index,types,validate,migrate,loader,saver}.ts`, `tests/game-runtime/world2d-format.ts`, and canonical fixtures under `tests/fixtures/world2d/`. Modify root `src/index.ts` and `package.json` exports. Update `webpage/src/content/docs/api/world2d.md`, `webpage/src/content/docs/guides/world-format.md`, and docs index/navigation.

1. Commit canonical JSON fixtures and Perry tests first for valid simple/tilemap/object scenes, round trips, path-addressed validation errors, duplicate IDs, future versions, and safe empty/failing factory behavior. Fixtures must not require native rendering. Include every explicit tile-cell flip flag combination used by the Tiled contract.
2. Implement the exact version-1 data interfaces in this plan and publish the fixture as the cross-repository contract. Include a stable, versioned extension point: `registerComponentFactory(kind, factory)` that accepts plain JSON data and returns a component or a structured diagnostic; built-ins remain explicitly listed.
3. Implement `validateWorld2D`, `migrateWorld2D`, and deterministic `serializeWorld2D`. Sort only maps/sets whose order is semantically irrelevant; preserve layer, object, component, and metadata order.
4. Implement `World2DLoader` that validates completely before constructing objects, resolves asset references relative to the document, creates only registered built-ins/factories, and attaches atomically to `GameScene`. On failure it returns diagnostics and leaves the destination scene unchanged.
5. Add a hand-authored sample fixture round-trip and API docs. Run all world2D runtime fixtures through Perry and package/docs validation. Commit `feat: add versioned 2d world data`.
