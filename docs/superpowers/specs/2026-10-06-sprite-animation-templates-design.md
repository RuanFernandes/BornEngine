# Reusable Layered Sprite Animation Templates

## Status

Design draft for review. No implementation is authorized by this document alone.

## Goal

Let a developer define a layered animation once, declare any named image
parameters they need, and bind different loaded textures to those same
parameters at runtime. Parameter names are chosen by the template author; the
engine defines no reserved roles such as body, head, or weapon. The template
controls the number and meaning of image inputs, the frame crops, their order,
timing, and per-layer transforms.

## User intent

- Make one reusable `idle`/`walk`/attack animation for multiple character,
  equipment, or other art variants.
- Let the template author declare and name the inputs it needs. Different
  templates may use different parameter names and counts.
- Identify each image input by a stable parameter ID so runtime code maps the
  right texture to the right visual part without relying on argument order.
- Place, crop, stretch, zoom, rotate, and pivot each image independently in
  every animation frame.
- Reuse the existing clip, frame, crop-grid, preview, and layer-editing ideas
  from BornEngineTools while retaining ordinary concrete animation documents.
- Keep template preview images out of the reusable template file so each game
  character can supply its own art at runtime.

## Existing behavior and constraint

The current engine `SpriteAnimation` keyframe contains one `SpriteFrame`, and
`SpriteAnimator` drives one `SpriteRenderer`. The animation editor's approved
composite-frame design adds ordered, independently transformable layers to an
editor document, but explicitly leaves runtime playback unchanged. A reusable
parameterized animation therefore needs a runtime extension as well as a new
template asset format. Repeated independent animators per image layer are not a
good fit: their playheads could drift and they would duplicate markers and
state-transition behavior.

## Approaches considered

1. **Copy an animation document for every image set.** This does not satisfy
   reuse: each character and equipment combination would still need its own
   animation data.
2. **A single-texture template.** Binding one texture to the same crop layout
   is useful for spritesheets, but cannot request multiple separately bound
   image inputs.
3. **A source-independent layered template with user-defined image parameters
   (recommended).** The template declares image slots and each keyframe lists
   the crops and transforms that use those slots. One binding supplies the
   texture for each slot; one animation playhead advances every layer together.
4. **A general skeletal or independently timed rig.** This would add bones,
   tracks, retargeting, and separate timing. It is not needed for the requested
   composited 2D sprite workflow and is outside V1.

## Template document

Use a new versioned `bornengine.spriteanim-template` format saved as
`*.spriteanim-template.json`. Do not change or silently convert existing
`*.spriteanim.json` files.

The template contains:

- A stable template ID, format version, display name, and optional description.
- An ordered list of image parameters. Each parameter has a unique,
  template-author-defined stable ID, an optional display label, a `required`
  flag, and optional user-defined tags for editor organization. IDs are opaque
  runtime keys: there are no reserved semantic names, and layers refer to
  whichever IDs the author chose. Tags are saved with the template and may be
  used to group or filter parameters in the editor; they do not affect texture
  binding or runtime behavior.
- Named clips with FPS and loop mode. Each clip contains ordered keyframes with
  optional duration and markers.
- A common output canvas size per clip. Layer offsets and pivots are measured
  against this canvas so variants use the same composition and anchor.
- Each keyframe contains an ordered bottom-to-top list of layers. A layer
  references one image parameter, a crop rectangle in that parameter's texture,
  visibility, and an independent transform (offset, stretch, zoom, rotation,
  and normalized pivot). Multiple layers may reference the same parameter.
- No fixed source image path. Image files chosen to author or preview a slot are
  transient editor inputs, not saved dependencies of the template.

Conceptual JSON shape:

```json
{
  "format": "bornengine.spriteanim-template",
  "version": 1,
  "id": "layered-animation-example",
  "name": "Layered Animation Example",
  "imageParameters": [
    { "id": "primary_layer", "label": "Primary Layer", "required": true, "tags": ["character"] },
    { "id": "overlay_fx", "label": "Overlay FX", "required": true, "tags": ["effects"] },
    { "id": "extra_art_01", "label": "Extra Art 01", "required": false, "tags": ["extras"] }
  ],
  "clips": [
    {
      "name": "idle",
      "fps": 8,
      "loop": "loop",
      "canvasSize": { "width": 32, "height": 48 },
      "frames": [
        {
          "layers": [
            { "parameter": "primary_layer", "source": { "x": 0, "y": 0, "width": 32, "height": 48 } },
            { "parameter": "overlay_fx", "source": { "x": 0, "y": 0, "width": 16, "height": 16 } },
            { "parameter": "extra_art_01", "source": { "x": 0, "y": 0, "width": 16, "height": 32 } }
          ]
        }
      ]
    }
  ]
}
```

