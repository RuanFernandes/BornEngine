# Sprite Animation Composite Frames Design

## Status

Design approved. Implementation has not started.

## Context

BornEngineTools' sprite animation editor stores each animation frame as one
image crop with one transform. The editor already supports image sequences,
manual atlas cropping, a checkerboard preview, and per-frame offset, stretch,
zoom, rotation, and pivot controls. It cannot combine multiple images into the
same animation frame, and the narrow sidebar mixes clip settings, frame
sequence controls, and transforms in one long column.

## Goals

- Compose one animation frame from multiple ordered image layers.
- Give each layer an independent source crop, visibility, offset, stretch, zoom,
  rotation, and pivot.
- Keep a frame sequence independent from the layer stack inside each frame.
- Let users add several image files as layers to the selected frame in one step.
- Let users turn a mouse-selected atlas crop into a layer in the selected frame.
- Reorganize the sidebar into focused Clip, Frames, and Layers tabs.
- Keep existing single-image animation documents readable without changing
  their format version.

## Non-goals

- A multi-track timeline shared across frames.
- Blend modes, keyframed layer transforms, or runtime animation playback changes.
- Replacing the existing atlas crop workflow that creates animation frames.
- Changing the World2D map editor or adding an LSP.

## Frame and layer data

`SpriteAnimationFrameDefinition` keeps its existing `image`, `x`, `y`,
`width`, `height`, and optional `transform` properties. It gains an optional
`layers` array. A layer stores a stable per-frame `id`, optional display name,
workspace-relative image path, integer crop rectangle, visibility, and its own
frame transform.

The layer array is ordered bottom-to-top. The existing frame properties mirror
the first layer whenever a frame with `layers` is edited. This preserves a
useful single-image projection for readers that do not know about composite
layers. Removing the last layer is disallowed, so every valid frame continues
to have a source image. A legacy frame without `layers` is treated as one
implicit layer made from its existing image crop and transform. The editor
materializes that layer only when the user edits the layer stack.

`layers` remains optional under the existing document version. Validation
checks layer IDs for uniqueness within a frame, normalized image references,
positive crop dimensions, non-negative crop origins, and valid per-layer
transforms. Existing frame transforms without the newer zoom field continue to
default to zoom `1`.

## Editor layout and interactions

The sidebar keeps the animation selector and add/delete clip actions at the
top, followed by three tabs:

- **Clip** contains clip name, animation group, FPS, loop mode, output canvas
  size, and direction.
- **Frames** contains the ordered frame list and the selected frame's name,
  duration, and frame operations. **Add Frames** retains the current behavior
  of making a sequence from selected images.
- **Layers** contains the selected frame's ordered layer list, add/remove,
  visibility, and reorder actions. **Add Images** in this tab puts every
  selected image into the current frame as a new layer. The atlas offers an
  action to add the current mouse-selected crop as a layer.

Selecting a layer shows its source and transform controls. Dragging on the
preview changes only the selected layer's offset. The preview and each frame
thumbnail draw visible layers in bottom-to-top order with their own transforms.
Selecting a different frame resets the selected layer to the first available
layer in that frame. Empty or read-only states disable the applicable actions
and controls.

The existing panel width may grow modestly to make the layer list and fields
readable, while keeping the atlas and preview workspace responsive. The
sidebar content is contained in its own scroll area; tabs prevent clip,
sequence, and layer controls from becoming one very long panel.

## Data flow and compatibility

The image picker reports whether selected files should become new frames or
layers. For layer mode, the webview builds layer entries using the image's full
dimensions and a default transform, appends them to the selected frame, mirrors
the first layer to the legacy frame properties, and submits one document edit.
Crop-to-layer uses the same layer insertion path with the selected image crop.
The existing workspace-relative image import/copy policy remains unchanged.

Reading a legacy document does not write a migration. Saving unrelated clip or
frame edits leaves a legacy frame without `layers`; saving a layer-stack edit
creates the optional array and synchronized legacy projection. Undo, redo,
save, and reopen continue to use VS Code's document history and JSON file.

## Validation and tests

- Schema tests cover legacy single-image frames, valid composite frames,
  duplicate layer IDs, invalid references/crops/transforms, and compatibility
  defaults.
- Layer-operation tests cover adding multiple images to one selected frame,
  reordering, visibility, removal constraints, and legacy-field projection.
- Preview tests cover layer order, hidden layers, and independent transforms.
- Webview tests cover tab navigation, layer selection, per-layer controls,
  crop-to-layer, image import, and old-document initialization.
- The full extension test suite, strict animation-editor TypeScript check, and
  extension/webview builds run before local installation.

## Acceptance criteria

- One selected frame can contain and preview multiple independently
  transformable image layers.
- Adding layer images does not increase the number of animation frames.
- Users can create a layer from an exact atlas crop, then reorder, hide, or
  remove it from the selected frame.
- Clip, frame-sequence, and layer controls are separated into the three sidebar
  tabs and remain usable in narrow VS Code editor panels.
- Existing single-image JSON opens and behaves as before, and only layer edits
  add the optional `layers` data.
- The saved JSON reopens with the same frame order, layer order, source crops,
  visibility, and transforms.
