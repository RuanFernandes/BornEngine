# BornEngineTools Map and Animation Editors Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make World2D bucket fills work with multi-tile selections and an accurate preview, shrink saved map JSON, add toolbar icons, and finish the approved composite-frame animation editor with an organized layer sidebar.

**Architecture:** World2D v2 compact storage is defined by the separate `2026-10-06-world2d-compact-v2.md` plan, with a primary tileset, extras, and adaptive grid codecs. The map editor shares a pure fill-region/pattern-placement calculation between preview and edits, caches the hover result, and draws only visible ghost cells. Sprite animation documents retain their v1 format and legacy frame fields, adding an optional per-frame `layers` array only after layer edits; the webview separates Clip, Frames, and Layers and composites each frame from its visible ordered layers.

**Tech Stack:** Existing TypeScript engine World2D modules, BornEngineTools TypeScript webviews, Canvas 2D, inline SVG, JSON serialization, existing Node runtime and extension tests.

**Spec:** `docs/superpowers/specs/2026-10-06-sprite-animation-composite-frames-design.md` and `docs/superpowers/specs/2026-10-06-bornengine-tools-map-editor-design.md`.

## Global Constraints

- Version-1 maps remain readable; saving them upgrades to version 2. The in-memory World2D layer data remains `Array<World2DTileCell | null>`.
- Compact World2D source ranges, flip masks, grid codecs and validation follow the dedicated compact-v2 spec and plan; the earlier per-row palette/RLE layout is superseded.
- Bucket fills remain four-connected and replace only the source region. The multi-tile selection repeats with its top-left tile aligned to the clicked cell.
- Bucket hover previews never edit the document. Preview and apply paths use the same fill result, and preview rendering skips offscreen cells.
- Animation frame count remains independent from each frame's ordered layer count. Legacy single-image frames stay unchanged until their layer stack is edited; legacy fields mirror the first layer after an edit.
- Icons are static inline SVG; keep text labels, keyboard focus, and accessible button names.
- Keep extension source, generated bundles, and the installed local extension in sync only after checks pass. Do not publish packages or push branches as part of this implementation.

## Review Focus

- The map codec must round-trip nulls, every flip combination, and asymmetric tileset indices while reducing representative map JSON substantially; v1 fixtures must still load and become v2 only on save.
- Region discovery must not cross diagonals or tiles different from the seed; a multicolumn/multirow brush must use the same placement for preview and apply.
- Large map previews must not recompute a flood fill for unchanged hover inputs or draw offscreen cells.
- Adding images as animation layers must not append animation frames; adding an atlas crop as a layer must use its exact crop rectangle.
- Layer order, visibility, transforms, zoom, rotation, and pivot must survive save/reopen; the preview and frame thumbnails must composite in bottom-to-top order.
- Opening and saving legacy animation JSON without layer edits must not materialize or rewrite the optional `layers` field.

---

### Task 1: Primary/extras sources and compact World2D v2 storage

Execute `docs/superpowers/plans/2026-10-06-world2d-compact-v2.md` after its
approval. It owns the storage schema, numeric source references, adaptive
codecs, defaults, v1 migration, main/extras source UI, save compaction and
storage documentation. The shipped reference is the [World2D API](../../../webpage/src/content/docs/api/world2d.md), with an overview in the [World format guide](../../../webpage/src/content/docs/guides/world-format.md). Reproduce size and codec timings with the [storage measurement script](../../../tools/measure-world2d-storage.mjs). Tasks 2–8 below continue to own bucket/ghost, icons and the composite animation editor. Do not implement the superseded per-row codec.

### Task 2: Specify and test shared multi-tile bucket placement

**Files:** `tools/vscode/bornengine-tools/src/maps/world2dEdits.ts`, `tools/vscode/bornengine-tools/src/maps/tileSelection.ts`, `tools/vscode/bornengine-tools/test/world2dTileFill.test.cjs`, plus a focused pure-helper test if separation improves reuse.

1. Add failing tests for a 2×2 selected pattern repeated over a region, clipped pattern cells at map edges, disconnected and diagonal regions, empty-source regions, and invalid tile IDs within a pattern.
2. Extract/export one pure helper that finds the four-connected region and assigns pattern cells relative to the clicked seed.
3. Change `fillTiles` to accept a validated rectangular pattern instead of one replacement cell. Preserve the current no-op behavior when the generated result already matches the map.
4. Assert that a one-tile pattern remains behaviorally identical to the current bucket and that the source World2D document stays immutable.

### Task 3: Integrate cached patterned bucket ghost preview

**Files:** `tools/vscode/bornengine-tools/src/webview/mapEditor.ts`, `tools/vscode/bornengine-tools/src/maps/mapEditor.css`, `tools/vscode/bornengine-tools/test/world2dTileFill.test.cjs` and focused preview tests.

1. Add failing tests around the pure preview placement result and its agreement with the edit operation for the same seed/pattern.
2. Build the selected brush pattern from the tileset selection and send it with a bucket edit.
3. On bucket hover, compute/cache the connected region and replacement placements using the Task 2 helper. Invalidate on document, layer, source-cell, or selection changes.
4. Render a translucent tile ghost for visible placements only, with a clear region outline. Reuse existing tileset image and tile-stamp rendering paths where possible.
5. Update pointer transitions so previews clear when leaving the map, changing tools, or selecting a non-tile layer. Confirm applying the bucket produces exactly the previewed pattern.