The example omits default transforms and optional frame fields for readability;
the format schema defines their defaults explicitly. The editor may display
friendly labels, but saved parameter and clip IDs remain stable when labels are
renamed.

## Compact JSON storage

Save animation documents as compact JSON without indentation or insignificant
whitespace. This removes formatting bytes while preserving every animation
value. For versioned formats with documented defaults, the canonical serializer
may also omit a field only when its value exactly equals that default and
loading reconstructs the same editor/runtime value. Existing concrete
`*.spriteanim.json` documents are minified without dropping fields unless their
format explicitly defines the same safe default behavior.

Do not round numeric values, reorder arrays, discard IDs/tags/markers, merge
distinct layers, or otherwise change animation meaning for size savings. The
visual editor remains the primary authoring view; users can still open the file
as text and format it for inspection, while a subsequent visual save writes the
compact representation again.

Tests compare the parsed animation data before and after compact serialization,
including parameter IDs and tags, numeric transforms, frame/layer order, and
legacy concrete documents. Pretty-printed input must load and round-trip to the
same animation data.

## Editor workflow

Extend the existing Sprite Animation editor with separate flows for creating a
concrete animation document and a reusable template. Template editing uses the
same Clip, Frames, and Layers concepts approved for composite frames, and adds
an **Inputs** area to manage the template's image parameters.

1. Create a template and add, rename, reorder, or remove parameters with
   author-chosen IDs. Add optional user-defined tags and use them to organize,
   group, or filter parameters in the Inputs area. IDs remain independent of
   labels and tags.
2. Choose a temporary preview image for each parameter. The editor shows which
   preview image is assigned to each slot. The author can replace a slot's
   preview image or load alternate images to check that the same composition
   works with different art.
3. Create clips and frames, select a layer, choose its parameter, crop the
   parameter's image with the existing grid and mouse selection, then adjust
   layer order, visibility, offset, stretch (including negative mirroring),
   zoom, rotation, and pivot.
4. Preview the full frame composite and the animated clip. All visible layers
   share the clip's frame timing; individual layers can use different crops in
   each keyframe.
5. Save the source-independent template JSON. Reopening it does not require the
   transient preview images; the user chooses preview images again.

Validation identifies missing parameter references, duplicate IDs, invalid
timing, invalid transforms, empty frames, and crops outside the currently
assigned preview image. Optional parameters may be omitted at runtime; layers
that refer to an omitted optional parameter are skipped. Required parameters
must be supplied.

## Runtime binding and playback

Add a `SpriteAnimationTemplate` runtime model that accepts validated template
data and binds a map of parameter IDs to already-loaded `Texture` instances.
For example, the conceptual call is:

```ts
const bound = template.bind({
  primary_layer: primaryTexture,
  overlay_fx: effectTexture,
  extra_art_01: optionalTexture,
});
```

This is a named map, not positional parameters: each texture is assigned to
layers that reference the matching author-defined parameter ID, regardless of
input order. Each bound
character gets its own generated SpriteSheet/SpriteFrame objects, clip data,
and playback state while sharing the immutable template definition. Game code
provides this map when binding the template, then selects `idle`, `walk`, or
another clip on that animator; it does not need to duplicate or rewrite the
template JSON for each image combination.

The bound result exposes clips that use the existing FPS, loop, duration, and
marker semantics. Add a layer-aware animation target/renderer that can draw all
visible layers of the current keyframe in order. Integrate it with the existing
`SpriteAnimator` playhead and state machine so a single animator advances the
whole composite, fires markers once, and keeps transitions synchronized. The
existing `SpriteRenderer` + `SpriteAnimator` path for one-image animations
continues to work without source changes. The runtime must draw each source
texture directly through the existing 2D rendering path; baking dynamic
composite textures is not required for V1.