### Task 4: Add inline icons to the map toolbar

**Files:** `tools/vscode/bornengine-tools/src/maps/mapEditorHtml.ts`, `tools/vscode/bornengine-tools/src/maps/mapEditor.css`.

1. Add markup checks for icon spans, preserved visible labels, and accessible button titles/names.
2. Add a small consistent set of static inline SVGs to map Select, Paint, Bucket, Erase, and Object tools.
3. Verify CSP requires no new source and no external assets.

### Task 5: Add backward-compatible animation layer schema and edit operations

**Files:** `tools/vscode/bornengine-tools/src/animations/spriteAnimationSchema.ts`, `tools/vscode/bornengine-tools/src/animations/spriteAnimationEdits.ts`, new focused pure layer helpers if useful, `tools/vscode/bornengine-tools/test/animationFrameEditing.test.cjs`.

1. Add failing schema tests for legacy implicit layers, valid multi-layer frames, duplicate IDs, invalid crops/paths/transforms, and the first-layer legacy-field projection.
2. Add the optional `layers` shape from the approved sprite-animation spec without changing the document version. Keep frame `image/x/y/width/height/transform` fields valid and required for compatibility.
3. Add pure layer operations for materializing a legacy implicit layer, adding multiple images to the selected frame, reordering, toggling visibility, changing a selected layer transform, deleting while retaining at least one layer, and mirroring the first layer to legacy fields.
4. Test that unrelated edits preserve a legacy frame without `layers`, while a layer-stack edit creates `layers` and remains round-trip valid.

### Task 6: Connect image picking and atlas crops to frame layers

**Files:** `tools/vscode/bornengine-tools/src/animations/spriteAnimationEditorProvider.ts`, `tools/vscode/bornengine-tools/src/webview/animationEditor.ts`, animation editor tests.

1. Add failing host/webview message tests for separate “add as frames” and “add as layers” image selection modes, including cancelled pickers and duplicate image paths.
2. Extend the existing workspace image picker message with an explicit destination; preserve the existing image import/copy policy and frame-sequence behavior.
3. Add each selected image to the current frame as a full-image layer in selection order. Do not increase frame count in layer mode.
4. Add an atlas action that inserts the exact current mouse-selected crop as a layer in the selected frame. Keep “Crop frames” behavior unchanged.
5. Reset selected-layer state safely when the frame, clip, or document changes; surface host-side errors through the existing diagnostics/status path.

### Task 7: Reorganize the animation sidebar and composite frame rendering

**Files:** `tools/vscode/bornengine-tools/src/animations/animationEditorHtml.ts`, `tools/vscode/bornengine-tools/src/animations/animationEditor.css`, `tools/vscode/bornengine-tools/src/webview/animationEditor.ts`, `tools/vscode/bornengine-tools/src/animations/animationPreview.ts`, `tools/vscode/bornengine-tools/src/animations/animationFrameTransform.ts`, animation editor tests.

1. Add failing tests for tab switching, layer selection/order/visibility controls, independent transform updates, crop-to-layer, and old-document initialization.
2. Build Clip, Frames, and Layers sidebar tabs. Keep clip selection/add/delete at the top; place sequence/name/duration controls in Frames; place layer stack/add/reorder/visibility/remove and selected-layer transforms in Layers. Add decorative inline SVG icons to primary actions and tabs while retaining labels.
3. Render visible layers bottom-to-top in the large preview and frame thumbnails. Apply each layer's crop and transform independently; drag changes only the selected layer offset.
4. Show each layer's source preview and a clear empty/read-only state. Keep the sidebar scrollable and usable at the current narrow-panel width.
5. Keep scrubber/playback frame indexing based on animation frames only; switching a layer must never change the active animation frame.

### Task 8: Build, verify, and refresh the local extension

**Files:** generated extension bundles under `tools/vscode/bornengine-tools/dist/` and the packaged extension's `dist/`; local installed extension at `/home/nullborne/.vscode/extensions/nullborne.bornengine-tools-0.1.0/`.

1. Run World2D format tests, the complete BornEngineTools test suite, engine type checks, strict animation-editor type check, and both map/animation extension builds.
2. Review JSON-size deltas on sparse and repeated maps and verify legacy v1 maps and old animation files reopen correctly.
3. Copy only successful generated bundles to the package and local extension locations; do not include `node_modules` or unrelated package files.
4. Report the checks and the new World2D version requirement for maps saved in the compact format. Publishing and branch integration are outside this request.

## Completion Criteria

- Multi-tile bucket fill, preview, and committed result agree exactly and remain responsive on large layers.
- Map and animation primary actions display icons while retaining text and accessible names.
- Representative saved maps are substantially smaller than expanded version-1 JSON, and version-1 maps still load and edit.
- One sprite animation frame can hold multiple individually editable image/crop layers without altering frame order or count.
- Frame composites, thumbnails, transforms, layer order, and visibility survive save/reopen; legacy single-image JSON remains unchanged until layer edits.
- Engine, extension, and local installed bundles pass the listed checks and remain in sync.