Layer offsets are in the clip's output-canvas pixel units, stretch is signed
and unitless, zoom is positive, rotation is in degrees, and pivot is normalized
to the layer's source crop. The root renderer's output size scales the canvas
from template pixels to world units. This keeps runtime composition aligned
with the editor preview. Rendering order is bottom-to-top as stored in each
frame.

The binding validates that required IDs are present, supplied textures are
loaded and owned by the same Game, no unknown IDs are supplied, all crop
rectangles fit the corresponding textures, and each layer transform is valid.
Missing optional IDs skip only their layers. A failed binding returns a
recoverable diagnostic and does not invalidate unrelated templates or textures.
Projects continue to load JSON and textures through their existing content path;
the template API does not add filesystem JSON loading, native FFI, or automatic
texture loading.

## Compatibility boundary

- Existing concrete `*.spriteanim.json` files retain their current shape,
  source references, and editor behavior.
- The already-approved optional `layers` field for concrete animation editor
  documents remains governed by the composite-frame design. This template
  feature does not silently reinterpret or migrate those files.
- The new template JSON is the runtime-reusable, parameterized composite
  animation format. It reuses the editor's layer and transform concepts but
  adds stable parameter IDs and runtime binding.
- Current one-sprite `SpriteAnimation`, `SpriteRenderer`, and `SpriteAnimator`
  construction stays source-compatible. New composite APIs are additive.

## V1 scope

Included:

- A versioned template JSON format with author-defined required/optional image
  parameters and organizational tags, clips, synchronized keyframes,
  per-layer crops, order, and transforms.
- BornEngineTools create/open/save support for animation templates, including
  parameter management, one preview source per parameter, crop selection, and
  composite animation preview.
- Runtime binding from a parameter-ID-to-Texture map, with per-binding frame
  objects and validation.
- Layer-aware rendering/playback integrated with the existing animation
  playhead, markers, and state transitions.
- Documentation and an example reusing one walk/idle template with different
  author-defined parameter-to-texture maps.
- Backward compatibility for existing concrete animation JSON and the current
  single-sprite runtime APIs.

Excluded:

- Bones, skeletal animation, IK, arbitrary retargeting, independently timed
  layer tracks, blend modes, and a general-purpose rig editor.
- Baking or caching runtime composite images as generated texture assets.
- Automatic asset/JSON loading from file paths inside the template API.
- Template marketplace, runtime hot reload, and automatic migrations between
  template versions.
- Making the editor-only layers of legacy concrete animation JSON runtime
  playable without converting them to a reusable template.

## Acceptance criteria

1. A template can declare multiple required parameters with arbitrary
   author-chosen IDs, save/reopen them, and use them from multiple clips.
2. Each keyframe can contain ordered layers that refer to different parameters;
   each layer preserves its crop and independent transform through save/reopen.
3. The editor can preview a clip using one set of temporary images, then swap
   any slot's preview image and verify the same crops and composition against a
   second compatible set.
4. Runtime binding maps each texture by parameter ID, independent of map order,
   and rejects missing required IDs, unknown IDs, unloaded/foreign textures,
   invalid crops, and invalid transforms with useful diagnostics.
5. A single layer-aware animation playhead advances all composite layers
   together, emits each marker once, and supports the existing clip/state
   selection behavior.
6. Two characters can bind the same template to different textures and play
   without sharing mutable renderer or playback state.
7. Existing concrete animation documents still open, edit, save, and serialize
   without implicit migration; existing single-sprite runtime examples still
   compile unchanged.

## Risks and mitigations

- **A source variant does not match the template crops.** Check every crop
  against each preview/bound texture and show the parameter ID in diagnostics.
- **Input ordering or tags map a texture to the wrong layer.** Use stable,
  author-defined IDs in JSON and a record/object argument in the runtime API,
  never positional matching; tags remain organizational metadata only.
- **Independent layer animators drift or duplicate events.** Advance composite
  keyframes from one existing animation playhead and one state machine.
- **Layer drawing changes old render behavior.** Keep the current one-frame
  path intact and add a separate layer-aware target for template composites.
- **Editor transforms and world rendering disagree.** Define offsets in canvas
  pixels, use the clip canvas as the root composition space, and verify preview
  and runtime against the same fixtures.
- **The template format diverges from the composite editor's layer model.**
  Reuse crop, ordering, visibility, and transform concepts while keeping the
  template's parameter binding explicit and its JSON format separate.
